import {comparison} from './activity-core.mjs';
import {budget} from './coach.mjs';
import {planForWeek, todayIn} from './plan-weeks.mjs';

export function currentWeekView(state, today = todayIn(state.context.timezone)) {
  const plan = planForWeek(state, today);
  return {today, plan, budget:budget(state, plan), comparison:comparison(state, plan)};
}
