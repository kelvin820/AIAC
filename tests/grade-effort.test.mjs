import {test} from 'node:test';
import assert from 'node:assert/strict';
import {minettiCost, paceFactor, smoothProfile, routeEffort, DOWNHILL_FLOOR} from '../src/grade-effort.mjs';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('Minetti cost: 3.6 J/kg/m on the flat, higher uphill, lowest on moderate downhill, clamped outside ±45%', () => {
  close(minettiCost(0), 3.6);
  assert.ok(minettiCost(0.1) > 3.6);
  assert.ok(minettiCost(-0.1) < 3.6);
  assert.ok(minettiCost(-0.2) < minettiCost(-0.1));
  close(minettiCost(0.9), minettiCost(0.45));
  // ~10% grade costs roughly 1.6x flat in Minetti's data.
  assert.ok(paceFactor(0.1) > 1.5 && paceFactor(0.1) < 1.7);
});

test('downhill speed-up is capped at 10%', () => {
  assert.equal(paceFactor(-0.15), DOWNHILL_FLOOR);
  assert.ok(paceFactor(-0.01) < 1 && paceFactor(-0.01) > DOWNHILL_FLOOR);
});

test('a flat route keeps the flat pace everywhere', () => {
  const r = routeEffort([{distance:0, altitude:20}, {distance:2500, altitude:20}], 360);
  assert.equal(r.distanceMeters, 2500);
  assert.deepEqual(r.splits.map(s => [s.km, s.meters, s.pace]), [[1, 1000, 360], [2, 1000, 360], [3, 500, 360]]);
  assert.equal(r.predictedSeconds, 900);
  assert.equal(r.equivalentFlatMeters, 2500);
  assert.deepEqual([r.gainMeters, r.lossMeters, r.averageAltitude], [0, 0, 20]);
});

test('a climb then descent: slower up, faster (capped) down, longer equivalent distance', () => {
  const pts = [{distance:0, altitude:10}, {distance:1000, altitude:60}, {distance:2000, altitude:10}];
  const r = routeEffort(pts, 300);
  assert.ok(r.splits[0].pace > 330, `uphill split ${r.splits[0].pace}`);
  assert.ok(r.splits[1].pace < 300 && r.splits[1].pace >= 270, `downhill split ${r.splits[1].pace}`);
  assert.ok(r.equivalentFlatMeters > 2000);
  assert.ok(r.gainMeters > 40 && r.gainMeters <= 50);
  assert.equal(r.averageAltitude, 35);
  assert.match(r.howCalculated, /Minetti/);
});

test('smoothing removes GPS altitude jitter', () => {
  const noisy = Array.from({length:101}, (_, i) => ({distance:i * 10, altitude:50 + (i % 2 ? 3 : -3)}));
  const flat = routeEffort(noisy, 360);
  assert.ok(flat.gainMeters < 30, `gain ${flat.gainMeters}`);
  assert.ok(flat.splits.every(s => Math.abs(s.pace - 360) <= 5));
  assert.ok(smoothProfile(noisy).length >= 100);
});

test('bad input returns null', () => {
  assert.equal(routeEffort([], 300), null);
  assert.equal(routeEffort([{distance:0, altitude:1}], 300), null);
  assert.equal(routeEffort([{distance:0, altitude:1}, {distance:100, altitude:1}], 0), null);
});
