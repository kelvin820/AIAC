import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityLoad, performanceSeries, formStatus, validateAthlete, defaultAthlete, loadSummary} from '../src/training-load.mjs';
import {createDemoService} from '../src/demo-service.mjs';

const run = (date, extra = {}) => ({id:date + (extra.id ?? ''), date, durationSeconds:3600, distanceMeters:10000, avgHeartRate:150, sport:'running', ...extra});
const athlete = {...defaultAthlete(), maxHeartRate:190, restingHeartRate:50, lthr:170};
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('heart-rate HRSS follows the documented formula and is marked medium confidence', () => {
  const load = activityLoad(run('2026-11-02'), athlete);
  // 3600 s × 150 bpm × HRR (100/140) ÷ (170 × 3600) × 100
  assert.equal(load.score, Math.round(150 * (100 / 140) / 170 * 100));
  assert.equal(load.source, 'heart-rate');
  assert.equal(load.confidence, 'medium');
  const noLthr = activityLoad(run('2026-11-02'), {...athlete, lthr:null});
  assert.equal(noLthr.score, Math.round(150 * (100 / 140) / 171 * 100));
  assert.match(noLthr.method, /最大心率 90%/);
});

test('fallback order: power, heart rate, pace, HR estimate, then duration only', () => {
  assert.equal(activityLoad(run('d', {normalizedPower:250}), {...athlete, ftp:250}).source, 'power');
  assert.equal(activityLoad(run('d', {normalizedPower:250}), {...athlete, ftp:250}).score, 100);
  assert.equal(activityLoad(run('d'), athlete).source, 'heart-rate');
  const pace = activityLoad(run('d', {avgHeartRate:null}), {...defaultAthlete(), thresholdPaceSecPerKm:300});
  // 6:00/km against a 5:00/km threshold: IF 300/360
  assert.equal(pace.source, 'pace');
  assert.equal(pace.score, Math.round((300 / 360) ** 2 * 100));
  const estimate = activityLoad(run('d'), {...defaultAthlete(), maxHeartRate:200});
  assert.equal(estimate.source, 'estimate-heart-rate');
  assert.equal(estimate.score, Math.round(100 * 0.75 ** 2));
  assert.equal(estimate.confidence, 'low');
  const duration = activityLoad(run('d', {avgHeartRate:null}), defaultAthlete());
  assert.deepEqual([duration.source, duration.score, duration.confidence], ['estimate-duration', 36, 'low']);
  assert.equal(activityLoad(run('d', {durationSeconds:0}), athlete).score, 0);
});

test('low-intensity heart-rate estimates are damped', () => {
  const easy = activityLoad(run('d', {avgHeartRate:100}), {...defaultAthlete(), maxHeartRate:200});
  assert.equal(easy.score, Math.round(100 * (0.5 * 0.75) ** 2));
});

test('PMC uses 42-day fitness and 7-day fatigue averages, including rest days', () => {
  const series = performanceSeries([run('2026-11-01', {normalizedPower:250})], {...athlete, ftp:250}, '2026-11-03');
  assert.equal(series.length, 3);
  close(series[0].ctl, 100 / 42);
  close(series[0].atl, 100 / 7);
  close(series[0].tsb, 100 / 42 - 100 / 7);
  close(series[1].ctl, series[0].ctl * 41 / 42);
  close(series[2].atl, series[0].atl * (6 / 7) ** 2);
  assert.equal(series[1].load, 0);
  assert.deepEqual(performanceSeries([], athlete, '2026-11-03'), []);
  assert.equal(performanceSeries([run('2026-11-05')], athlete, '2026-11-03').length, 0);
});

test('activities on the same day add up', () => {
  const series = performanceSeries([run('2026-11-01', {id:'a', normalizedPower:250}), run('2026-11-01', {id:'b', normalizedPower:250})], {...athlete, ftp:250}, '2026-11-01');
  assert.equal(series[0].load, 200);
});

test('form status bands match the documented TSB ranges', () => {
  assert.deepEqual([30, 10, 0, -15, -30, -50].map(v => formStatus(v).key), ['detraining', 'fresh', 'maintenance', 'productive', 'caution', 'overreaching']);
  assert.equal(formStatus(5).key, 'maintenance');
  assert.equal(formStatus(-10).key, 'productive');
});

test('athlete thresholds are validated and blanks stay unknown', () => {
  assert.deepEqual(validateAthlete({maxHeartRate:'188', restingHeartRate:'', weightKg:'76.44'}), {...defaultAthlete(), maxHeartRate:188, weightKg:76.4});
  assert.throws(() => validateAthlete({maxHeartRate:300}), /maxHeartRate/);
  assert.throws(() => validateAthlete({maxHeartRate:105, restingHeartRate:110}), /安靜心率/);
  assert.throws(() => validateAthlete({maxHeartRate:180, lthr:190}), /乳酸閾值/);
  assert.throws(() => validateAthlete({ftp:'abc'}), /ftp/);
});

test('summary reports 7-day change, per-activity source and whether thresholds are set', () => {
  const state = {context:{date:'2026-11-10'}, athlete, activities:[run('2026-11-01'), run('2026-11-08')]};
  const summary = loadSummary(state);
  assert.equal(summary.today.date, '2026-11-10');
  assert.equal(summary.historyDays, 10);
  assert.ok(summary.change.ctl > 0);
  assert.equal(summary.perActivity['2026-11-01'].source, 'heart-rate');
  assert.deepEqual(summary.confidence, {high:0, medium:2, low:0});
  assert.equal(summary.athleteComplete, true);
  assert.equal(loadSummary({...state, activities:[]}).today, null);
});

function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};}

test('browser demo saves thresholds, exposes load and keeps them through backup', async () => {
  const demo = createDemoService(storage());
  let s = await demo.request('state');
  assert.deepEqual(s.athlete, defaultAthlete());
  await assert.rejects(demo.request('athlete', {athlete:{maxHeartRate:500}}), /maxHeartRate/);
  s = await demo.request('athlete', {athlete:{maxHeartRate:190, restingHeartRate:50}});
  assert.equal(s.athlete.maxHeartRate, 190);
  const day = s.plan[0].id;
  s = await demo.request('activities', {source:'manual', activities:[{startedAt:day + 'T07:00:00+08:00', durationSeconds:3600, avgHeartRate:150, planId:day}]});
  assert.equal(s.load.perActivity[s.activities[0].id].source, 'heart-rate');
  assert.ok(s.load.today.ctl > 0);
  const backup = JSON.parse(JSON.stringify(await demo.request('backup')));
  assert.equal(backup.data.athlete.maxHeartRate, 190);
  const restored = await createDemoService(storage()).request('backup-restore', backup);
  assert.equal(restored.athlete.restingHeartRate, 50);
  delete backup.data.athlete;
  const legacy = await createDemoService(storage()).request('backup-restore', backup);
  assert.deepEqual(legacy.athlete, defaultAthlete());
});
