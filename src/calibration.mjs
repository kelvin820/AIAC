// Post-run calibration, first version (docs/ALGORITHMS.md R17, approved 2026-11-15).
// Steady easy runs on library routes: actual moving time ÷ the time the model predicts at the athlete's
// easy pace with the route's grade (R1) and that day's heat (R12, when the past weather is known).
// One personal factor: exponentially weighted (new run 20%), limited to 0.85–1.15, applied after 5 runs.
import {routeEffort} from './grade-effort.mjs';
import {heatAdjustment} from './weather.mjs';
import {flatPace} from './route-library.mjs';

export const RULE_VERSION = 'R17-v1';
export const ALPHA = 0.2;
export const MIN_SAMPLES = 5;
export const FACTOR_RANGE = [0.85, 1.15];
export const MIN_SECONDS = 1200;

export function easyBand(athlete) {
  const threshold = athlete?.lthr ?? (athlete?.maxHeartRate ? Math.round(athlete.maxHeartRate * 0.9) : null);
  return threshold ? [Math.round(threshold * 0.85), Math.round(threshold * 0.9)] : null;
}

// Runs that qualify, whether or not their weather is known yet.
export function calibrationRuns(state) {
  const band = easyBand(state.athlete);
  if (!band || !flatPace('Zone2', state.athlete)) return [];
  const activities = new Map((state.activities ?? []).map(a => [a.id, a]));
  return (state.routeLibrary ?? []).flatMap(entry => {
    const a = activities.get(entry.activityId);
    if (!a || !(a.durationSeconds >= MIN_SECONDS) || !entry.heartRate?.steady) return [];
    if (!(a.avgHeartRate >= band[0] && a.avgHeartRate <= band[1])) return [];
    return [{activity:a, entry}];
  });
}

export function calibrationSamples(state) {
  const pace = flatPace('Zone2', state.athlete);
  return calibrationRuns(state).map(({activity, entry}) => {
    const w = state.runWeather?.[activity.id];
    const heat = w ? heatAdjustment(w) : null;
    const effort = routeEffort(entry.points.map(([distance, altitude]) => ({distance, altitude})), pace * (heat?.factor ?? 1));
    return {activityId:activity.id, date:activity.date, name:entry.name, avgHeartRate:activity.avgHeartRate,
      actualSeconds:activity.durationSeconds, predictedSeconds:effort.predictedSeconds,
      ratio:Math.round(activity.durationSeconds / effort.predictedSeconds * 1000) / 1000,
      heatIncluded:Boolean(heat), wbgt:heat?.wbgt ?? null};
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function personalFactor(samples) {
  if (!samples.length) return {n:0, raw:null, factor:1, active:false};
  let f = samples[0].ratio;
  for (const s of samples.slice(1)) f = f * (1 - ALPHA) + s.ratio * ALPHA;
  const clamped = Math.min(FACTOR_RANGE[1], Math.max(FACTOR_RANGE[0], f));
  const active = samples.length >= MIN_SAMPLES;
  return {n:samples.length, raw:Math.round(f * 1000) / 1000, factor:active ? Math.round(clamped * 1000) / 1000 : 1, active};
}

// Qualifying runs whose day's weather has not been read yet.
export function weatherPending(state, limit = 15) {
  return calibrationRuns(state).filter(({activity, entry}) => !state.runWeather?.[activity.id] && entry.start).slice(0, limit);
}

export function calibrationView(state) {
  const samples = calibrationSamples(state);
  return {rule:RULE_VERSION, band:easyBand(state.athlete), minSamples:MIN_SAMPLES, ...personalFactor(samples),
    samples:samples.slice(-20).reverse(), weatherPending:weatherPending(state, 1000).length,
    missing:!easyBand(state.athlete) ? 'hr' : !flatPace('Zone2', state.athlete) ? 'pace' : null};
}

// Local hour (YYYY-MM-DDTHH:00) when the run started, for the past weather lookup.
export function startHour(activity, timezone) {
  const d = new Date(activity.startedAt);
  if (!Number.isFinite(+d)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:timezone || 'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'}).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
}
