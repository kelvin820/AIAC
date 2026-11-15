// Weather and air quality at departure, from Open-Meteo (https://open-meteo.com, free, no key).
// Guidance rules are docs/ALGORITHMS.md R11 (wind) and R14 (air quality), approved 2026-11-15.
// Heat and humidity are shown but do not change pace yet (R12 pending). Never invents values.

export const DEFAULT_SETTINGS = {departure:'05:30', place:'台北士林', latitude:25.0930, longitude:121.5250};
const HOURLY = 'temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability,precipitation,weather_code';

export function validateSettings(input = {}) {
  const out = {...DEFAULT_SETTINGS};
  if (input.departure !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.departure))) throw Error('出發時間格式需為 HH:MM');
    out.departure = String(input.departure);
  }
  if (input.place !== undefined) {
    const place = String(input.place).trim();
    if (!place || place.length > 40) throw Error('地點名稱需為 1–40 字');
    out.place = place;
  }
  for (const [key, max] of [['latitude', 90], ['longitude', 180]]) {
    if (input[key] === undefined || input[key] === '') continue;
    const v = Number(input[key]);
    if (!Number.isFinite(v) || Math.abs(v) > max) throw Error(key === 'latitude' ? '緯度需介於 −90 到 90' : '經度需介於 −180 到 180');
    out[key] = Math.round(v * 10000) / 10000;
  }
  return out;
}

export function createOpenMeteo({fetchImpl = globalThis.fetch} = {}) {
  async function get(host, path, params) {
    const url = new URL(`https://${host}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetchImpl(url, {headers:{Accept:'application/json'}, redirect:'error', signal:AbortSignal.timeout(15000)});
    if (!res.ok) throw Error(`天氣服務回應 ${res.status}，稍後再試。`);
    return res.json();
  }
  return {
    async forecast({latitude, longitude}, timezone) {
      const common = {latitude, longitude, timezone, forecast_days:2};
      const [weather, air] = await Promise.all([
        get('api.open-meteo.com', '/v1/forecast', {...common, hourly:HOURLY, wind_speed_unit:'ms'}),
        get('air-quality-api.open-meteo.com', '/v1/air-quality', {...common, hourly:'us_aqi,pm2_5'}).catch(() => null),
      ]);
      return {weather, air};
    },
  };
}

const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;

// The hour to read: the departure time today, or the next full hour once that has passed.
export function departureHour(date, departure, nowLocal) {
  const at = `${date}T${departure.slice(0, 2)}:00`;
  if (!nowLocal || nowLocal.slice(0, 13) <= at.slice(0, 13)) return at;
  const h = Number(nowLocal.slice(11, 13)) + (nowLocal.slice(14, 16) === '00' ? 0 : 1);
  return h > 23 ? at : `${date}T${String(h).padStart(2, '0')}:00`;
}

// Pick one hour out of the raw responses.
export function conditionsAt({weather, air}, hour) {
  const i = weather?.hourly?.time?.indexOf(hour) ?? -1;
  if (i < 0) return null;
  const h = weather.hourly, a = air?.hourly, j = a?.time?.indexOf(hour) ?? -1;
  return {
    hour, temperature:num(h.temperature_2m?.[i]), humidity:num(h.relative_humidity_2m?.[i]), dewPoint:num(h.dew_point_2m?.[i]),
    wind:num(h.wind_speed_10m?.[i]), gust:num(h.wind_gusts_10m?.[i]),
    precipitationProbability:num(h.precipitation_probability?.[i]), precipitation:num(h.precipitation?.[i]), weatherCode:num(h.weather_code?.[i]),
    aqi:j >= 0 ? num(a.us_aqi?.[j]) : null, pm25:j >= 0 ? num(a.pm2_5?.[j]) : null,
  };
}

export function environmentGuide(c) {
  if (!c) return null;
  const wind = c.wind === null ? {level:'unknown', label:'沒有風速資料'}
    : c.wind >= 10.8 ? {level:'strong', label:'強風'} : c.wind >= 5.5 ? {level:'breezy', label:'有風'} : {level:'calm', label:'無風／微風'};
  const air = c.aqi === null ? {level:'unknown', label:'沒有空氣品質預報'}
    : c.aqi > 150 ? {level:'indoor', label:'不建議戶外'} : c.aqi > 100 ? {level:'either', label:'室內戶外都可以'} : {level:'outdoor', label:'建議戶外'};
  const rainy = (c.precipitationProbability ?? 0) >= 60 || (c.precipitation ?? 0) >= 1;
  const hints = [];
  if (air.level === 'indoor') hints.push('空氣品質不佳，建議改室內（跑步機、腳踏車或滑步機）。');
  if (rainy) hints.push('出發時段可能下雨，要不要改室內由你決定。');
  if (wind.level === 'strong') hints.push('強風，注意安全，逆風段不要硬追配速。');
  return {wind, air, rainy, hints, heatNote:'熱與濕度的配速修正尚在研究（R12），目前只顯示數值。'};
}
