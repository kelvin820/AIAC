// Today's prescription for the home page: the intensity budget (R18) plus substitutes for the
// session (R15/R16). Pure, no LLM, no network; shared by the local server, the cloud handler and the demo.
import {budgetFromState} from './daily-budget.mjs';
import {substitutes} from './cross-training.mjs';
import {recommendRoutes, pendingActivities} from './route-library.mjs';
import {DEFAULT_SETTINGS, departureHour, conditionsAt, environmentGuide} from './weather.mjs';

function localNow(timezone, now) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:timezone || 'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).formatToParts(now).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  } catch { return null; }
}

// Conditions at departure from the last fetched forecast; null when there is none for today and this place.
export function environmentView(state, today, now = new Date()) {
  const settings = state.prescriptionSettings ?? DEFAULT_SETTINGS;
  const w = state.weather;
  const base = {settings, fetchedAt:w?.fetchedAt ?? null};
  if (!w || w.latitude !== settings.latitude || w.longitude !== settings.longitude) return {...base, status:'none'};
  const nowLocal = localNow(state.context?.timezone, now);
  const hour = departureHour(today, settings.departure, nowLocal?.slice(0, 10) === today ? nowLocal : null);
  const conditions = conditionsAt(w.raw, hour);
  if (!conditions) return {...base, status:'stale'};
  return {...base, status:'ok', conditions, guide:environmentGuide(conditions)};
}

export function prescriptionView(state, today = state.context.date, now = new Date()) {
  const kettlebell = state.kettlebell?.plans?.[today];
  if (kettlebell) return {date:today, kettlebell:true, budget:null, substitutes:[], environment:environmentView(state, today, now)};
  const budget = budgetFromState(state, today);
  return {date:today, kettlebell:false, budget, substitutes:substitutes(budget.session, state.athlete ?? {}), routes:{...recommendRoutes(state, budget.session), pending:pendingActivities(state, 1000).length}, environment:environmentView(state, today, now)};
}

// Compact form for the coach's LLM input: numbers and reasons only.
export function prescriptionForCoach(view) {
  if (!view?.budget) return view?.kettlebell ? {kettlebell:true} : null;
  const env = view.environment?.status === 'ok' ? {at:view.environment.conditions.hour, place:view.environment.settings.place, ...view.environment.conditions, wind:view.environment.guide.wind.label, air:view.environment.guide.air.label, windSpeed:view.environment.conditions.wind} : null;
  const {decision, planned, session, reasons} = view.budget;
  return {decision, planned:{type:planned.type, minutes:planned.minutes}, session:{type:session.type, minutes:session.minutes},
    reasons:reasons.map(r => r.text),
    substitutes:view.substitutes.map(s => ({mode:s.label, minutes:s.minutes, coverage:s.coverage, howCalculated:s.howCalculated})),
    environment:env,
    routes:(view.routes?.routes ?? []).map(r => ({name:r.name, km:Math.round(r.distanceMeters / 100) / 10, gainMeters:r.gainMeters, minutes:Math.round(r.predictedSeconds / 60), splits:r.splits.map(s => s.pace)}))};
}
