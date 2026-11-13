import {test} from 'node:test';
import assert from 'node:assert/strict';
import {heartRateZone, thresholdHeartRate, personalBests, performanceData} from '../src/performance.mjs';
import {defaultAthlete} from '../src/training-load.mjs';

const run = (id, date, extra = {}) => ({id, date, name:'跑步', durationSeconds:3000, distanceMeters:10000, avgHeartRate:150, sport:'running', ...extra});

test('zones use LTHR, or 90% of max heart rate marked as estimated', () => {
  assert.deepEqual(thresholdHeartRate({lthr:170}), {bpm:170, estimated:false});
  assert.deepEqual(thresholdHeartRate({maxHeartRate:200}), {bpm:180, estimated:true});
  assert.equal(thresholdHeartRate(defaultAthlete()), null);
  const t = {bpm:200};
  assert.deepEqual([160, 169, 170, 179, 189, 199, 200, 230].map(hr => heartRateZone(hr, t)), ['z1', 'z1', 'z2', 'z2', 'z3', 'z4', 'z5', 'z5']);
  assert.equal(heartRateZone(null, t), null);
  assert.equal(heartRateZone(150, null), null);
});

test('personal bests only use measured values: 1 km laps, distance thresholds, longest', () => {
  const laps = [{durationSeconds:250, distanceMeters:1000}, {durationSeconds:230, distanceMeters:1005}, {durationSeconds:100, distanceMeters:500}];
  const bests = personalBests([
    run('a', '2026-11-01', {laps, durationSeconds:3300}),
    run('b', '2026-11-02', {durationSeconds:1350, distanceMeters:5000}),
    run('c', '2026-11-03', {durationSeconds:1200, distanceMeters:4000}),
    run('d', '2026-11-04', {durationSeconds:6000, distanceMeters:21100}),
    {id:'bike', date:'2026-11-05', name:'騎車', sport:'cycling', durationSeconds:9000, distanceMeters:60000},
  ]);
  const by = Object.fromEntries(bests.map(b => [b.key, b]));
  assert.equal(by['fastest-km'].value, Math.round(230 * 1000 / 1005));
  assert.equal(by['fastest-km'].activityId, 'a');
  assert.equal(by['pace-5k'].activityId, 'b');
  assert.equal(by['pace-10k'].activityId, 'd');
  assert.equal(by['longest-distance'].activityId, 'd');
  assert.equal(by['longest-duration'].activityId, 'bike');
  assert.deepEqual(personalBests([]), []);
});

test('performance data falls back to the planned type, excludes future days and reports zones', () => {
  const state = {
    context:{date:'2026-11-10'},
    athlete:{...defaultAthlete(), maxHeartRate:190, restingHeartRate:50, lthr:170},
    plan:[{id:'2026-11-09', type:'Interval', minutes:45, completed:false}],
    planHistory:{},
    activities:[run('a', '2026-11-09', {planId:'2026-11-09', trainingType:'Unknown'}), run('b', '2026-11-10', {trainingType:'Zone2'}), run('future', '2026-11-12')],
  };
  const data = performanceData(state);
  assert.deepEqual(data.activities.map(a => [a.id, a.type, a.zone, a.week]), [['a', 'Interval', 'z2', '2026-11-09'], ['b', 'Zone2', 'z2', '2026-11-09']]);
  assert.equal(data.pmc.at(-1).date, '2026-11-10');
  assert.deepEqual(data.zones.map(z => z.maxBpm), [145, 153, 162, 170, null]);
  assert.equal(data.threshold.estimated, false);
});
