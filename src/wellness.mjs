// Daily wellness log (sleep, resting HR, HRV, weight, subjective scores) and a transparent readiness check.
//
// Fields follow the Coach Watts Wellness model (https://github.com/watt-mind/coach, prisma Wellness:
// hrv, restingHr, sleepHours, sleepQuality, fatigue, soreness, stress, mood, weight) and its idea of a
// readiness estimate from HRV and resting HR, Apache License 2.0; see docs/THIRD_PARTY.md.
// Modified for AIAC: manual entries only, and readiness is a list of named signals against the
// athlete's own 28-day baseline instead of an opaque score. It never changes the plan by itself.
import {validateAthlete} from './training-load.mjs';

export const WELLNESS_FIELDS = {
  sleepHours: {label:'睡眠', unit:'小時', min:0, max:16, step:0.1},
  restingHr: {label:'安靜心率', unit:'bpm', min:25, max:120, step:1},
  hrv: {label:'HRV', unit:'ms', min:5, max:300, step:1},
  weightKg: {label:'體重', unit:'kg', min:25, max:250, step:0.1},
  sleepQuality: {label:'睡眠品質', unit:'1–5', min:1, max:5, step:1},
  fatigue: {label:'疲勞', unit:'1–5', min:1, max:5, step:1},
  soreness: {label:'痠痛', unit:'1–5', min:1, max:5, step:1},
  stress: {label:'壓力', unit:'1–5', min:1, max:5, step:1},
  mood: {label:'心情', unit:'1–5', min:1, max:5, step:1},
};
export const BASELINE_DAYS = 28;
export const MIN_BASELINE_VALUES = 7;
export const MAX_ENTRIES = 3650;

const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function validateWellness(input, now = new Date().toISOString()) {
  if (!isDate(input?.date)) throw Error('請提供有效日期');
  const entry = {date:input.date};
  let any = false;
  for (const [key, f] of Object.entries(WELLNESS_FIELDS)) {
    const raw = input[key];
    if (raw === null || raw === undefined || raw === '') { entry[key] = null; continue; }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < f.min || value > f.max) throw Error(`${f.label}需介於 ${f.min}–${f.max}`);
    entry[key] = f.step === 1 ? Math.round(value) : Math.round(value * 10) / 10;
    any = true;
  }
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (notes.length > 1000) throw Error('備註最多 1000 字');
  entry.notes = notes;
  if (!any && !notes) throw Error('請至少填寫一項');
  entry.updatedAt = typeof input.updatedAt === 'string' && Number.isFinite(Date.parse(input.updatedAt)) ? input.updatedAt : now;
  return entry;
}

export function wellnessAction(state, body, today, now) {
  state.wellness ??= [];
  if (body?.action === 'delete') {
    const before = state.wellness.length;
    state.wellness = state.wellness.filter(e => e.date !== body.date);
    if (state.wellness.length === before) throw Error('找不到這天的紀錄');
    return;
  }
  if (body?.action === 'apply-threshold') {
    if (!['restingHeartRate', 'weightKg'].includes(body.field)) throw Error('只能更新安靜心率或體重');
    const suggestion = wellnessView(state, today).suggestions[body.field];
    if (!suggestion) throw Error('目前沒有可更新的建議值');
    state.athlete = validateAthlete({...state.athlete, [body.field]:suggestion.value});
    return;
  }
  if (body?.action !== 'save') throw Error('健康紀錄操作不正確');
  const entry = validateWellness({...body.entry, updatedAt:undefined}, now);
  if (entry.date > today) throw Error('不能記錄未來的日期');
  state.wellness = state.wellness.filter(e => e.date !== entry.date);
  state.wellness.push(entry);
  state.wellness.sort((a, b) => a.date.localeCompare(b.date));
  if (state.wellness.length > MAX_ENTRIES) state.wellness = state.wellness.slice(-MAX_ENTRIES);
}

// Mean and standard deviation over the previous 28 days (the day itself is excluded).
export function baseline(entries, key, date, days = BASELINE_DAYS) {
  const from = addDays(date, -days);
  const values = entries.filter(e => e.date >= from && e.date < date && typeof e[key] === 'number').map(e => e[key]);
  if (values.length < MIN_BASELINE_VALUES) return {count:values.length, mean:null, sd:null};
  const mean = values.reduce((n, v) => n + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((n, v) => n + (v - mean) ** 2, 0) / values.length);
  return {count:values.length, mean:Math.round(mean * 10) / 10, sd:Math.round(sd * 10) / 10};
}

// Named signals for one day. Status needs at least two available signals.
export function readiness(entries, date) {
  const entry = entries.find(e => e.date === date);
  if (!entry) return {date, status:'none', label:'今天還沒有紀錄', signals:[], flags:0};
  const signals = [];
  const hrv = baseline(entries, 'hrv', date), rhr = baseline(entries, 'restingHr', date);
  if (entry.hrv !== null) {
    if (hrv.mean === null) signals.push({key:'hrv', label:'HRV', value:entry.hrv, state:'building', text:`基準累積中（${hrv.count}/${MIN_BASELINE_VALUES} 天）`});
    else {
      const low = entry.hrv < hrv.mean - Math.max(hrv.sd, 1);
      signals.push({key:'hrv', label:'HRV', value:entry.hrv, baseline:hrv, state:low ? 'flag' : 'ok', text:low ? `低於個人基準 ${hrv.mean} ms` : `接近或高於個人基準 ${hrv.mean} ms`});
    }
  }
  if (entry.restingHr !== null) {
    if (rhr.mean === null) signals.push({key:'restingHr', label:'安靜心率', value:entry.restingHr, state:'building', text:`基準累積中（${rhr.count}/${MIN_BASELINE_VALUES} 天）`});
    else {
      const high = entry.restingHr > rhr.mean + Math.max(rhr.sd, 1) || entry.restingHr >= rhr.mean + 5;
      signals.push({key:'restingHr', label:'安靜心率', value:entry.restingHr, baseline:rhr, state:high ? 'flag' : 'ok', text:high ? `高於個人基準 ${rhr.mean} bpm` : `接近個人基準 ${rhr.mean} bpm`});
    }
  }
  if (entry.sleepHours !== null) signals.push({key:'sleepHours', label:'睡眠', value:entry.sleepHours, state:entry.sleepHours < 6 ? 'flag' : 'ok', text:entry.sleepHours < 6 ? '少於 6 小時' : '6 小時以上'});
  for (const key of ['fatigue', 'soreness']) {
    if (entry[key] !== null) signals.push({key, label:WELLNESS_FIELDS[key].label, value:entry[key], state:entry[key] >= 4 ? 'flag' : 'ok', text:entry[key] >= 4 ? '自評偏高（4–5）' : '自評 1–3'});
  }
  const judged = signals.filter(s => s.state !== 'building');
  const flags = judged.filter(s => s.state === 'flag').length;
  let status, label;
  if (judged.length < 2) { status = 'insufficient'; label = '資料不足，至少需要兩項可判斷的指標'; }
  else if (flags === 0) { status = 'good'; label = '狀態良好'; }
  else if (flags === 1) { status = 'watch'; label = '留意'; }
  else { status = 'low'; label = '偏低，可考慮減量'; }
  return {date, status, label, signals, flags};
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

export function wellnessView(state, today) {
  const entries = state.wellness ?? [];
  const athlete = state.athlete ?? {};
  const suggestions = {};
  const recentRhr = entries.filter(e => e.date > addDays(today, -7) && e.date <= today && e.restingHr !== null).map(e => e.restingHr);
  if (recentRhr.length >= 3) {
    const value = median(recentRhr);
    if (value !== athlete.restingHeartRate) suggestions.restingHeartRate = {value, text:`近 7 天安靜心率中位數 ${value} bpm（${recentRhr.length} 天）`};
  }
  const lastWeight = [...entries].reverse().find(e => e.weightKg !== null && e.date <= today);
  if (lastWeight && lastWeight.weightKg !== athlete.weightKg) suggestions.weightKg = {value:lastWeight.weightKg, text:`${lastWeight.date} 體重 ${lastWeight.weightKg} kg`};
  const from = addDays(today, -365);
  return {
    today,
    entries:entries.filter(e => e.date >= from && e.date <= today),
    readiness:readiness(entries, today),
    baselines:{hrv:baseline(entries, 'hrv', today), restingHr:baseline(entries, 'restingHr', today)},
    suggestions,
  };
}

export function validateStoredWellness(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > MAX_ENTRIES) throw Error('備份的健康紀錄格式不正確。');
  const out = list.map(e => { try { return validateWellness(e, e?.updatedAt); } catch { throw Error('備份的健康紀錄格式不正確。'); } });
  if (new Set(out.map(e => e.date)).size !== out.length) throw Error('備份的健康紀錄日期重複。');
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
