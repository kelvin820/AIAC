// Structured workouts: warm-up, main set, repeats, cool-down, with pace, heart-rate or RPE targets.
//
// Step shape follows the Coach Watts structured workout format (https://github.com/watt-mind/coach,
// server/utils/structured-workout-validation.ts: typed steps with durations and targets, nested
// repeat blocks that must contain a recovery step), Apache License 2.0; see docs/THIRD_PARTY.md.
// Modified for AIAC: generated deterministically from the weekly plan day and athlete thresholds
// (never stored, so plan or threshold edits update it), with running templates and a factual
// execution check against recorded activities.
import {activityLapFacts} from './activity-core.mjs';
import {defaultAthlete} from './training-load.mjs';

// Intensity per kind: pace as a multiple of threshold pace (higher = slower), heart rate as a
// share of threshold heart rate, RPE on a 1–10 scale.
export const INTENSITY = {
  recovery: {label:'恢復', pace:[1.30, 1.45], hr:[0.75, 0.85], rpe:[2, 3]},
  easy: {label:'輕鬆有氧', pace:[1.15, 1.30], hr:[0.85, 0.90], rpe:[3, 4]},
  tempo: {label:'節奏', pace:[1.03, 1.08], hr:[0.92, 0.98], rpe:[6, 7]},
  interval: {label:'間歇', pace:[0.93, 0.98], hr:[0.98, 1.05], rpe:[8, 9]},
};

export function targetBasis(athlete = defaultAthlete()) {
  if (athlete.thresholdPaceSecPerKm) return {kind:'pace', value:athlete.thresholdPaceSecPerKm, note:'依臨界配速'};
  if (athlete.lthr) return {kind:'hr', value:athlete.lthr, note:'依乳酸閾值心率'};
  if (athlete.maxHeartRate) return {kind:'hr', value:Math.round(athlete.maxHeartRate * 0.9), note:'依最大心率 90% 估算的閾值心率'};
  return {kind:'rpe', value:null, note:'沒有配速或心率閾值，用自覺強度（1–10）'};
}

// Pace targets are seconds per km (low = faster bound). HR targets are bpm.
export function target(intensity, basis) {
  const z = INTENSITY[intensity];
  if (basis.kind === 'pace') return {kind:'pace', low:Math.round(basis.value * z.pace[0]), high:Math.round(basis.value * z.pace[1])};
  if (basis.kind === 'hr') return {kind:'hr', low:Math.round(basis.value * z.hr[0]), high:Math.round(basis.value * z.hr[1])};
  return {kind:'rpe', low:z.rpe[0], high:z.rpe[1]};
}

const step = (type, minutes, intensity, basis, label) => ({type, durationSeconds:Math.round(minutes * 60), intensity, label:label ?? INTENSITY[intensity].label, target:target(intensity, basis)});

// Build the steps for one plan day. Returns null for rest days and days without minutes.
export function buildStructure(day, athlete = defaultAthlete()) {
  if (!day || day.type === 'Rest' || !(day.minutes > 0)) return null;
  const basis = targetBasis(athlete);
  const total = day.minutes;
  let steps;
  if (day.type === 'Recovery') {
    steps = [step('active', total, 'recovery', basis, '恢復跑，可交談的輕鬆強度')];
  } else if (day.type === 'Tempo' && total >= 30) {
    const warm = 15;
    let main = total - warm - Math.max(5, Math.min(10, total - warm - 10));
    let block;
    if (main > 30) {
      // Long tempo is split in two with a 3-minute jog; the leftover goes to the cool-down.
      const piece = Math.floor((main - 6) / 2);
      block = {type:'repeat', reps:2, steps:[step('active', piece, 'tempo', basis, '節奏跑'), step('rest', 3, 'recovery', basis, '慢跑恢復')]};
      main = 2 * (piece + 3);
    } else {
      block = step('active', main, 'tempo', basis, '節奏跑');
    }
    steps = [step('warmup', warm, 'easy', basis, '暖身慢跑'), block, step('cooldown', total - warm - main, 'easy', basis, '緩和慢跑')];
  } else if (day.type === 'Interval' && total >= 38) {
    // 38 minutes is the minimum: 15 warm-up + 3 x (4 + 2) + 5 cool-down.
    const warm = 15, reps = Math.max(3, Math.min(8, Math.floor((total - warm - 5) / 6)));
    const cool = total - warm - reps * 6;
    steps = [step('warmup', warm, 'easy', basis, '暖身慢跑，最後加 3–4 次短加速'),
      {type:'repeat', reps, steps:[step('active', 4, 'interval', basis, '間歇快跑'), step('rest', 2, 'recovery', basis, '慢跑恢復')]},
      step('cooldown', Math.max(5, cool), 'easy', basis, '緩和慢跑')];
  } else {
    // Zone2, Long Run, Indoor, and short Tempo/Interval days fall back to a steady session.
    const warm = total >= 40 ? 10 : 5, cool = total >= 30 ? 5 : 0;
    const label = day.type === 'Long Run' ? '長跑，穩定有氧' : day.type === 'Indoor' ? '室內有氧（跑步機或訓練台）' : '穩定有氧';
    steps = [step('warmup', warm, 'easy', basis, '暖身慢跑'), step('active', total - warm - cool, 'easy', basis, label),
      ...(cool ? [step('cooldown', cool, 'easy', basis, '緩和慢跑')] : [])];
    if (day.type !== 'Zone2' && day.type !== 'Long Run' && day.type !== 'Indoor') steps[1].note = '這天時間太短，無法安排完整的品質課，改為穩定有氧。';
  }
  return {date:day.id, type:day.type, plannedMinutes:total, basis, steps, totalSeconds:totalSeconds(steps)};
}

export function totalSeconds(steps) {
  return steps.reduce((n, s) => n + (s.type === 'repeat' ? s.reps * totalSeconds(s.steps) : s.durationSeconds), 0);
}

// Every repeat block must contain a recovery step (Coach Watts validation rule).
export function validateStructure(structure) {
  const check = steps => steps.every(s => s.type !== 'repeat' || (s.reps >= 1 && s.steps.some(c => c.type === 'rest') && check(s.steps)));
  return Boolean(structure) && check(structure.steps);
}

// The main work steps (the part the execution check compares against).
export function mainSteps(structure) {
  const out = [];
  for (const s of structure.steps) {
    if (s.type === 'repeat') out.push(...s.steps.filter(c => c.type === 'active').map(c => ({...c, reps:s.reps})));
    else if (s.type === 'active') out.push(s);
  }
  return out;
}

const within = (value, t) => value >= t.low && value <= t.high;

// Facts only: duration against plan, average HR or pace against the main target, interval laps in range.
export function executionCheck(structure, activities) {
  if (!structure || !activities.length) return null;
  const seconds = activities.reduce((n, a) => n + a.durationSeconds, 0);
  const main = mainSteps(structure)[0];
  const out = {plannedMinutes:structure.plannedMinutes, actualMinutes:Math.round(seconds / 60 * 10) / 10,
    timeRatio:Math.round(seconds / 60 / structure.plannedMinutes * 100), basis:structure.basis.kind, checks:[]};
  const primary = activities.reduce((a, b) => b.durationSeconds > a.durationSeconds ? b : a);
  if (main.target.kind === 'hr' && primary.avgHeartRate > 0 && !main.reps) {
    out.checks.push({metric:'平均心率', value:primary.avgHeartRate, target:main.target,
      result:within(primary.avgHeartRate, main.target) ? 'in' : primary.avgHeartRate > main.target.high ? 'above' : 'below'});
  }
  if (main.target.kind === 'pace' && primary.distanceMeters > 0 && !main.reps) {
    const pace = Math.round(primary.durationSeconds / (primary.distanceMeters / 1000));
    // Average pace includes warm-up and cool-down, so it is compared with a widened band.
    const band = {kind:'pace', low:main.target.low, high:Math.round(main.target.high * 1.05)};
    out.checks.push({metric:'平均配速（含暖身緩和）', value:pace, target:band, result:within(pace, band) ? 'in' : pace < band.low ? 'faster' : 'slower'});
  }
  if (main.reps) {
    const laps = activities.flatMap(a => activityLapFacts(a));
    if (laps.length) {
      const hits = laps.filter(l => main.target.kind === 'pace' ? l.paceSecondsPerKm && within(l.paceSecondsPerKm, main.target) : main.target.kind === 'hr' ? l.avgHeartRate && within(l.avgHeartRate, main.target) : false).length;
      out.checks.push({metric:main.target.kind === 'rpe' ? '分圈' : '落在間歇目標內的分圈', value:hits, of:main.reps, laps:laps.length, target:main.target, result:main.target.kind === 'rpe' ? 'unknown' : hits >= main.reps ? 'in' : 'below'});
    } else {
      out.checks.push({metric:'分圈', value:null, result:'unknown', note:'沒有分圈資料，無法比對每組間歇。'});
    }
  }
  return out;
}

const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Structures for plan days near today, and execution checks for linked activities in that range.
export function workoutsView(state, today = state.context.date, before = 35, after = 70) {
  const from = addDays(today, -before), to = addDays(today, after);
  const athlete = state.athlete ?? defaultAthlete();
  const days = [...Object.values(state.planHistory ?? {}).flat(), ...state.plan].filter(d => d.id >= from && d.id <= to);
  const structures = {}, checks = {};
  for (const day of days) {
    if (state.kettlebell?.plans?.[day.id]) continue;
    const structure = buildStructure(day, athlete);
    if (!structure) continue;
    structures[day.id] = structure;
    const linked = (state.activities ?? []).filter(a => a.planId === day.id && !a.kettlebellSessionId);
    const check = executionCheck(structure, linked);
    if (check) checks[day.id] = check;
  }
  return {structures, checks};
}
