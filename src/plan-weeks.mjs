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
  state.plan = history[selected] ?? Array.from({length:7}, (_, index) => {
    const day = new Date(`${selected}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + index);
    return {id:day.toISOString().slice(0, 10), type:'Rest', minutes:0, completed:false};
  });
  delete history[selected];
}

export function hasPlanDate(state, date) {
  return state.plan.some(day => day.id === date)
    || Object.values(state.planHistory ?? {}).some(week => week.some(day => day.id === date));
}
