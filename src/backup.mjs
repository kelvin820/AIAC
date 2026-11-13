import {initialState} from './initial-state.mjs';
import {validatePlan} from './coach.mjs';
import {weekStart} from './plan-weeks.mjs';

export const backupLimit = 10 * 1024 * 1024;
const fields = ['profile','context','plan','planHistory','activities','messages','recommendations','revisions','memories'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string';
const id = value => string(value) && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const timestamp = value => string(value) && Number.isFinite(Date.parse(value));
const metric = value => value === null || (Number.isFinite(value) && value >= 0);
const check = (condition, label) => {if (!condition) throw Error(`備份的${label}格式不正確。`);};

export function exportBackup(state) {
  return {
    format:'aiac-backup', version:1, exportedAt:new Date().toISOString(),
    data:Object.fromEntries(fields.map(key => [key, structuredClone(state[key] ?? (key === 'planHistory' ? {} : undefined))])),
  };
}

function checkPlan(plan) {
  check(Array.isArray(plan) && plan.length === 7 && plan.every(record), '課表');
  const monday = weekStart(plan[0].id);
  const days = plan.map((_, index) => {
    const date = new Date(`${monday}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return {...plan[index], id:date.toISOString().slice(0,10)};
  });
  validatePlan(plan, days);
  return monday;
}

function checkActivity(activity) {
  check(record(activity) && id(activity.id) && string(activity.name) && string(activity.sport)
    && string(activity.source) && string(activity.sourceId) && timestamp(activity.startedAt)
    && Number.isFinite(activity.durationSeconds) && activity.durationSeconds >= 0
    && metric(activity.distanceMeters) && metric(activity.avgHeartRate)
    && string(activity.timezone) && string(activity.trainingType) && (activity.planId === null || string(activity.planId))
    && Array.isArray(activity.quality) && activity.quality.every(string)
    && Array.isArray(activity.sources) && activity.sources.every(source => record(source) && string(source.source) && string(source.sourceId)), '活動');
  weekStart(activity.date);
  if (activity.route !== undefined) check(Array.isArray(activity.route) && activity.route.length <= 1200
    && activity.route.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
      && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180), 'GPS 路線');
  if (activity.laps !== undefined) check(Array.isArray(activity.laps) && activity.laps.every(record), '分圈');
}

export function restoreBackup(state, backup) {
  check(record(backup) && backup.format === 'aiac-backup' && backup.version === 1 && record(backup.data), '版本或檔案');
  const data = backup.data;
  const defaults = initialState();
  check(record(data.profile) && Object.keys(defaults.profile).every(key => key === 'weeklyMinutes'
    ? Number.isFinite(data.profile[key]) && data.profile[key] >= 0 && data.profile[key] <= 2000
    : string(data.profile[key])), '個人設定');
  check(record(data.context) && Object.keys(defaults.context).every(key => key === 'minutes'
    ? Number.isFinite(data.context[key]) && data.context[key] >= 0 && data.context[key] <= 180
    : string(data.context[key])), '每日情境');
  weekStart(data.context.date);
  new Intl.DateTimeFormat('en', {timeZone:data.context.timezone});
  const activeWeek = checkPlan(data.plan);
  check(record(data.planHistory), '課表歷史');
  for (const [week, plan] of Object.entries(data.planHistory)) check(week !== activeWeek && checkPlan(plan) === week, '課表歷史');
  check(Array.isArray(data.activities), '活動');
  data.activities.forEach(checkActivity);
  check(new Set(data.activities.map(activity => activity.id)).size === data.activities.length, '活動識別碼');
  check(Array.isArray(data.messages) && data.messages.every(message => record(message) && string(message.text) && string(message.role)), '對話');
  check(Array.isArray(data.memories) && data.memories.every(memory => record(memory) && id(memory.id) && string(memory.text)), '記憶');
  check(Array.isArray(data.revisions) && data.revisions.every(revision => record(revision) && timestamp(revision.at) && string(revision.reason)), '課表修改紀錄');
  check(Array.isArray(data.recommendations), '教練建議');
  for (const recommendation of data.recommendations) {
    check(record(recommendation) && id(recommendation.id) && timestamp(recommendation.at)
      && string(recommendation.text) && Array.isArray(recommendation.uncertainties) && recommendation.uncertainties.every(string), '教練建議');
    if (recommendation.proposedPlan) {
      checkPlan(recommendation.planBefore);
      validatePlan(recommendation.proposedPlan, recommendation.planBefore);
    }
  }
  // Drop lastOpenedOn so the next open moves a restored context date to today.
  const {lastOpenedOn, ...rest} = state;
  return {...rest, ...Object.fromEntries(fields.map(key => [key, structuredClone(data[key])]))};
}
