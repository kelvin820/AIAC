// Training load engine: per-activity load score, daily load, fitness / fatigue / form (PMC).
//
// Formulas and the fallback order are adapted from Coach Watts
// (https://github.com/watt-mind/coach, server/utils/normalize-tss.ts, training-stress.ts,
// docs/02-features/analytics/training-stress-metrics.md), Copyright Coach Watts contributors,
// licensed under the Apache License 2.0. Modified for AIAC: rewritten as pure, browser-safe
// functions over AIAC activity records, added a running pace score, and every score carries
// its source and confidence so estimates are never shown as measurements. See docs/THIRD_PARTY.md.

import {circuitDeviceRecords} from '../public/kettlebell-core.js';

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;

// Athlete thresholds, all optional. Pace is seconds per kilometre.
export function defaultAthlete() {
  return {maxHeartRate:null, restingHeartRate:null, lthr:null, thresholdPaceSecPerKm:null, ftp:null, weightKg:null};
}

export function validateAthlete(input) {
  const ranges = {maxHeartRate:[100,230], restingHeartRate:[25,120], lthr:[80,220], thresholdPaceSecPerKm:[120,900], ftp:[50,700], weightKg:[25,250]};
  const out = defaultAthlete();
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const raw = input?.[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) throw Error(`運動員閾值「${key}」需介於 ${min}–${max}`);
    out[key] = key === 'weightKg' ? Math.round(value * 10) / 10 : Math.round(value);
  }
  if (out.maxHeartRate && out.restingHeartRate && out.restingHeartRate >= out.maxHeartRate) throw Error('安靜心率需低於最大心率');
  if (out.maxHeartRate && out.lthr && out.lthr > out.maxHeartRate) throw Error('乳酸閾值心率不可高於最大心率');
  return out;
}

const result = (score, source, confidence, method) => ({score:Math.round(score), source, confidence, method});

// Load score for one activity. Fallback order (most to least reliable):
// power TSS -> heart-rate HRSS -> running pace score -> HR-intensity estimate -> duration only.
export function activityLoad(activity, athlete = defaultAthlete()) {
  const seconds = activity.durationSeconds;
  if (!positive(seconds)) return result(0, 'none', 'low', '沒有運動時間');
  const hours = seconds / 3600;
  const hr = positive(activity.avgHeartRate) ? activity.avgHeartRate : null;
  const {maxHeartRate:max, restingHeartRate:rest, lthr, thresholdPaceSecPerKm:threshold, ftp} = athlete;

  const np = activity.normalizedPower ?? activity.stravaMetrics?.weightedWatts;
  if (positive(np) && positive(ftp)) {
    const intensity = np / ftp;
    return result(hours * intensity * intensity * 100, 'power', 'high', `功率 TSS：標準化功率 ${Math.round(np)} W ÷ FTP ${ftp} W`);
  }

  if (hr && positive(max) && positive(rest) && max > rest && hr > rest) {
    const reserve = Math.min(1, (hr - rest) / (max - rest));
    const hrThreshold = positive(lthr) ? lthr : Math.round(max * 0.9);
    return result(seconds * hr * reserve / (hrThreshold * 3600) * 100, 'heart-rate', 'medium',
      `心率 HRSS：平均 ${hr} bpm，心率儲備 ${(reserve * 100).toFixed(0)}%，閾值 ${hrThreshold} bpm${positive(lthr) ? '' : '（以最大心率 90% 估）'}`);
  }

  if (activity.sport === 'running' && positive(activity.distanceMeters) && positive(threshold)) {
    const pace = seconds / (activity.distanceMeters / 1000);
    const intensity = threshold / pace;
    return result(hours * intensity * intensity * 100, 'pace', 'medium', `配速分數：平均配速 ÷ 臨界配速，強度 ${intensity.toFixed(2)}（未計坡度）`);
  }

  if (hr && positive(max)) {
    let intensity = hr / max;
    if (intensity < 0.55) intensity *= 0.75;
    return result(hours * 100 * intensity * intensity, 'estimate-heart-rate', 'low', `估算：平均心率 ${hr} ÷ 最大心率 ${max}`);
  }

  return result(hours * 36, 'estimate-duration', 'low', '估算：只有時間，假設中等強度；請在運動員設定補上心率閾值');
}

const nextDay = date => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
};

export function dailyLoads(activities, athlete) {
  const days = new Map();
  for (const activity of activities) {
    const {score} = activityLoad(activity, athlete);
    days.set(activity.date, (days.get(activity.date) ?? 0) + score);
  }
  return days;
}

// Day-by-day exponentially weighted fitness (CTL) and fatigue (ATL); form TSB = CTL - ATL.
// Starts at the first activity with zero load, so values are low until about six weeks of history exist.
export function performanceSeries(activities, athlete, endDate) {
  const loads = dailyLoads(activities, athlete);
  const dates = [...loads.keys()].filter(date => date <= endDate).sort();
  if (!dates.length) return [];
  const series = [];
  let ctl = 0, atl = 0;
  for (let date = dates[0]; date <= endDate; date = nextDay(date)) {
    const load = loads.get(date) ?? 0;
    const tsbBefore = ctl - atl;
    ctl += (load - ctl) / CTL_DAYS;
    atl += (load - atl) / ATL_DAYS;
    series.push({date, load, ctl, atl, tsb:ctl - atl, formBefore:tsbBefore});
  }
  return series;
}

export function formStatus(tsb) {
  if (tsb > 25) return {key:'detraining', label:'體能流失', advice:'休息偏多，體能正在下降'};
  if (tsb > 5) return {key:'fresh', label:'巔峰', advice:'精神充足，適合比賽或測驗'};
  if (tsb > -10) return {key:'maintenance', label:'維持', advice:'負荷與恢復大致平衡'};
  if (tsb > -25) return {key:'productive', label:'有效訓練', advice:'正在累積體能的理想區間'};
  if (tsb > -40) return {key:'caution', label:'注意', advice:'疲勞偏高，受傷風險上升'};
  return {key:'overreaching', label:'過度', advice:'疲勞過高，請安排休息'};
}

// Summary for the UI: today's values, 7-day change, recent series and per-activity scores.
export function loadActivities(state) {
  const devices=circuitDeviceRecords(state);
  const standalone=state.activities.filter(activity=>!activity.kettlebellSessionId);
  const circuits=(state.kettlebell?.sessions??[]).flatMap(session=>{
    const device=devices.get(session.id);
    return device?[{...device,id:session.id,date:session.plan.date}]:[];
  });
  return [...standalone,...circuits];
}

export function loadSummary(state, today = state.context.date, days = 90) {
  const athlete = state.athlete ?? defaultAthlete();
  const records=loadActivities(state);
  const series = performanceSeries(records, athlete, today);
  const last = series.at(-1) ?? null;
  const weekAgo = series.at(-8) ?? null;
  const confidence = {high:0, medium:0, low:0};
  const perActivity = {};
  for (const activity of state.activities) {
    const load = activityLoad(activity, athlete);
    perActivity[activity.id] = load;
  }
  for(const activity of records){
    const load=perActivity[activity.id]??activityLoad(activity,athlete);
    perActivity[activity.id]=load;
    if(load.score>0)confidence[load.confidence]++;
  }
  return {
    today: last && {date:last.date, ctl:last.ctl, atl:last.atl, tsb:last.tsb, status:formStatus(last.tsb)},
    change: last && weekAgo ? {ctl:last.ctl - weekAgo.ctl, atl:last.atl - weekAgo.atl, tsb:last.tsb - weekAgo.tsb} : null,
    historyDays: series.length,
    series: series.slice(-days),
    perActivity,
    confidence,
    athleteComplete: Boolean(athlete.maxHeartRate && athlete.restingHeartRate),
  };
}
