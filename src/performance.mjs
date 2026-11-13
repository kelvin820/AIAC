// Performance page data: full fitness / fatigue / form history, weekly volume, heart-rate zone
// distribution and personal bests. Pure and browser-safe so the local server and the browser
// demo share it. Zone bands follow the common LTHR-based five-zone model; PMC comes from
// training-load.mjs (adapted from Coach Watts, Apache 2.0, see docs/THIRD_PARTY.md).
import {activityLoad, defaultAthlete, performanceSeries} from './training-load.mjs';
import {activityLapFacts} from './activity-core.mjs';
import {weekStart} from './plan-weeks.mjs';

// Upper bounds as a share of threshold heart rate. Z5 is everything at or above threshold.
export const HR_ZONES = [
  {key:'z1', label:'Z1 恢復', max:0.85},
  {key:'z2', label:'Z2 有氧', max:0.90},
  {key:'z3', label:'Z3 節奏', max:0.95},
  {key:'z4', label:'Z4 次閾值', max:1.00},
  {key:'z5', label:'Z5 閾值以上', max:Infinity},
];

export function thresholdHeartRate(athlete) {
  if (athlete?.lthr) return {bpm:athlete.lthr, estimated:false};
  if (athlete?.maxHeartRate) return {bpm:Math.round(athlete.maxHeartRate * 0.9), estimated:true};
  return null;
}

export function heartRateZone(avgHeartRate, threshold) {
  if (!threshold || !(avgHeartRate > 0)) return null;
  const ratio = avgHeartRate / threshold.bpm;
  return HR_ZONES.find(zone => ratio < zone.max).key;
}

// Fastest lap of about one kilometre (auto-lap 950–1050 m), from FIT lap summaries.
function fastestKilometre(activity) {
  let best = null;
  for (const lap of activityLapFacts(activity)) {
    if (!(lap.distanceMeters >= 950 && lap.distanceMeters <= 1050) || !lap.paceSecondsPerKm) continue;
    if (!best || lap.paceSecondsPerKm < best.paceSecondsPerKm) best = {paceSecondsPerKm:lap.paceSecondsPerKm, lap:lap.lap};
  }
  return best;
}

export function personalBests(activities) {
  const runs = activities.filter(a => a.sport === 'running' && a.durationSeconds > 0);
  const ref = a => ({activityId:a.id, date:a.date, name:a.name});
  const pace = a => a.durationSeconds / (a.distanceMeters / 1000);
  const bests = [];
  let km = null;
  for (const run of runs) {
    const lap = fastestKilometre(run);
    if (lap && (!km || lap.paceSecondsPerKm < km.paceSecondsPerKm)) km = {...lap, ...ref(run)};
  }
  if (km) bests.push({key:'fastest-km', label:'最快 1 公里分圈', kind:'pace', value:km.paceSecondsPerKm, note:`第 ${km.lap} 圈`, ...km});
  for (const [key, label, min] of [['pace-5k', '5 公里以上最佳平均配速', 5000], ['pace-10k', '10 公里以上最佳平均配速', 10000]]) {
    const best = runs.filter(a => a.distanceMeters >= min).sort((a, b) => pace(a) - pace(b))[0];
    if (best) bests.push({key, label, kind:'pace', value:pace(best), note:`${(best.distanceMeters / 1000).toFixed(2)} km`, ...ref(best)});
  }
  const longest = runs.filter(a => a.distanceMeters > 0).sort((a, b) => b.distanceMeters - a.distanceMeters)[0];
  if (longest) bests.push({key:'longest-distance', label:'最長距離', kind:'distance', value:longest.distanceMeters, ...ref(longest)});
  const longestTime = [...activities].filter(a => a.durationSeconds > 0).sort((a, b) => b.durationSeconds - a.durationSeconds)[0];
  if (longestTime) bests.push({key:'longest-duration', label:'最長時間', kind:'duration', value:longestTime.durationSeconds, ...ref(longestTime)});
  return bests;
}

// Everything the Performance page needs; the client filters by period without another request.
export function performanceData(state, today = state.context.date) {
  const athlete = state.athlete ?? defaultAthlete();
  const threshold = thresholdHeartRate(athlete);
  const planTypes = new Map([...state.plan, ...Object.values(state.planHistory ?? {}).flat()].map(day => [day.id, day.type]));
  const activities = state.activities.filter(a => a.date <= today).map(a => {
    const load = activityLoad(a, athlete);
    const type = a.trainingType && a.trainingType !== 'Unknown' ? a.trainingType : (a.planId && planTypes.get(a.planId)) || 'Unknown';
    return {id:a.id, date:a.date, week:weekStart(a.date), minutes:a.durationSeconds / 60, distanceMeters:a.distanceMeters, load:load.score,
      confidence:load.confidence, type, zone:heartRateZone(a.avgHeartRate, threshold), sport:a.sport};
  });
  return {
    today,
    pmc:performanceSeries(state.activities, athlete, today).map(({date, load, ctl, atl, tsb}) => ({date, load, ctl, atl, tsb})),
    activities,
    zones:HR_ZONES.map(({key, label, max}) => ({key, label, maxBpm:threshold && Number.isFinite(max) ? Math.round(threshold.bpm * max) : null})),
    threshold,
    bests:personalBests(state.activities.filter(a => a.date <= today)),
  };
}
