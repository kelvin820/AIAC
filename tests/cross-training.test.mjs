import {test} from 'node:test';
import assert from 'node:assert/strict';
import {substitute, substitutes, MODES, RULE_VERSION} from '../src/cross-training.mjs';

const athlete = {lthr:170, maxHeartRate:190, thresholdPaceSecPerKm:270};

test('easy run on a bike: 1.5x time, bike HR estimated from run threshold − 10, fully substitutes', () => {
  const r = substitute({type:'Zone2', minutes:60}, 'bike-indoor', athlete);
  assert.equal(r.minutes, 90);
  assert.equal(r.coverage, 'full');
  assert.deepEqual(r.missing, []);
  assert.deepEqual([r.target.kind, r.target.low, r.target.high], ['hr', Math.round(160 * 0.85), Math.round(160 * 0.9)]);
  assert.match(r.target.basis, /− 10 估算/);
  assert.equal(r.rule.id, RULE_VERSION);
  assert.match(r.howCalculated, /× 1\.5 = 90 分鐘/);
  assert.match(r.howCalculated, /經驗法則/);
  assert.ok(r.tips.some(t => t.includes('騎車閾值心率')));
});

test('a measured bike threshold is used as is', () => {
  const r = substitute({type:'Recovery', minutes:30}, 'bike-outdoor', {...athlete, bikeLthr:158});
  assert.equal(r.target.low, Math.round(158 * 0.75));
  assert.equal(r.minutes, 45);
  assert.ok(!r.tips.some(t => t.includes('騎車閾值心率')));
  assert.ok(r.tips.some(t => t.includes('滑行')));
});

test('quality sessions only partly substitute and say what is missing', () => {
  const r = substitute({type:'Interval', minutes:50}, 'elliptical', athlete);
  assert.equal(r.minutes, 50);
  assert.equal(r.coverage, 'partial');
  assert.ok(r.missing.some(m => m.includes('速度')));
  assert.deepEqual([r.target.low, r.target.high], [Math.round(170 * 0.98), Math.round(170 * 1.05)]);
  const long = substitute({type:'Long Run', minutes:100}, 'bike-indoor', athlete);
  assert.equal(long.minutes, 150);
  assert.ok(long.missing.some(m => m.includes('肌肉耐力')));
});

test('treadmill keeps time and pace, always reminds the 1% grade', () => {
  const r = substitute({type:'Tempo', minutes:40}, 'treadmill', athlete);
  assert.equal(r.coverage, 'full');
  assert.equal(r.minutes, 40);
  assert.deepEqual([r.target.pace.low, r.target.pace.high], [Math.round(270 * 1.03), Math.round(270 * 1.08)]);
  assert.ok(r.tips.some(t => t.includes('1%')));
  assert.match(r.howCalculated, /配速 4:38–4:52 \/km/);
});

test('without heart-rate data it falls back to RPE; rest days and unknown modes', () => {
  const r = substitute({type:'Zone2', minutes:45}, 'bike-indoor', {});
  assert.deepEqual([r.target.kind, r.target.low, r.target.high], ['rpe', 3, 4]);
  assert.equal(r.minutes, 70); // 67.5 rounded to 5
  assert.equal(substitute({type:'Rest', minutes:0}, 'elliptical', athlete), null);
  assert.throws(() => substitute({type:'Zone2', minutes:30}, 'swim', athlete), /不支援/);
  assert.deepEqual(substitutes({type:'Zone2', minutes:30}, athlete).map(x => x.mode), Object.keys(MODES));
  assert.deepEqual(substitutes(null), []);
});
