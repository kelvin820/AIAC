// Today's intensity budget: start from the planned session and only scale it down when recovery or
// load signals say so. Never raises intensity or adds make-up work (product red line).
//
// Rules are docs/ALGORITHMS.md R18 (first version, approved 2026-11-15, AIAC's own thresholds).
// Every adjustment carries a reason so the AI coach and the UI can explain it.
import {readiness} from './wellness.mjs';
import {performanceSeries, dailyLoads, defaultAthlete, loadActivities} from './training-load.mjs';

export const RULE_VERSION = 'R18-v1';
export const DEFAULT_SESSION = {type:'Zone2', minutes:40};
export const QUALITY = new Set(['Tempo', 'Interval']);
const TYPE_LABEL = {Rest:'休息', Recovery:'恢復跑', Zone2:'輕鬆有氧', Indoor:'室內有氧', 'Long Run':'長跑', Tempo:'節奏跑', Interval:'間歇'};

const round5 = n => Math.max(5, Math.round(n / 5) * 5);

// inputs: {planDay, readiness, tsb, yesterdayLoad, avgDailyLoad}
//   planDay: {type, minutes} or null (no plan -> DEFAULT_SESSION)
//   readiness: output of wellness.readiness (status good|watch|low|insufficient|none)
//   tsb: today's form (CTL − ATL) or null
//   yesterdayLoad / avgDailyLoad: yesterday's load and the 28-day average daily load
export function todayBudget({planDay = null, readiness:ready = null, tsb = null, yesterdayLoad = null, avgDailyLoad = null} = {}) {
  const planned = planDay && planDay.type ? {type:planDay.type, minutes:planDay.minutes ?? 0} : null;
  const base = planned ?? DEFAULT_SESSION;
  const reasons = [];
  if (!planned) reasons.push({key:'no-plan', text:`今天沒有計畫課，預設${TYPE_LABEL.Zone2} ${DEFAULT_SESSION.minutes} 分鐘`});
  if (base.type === 'Rest' || !(base.minutes > 0)) {
    return result(base, {type:'Rest', minutes:0}, 'rest', [...reasons, {key:'planned-rest', text:'計畫今天休息'}], ready, tsb);
  }

  // Each rule proposes an outcome with a severity; the most severe wins, all triggered reasons are listed.
  const hits = [];
  if (typeof tsb === 'number' && tsb < -40) hits.push({severity:4, key:'tsb-overreaching', text:`狀態值 ${tsb.toFixed(0)}，疲勞過高（< −40）：建議休息，或只做 20 分鐘恢復`, outcome:{type:'Recovery', minutes:Math.min(20, base.minutes)}, allowRest:true});
  if (ready?.status === 'low') hits.push({severity:3, key:'readiness-low', text:`恢復狀況偏低（${ready.flags} 個警訊）：改恢復課，時間 × 0.7`, outcome:{type:'Recovery', minutes:round5(base.minutes * 0.7)}});
  if (ready?.status === 'watch' && QUALITY.has(base.type)) hits.push({severity:2, key:'readiness-watch', text:'恢復狀況留意（1 個警訊）：品質課降為輕鬆課，時間不變', outcome:{type:'Zone2', minutes:base.minutes}});
  if (typeof tsb === 'number' && tsb < -25 && QUALITY.has(base.type)) hits.push({severity:2, key:'tsb-caution', text:`狀態值 ${tsb.toFixed(0)}，疲勞明顯大於體能（< −25）：品質課降為輕鬆課`, outcome:{type:'Zone2', minutes:base.minutes}});
  if (yesterdayLoad > 0 && avgDailyLoad > 0 && yesterdayLoad > 2 * avgDailyLoad && QUALITY.has(base.type)) hits.push({severity:2, key:'yesterday-spike', text:`昨天負荷 ${Math.round(yesterdayLoad)}，超過近 4 週日平均 ${Math.round(avgDailyLoad)} 的 2 倍：今天不排品質課`, outcome:{type:'Zone2', minutes:base.minutes}});

  // Reasons for each signal the user can see, including the ones that did not change anything.
  for (const signal of ready?.signals ?? []) if (signal.state === 'flag') reasons.push({key:`signal-${signal.key}`, text:`${signal.label}：${signal.text}`});
  if (!hits.length) {
    if (ready?.status === 'good') reasons.push({key:'good', text:'狀況良好，可照計畫（不自動加量）'});
    else if (!ready || ready.status === 'none' || ready.status === 'insufficient') reasons.push({key:'no-readiness', text:'今天恢復資料不足，依計畫與負荷判斷'});
    return result(base, {...base}, 'as-planned', reasons, ready, tsb);
  }
  const top = hits.reduce((a, b) => b.severity > a.severity ? b : a);
  for (const hit of hits) reasons.push({key:hit.key, text:hit.text, applied:hit === top});
  return result(base, top.outcome, top.allowRest ? 'rest-or-recovery' : 'reduced', reasons, ready, tsb);
}

function result(planned, session, decision, reasons, ready, tsb) {
  return {
    rule:RULE_VERSION, decision,
    planned:{...planned, label:TYPE_LABEL[planned.type] ?? planned.type},
    session:{...session, label:TYPE_LABEL[session.type] ?? session.type},
    reasons,
    inputs:{readiness:ready?.status ?? 'none', tsb:typeof tsb === 'number' ? Math.round(tsb * 10) / 10 : null},
  };
}

const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Gather the inputs from the stored state.
export function budgetFromState(state, today = state.context.date) {
  const athlete = state.athlete ?? defaultAthlete();
  const days = [...Object.values(state.planHistory ?? {}).flat(), ...(state.plan ?? [])];
  const planDay = days.find(d => d.id === today) ?? null;
  const activities = state.kettlebell ? loadActivities(state) : state.activities ?? [];
  const series = performanceSeries(activities, athlete, today, state.intervalsFitness);
  const todayRow = series.at(-1)?.date === today ? series.at(-1) : null;
  // Form going into today: yesterday's values, not today's (today's training has not happened yet).
  const yesterday = addDays(today, -1);
  const yRow = series.find(r => r.date === yesterday);
  const tsb = yRow ? yRow.tsb : todayRow ? todayRow.formBefore : null;
  const loads = dailyLoads(activities, athlete);
  let sum = 0;
  for (let i = 1; i <= 28; i++) sum += loads.get(addDays(today, -i)) ?? 0;
  return todayBudget({planDay, readiness:readiness(state.wellness ?? [], today), tsb,
    yesterdayLoad:loads.get(yesterday) ?? 0, avgDailyLoad:sum / 28});
}
