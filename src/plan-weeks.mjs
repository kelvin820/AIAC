export function weekStart(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('請提供有效日期');
  const day = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(+day) || day.toISOString().slice(0, 10) !== date) throw Error('請提供有效日期');
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

export function selectPlanWeek(state, date) {
  const selected = weekStart(date);
  const current = state.plan[0].id;
  if (selected === current) return;
  const history = state.planHistory ??= {};
  history[current] = state.plan;
  state.plan = history[selected] ?? restWeek(selected);
  delete history[selected];
}

function restWeek(monday) {
  return Array.from({length:7}, (_, index) => {
    const day = new Date(`${monday}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + index);
    return {id:day.toISOString().slice(0, 10), type:'Rest', minutes:0, completed:false};
  });
}

export function planForWeek(state, date) {
  const monday = weekStart(date);
  if (state.plan[0].id === monday) return state.plan;
  return state.planHistory?.[monday] ?? restWeek(monday);
}

export function ensurePlanWeek(state,date) {
  const monday=weekStart(date);
  if(monday!==state.plan[0].id) (state.planHistory??={})[monday]??=restWeek(monday);
}

export function hasPlanDate(state, date) {
  return state.plan.some(day => day.id === date)
    || Object.values(state.planHistory ?? {}).some(week => week.some(day => day.id === date));
}

export function todayIn(timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:timezone}).format(now);
}

// On the first open of a new day, move the daily context to today. If the
// active plan was showing the old "today", follow it to today's week. A past
// date the user picks keeps until the next day begins.
export function advanceToToday(state, today) {
  weekStart(today);
  if (state.lastOpenedOn && state.lastOpenedOn >= today) return false;
  state.lastOpenedOn = today;
  const previous = state.context.date;
  if (typeof previous === 'string' && previous < today) {
    const followed = state.plan.some(day => day.id === previous);
    state.context.date = today;
    delete state.context.trainingIntent;
    if (followed) selectPlanWeek(state, today);
  }
  return true;
}
