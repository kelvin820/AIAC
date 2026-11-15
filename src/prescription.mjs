// Today's prescription for the home page: the intensity budget (R18) plus substitutes for the
// session (R15/R16). Pure, no LLM, no network; shared by the local server, the cloud handler and the demo.
import {budgetFromState} from './daily-budget.mjs';
import {substitutes} from './cross-training.mjs';
import {recommendRoutes, pendingActivities} from './route-library.mjs';

export function prescriptionView(state, today = state.context.date) {
  const kettlebell = state.kettlebell?.plans?.[today];
  if (kettlebell) return {date:today, kettlebell:true, budget:null, substitutes:[]};
  const budget = budgetFromState(state, today);
  return {date:today, kettlebell:false, budget, substitutes:substitutes(budget.session, state.athlete ?? {}), routes:{...recommendRoutes(state, budget.session), pending:pendingActivities(state, 1000).length}};
}

// Compact form for the coach's LLM input: numbers and reasons only.
export function prescriptionForCoach(view) {
  if (!view?.budget) return view?.kettlebell ? {kettlebell:true} : null;
  const {decision, planned, session, reasons} = view.budget;
  return {decision, planned:{type:planned.type, minutes:planned.minutes}, session:{type:session.type, minutes:session.minutes},
    reasons:reasons.map(r => r.text),
    substitutes:view.substitutes.map(s => ({mode:s.label, minutes:s.minutes, coverage:s.coverage, howCalculated:s.howCalculated})),
    routes:(view.routes?.routes ?? []).map(r => ({name:r.name, km:Math.round(r.distanceMeters / 100) / 10, gainMeters:r.gainMeters, minutes:Math.round(r.predictedSeconds / 60), splits:r.splits.map(s => s.pace)}))};
}
