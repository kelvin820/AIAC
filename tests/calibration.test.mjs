import {test} from 'node:test';
import assert from 'node:assert/strict';
import {easyBand, calibrationSamples, personalFactor, calibrationView, weatherPending, startHour, FACTOR_RANGE} from '../src/calibration.mjs';
import {recommendRoutes} from '../src/route-library.mjs';

const athlete = {lthr:170, thresholdPaceSecPerKm:300};   // easy band 145–153, easy pace 368 s/km
const flat = km => Array.from({length:km * 10 + 1}, (_, i) => [i * 100, 10]);
const entry = (id, km, steady = true) => ({activityId:id, name:'河濱', points:flat(km), start:[25.09, 121.52], heartRate:{cv:0.04, steady}, v:2});
const run = (id, date, km, seconds, hr = 150) => ({id, date, durationSeconds:seconds, avgHeartRate:hr, startedAt:`${date}T21:30:00Z`, timezone:'Asia/Taipei'});

test('easy band is 85–90% of threshold heart rate', () => {
  assert.deepEqual(easyBand(athlete), [145, 153]);
  assert.deepEqual(easyBand({maxHeartRate:190}), [145, 154]);
  assert.equal(easyBand({}), null);
});

test('only steady easy runs of 20+ minutes on library routes are used', () => {
  const s = {athlete, activities:[run('a', '2026-11-01', 6, 6 * 368 * 1.05), run('b', '2026-11-02', 6, 1000), run('c', '2026-11-03', 6, 2300, 170), run('d', '2026-11-04', 6, 2300)],
    routeLibrary:[entry('a', 6), entry('b', 6), entry('c', 6), entry('d', 6, false)]};
  const samples = calibrationSamples(s);
  assert.deepEqual(samples.map(x => [x.activityId, x.ratio, x.heatIncluded]), [['a', 1.05, false]]);
});

test('past weather adds the heat slowdown to the prediction', () => {
  const s = {athlete, activities:[run('a', '2026-11-01', 6, 2300)], routeLibrary:[entry('a', 6)], runWeather:{a:{temperature:28, humidity:80}}};
  const [x] = calibrationSamples(s);
  assert.equal(x.heatIncluded, true);
  assert.ok(x.wbgt > 28);
  assert.ok(x.predictedSeconds > 6 * 368);
  assert.deepEqual(weatherPending(s), []);
  assert.equal(weatherPending({...s, runWeather:{}}).length, 1);
});

test('personal factor: weighted 20% per new run, active after 5 runs, limited to 0.85–1.15', () => {
  assert.deepEqual(personalFactor([]), {n:0, raw:null, factor:1, active:false});
  const r = ratios => ratios.map(ratio => ({ratio}));
  assert.deepEqual(personalFactor(r([1.1, 1.1, 1.1, 1.1])), {n:4, raw:1.1, factor:1, active:false});
  assert.equal(personalFactor(r([1, 1, 1, 1, 1.5])).factor, 1.1);
  assert.equal(personalFactor(r([1.4, 1.4, 1.4, 1.4, 1.4])).factor, FACTOR_RANGE[1]);
});

test('an active factor slows (or speeds) recommended route pacing; view explains what is missing', () => {
  const s = {athlete, activities:[run('a', '2026-11-01', 6, 2300)], routeLibrary:[entry('a', 6)]};
  const base = recommendRoutes(s, {type:'Zone2', minutes:38});
  const slow = recommendRoutes(s, {type:'Zone2', minutes:38}, 3, null, {active:true, factor:1.05, n:6});
  assert.equal(slow.flatPace, Math.round(base.flatPace * 1.05));
  assert.deepEqual(slow.calibration, {factor:1.05, n:6});
  assert.equal(recommendRoutes(s, {type:'Zone2', minutes:38}, 3, null, {active:false, factor:1}).calibration, null);
  assert.equal(calibrationView({athlete:{}}).missing, 'hr');
  assert.equal(calibrationView({athlete:{lthr:170}}).missing, 'pace');
  assert.equal(calibrationView(s).n, 1);
});

test('run start hour in local time', () => {
  assert.equal(startHour({startedAt:'2026-11-01T21:30:00Z'}, 'Asia/Taipei'), '2026-11-02T05:00');
  assert.equal(startHour({startedAt:'x'}, 'Asia/Taipei'), null);
});
