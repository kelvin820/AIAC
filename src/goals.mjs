// Athlete goals: race event, performance metric, body weight and training consistency.
// Goal types and fields follow the Coach Watts Goal model (https://github.com/watt-mind/coach,
// prisma Goal, docs/02-features/goals), Apache License 2.0; see docs/THIRD_PARTY.md.
// Modified for AIAC: pure, browser-safe functions over AIAC state; progress is computed from
// AIAC data where possible and every value says where it came from.
import {weekStart} from './plan-weeks.mjs';
import {performanceSeries, defaultAthlete, loadActivities} from './training-load.mjs';
import {sessionTotals} from '../public/kettlebell-core.js';

export const GOAL_TYPES = ['event', 'performance', 'body', 'consistency'];
export const GOAL_STATUSES = ['active', 'completed', 'archived'];
export const PRIORITIES = ['high', 'medium', 'low'];

// Metrics AIAC can read on its own. `better` says which direction is an improvement.
export const GOAL_METRICS = {
  ctl: {label:'體能 CTL', unit:'', better:'higher', types:['performance']},
  thresholdPace: {label:'臨界配速', unit:'秒/km', better:'lower', types:['performance']},
  weeklyMinutes: {label:'近 4 週平均每週分鐘', unit:'分鐘', better:'higher', types:['performance']},
  weightKg: {label:'體重', unit:'kg', better:null, types:['body']},
  custom: {label:'自訂指標', unit:'', better:null, types:['performance', 'body']},
};

const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const text = (v, max, label, required = false) => {
  const value = typeof v === 'string' ? v.trim() : '';
  if (required && !value) throw Error(`請填寫${label}`);
  if (value.length > max) throw Error(`${label}最多 ${max} 字`);
  return value;
};
const num = (v, label, min, max, required = false) => {
  if (v === null || v === undefined || v === '') {
    if (required) throw Error(`請填寫${label}`);
    return null;
  }
  const value = Number(v);
  if (!Number.isFinite(value) || value < min || value > max) throw Error(`${label}需介於 ${min}–${max}`);
  return Math.round(value * 100) / 100;
};

export function validateGoal(input, now = new Date().toISOString()) {
  if (!GOAL_TYPES.includes(input?.type)) throw Error('目標類型不正確');
  const goal = {
    id: typeof input.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(input.id) ? input.id : globalThis.crypto.randomUUID(),
    type: input.type,
    title: text(input.title, 120, '目標名稱', true),
    description: text(input.description, 1000, '說明'),
    priority: PRIORITIES.includes(input.priority) ? input.priority : 'medium',
    status: GOAL_STATUSES.includes(input.status) ? input.status : 'active',
    targetDate: null,
    createdAt: typeof input.createdAt === 'string' && Number.isFinite(Date.parse(input.createdAt)) ? input.createdAt : now,
    updatedAt: now,
  };
  if (input.targetDate !== null && input.targetDate !== undefined && input.targetDate !== '') {
    if (!isDate(input.targetDate)) throw Error('目標日期格式不正確');
    goal.targetDate = input.targetDate;
  }
  if (goal.type === 'event') {
    if (!goal.targetDate) throw Error('賽事目標需要比賽日期');
    goal.distanceKm = num(input.distanceKm, '比賽距離', 0.1, 400);
    goal.targetTimeSeconds = num(input.targetTimeSeconds, '目標完賽時間', 60, 172800);
  } else if (goal.type === 'consistency') {
    goal.sessionsPerWeek = num(input.sessionsPerWeek, '每週次數', 1, 14, true);
  } else {
    const metric = GOAL_METRICS[input.metric];
    if (!metric || !metric.types.includes(goal.type)) throw Error('目標指標不正確');
    goal.metric = input.metric;
    goal.unit = goal.metric === 'custom' ? text(input.unit, 20, '單位') : metric.unit;
    goal.startValue = num(input.startValue, '起始值', -100000, 100000, true);
    goal.targetValue = num(input.targetValue, '目標值', -100000, 100000, true);
    if (goal.startValue === goal.targetValue) throw Error('起始值與目標值不可相同');
    goal.currentValue = goal.metric === 'custom' ? num(input.currentValue ?? input.startValue, '目前值', -100000, 100000) : null;
  }
  return goal;
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// One entry per training session: standalone device activities plus kettlebell sessions
// (timed by AIAC; a device record linked to a session is not counted again).
export function trainingSessions(state) {
  const standalone = (state.activities ?? []).filter(a => !a.kettlebellSessionId).map(a => ({date:a.date, minutes:a.durationSeconds / 60}));
  const circuits = (state.kettlebell?.sessions ?? []).map(session => ({date:session.plan.date, minutes:sessionTotals(session).totalSeconds / 60}));
  return [...standalone, ...circuits];
}

function minutesPerWeek(activities, today, weeks) {
  const thisWeek = weekStart(today);
  const from = addDays(thisWeek, -7 * weeks);
  const total = activities.filter(a => a.date >= from && a.date < thisWeek).reduce((n, a) => n + a.minutes, 0);
  return total / weeks;
}

// Current value of an automatic metric, with where it came from. null when AIAC has no data.
export function metricValue(metric, state, today) {
  const athlete = state.athlete ?? defaultAthlete();
  if (metric === 'ctl') {
    const last = performanceSeries(loadActivities(state), athlete, today, state.intervalsFitness).at(-1);
    return last ? {value:Math.round(last.ctl * 10) / 10, source:'訓練負荷計算'} : null;
  }
  if (metric === 'thresholdPace') return athlete.thresholdPaceSecPerKm ? {value:athlete.thresholdPaceSecPerKm, source:'訓練閾值設定'} : null;
  if (metric === 'weightKg') return athlete.weightKg ? {value:athlete.weightKg, source:'訓練閾值設定'} : null;
  if (metric === 'weeklyMinutes') return {value:Math.round(minutesPerWeek(trainingSessions(state), today, 4)), source:'近 4 個完整週的活動與壺鈴課'};
  return null;
}

// Share of the way from start to target, clamped to 0–1. Works whether the target is above or below the start.
export function metricProgress(start, current, target) {
  if (current === null || current === undefined) return null;
  return Math.max(0, Math.min(1, (current - start) / (target - start)));
}

export function goalProgress(goal, state, today) {
  const daysLeft = goal.targetDate ? daysBetween(today, goal.targetDate) : null;
  const base = {daysLeft, weeksLeft:daysLeft === null ? null : Math.floor(daysLeft / 7)};
  if (goal.type === 'event') {
    const last = performanceSeries(loadActivities(state), state.athlete ?? defaultAthlete(), today, state.intervalsFitness).at(-1);
    return {...base, kind:'event', ratio:null, ctl:last ? last.ctl : null, tsb:last ? last.tsb : null,
      source:last ? '訓練負荷計算' : '尚無活動紀錄'};
  }
  if (goal.type === 'consistency') {
    const thisWeek = weekStart(today);
    const sessions = trainingSessions(state);
    const count = from => sessions.filter(a => a.date >= from && a.date < addDays(from, 7)).length;
    const weeks = Array.from({length:8}, (_, i) => addDays(thisWeek, -7 * (8 - i)));
    const met = weeks.filter(w => count(w) >= goal.sessionsPerWeek).length;
    const thisWeekCount = count(thisWeek);
    return {...base, kind:'consistency', ratio:Math.min(1, thisWeekCount / goal.sessionsPerWeek), thisWeek:thisWeekCount,
      weeksMet:met, weeksChecked:8, source:'活動與壺鈴課（每堂算一次）'};
  }
  const auto = goal.metric === 'custom' ? null : metricValue(goal.metric, state, today);
  const current = goal.metric === 'custom' ? goal.currentValue : auto?.value ?? null;
  return {...base, kind:'metric', current, ratio:metricProgress(goal.startValue, current, goal.targetValue),
    source:goal.metric === 'custom' ? '手動更新' : auto?.source ?? '尚無資料，請先補上對應數值'};
}

const priorityRank = {high:0, medium:1, low:2};

// Goals with progress. Active first (priority, then nearest date), then completed, then archived.
export function goalsSummary(state, today = state.context.date) {
  const statusRank = {active:0, completed:1, archived:2};
  const goals = (state.goals ?? []).map(goal => ({...goal, progress:goalProgress(goal, state, today)}));
  goals.sort((a, b) => statusRank[a.status] - statusRank[b.status] || priorityRank[a.priority] - priorityRank[b.priority]
    || (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') || a.createdAt.localeCompare(b.createdAt));
  const primary = goals.find(goal => goal.status === 'active' && (goal.progress.daysLeft === null || goal.progress.daysLeft >= 0)) ?? null;
  return {goals, primaryId:primary?.id ?? null};
}

// Compact goal list for the coach prompt (only sent when the user asks the coach).
export function goalsForCoach(state, today = state.context.date) {
  return goalsSummary(state, today).goals.filter(goal => goal.status === 'active').slice(0, 5).map(goal => ({
    type:goal.type, title:goal.title, priority:goal.priority, targetDate:goal.targetDate, daysLeft:goal.progress.daysLeft,
    ...(goal.type === 'event' ? {distanceKm:goal.distanceKm, targetTimeSeconds:goal.targetTimeSeconds} : {}),
    ...(goal.type === 'consistency' ? {sessionsPerWeek:goal.sessionsPerWeek, thisWeek:goal.progress.thisWeek} : {}),
    ...(goal.metric ? {metric:goal.metric, unit:goal.unit, startValue:goal.startValue, currentValue:goal.progress.current, targetValue:goal.targetValue} : {}),
  }));
}

export function applyGoalAction(state, body, now) {
  state.goals ??= [];
  if (body?.action === 'delete') {
    const before = state.goals.length;
    state.goals = state.goals.filter(goal => goal.id !== body.id);
    if (state.goals.length === before) throw Error('找不到這個目標');
    return;
  }
  if (body?.action !== 'save') throw Error('目標操作不正確');
  const existing = body.goal?.id && state.goals.find(goal => goal.id === body.goal.id);
  if (body.goal?.id && !existing) throw Error('找不到這個目標');
  if (!existing && state.goals.length >= 50) throw Error('目標最多 50 個，請先刪除不需要的目標');
  const goal = validateGoal({...body.goal, createdAt:existing?.createdAt}, now);
  if (existing) state.goals[state.goals.indexOf(existing)] = goal;
  else state.goals.push(goal);
}
