import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSettings, createOpenMeteo, departureHour, conditionsAt, environmentGuide, DEFAULT_SETTINGS, wbgt, heatAdjustment} from '../src/weather.mjs';

const hours = ['2026-11-16T05:00', '2026-11-16T06:00'];
const raw = {weather:{hourly:{time:hours, temperature_2m:[20.7, 21], relative_humidity_2m:[92, 90], dew_point_2m:[19.4, 19], wind_speed_10m:[1, 6], wind_gusts_10m:[2.5, 9], precipitation_probability:[37, 70], precipitation:[0, 1.2], weather_code:[2, 61]}},
  air:{hourly:{time:hours, us_aqi:[66, 160], pm2_5:[15.9, 70]}}};

test('settings default to 05:30 in Shilin and are validated', () => {
  assert.deepEqual(validateSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(validateSettings({departure:'06:15', place:' 河濱 ', latitude:'25.1', longitude:121.5}), {departure:'06:15', place:'河濱', latitude:25.1, longitude:121.5});
  assert.throws(() => validateSettings({departure:'25:00'}), /HH:MM/);
  assert.throws(() => validateSettings({latitude:100}), /緯度/);
  assert.throws(() => validateSettings({place:''}), /地點/);
});

test('departure hour: today at the set time, or the next full hour once past', () => {
  assert.equal(departureHour('2026-11-16', '05:30', '2026-11-16T04:10'), '2026-11-16T05:00');
  assert.equal(departureHour('2026-11-16', '05:30', '2026-11-16T05:40'), '2026-11-16T05:00');
  assert.equal(departureHour('2026-11-16', '05:30', '2026-11-16T09:20'), '2026-11-16T10:00');
  assert.equal(departureHour('2026-11-16', '05:30', '2026-11-16T09:00'), '2026-11-16T09:00');
});

test('conditions and guidance follow R11 and R14; missing data stays missing', () => {
  const calm = conditionsAt(raw, hours[0]);
  assert.deepEqual([calm.temperature, calm.dewPoint, calm.wind, calm.aqi], [20.7, 19.4, 1, 66]);
  const g = environmentGuide(calm);
  assert.deepEqual([g.wind.level, g.air.level, g.rainy, g.heat.risk.level], ['calm', 'outdoor', false, 'high']);
  assert.deepEqual(environmentGuide({...calm, temperature:12, humidity:60}).hints, []);
  const bad = environmentGuide(conditionsAt(raw, hours[1]));
  assert.deepEqual([bad.wind.level, bad.air.level, bad.rainy, bad.hints.length], ['breezy', 'indoor', true, 3]);
  assert.equal(environmentGuide({...calm, wind:11}).wind.level, 'strong');
  assert.equal(environmentGuide({...calm, aqi:120}).air.level, 'either');
  const noAir = environmentGuide(conditionsAt({weather:raw.weather, air:null}, hours[0]));
  assert.equal(noAir.air.level, 'unknown');
  assert.equal(conditionsAt(raw, '2026-11-17T05:00'), null);
  assert.equal(environmentGuide(null), null);
});

test('client calls both Open-Meteo hosts and tolerates a missing air-quality answer', async () => {
  const urls = [];
  const client = createOpenMeteo({fetchImpl:async url => { urls.push(String(url)); return url.hostname.startsWith('air') ? {ok:false, status:503} : {ok:true, json:async () => raw.weather}; }});
  const r = await client.forecast(DEFAULT_SETTINGS, 'Asia/Taipei');
  assert.equal(r.air, null);
  assert.match(urls[0], /api\.open-meteo\.com\/v1\/forecast\?latitude=25\.093&longitude=121\.525&timezone=Asia%2FTaipei/);
  assert.match(urls[0], /wind_speed_unit=ms/);
  assert.match(urls[1], /air-quality-api\.open-meteo\.com/);
  const down = createOpenMeteo({fetchImpl:async () => ({ok:false, status:500})});
  await assert.rejects(down.forecast(DEFAULT_SETTINGS, 'Asia/Taipei'), /500/);
});

test('R12: WBGT estimate, 0.35% per degree above 15, ACSM risk bands', () => {
  assert.equal(wbgt(20.7, 92), 24.5);
  assert.equal(wbgt(null, 50), null);
  const h = heatAdjustment({temperature:20.7, humidity:92});
  assert.deepEqual([h.wbgt, h.factor, h.slowdownPercent, h.risk.level], [24.5, 1.033, 3.3, 'high']);
  assert.match(h.howCalculated, /Mantzios/);
  const cool = heatAdjustment({temperature:10, humidity:60});
  assert.deepEqual([cool.factor, cool.slowdownPercent, cool.risk.level], [1, 0, 'low']);
  assert.equal(heatAdjustment({temperature:32, humidity:75}).risk.level, 'extreme');
  assert.ok(environmentGuide({temperature:32, humidity:75, wind:1, aqi:50}).hints.some(t => t.includes('極高')));
  assert.equal(heatAdjustment({temperature:null, humidity:80}), null);
});
