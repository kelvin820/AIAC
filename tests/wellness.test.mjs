import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateWellness, wellnessAction, baseline, readiness, wellnessView, validateStoredWellness} from '../src/wellness.mjs';
import {defaultAthlete} from '../src/training-load.mjs';
import {createDemoService} from '../src/demo-service.mjs';

const TODAY = '2026-11-13';
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// 10 baseline days before TODAY with HRV 60±2 and resting HR 50±1.
const history = () => Array.from({length:10}, (_, i) => validateWellness({date:addDays(TODAY, -(i + 1)), hrv:60 + (i % 2 ? 2 : -2), restingHr:50 + (i % 2 ? 1 : -1), sleepHours:7.5}, 'x'));

test('entries are validated, rounded and need at least one value', () => {
  const e = validateWellness({date:TODAY, sleepHours:'7.25', restingHr:'51.4', fatigue:'3', notes:' 好 '}, 'now');
  assert.deepEqual([e.sleepHours, e.restingHr, e.fatigue, e.hrv, e.notes, e.updatedAt], [7.3, 51, 3, null, '好', 'now']);
  assert.throws(() => validateWellness({date:'2026-02-30', hrv:50}), /日期/);
  assert.throws(() => validateWellness({date:TODAY}), /至少/);
  assert.throws(() => validateWellness({date:TODAY, fatigue:6}), /疲勞/);
  assert.throws(() => validateWellness({date:TODAY, restingHr:'abc'}), /安靜心率/);
});

test('saving replaces the same date, keeps order, rejects future dates and deletes', () => {
  const s = {wellness:[]};
  wellnessAction(s, {action:'save', entry:{date:'2026-11-12', hrv:55}}, TODAY, 'a');
  wellnessAction(s, {action:'save', entry:{date:'2026-11-10', hrv:58}}, TODAY, 'b');
  wellnessAction(s, {action:'save', entry:{date:'2026-11-12', hrv:61}}, TODAY, 'c');
  assert.deepEqual(s.wellness.map(e => [e.date, e.hrv, e.updatedAt]), [['2026-11-10', 58, 'b'], ['2026-11-12', 61, 'c']]);
  assert.throws(() => wellnessAction(s, {action:'save', entry:{date:'2026-11-14', hrv:50}}, TODAY, 'd'), /未來/);
  wellnessAction(s, {action:'delete', date:'2026-11-10'}, TODAY, 'e');
  assert.equal(s.wellness.length, 1);
  assert.throws(() => wellnessAction(s, {action:'delete', date:'2026-11-10'}, TODAY, 'e'), /找不到/);
  assert.throws(() => wellnessAction(s, {action:'nope'}, TODAY, 'e'), /操作/);
});

test('baseline uses the previous 28 days only and needs 7 values', () => {
  const entries = history();
  assert.deepEqual(baseline(entries, 'hrv', TODAY), {count:10, mean:60, sd:2});
  assert.equal(baseline(entries.slice(0, 6), 'hrv', TODAY).mean, null);
  assert.equal(baseline(entries, 'hrv', addDays(TODAY, -5)).count, 5);
  assert.equal(baseline([...entries, validateWellness({date:TODAY, hrv:10}, 'x')], 'hrv', TODAY).mean, 60);
});

test('readiness lists named signals against the personal baseline', () => {
  const good = [...history(), validateWellness({date:TODAY, hrv:61, restingHr:50, sleepHours:7, fatigue:2}, 'x')];
  const r = readiness(good, TODAY);
  assert.deepEqual([r.status, r.flags], ['good', 0]);
  assert.deepEqual(r.signals.map(s => [s.key, s.state]), [['hrv', 'ok'], ['restingHr', 'ok'], ['sleepHours', 'ok'], ['fatigue', 'ok']]);
  const one = [...history(), validateWellness({date:TODAY, hrv:55, restingHr:50, sleepHours:7}, 'x')];
  assert.deepEqual([readiness(one, TODAY).status, readiness(one, TODAY).label], ['watch', '留意']);
  const low = [...history(), validateWellness({date:TODAY, hrv:55, restingHr:56, sleepHours:5, soreness:5}, 'x')];
  assert.deepEqual([readiness(low, TODAY).status, readiness(low, TODAY).flags], ['low', 4]);
  const early = [validateWellness({date:TODAY, hrv:40, restingHr:70}, 'x')];
  assert.equal(readiness(early, TODAY).status, 'insufficient');
  assert.ok(readiness(early, TODAY).signals.every(s => s.state === 'building'));
  assert.equal(readiness([], TODAY).status, 'none');
});

test('threshold suggestions need data, differ from current values and are applied only on request', () => {
  const s = {athlete:{...defaultAthlete(), maxHeartRate:190, restingHeartRate:55, weightKg:76}, wellness:[...history(), validateWellness({date:TODAY, weightKg:75.2}, 'x')]};
  const view = wellnessView(s, TODAY);
  assert.deepEqual(view.suggestions.restingHeartRate.value, 50);
  assert.equal(view.suggestions.weightKg.value, 75.2);
  assert.equal(s.athlete.restingHeartRate, 55);
  wellnessAction(s, {action:'apply-threshold', field:'restingHeartRate'}, TODAY, 'x');
  assert.equal(s.athlete.restingHeartRate, 50);
  assert.equal(wellnessView(s, TODAY).suggestions.restingHeartRate, undefined);
  assert.throws(() => wellnessAction(s, {action:'apply-threshold', field:'restingHeartRate'}, TODAY, 'x'), /沒有可更新/);
  assert.throws(() => wellnessAction(s, {action:'apply-threshold', field:'ftp'}, TODAY, 'x'), /只能/);
  // A suggestion that would break the thresholds (resting above max) is refused.
  s.athlete.maxHeartRate = 105; s.athlete.restingHeartRate = 40;
  s.wellness = [0, 1, 2].map(n => validateWellness({date:addDays(TODAY, -n), restingHr:110}, 'x'));
  assert.throws(() => wellnessAction(s, {action:'apply-threshold', field:'restingHeartRate'}, TODAY, 'x'), /安靜心率/);
});

test('stored wellness is validated on restore', () => {
  assert.deepEqual(validateStoredWellness(undefined), []);
  assert.equal(validateStoredWellness(history()).length, 10);
  assert.throws(() => validateStoredWellness([...history(), history()[0]]), /重複/);
  assert.throws(() => validateStoredWellness([{date:TODAY, hrv:999}]), /健康紀錄/);
});

function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};}

test('browser demo saves entries, shows readiness and backs them up', async () => {
  const demo = createDemoService(storage());
  let s = await demo.request('state');
  assert.equal(s.wellnessView.readiness.status, 'none');
  const today = s.wellnessView.today;
  await assert.rejects(demo.request('wellness', {action:'save', entry:{date:today}}), /至少/);
  s = await demo.request('wellness', {action:'save', entry:{date:today, sleepHours:5, fatigue:5}});
  assert.equal(s.wellnessView.readiness.status, 'low');
  const backup = JSON.parse(JSON.stringify(await demo.request('backup')));
  assert.equal(backup.data.wellness.length, 1);
  assert.equal((await createDemoService(storage()).request('backup-restore', backup)).wellness[0].fatigue, 5);
});
