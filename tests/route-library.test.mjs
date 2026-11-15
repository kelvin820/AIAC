import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeEntry, pendingActivities, addEntries, groupRoutes, flatPace, recommendRoutes} from '../src/route-library.mjs';

// A straight route of `km` kilometres with a constant grade, as intervals.icu stream rows.
function rows(km, grade = 0, start = [25.09, 121.52]) {
  const n = km * 100 + 1, distance = Array.from({length:n}, (_, i) => i * 10);
  return [
    {type:'distance', data:distance},
    {type:'fixed_altitude', data:distance.map(d => 10 + d * grade)},
    {type:'latlng', data:distance.map(d => [start[0] + d / 111000, start[1]])},
  ];
}
const act = (id, date, km) => ({id, date, name:`跑 ${id}`, sport:'running', distanceMeters:km * 1000, sources:[{source:'intervals', sourceId:`i${id}`}]});

test('a library entry keeps a compact 100 m profile and rounded endpoints', () => {
  const e = routeEntry(act('a', '2026-11-01', 5), rows(5, 0.02));
  assert.equal(e.distanceMeters, 5000);
  assert.equal(e.points.length, 51);
  assert.equal(e.altitudeSource, 'fixed_altitude');
  assert.ok(e.gainMeters > 90 && e.gainMeters <= 100);
  assert.deepEqual(e.start, [25.09, 121.52]);
  assert.equal(routeEntry(act('b', '2026-11-01', 5), [{type:'distance', data:[0, 10]}]), null);
});

test('pending activities: intervals runs only, newest first, not yet in the library or skipped', () => {
  const s = {activities:[act('a', '2026-11-01', 5), act('b', '2026-11-03', 8), {...act('c', '2026-11-02', 5), sources:[{source:'intervals'}, {source:'strava'}]}, {...act('d', '2026-11-04', 5), sport:'cycling'}, act('e', '2026-11-05', 0.5)],
    routeLibrary:[{activityId:'a', date:'2026-11-01'}], routeLibrarySkipped:['x']};
  assert.deepEqual(pendingActivities(s).map(a => a.id), ['b']);
  addEntries(s, [{activityId:'b', date:'2026-11-03'}], ['c']);
  assert.deepEqual(s.routeLibrary.map(e => e.activityId), ['b', 'a']);
  assert.deepEqual(s.routeLibrarySkipped, ['x', 'c']);
});

test('repeat runs of the same route are grouped', () => {
  const a = routeEntry(act('a', '2026-11-03', 5), rows(5));
  const b = routeEntry(act('b', '2026-11-01', 5), rows(5));
  const c = routeEntry(act('c', '2026-11-02', 5), rows(5, 0, [25.2, 121.6]));
  assert.deepEqual(groupRoutes([a, b, c]).map(g => [g.entry.activityId, g.times]), [['a', 2], ['c', 1]]);
});

test('flat pace comes from threshold pace and the session intensity', () => {
  assert.equal(flatPace('Zone2', {thresholdPaceSecPerKm:300}), Math.round(300 * 1.225));
  assert.equal(flatPace('Zone2', {}), null);
});

test('routes are ranked by how close the equal-effort time is to the session', () => {
  const s = {athlete:{thresholdPaceSecPerKm:300}, activities:[act('a', '2026-11-01', 5), act('b', '2026-11-02', 8), act('c', '2026-11-03', 6)], routeLibrary:[]};
  addEntries(s, [routeEntry(s.activities[0], rows(5)), routeEntry(s.activities[1], rows(8, 0, [25.3, 121.5])), routeEntry(s.activities[2], rows(6, 0.03, [25.4, 121.5]))]);
  // Easy pace 6:08/km: 40 minutes ≈ 6.5 km flat.
  const r = recommendRoutes(s, {type:'Zone2', minutes:40});
  assert.equal(r.status, 'ok');
  assert.equal(r.flatPace, 368);
  assert.equal(r.routes[0].activityId, 'c');
  assert.ok(r.routes[0].splits[0].pace > 368);
  assert.ok(r.routes.every(x => Math.abs(x.predictedSeconds - 2400) / 2400 <= 0.2));
  // Quality sessions prefer the flattest route among those that fit.
  const q = recommendRoutes(s, {type:'Tempo', minutes:33});
  assert.equal(q.routes[0].activityId, 'a');
  assert.match(q.note, /平坦/);
  assert.equal(recommendRoutes({...s, athlete:{}}, {type:'Zone2', minutes:40}).status, 'needs-pace');
  assert.equal(recommendRoutes({...s, routeLibrary:[]}, {type:'Zone2', minutes:40}).status, 'empty');
  assert.equal(recommendRoutes(s, {type:'Rest', minutes:0}).status, 'rest');
  assert.equal(recommendRoutes(s, {type:'Zone2', minutes:120}).status, 'no-match');
});

test('heat slows the flat pace for routes and is reported', () => {
  const s = {athlete:{thresholdPaceSecPerKm:300}, activities:[act('a', '2026-11-01', 6)], routeLibrary:[]};
  addEntries(s, [routeEntry(s.activities[0], rows(6))]);
  const r = recommendRoutes(s, {type:'Zone2', minutes:38}, 3, {factor:1.033, wbgt:24.5, slowdownPercent:3.3});
  assert.deepEqual([r.basePace, r.flatPace, r.heat.slowdownPercent], [368, 380, 3.3]);
  assert.equal(recommendRoutes(s, {type:'Zone2', minutes:38}, 3, {factor:1, wbgt:12}).heat, null);
});
