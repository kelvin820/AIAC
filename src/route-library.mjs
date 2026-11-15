// Route library from the athlete's own past runs, and route recommendations for today's session.
// Profiles come from intervals.icu streams (route-profile.mjs) and are stored compactly: altitude every
// 100 m plus the rounded start and end points used to group repeat runs of the same route.
// Equal-effort pacing per km uses grade-effort.mjs (docs/ALGORITHMS.md R1). No LLM, no network.
import {routeProfileFromStreams} from './route-profile.mjs';
import {routeEffort, smoothProfile} from './grade-effort.mjs';
import {INTENSITY} from './workout-structure.mjs';

export const MAX_ROUTES = 200;
export const PROFILE_STEP = 100;
export const SAME_ROUTE_METERS = 200;
export const MAX_FIT_ERROR = 0.2;
export const ENTRY_VERSION = 2;
export const STEADY_HR_CV = 0.08;
export const WARMUP_SECONDS = 300;
const KIND = {Recovery:'recovery', Zone2:'easy', Indoor:'easy', 'Long Run':'easy', Tempo:'tempo', Interval:'interval'};
const QUALITY = new Set(['Tempo', 'Interval']);
const RUNNING = new Set(['running']);

const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

function endpoints(rows) {
  const gps = (Array.isArray(rows) ? rows : []).find(r => r?.type === 'latlng');
  const pts = [];
  for (const [i, entry] of (Array.isArray(gps?.data) ? gps.data : []).entries()) {
    const [lat, lng] = Array.isArray(entry) ? entry : [entry, gps.data2?.[i]];
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) pts.push([round(lat, 4), round(lng, 4)]);
  }
  return pts.length >= 2 ? {start:pts[0], end:pts.at(-1)} : {start:null, end:null};
}

// Heart-rate steadiness after a 5-minute warm-up: coefficient of variation ≤ 8% (R17, used to pick calibration runs).
export function heartRateSteadiness(rows) {
  const by = Object.fromEntries((Array.isArray(rows) ? rows : []).filter(r => r && Array.isArray(r.data)).map(r => [r.type, r.data]));
  const hr = by.heartrate, time = by.time;
  if (!hr) return null;
  const values = hr.filter((v, i) => Number.isFinite(v) && v > 30 && v < 240 && (!time || time[i] >= WARMUP_SECONDS));
  if (values.length < 60) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return {cv:Math.round(sd / mean * 1000) / 1000, steady:sd / mean <= STEADY_HR_CV};
}

// One library entry from an activity and its intervals.icu stream rows; null when there is no usable profile.
export function routeEntry(activity, rows) {
  const profile = routeProfileFromStreams(rows);
  if (!profile) return null;
  const smooth = smoothProfile(profile.points);
  const total = smooth.at(-1).distance;
  const points = [];
  for (let d = 0; d < total; d += PROFILE_STEP) points.push([d, round(smooth.find(p => p.distance >= d).altitude, 1)]);
  points.push([round(total, 0), round(smooth.at(-1).altitude, 1)]);
  const effort = routeEffort(points.map(([distance, altitude]) => ({distance, altitude})), 360);
  return {
    activityId:activity.id, date:activity.date, name:activity.name ?? '跑步路線',
    distanceMeters:effort.distanceMeters, gainMeters:effort.gainMeters, averageAltitude:effort.averageAltitude,
    altitudeSource:profile.altitudeSource, ...endpoints(rows), points,
    v:ENTRY_VERSION, heartRate:heartRateSteadiness(rows),
  };
}

// Running activities with an intervals.icu source and no entry yet (Strava-sourced ones cannot be read).
export function pendingActivities(state, limit = 15) {
  // Entries from an older version are read again (they lack heart-rate steadiness).
  const have = new Set((state.routeLibrary ?? []).filter(e => e.v >= ENTRY_VERSION).map(e => e.activityId));
  const skipped = new Set(state.routeLibrarySkipped ?? []);
  return (state.activities ?? [])
    .filter(a => RUNNING.has(a.sport) && a.distanceMeters >= 1000 && !have.has(a.id) && !skipped.has(a.id)
      && a.sources?.some(s => s.source === 'intervals') && !a.sources.some(s => s.source.startsWith('strava')))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export function addEntries(state, entries, skippedIds = []) {
  const byId = new Map((state.routeLibrary ?? []).map(e => [e.activityId, e]));
  for (const e of entries) byId.set(e.activityId, e);
  state.routeLibrary = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ROUTES);
  state.routeLibrarySkipped = [...new Set([...(state.routeLibrarySkipped ?? []), ...skippedIds])].slice(-500);
}

const meters = (a, b) => {
  if (!a || !b) return Infinity;
  const k = Math.PI / 180, x = (b[1] - a[1]) * k * Math.cos((a[0] + b[0]) / 2 * k), y = (b[0] - a[0]) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
};

// Group repeat runs of the same route: similar distance and the same start and end.
export function groupRoutes(entries) {
  const groups = [];
  for (const e of entries) {
    const g = groups.find(g => Math.abs(g.entry.distanceMeters - e.distanceMeters) <= Math.max(150, g.entry.distanceMeters * 0.03)
      && meters(g.entry.start, e.start) <= SAME_ROUTE_METERS && meters(g.entry.end, e.end) <= SAME_ROUTE_METERS);
    if (g) g.times++;
    else groups.push({entry:e, times:1});
  }
  return groups;
}

// Flat target pace for a session from the athlete's threshold pace (middle of the intensity's pace range).
export function flatPace(sessionType, athlete) {
  const t = athlete?.thresholdPaceSecPerKm;
  if (!t) return null;
  const z = INTENSITY[KIND[sessionType] ?? 'easy'];
  return Math.round(t * (z.pace[0] + z.pace[1]) / 2);
}

// Up to `count` routes whose equal-effort time is closest to the session's minutes.
export function recommendRoutes(state, session, count = 3, heat = null, calibration = null) {
  if (!session || session.type === 'Rest' || !(session.minutes > 0)) return {status:'rest', routes:[]};
  const existing = new Set((state.activities ?? []).map(a => a.id));
  const entries = (state.routeLibrary ?? []).filter(e => existing.has(e.activityId));
  if (!entries.length) return {status:'empty', routes:[]};
  const basePace = flatPace(QUALITY.has(session.type) ? 'Zone2' : session.type, state.athlete);
  const personal = calibration?.active ? calibration.factor : 1;
  const pace = basePace ? Math.round(basePace * (heat?.factor > 1 ? heat.factor : 1) * personal) : basePace;
  if (!pace) return {status:'needs-pace', routes:[], libraryCount:entries.length};
  const target = session.minutes * 60;
  const scored = groupRoutes(entries).map(({entry, times}) => {
    const effort = routeEffort(entry.points.map(([distance, altitude]) => ({distance, altitude})), pace);
    return {entry, times, effort, fit:Math.abs(effort.predictedSeconds - target) / target,
      hilliness:effort.equivalentFlatMeters / Math.max(1, effort.distanceMeters)};
  }).filter(r => r.fit <= MAX_FIT_ERROR);
  scored.sort((a, b) => QUALITY.has(session.type) ? a.hilliness - b.hilliness || a.fit - b.fit : a.fit - b.fit);
  return {
    status:scored.length ? 'ok' : 'no-match', flatPace:pace, basePace, heat:heat && heat.factor > 1 ? {wbgt:heat.wbgt, slowdownPercent:heat.slowdownPercent} : null, calibration:calibration?.active ? {factor:calibration.factor, n:calibration.n} : null, targetSeconds:target, libraryCount:entries.length,
    note:QUALITY.has(session.type) ? '品質課優先推薦最平坦的路線；路線時間以輕鬆配速估算，主課段照課表配速。' : null,
    routes:scored.slice(0, count).map(({entry, times, effort}) => ({
      activityId:entry.activityId, name:entry.name, lastRun:entry.date, timesRun:times,
      distanceMeters:effort.distanceMeters, gainMeters:effort.gainMeters, averageAltitude:effort.averageAltitude,
      altitudeSource:entry.altitudeSource, predictedSeconds:effort.predictedSeconds, equivalentFlatMeters:effort.equivalentFlatMeters,
      splits:effort.splits.map(({km, meters, pace}) => ({km, meters, pace})), howCalculated:effort.howCalculated,
    })),
  };
}
