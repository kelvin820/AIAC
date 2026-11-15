import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createIntervals, mapActivity, mapWellness, mergeWellness, mergeFitness, syncRange, syncIntervals, MAX_FITNESS_DAYS} from '../src/intervals.mjs';
import {activityLoad, performanceSeries, loadSummary, defaultAthlete} from '../src/training-load.mjs';
import {initialState} from '../src/initial-state.mjs';
import {normalizeActivity} from '../src/activity-core.mjs';

const TODAY = '2026-11-13';
const run = extra => ({id:'i101', start_date:'2026-11-12T22:30:00Z', start_date_local:'2026-11-13T06:30:00', type:'Run', name:'晨跑', moving_time:3000, elapsed_time:3100, distance:9500, average_heartrate:148.6, icu_training_load:62, icu_weighted_avg_watts:240, ...extra});
const wellness = extra => ({id:'2026-11-13', restingHR:51, hrv:63.4, sleepSecs:26100, weight:75.6, sleepQuality:2, fatigue:3, soreness:1, stress:4, mood:1, ...extra});

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({url:String(url), auth:init.headers.Authorization});
    const path = new URL(url).pathname;
    const route = Object.entries(routes).find(([p]) => path.endsWith(p));
    if (!route) return {ok:false, status:404, json:async () => ({})};
    const [status, body] = route[1];
    return {ok:status < 300, status, json:async () => body};
  };
  return {fn, calls};
}

test('client uses Basic auth with API_KEY, the athlete id and the date range', async () => {
  const {fn, calls} = fakeFetch({'/activities':[200, []], '/wellness':[200, []]});
  const client = createIntervals({apiKey:' secret ', athleteId:'i12345', fetchImpl:fn});
  assert.equal(client.configured(), true);
  await client.activities('2026-10-01', TODAY);
  assert.equal(calls[0].url, 'https://intervals.icu/api/v1/athlete/i12345/activities?oldest=2026-10-01&newest=2026-11-13');
  assert.equal(calls[0].auth, 'Basic ' + Buffer.from('API_KEY:secret').toString('base64'));
  assert.equal(createIntervals({apiKey:'x'}).configured(), false);
  await assert.rejects(createIntervals({apiKey:'x'}).activities('a', 'b'), /INTERVALS_ATHLETE_ID/);
  const rejected = createIntervals({apiKey:'x', athleteId:'i1', fetchImpl:fakeFetch({'/activities':[401, {}]}).fn});
  await assert.rejects(rejected.activities('a', 'b'), e => e.code === 'INTERVALS_REJECTED');
});

test('activity summaries map to AIAC fields and sports', () => {
  const m = mapActivity(run());
  assert.deepEqual(m, {sourceId:'i101', startedAt:'2026-11-12T22:30:00Z', durationSeconds:3000, distanceMeters:9500, avgHeartRate:149, sport:'running', name:'晨跑', normalizedPower:240, intervalsLoad:62});
  assert.equal(mapActivity(run({start_date:'2026-11-12T22:30:00'})).startedAt, '2026-11-12T22:30:00Z');
  assert.equal(mapActivity(run({moving_time:0})).durationSeconds, 3100);
  assert.equal(mapActivity(run({type:'VirtualRide'})).sport, 'cycling');
  assert.equal(mapActivity(run({type:'Rowing'})).sport, 'rowing');
  assert.equal(mapActivity(run({average_heartrate:null, distance:0})).distanceMeters, null);
  // The local date follows the athlete's timezone, not UTC.
  assert.equal(normalizeActivity(mapActivity(run()), 'intervals', 'Asia/Taipei').date, '2026-11-13');
});

test('wellness maps measured values and converts 1–4 scales to AIAC 1–5 in the right direction', () => {
  assert.deepEqual(mapWellness(wellness()), {date:'2026-11-13', restingHr:51, hrv:63.4, sleepHours:7.3, weightKg:75.6, sleepQuality:4, mood:5, fatigue:4, soreness:1, stress:5});
  const empty = mapWellness({id:'2026-11-12', hrv:999, sleepSecs:0});
  assert.equal(empty.hrv, null);
  assert.equal(empty.sleepHours, null);
});

test('imported wellness wins, manual values fill gaps and notes stay; empty and future days are skipped', () => {
  const s = {wellness:[{date:'2026-11-13', sleepHours:6, restingHr:null, hrv:null, weightKg:null, sleepQuality:null, fatigue:2, soreness:null, stress:null, mood:null, notes:'小腿緊', updatedAt:'x'}]};
  const r = mergeWellness(s, [wellness({fatigue:null}), {id:'2026-11-12'}, wellness({id:'2026-11-14'})], TODAY, 'now');
  assert.deepEqual(r, {saved:1, skipped:2});
  assert.deepEqual([s.wellness[0].sleepHours, s.wellness[0].fatigue, s.wellness[0].restingHr, s.wellness[0].notes], [7.3, 2, 51, '小腿緊']);
});

test('first sync reads 90 days, later syncs overlap two days', () => {
  assert.deepEqual(syncRange({}, TODAY), {oldest:'2026-08-15', newest:TODAY});
  assert.deepEqual(syncRange({lastSyncDate:'2026-11-10'}, TODAY), {oldest:'2026-11-08', newest:TODAY});
});

test('sync imports, deduplicates against existing activities and fills power and load', async () => {
  const s = initialState();
  s.context.timezone = 'Asia/Taipei';
  const fit = normalizeActivity({sourceId:'fit-1', startedAt:'2026-11-12T22:30:10Z', durationSeconds:3010, distanceMeters:9480, sport:'running'}, 'fit', 'Asia/Taipei');
  s.activities.push(fit);
  const {fn, calls} = fakeFetch({'/activities':[200, [run(), run({id:'i102', start_date:'2026-11-10T22:00:00Z', name:'恢復跑'}), run({id:'bad', moving_time:0, elapsed_time:0})]], '/wellness':[200, [wellness()]]});
  const client = createIntervals({apiKey:'k', athleteId:'i1', fetchImpl:fn});
  const result = await syncIntervals(s, client, {today:TODAY, now:'2026-11-13T08:00:00.000Z'});
  assert.deepEqual([result.added, result.duplicates, result.invalid, result.wellness], [1, 1, 1, 1]);
  assert.equal(s.activities.length, 2);
  assert.deepEqual(s.activities[0].sources.map(x => x.source), ['fit', 'intervals']);
  assert.equal(s.activities[0].normalizedPower, 240);
  assert.equal(s.activities[0].intervalsLoad, 62);
  assert.equal(s.connections.intervals.lastSyncDate, TODAY);
  assert.deepEqual(s.connections.intervals.lastResult, {activities:1, duplicates:1, invalid:1, wellness:1, fitnessDays:0});
  assert.match(calls[0].url, /oldest=2026-08-15/);
  // A second pass imports nothing new.
  const again = await syncIntervals(s, client, {today:TODAY});
  assert.deepEqual([again.added, again.duplicates], [0, 2]);
  const changed = fakeFetch({'/activities':[200,[run({distance:null,moving_time:3100})]], '/wellness':[200,[]]});
  const changedClient = createIntervals({apiKey:'k',athleteId:'i1',fetchImpl:changed.fn});
  const corrected = await syncIntervals(s,changedClient,{today:TODAY});
  assert.deepEqual([corrected.added,corrected.duplicates],[0,1]);
  assert.match(calls.at(-1).url, /oldest=2026-11-11/);
  await syncIntervals(s, client, {today:TODAY, backfillDays:365});
  assert.match(calls.at(-1).url, /oldest=2025-11-13/);
});

test('failed sync keeps the error on the status and flags a rejected key', async () => {
  const s = initialState();
  const client = createIntervals({apiKey:'k', athleteId:'i1', fetchImpl:fakeFetch({'/activities':[403, {}], '/wellness':[200, []]}).fn});
  await assert.rejects(syncIntervals(s, client, {today:TODAY}), /拒絕/);
  assert.equal(s.connections.intervals.rejected, true);
  const down = createIntervals({apiKey:'k', athleteId:'i1', fetchImpl:async () => { throw Error('fetch failed'); }});
  await assert.rejects(syncIntervals(s, down, {today:TODAY}), /暫時無法連到/);
});

test('intervals.icu load is used when present, otherwise AIAC calculates', () => {
  const athlete = {...defaultAthlete(), maxHeartRate:190, restingHeartRate:50};
  const a = {date:'2026-11-13', durationSeconds:3600, avgHeartRate:150, sport:'running'};
  assert.deepEqual([activityLoad({...a, intervalsLoad:72}, athlete).score, activityLoad({...a, intervalsLoad:72}, athlete).source, activityLoad({...a, intervalsLoad:72}, athlete).confidence], [72, 'intervals', 'high']);
  assert.equal(activityLoad(a, athlete).source, 'heart-rate');
});

test('intervals.icu fitness and fatigue are used on their days; AIAC carries on between them', () => {
  const act = (date, intervalsLoad) => ({id:date, date, durationSeconds:3600, intervalsLoad, sport:'running'});
  const anchors = {'2026-11-10':{ctl:40, atl:50}};
  const series = performanceSeries([act('2026-11-11', 70)], defaultAthlete(), '2026-11-12', anchors);
  assert.deepEqual(series.map(d => [d.date, d.source]), [['2026-11-10', 'intervals'], ['2026-11-11', 'aiac'], ['2026-11-12', 'aiac']]);
  assert.deepEqual([series[0].ctl, series[0].atl], [40, 50]);
  assert.equal(series[1].ctl, 40 + (70 - 40) / 42);
  assert.equal(series[1].atl, 50 + (70 - 50) / 7);
  const state = {context:{date:'2026-11-12'}, athlete:defaultAthlete(), activities:[act('2026-11-11', 70)], intervalsFitness:{...anchors, '2026-11-12':{ctl:41, atl:52}}};
  const summary = loadSummary(state);
  assert.deepEqual([summary.today.ctl, summary.today.atl, summary.today.tsb, summary.today.source], [41, 52, -11, 'intervals']);
});

test('fitness from wellness rows is validated, ignores future days and keeps a bounded history', () => {
  const s = {};
  assert.equal(mergeFitness(s, [wellness({ctl:45.27, atl:60.04}), wellness({id:'2026-11-14', ctl:1, atl:1}), wellness({id:'2026-11-12', ctl:'x', atl:2}), wellness({id:'2026-11-11', ctl:-1, atl:2})], TODAY), 1);
  assert.deepEqual(s.intervalsFitness, {'2026-11-13':{ctl:45.3, atl:60}});
  const many = Array.from({length:MAX_FITNESS_DAYS + 5}, (_, i) => ({id:new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10), ctl:1, atl:1}));
  mergeFitness(s, many, '2099-01-01');
  assert.equal(Object.keys(s.intervalsFitness).length, MAX_FITNESS_DAYS);
});

test('intervals.icu fitness survives backup and bad values are refused', async () => {
  const {exportBackup, restoreBackup} = await import('../src/backup.mjs');
  const s = initialState();
  s.intervalsFitness = {'2026-11-12':{ctl:44, atl:51}};
  const backup = JSON.parse(JSON.stringify(exportBackup(s)));
  assert.deepEqual(restoreBackup(initialState(), backup).intervalsFitness, {'2026-11-12':{ctl:44, atl:51}});
  backup.data.intervalsFitness['2026-11-13'] = {ctl:'x', atl:1};
  assert.throws(() => restoreBackup(initialState(), backup), /intervals\.icu 體能/);
  delete backup.data.intervalsFitness;
  assert.deepEqual(restoreBackup(initialState(), backup).intervalsFitness, {});
});
