// intervals.icu sync: activities (summaries) and wellness (resting HR, HRV, sleep, weight, subjective scores).
//
// Endpoints, auth and field names follow the intervals.icu API as used by Coach Watts
// (https://github.com/watt-mind/coach, server/utils/intervals.ts and services/intervalsService.ts),
// Apache License 2.0; see docs/THIRD_PARTY.md. Modified for AIAC: a small fetch-only client that runs
// in Node or a serverless function, mapping onto AIAC activity and wellness records.
//
// Auth: personal API key as HTTP Basic, username "API_KEY", password = the key. The athlete id
// (for example i12345) is required for API-key access.
import {normalizeActivity, importActivities} from './activity-core.mjs';
import {validateWellness} from './wellness.mjs';

const BASE = 'https://intervals.icu/api/v1';
export const FIRST_SYNC_DAYS = 90;
export const OVERLAP_DAYS = 2;

export function createIntervals({apiKey, athleteId, fetchImpl = globalThis.fetch} = {}) {
  const configured = () => Boolean(apiKey?.trim() && athleteId?.trim());
  async function get(path, params) {
    if (!configured()) throw Error('請在本機 .env 設定 INTERVALS_API_KEY 與 INTERVALS_ATHLETE_ID，再重啟 AIAC。');
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    const auth = Buffer.from(`API_KEY:${apiKey.trim()}`).toString('base64');
    const response = await fetchImpl(url, {headers:{Authorization:`Basic ${auth}`, Accept:'application/json'}, redirect:'error', signal:AbortSignal.timeout(20000)});
    if (response.status === 401 || response.status === 403) {
      const error = Error('intervals.icu 拒絕了這組 API Key 或運動員 ID，請到 intervals.icu 設定頁確認後更新 .env。');
      error.code = 'INTERVALS_REJECTED';
      throw error;
    }
    if (!response.ok) throw Error(`intervals.icu 回應 ${response.status}，稍後會再試。`);
    return response.json();
  }
  // Check configuration before building the path, so a missing id gives the .env hint.
  const athlete = () => configured() ? encodeURIComponent(athleteId.trim()) : '';
  return {
    configured,
    activities:(oldest, newest) => get(`/athlete/${athlete()}/activities`, {oldest, newest}),
    wellness:(oldest, newest) => get(`/athlete/${athlete()}/wellness`, {oldest, newest}),
  };
}

const SPORTS = {Run:'running', VirtualRun:'running', TrailRun:'running', Ride:'cycling', VirtualRide:'cycling', GravelRide:'cycling', MountainBikeRide:'cycling', Swim:'swimming', OpenWaterSwim:'swimming', WeightTraining:'strength', Walk:'walking', Hike:'hiking'};
const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

// intervals.icu activity summary -> input for normalizeActivity, plus fields AIAC keeps for load.
export function mapActivity(row) {
  let start = row.start_date || row.start_date_local;
  if (typeof start === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(start)) start += row.start_date ? 'Z' : '';
  return {
    sourceId:String(row.id),
    startedAt:start,
    durationSeconds:positive(row.moving_time) ?? positive(row.elapsed_time) ?? positive(row.duration) ?? 0,
    distanceMeters:positive(row.distance),
    avgHeartRate:positive(row.average_heartrate) ? Math.round(row.average_heartrate) : null,
    sport:SPORTS[row.type] ?? String(row.type || 'unknown').toLowerCase(),
    name:typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'intervals.icu 活動',
    normalizedPower:positive(row.icu_weighted_avg_watts),
    intervalsLoad:positive(row.icu_training_load),
  };
}

// intervals.icu subjective scales are 1–4 and run in different directions. AIAC uses 1–5:
// sleep quality and mood 1 = poor … 5 = good; fatigue, soreness and stress 1 = low … 5 = high.
// Mapped linearly (CW maps the same order onto 1–10): Great/Good/Avg/Poor -> 5/4/2/1, Low/Avg/High/Extreme -> 1/2/4/5.
const GOOD_FIRST = {1:5, 2:4, 3:2, 4:1};
const LOW_FIRST = {1:1, 2:2, 3:4, 4:5};

export function mapWellness(row) {
  const date = typeof row.id === 'string' ? row.id.slice(0, 10) : null;
  const pick = (v, min, max) => positive(v) !== null && v >= min && v <= max ? v : null;
  return {
    date,
    restingHr:pick(row.restingHR, 25, 120),
    hrv:pick(row.hrv, 5, 300),
    sleepHours:pick(row.sleepSecs, 1, 57600) === null ? null : Math.round(row.sleepSecs / 360) / 10,
    weightKg:pick(row.weight, 25, 250),
    sleepQuality:GOOD_FIRST[row.sleepQuality] ?? null,
    mood:GOOD_FIRST[row.mood] ?? null,
    fatigue:LOW_FIRST[row.fatigue] ?? null,
    soreness:LOW_FIRST[row.soreness] ?? null,
    stress:LOW_FIRST[row.stress] ?? null,
  };
}

const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Merge imported wellness into a day: imported values win (intervals.icu is the primary source),
// manual values stay where intervals.icu has none, and notes are always kept.
export function mergeWellness(state, rows, today, now) {
  state.wellness ??= [];
  let saved = 0, skipped = 0;
  for (const row of rows) {
    const mapped = mapWellness(row);
    if (!mapped.date || mapped.date > today) { skipped++; continue; }
    const existing = state.wellness.find(e => e.date === mapped.date);
    const merged = {...(existing ?? {}), date:mapped.date};
    let any = false;
    for (const [k, v] of Object.entries(mapped)) if (k !== 'date' && v !== null) { merged[k] = v; any = true; }
    if (!any) { skipped++; continue; }
    const entry = validateWellness({...merged, notes:existing?.notes ?? ''}, now);
    state.wellness = state.wellness.filter(e => e.date !== entry.date);
    state.wellness.push(entry);
    saved++;
  }
  state.wellness.sort((a, b) => a.date.localeCompare(b.date));
  return {saved, skipped};
}

// intervals.icu's daily fitness (ctl) and fatigue (atl). AIAC uses them as is on those days.
export const MAX_FITNESS_DAYS = 800;
export function mergeFitness(state, rows, today) {
  state.intervalsFitness ??= {};
  let saved = 0;
  for (const row of rows) {
    const date = typeof row.id === 'string' ? row.id.slice(0, 10) : null;
    const ok = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1000;
    if (!date || date > today || !ok(row.ctl) || !ok(row.atl)) continue;
    state.intervalsFitness[date] = {ctl:Math.round(row.ctl * 10) / 10, atl:Math.round(row.atl * 10) / 10};
    saved++;
  }
  const keep = Object.keys(state.intervalsFitness).sort().slice(-MAX_FITNESS_DAYS);
  state.intervalsFitness = Object.fromEntries(keep.map(d => [d, state.intervalsFitness[d]]));
  return saved;
}

export function syncRange(status, today) {
  const oldest = status?.lastSyncDate ? addDays(status.lastSyncDate, -OVERLAP_DAYS) : addDays(today, -FIRST_SYNC_DAYS);
  return {oldest, newest:today};
}

// One sync pass. Mutates state; the caller saves it.
export async function syncIntervals(state, client, {today, now = new Date().toISOString(), backfillDays = null}) {
  const status = state.connections.intervals ??= {};
  const range = backfillDays ? {oldest:addDays(today, -backfillDays), newest:today} : syncRange(status, today);
  try {
    const [rows, wellnessRows] = await Promise.all([client.activities(range.oldest, range.newest), client.wellness(range.oldest, range.newest)]);
    const items = [];
    let invalid = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      try {
        const mapped = mapActivity(row);
        if (!(mapped.durationSeconds > 0)) { invalid++; continue; }
        const item = normalizeActivity(mapped, 'intervals', state.context.timezone);
        if (mapped.normalizedPower) item.normalizedPower = mapped.normalizedPower;
        if (mapped.intervalsLoad) item.intervalsLoad = mapped.intervalsLoad;
        items.push(item);
      } catch { invalid++; }
    }
    const counts = importActivities(state, items);
    const wellness = mergeWellness(state, Array.isArray(wellnessRows) ? wellnessRows : [], today, now);
    const anchors = mergeFitness(state, Array.isArray(wellnessRows) ? wellnessRows : [], today);
    Object.assign(status, {lastSync:now, lastSyncDate:today, lastRange:range,
      lastResult:{activities:counts.added, duplicates:counts.duplicates, invalid, wellness:wellness.saved, fitnessDays:anchors}});
    delete status.lastError;
    delete status.rejected;
    return {...counts, invalid, wellness:wellness.saved, range};
  } catch (error) {
    status.lastError = error.name === 'TimeoutError' ? 'intervals.icu 同步逾時，稍後會自動重試。'
      : error.message === 'fetch failed' ? '暫時無法連到 intervals.icu，稍後會自動重試。' : error.message;
    status.rejected = error.code === 'INTERVALS_REJECTED';
    throw Object.assign(Error(status.lastError), {code:error.code});
  }
}
