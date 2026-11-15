import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeProfileFromStreams} from '../src/route-profile.mjs';
import {routeEffort} from '../src/grade-effort.mjs';

const distance = Array.from({length:21}, (_, i) => i * 50);

test('terrain-corrected altitude is preferred over the watch altitude', () => {
  const rows = [{type:'distance', data:distance}, {type:'altitude', data:distance.map(() => 10)}, {type:'fixed_altitude', data:distance.map(d => 10 + d / 50)}, {type:'latlng', data:[[25, 121]]}];
  const p = routeProfileFromStreams(rows);
  assert.equal(p.altitudeSource, 'fixed_altitude');
  assert.equal(p.points.length, 21);
  assert.ok(!('latlng' in p));
  const r = routeEffort(p.points, 360);
  assert.ok(r.gainMeters > 10);
});

test('falls back to watch altitude and skips bad samples', () => {
  const alt = distance.map(() => 12);
  alt[3] = null; alt[4] = 99999;
  const p = routeProfileFromStreams([{type:'distance', data:distance}, {type:'altitude', data:alt}]);
  assert.equal(p.altitudeSource, 'altitude');
  assert.equal(p.points.length, 19);
});

test('missing distance, altitude or too short a route gives null', () => {
  assert.equal(routeProfileFromStreams(null), null);
  assert.equal(routeProfileFromStreams([{type:'altitude', data:[1, 2]}]), null);
  assert.equal(routeProfileFromStreams([{type:'distance', data:[0, 50]}, {type:'altitude', data:[1, 1]}]), null);
});
