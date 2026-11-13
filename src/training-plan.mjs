// Periodized training plan: blocks (base / build / taper / race) -> weekly minute targets -> daily sessions.
//
// Week-target rules are adapted from Coach Watts (https://github.com/watt-mind/coach,
// server/utils/plans/week-targets.ts: recovery week x0.6, progressive taper in the peak block,
// ramp cap of recent 4-week average x1.2 growing x1.1 per loading week, 240-minute floor),
// Apache License 2.0; see docs/THIRD_PARTY.md. Modified for AIAC: pure functions over AIAC weekly
// plans, running-oriented day layout, and plans are previewed and only written on confirmation,
// never over days that already have recorded training, kettlebell sessions or are in the past.
import {weekStart} from './plan-weeks.mjs';
import {hasRecordedActivity, validatePlan} from './coach.mjs';
import {sessionTotals} from '../public/kettlebell-core.js';

export const RECOVERY_WEEK_FACTOR = 0.6;
export const RAMP_BASE_MULTIPLIER = 1.2;
export const RAMP_GROWTH_PER_LOADING_WEEK = 1.1;
export const RAMP_FLOOR_MINUTES = 240;
export const MAX_PLAN_WEEKS = 52;
export const BLOCK_NAMES = {base:'基礎期', build:'強化期', taper:'減量期', race:'比賽週'};

const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const round5 = v => Math.max(0, Math.round(v / 5) * 5);
const int = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw Error(`${label}需為 ${min}–${max} 的整數`);
  return n;
};

export function validatePlanSettings(input, today) {
  const startWeek = weekStart(input?.startDate || today);
  if (startWeek < weekStart(today)) throw Error('計畫不能從過去的週開始');
  const settings = {
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : '訓練計畫',
    goalId: typeof input.goalId === 'string' && input.goalId ? input.goalId : null,
    startWeek,
    // An event goal replaces this with the weeks until race day.
    weeks: int(input.weeks ?? 12, 1, MAX_PLAN_WEEKS, '計畫週數'),
    weeklyMinutes: int(input.weeklyMinutes, 60, 1200, '每週目標分鐘'),
    daysPerWeek: int(input.daysPerWeek ?? 4, 2, 7, '每週訓練天數'),
    longRunDay: int(input.longRunDay ?? 5, 0, 6, '長跑日'),
    qualityPerWeek: int(input.qualityPerWeek ?? 1, 0, 2, '每週品質課'),
    recoveryRhythm: int(input.recoveryRhythm ?? 4, 0, 6, '恢復週週期'),
    raceWeek: Boolean(input.raceWeek),
  };
  if (settings.recoveryRhythm === 1) throw Error('恢復週週期需為 0（不安排）或 2–6');
  settings.raceDate = null;
  settings.raceMinutes = null;
  // Keep at least one easy day besides the long run.
  settings.qualityPerWeek = Math.min(settings.qualityPerWeek, Math.max(0, settings.daysPerWeek - 2));
  return settings;
}

// Split the plan into blocks. Taper: 2 weeks for 8+ week plans, 1 for 4+, none otherwise.
// With a race, the last week is the race week. The rest is about 40% base, 60% build.
export function planBlocks(weeks, raceWeek) {
  const race = raceWeek && weeks >= 2 ? 1 : 0;
  const taper = weeks >= 8 ? 2 : weeks >= 4 ? 1 : 0;
  const loading = weeks - race - taper;
  const base = loading >= 3 ? Math.max(1, Math.round(loading * 0.4)) : loading;
  const blocks = [];
  if (base) blocks.push({type:'base', weeks:base});
  if (loading - base) blocks.push({type:'build', weeks:loading - base});
  if (taper) blocks.push({type:'taper', weeks:taper});
  if (race) blocks.push({type:'race', weeks:race});
  return blocks;
}

export function rampBaseMinutes(recentWeeklyAvgMinutes) {
  return Math.round(Math.max((recentWeeklyAvgMinutes || 0) * RAMP_BASE_MULTIPLIER, RAMP_FLOOR_MINUTES));
}

// Weekly targets: loading volume capped by the ramp allowance, recovery weeks reduced, taper steps down.
export function weekTargets(settings, recentWeeklyAvgMinutes) {
  const ramp = rampBaseMinutes(recentWeeklyAvgMinutes);
  const out = [];
  let loadingOrdinal = 0, index = 0;
  for (const block of planBlocks(settings.weeks, settings.raceWeek)) {
    for (let n = 1; n <= block.weeks; n++, index++) {
      const isRecovery = (block.type === 'base' || block.type === 'build') && settings.recoveryRhythm > 0 && (index + 1) % settings.recoveryRhythm === 0;
      let minutes = settings.weeklyMinutes;
      if (block.type === 'base' || block.type === 'build') {
        if (!isRecovery) loadingOrdinal++;
        const cap = Math.round(ramp * RAMP_GROWTH_PER_LOADING_WEEK ** Math.max(0, loadingOrdinal - 1));
        minutes = Math.min(minutes, cap);
        if (isRecovery) minutes = Math.round(minutes * RECOVERY_WEEK_FACTOR);
      } else if (block.type === 'taper') {
        minutes = Math.round(minutes * (1 - n / block.weeks * 0.5));
      } else {
        minutes = Math.round(minutes * 0.4);
      }
      out.push({index, weekStart:addDays(settings.startWeek, index * 7), block:block.type, isRecovery, targetMinutes:round5(minutes)});
    }
  }
  return out;
}

// Training weekdays as offsets from the long-run day, spread so hard days have rest around them.
const DAY_PATTERNS = {1:[0], 2:[0,-3], 3:[0,-4,-2], 4:[0,-4,-2,1], 5:[0,-5,-4,-2,1], 6:[0,-5,-4,-3,-2,1], 7:[0,-6,-5,-4,-3,-2,-1]};
// Preferred quality-session days (offsets from the long run): mid-week first.
const QUALITY_PREFERENCE = [-4, -2, -5, -3, 2, 3];
const wrap = d => ((d % 7) + 7) % 7;
function trainingDays(daysPerWeek, longRunDay) {
  return DAY_PATTERNS[daysPerWeek].map(o => wrap(longRunDay + o)).sort((a, b) => a - b);
}

const adjacent = (a, b) => Math.abs(a - b) === 1;

// Day layout for one week. Quality days are never next to the long run or each other.
export function layoutWeek(week, settings) {
  const days = Array.from({length:7}, (_, i) => ({id:addDays(week.weekStart, i), type:'Rest', minutes:0, completed:false}));
  const total = week.targetMinutes;
  if (week.block === 'race') {
    // Race day from the goal date; two short easy runs earlier in the week, nothing the day before.
    const race = settings.raceDate ? (new Date(`${settings.raceDate}T12:00:00Z`).getUTCDay() + 6) % 7 : settings.longRunDay;
    const easy = [race - 5, race - 3].filter(d => d >= 0);
    // (Days after race day stay rest.)
    for (const d of easy) Object.assign(days[d], {type:'Zone2', minutes:Math.min(40, Math.max(20, round5(total / 3)))});
    Object.assign(days[race], {type:'Long Run', minutes:settings.raceMinutes ?? 0});
    return days;
  }
  const active = trainingDays(settings.daysPerWeek, settings.longRunDay);
  const long = settings.daysPerWeek >= 3 ? settings.longRunDay : null;
  const quality = [];
  const wanted = week.isRecovery ? 0 : week.block === 'base' ? Math.min(1, settings.qualityPerWeek) : week.block === 'taper' ? Math.min(1, settings.qualityPerWeek) : settings.qualityPerWeek;
  const candidates = QUALITY_PREFERENCE.map(o => wrap(settings.longRunDay + o)).filter(d => active.includes(d));
  for (const d of candidates) {
    if (quality.length >= wanted || d === long) continue;
    if ((long !== null && adjacent(d, long)) || quality.some(q => adjacent(q, d))) continue;
    quality.push(d);
  }
  const longMinutes = long === null ? 0 : Math.min(150, round5(total * (week.isRecovery ? 0.25 : 0.3)));
  const qualityMinutes = Math.min(75, Math.max(30, round5(total * 0.15)));
  const easyDays = active.filter(d => d !== long && !quality.includes(d));
  const left = total - longMinutes - qualityMinutes * quality.length;
  const easyMinutes = easyDays.length ? Math.min(90, Math.max(20, round5(left / easyDays.length))) : 0;
  if (long !== null) Object.assign(days[long], {type:'Long Run', minutes:longMinutes});
  quality.forEach((d, i) => Object.assign(days[d], {type:week.block === 'base' || (i === 1) ? 'Tempo' : 'Interval', minutes:qualityMinutes}));
  for (const d of easyDays) {
    const afterLong = long !== null && d === wrap(long + 1) && easyDays.length >= 2;
    Object.assign(days[d], {type:afterLong || week.isRecovery && d !== easyDays[0] ? 'Recovery' : 'Zone2', minutes:afterLong ? Math.min(easyMinutes, 30) : easyMinutes});
  }
  return days;
}

export function recentWeeklyAverage(state, today) {
  const thisWeek = weekStart(today), from = addDays(thisWeek, -28);
  const device = (state.activities ?? []).filter(a => !a.kettlebellSessionId && a.date >= from && a.date < thisWeek).reduce((n, a) => n + a.durationSeconds / 60, 0);
  const circuits = (state.kettlebell?.sessions ?? []).filter(s => s.plan.date >= from && s.plan.date < thisWeek).reduce((n, s) => n + sessionTotals(s).totalSeconds / 60, 0);
  return Math.round((device + circuits) / 4);
}

export function generatePlan(settings, state, today) {
  const recent = recentWeeklyAverage(state, today);
  const weeks = weekTargets(settings, recent).map(week => {
    const days = layoutWeek(week, settings);
    return {...week, days, plannedMinutes:days.reduce((n, d) => n + d.minutes, 0)};
  });
  return {settings, recentWeeklyAvgMinutes:recent, rampBaseMinutes:rampBaseMinutes(recent), blocks:planBlocks(settings.weeks, settings.raceWeek), weeks};
}

// Days that must not be overwritten: past days, recorded training, kettlebell plans or sessions.
export function protectedReason(state, date, today) {
  if (date < today) return '已過去';
  if (hasRecordedActivity(state, date)) return '已有實際紀錄';
  if (state.kettlebell?.plans?.[date] || (state.kettlebell?.sessions ?? []).some(s => s.plan.date === date)) return '已排壺鈴課';
  return null;
}

const existingWeek = (state, monday) => state.plan[0].id === monday ? state.plan : state.planHistory?.[monday] ?? null;

export function applyPreview(plan, state, today) {
  let written = 0;
  const skipped = [];
  for (const week of plan.weeks) {
    const current = existingWeek(state, week.weekStart);
    week.days.forEach((day, i) => {
      const reason = protectedReason(state, day.id, today);
      if (reason) skipped.push({date:day.id, reason, kept:current?.[i] ?? null});
      else written++;
    });
  }
  return {written, skipped};
}

// Write the plan into weekly plans. Protected days keep what they already had.
export function applyPlan(state, plan, today, now) {
  state.planHistory ??= {};
  const before = structuredClone(state.plan);
  for (const week of plan.weeks) {
    const current = existingWeek(state, week.weekStart);
    const next = week.days.map((day, i) => {
      const keep = protectedReason(state, day.id, today) && current?.[i];
      return keep ? {...current[i]} : {...day, completed:current?.[i]?.completed ?? false};
    });
    if (current) validatePlan(next, current);
    if (state.plan[0].id === week.weekStart) state.plan = next;
    else state.planHistory[week.weekStart] = next;
  }
  if (JSON.stringify(before) !== JSON.stringify(state.plan)) {
    state.revisions.push({at:now, reason:`套用訓練計畫：${plan.settings.name}`, before, after:structuredClone(state.plan)});
  }
  state.trainingPlans ??= [];
  for (const p of state.trainingPlans) if (p.status === 'active') p.status = 'replaced';
  const record = {id:globalThis.crypto.randomUUID(), status:'active', createdAt:now, settings:plan.settings,
    recentWeeklyAvgMinutes:plan.recentWeeklyAvgMinutes, blocks:plan.blocks,
    weeks:plan.weeks.map(({weekStart, block, isRecovery, targetMinutes, plannedMinutes}) => ({weekStart, block, isRecovery, targetMinutes, plannedMinutes}))};
  state.trainingPlans.unshift(record);
  state.trainingPlans = state.trainingPlans.slice(0, 20);
  return record;
}

export function trainingPlanAction(state, body, today, now) {
  if (body?.action === 'archive') {
    const plan = (state.trainingPlans ?? []).find(p => p.id === body.id);
    if (!plan) throw Error('找不到這個計畫');
    plan.status = 'archived';
    return null;
  }
  const settings = validatePlanSettings(body?.settings ?? {}, today);
  if (settings.goalId) {
    const goal = (state.goals ?? []).find(g => g.id === settings.goalId);
    if (!goal) throw Error('找不到對應的目標');
    // An event goal fixes the plan length: from the start week through the race week.
    if (goal.type === 'event' && goal.targetDate) {
      const weeks = Math.round((Date.parse(`${weekStart(goal.targetDate)}T12:00:00Z`) - Date.parse(`${settings.startWeek}T12:00:00Z`)) / 604800000) + 1;
      if (weeks < 1) throw Error('比賽日期早於計畫開始週');
      if (weeks > MAX_PLAN_WEEKS) throw Error(`比賽距今超過 ${MAX_PLAN_WEEKS} 週，請晚一點再建立計畫`);
      Object.assign(settings, {weeks, raceWeek:true, raceDate:goal.targetDate, raceMinutes:goal.targetTimeSeconds ? Math.min(180, Math.round(goal.targetTimeSeconds / 60)) : null});
    }
  }
  const plan = generatePlan(settings, state, today);
  if (body?.action === 'preview') return {...plan, apply:applyPreview(plan, state, today)};
  if (body?.action === 'apply') return applyPlan(state, plan, today, now);
  throw Error('計畫操作不正確');
}

// Where today falls in the active plan, for the coach prompt and the plan page.
export function activePlanStatus(state, today) {
  const plan = (state.trainingPlans ?? []).find(p => p.status === 'active');
  if (!plan) return null;
  const monday = weekStart(today);
  const week = plan.weeks.find(w => w.weekStart === monday);
  const last = plan.weeks.at(-1);
  return {id:plan.id, name:plan.settings.name, goalId:plan.settings.goalId, finished:monday > last.weekStart,
    week:week ? {number:plan.weeks.indexOf(week) + 1, of:plan.weeks.length, block:week.block, blockName:BLOCK_NAMES[week.block], isRecovery:week.isRecovery, targetMinutes:week.targetMinutes} : null};
}

// Structural check for plans restored from a backup.
export function validateStoredPlans(plans) {
  if (plans === undefined) return [];
  const ok = (c) => { if (!c) throw Error('備份的訓練計畫格式不正確。'); };
  ok(Array.isArray(plans) && plans.length <= 20);
  const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  for (const plan of plans) {
    ok(plan && typeof plan === 'object' && typeof plan.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(plan.id));
    ok(['active', 'replaced', 'archived'].includes(plan.status) && Number.isFinite(Date.parse(plan.createdAt)));
    ok(plan.settings && typeof plan.settings.name === 'string' && isDate(plan.settings.startWeek));
    ok(Array.isArray(plan.weeks) && plan.weeks.length >= 1 && plan.weeks.length <= MAX_PLAN_WEEKS);
    for (const week of plan.weeks) ok(isDate(week.weekStart) && week.block in BLOCK_NAMES && typeof week.isRecovery === 'boolean'
      && Number.isInteger(week.targetMinutes) && Number.isInteger(week.plannedMinutes));
  }
  ok(plans.filter(p => p.status === 'active').length <= 1);
  return structuredClone(plans);
}
