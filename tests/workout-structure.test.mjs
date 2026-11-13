import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildStructure, targetBasis, target, totalSeconds, validateStructure, mainSteps, executionCheck, workoutsView} from '../src/workout-structure.mjs';
import {defaultAthlete} from '../src/training-load.mjs';
import {initialState} from '../src/initial-state.mjs';
import {createDemoService} from '../src/demo-service.mjs';

const athlete = {...defaultAthlete(), maxHeartRate:190, restingHeartRate:50, lthr:170, thresholdPaceSecPerKm:300};
const day = (type, minutes, id = '2026-11-13') => ({id, type, minutes, completed:false});

test('target basis prefers threshold pace, then LTHR, then 90% of max HR, then RPE', () => {
  assert.equal(targetBasis(athlete).kind, 'pace');
  assert.deepEqual(targetBasis({...athlete, thresholdPaceSecPerKm:null}), {kind:'hr', value:170, note:'依乳酸閾值心率'});
  assert.equal(targetBasis({...defaultAthlete(), maxHeartRate:200}).value, 180);
  assert.equal(targetBasis(defaultAthlete()).kind, 'rpe');
  assert.deepEqual(target('interval', {kind:'pace', value:300}), {kind:'pace', low:279, high:294});
  assert.deepEqual(target('easy', {kind:'hr', value:170}), {kind:'hr', low:145, high:153});
  assert.deepEqual(target('tempo', {kind:'rpe'}), {kind:'rpe', low:6, high:7});
});

test('every type and length adds up to the planned minutes and repeats include recovery', () => {
  for (const type of ['Zone2', 'Recovery', 'Tempo', 'Interval', 'Long Run', 'Indoor']) {
    for (const minutes of [10, 20, 30, 45, 60, 75, 90, 150, 180]) {
      const s = buildStructure(day(type, minutes), athlete);
      assert.equal(s.totalSeconds, minutes * 60, `${type} ${minutes}`);
      assert.equal(totalSeconds(s.steps), minutes * 60);
      assert.ok(validateStructure(s));
      assert.ok(s.steps.every(st => st.type === 'repeat' ? st.steps.every(c => c.durationSeconds > 0) : st.durationSeconds > 0), `${type} ${minutes}`);
    }
  }
  assert.equal(buildStructure(day('Rest', 0), athlete), null);
  assert.equal(buildStructure(day('Zone2', 0), athlete), null);
  assert.equal(validateStructure({steps:[{type:'repeat', reps:3, steps:[{type:'active', durationSeconds:60}]}]}), false);
});

test('templates: intervals get 4-minute reps with 2-minute jogs, long tempo is split, short quality days become steady', () => {
  const interval = buildStructure(day('Interval', 45), athlete);
  assert.equal(interval.steps[1].reps, 4);
  assert.deepEqual(interval.steps[1].steps.map(s => [s.type, s.durationSeconds]), [['active', 240], ['rest', 120]]);
  assert.equal(buildStructure(day('Interval', 120), athlete).steps[1].reps, 8);
  assert.equal(buildStructure(day('Tempo', 75), athlete).steps[1].type, 'repeat');
  assert.equal(buildStructure(day('Tempo', 45), athlete).steps[1].intensity, 'tempo');
  const short = buildStructure(day('Interval', 20), athlete);
  assert.ok(short.steps.every(s => s.intensity === 'easy'));
  assert.match(short.steps[1].note, /太短/);
  assert.equal(mainSteps(interval)[0].reps, 4);
});

test('execution check reports facts against the main target', () => {
  const easy = buildStructure(day('Zone2', 50), {...athlete, thresholdPaceSecPerKm:null});
  const ran = (extra) => ({id:'a', date:'2026-11-13', durationSeconds:3000, distanceMeters:9000, avgHeartRate:150, ...extra});
  const check = executionCheck(easy, [ran()]);
  assert.deepEqual([check.actualMinutes, check.timeRatio], [50, 100]);
  assert.deepEqual(check.checks[0], {metric:'平均心率', value:150, target:{kind:'hr', low:145, high:153}, result:'in'});
  assert.equal(executionCheck(easy, [ran({avgHeartRate:165})]).checks[0].result, 'above');
  assert.equal(executionCheck(easy, []), null);
  const paceEasy = buildStructure(day('Zone2', 50), athlete);
  assert.equal(executionCheck(paceEasy, [ran({distanceMeters:8000})]).checks[0].result, 'in');
  assert.equal(executionCheck(paceEasy, [ran({distanceMeters:12000})]).checks[0].result, 'faster');
  const interval = buildStructure(day('Interval', 45), athlete);
  const laps = [...Array(4)].map(() => ({durationSeconds:285, distanceMeters:1000})).concat([{durationSeconds:400, distanceMeters:1000}]);
  assert.deepEqual(executionCheck(interval, [ran({laps})]).checks[0].value, 4);
  assert.equal(executionCheck(interval, [ran({laps})]).checks[0].result, 'in');
  assert.equal(executionCheck(interval, [ran()]).checks[0].result, 'unknown');
});

test('workouts view covers nearby plan days, skips kettlebell days and checks linked activities', () => {
  const s = initialState();
  s.context.date = s.plan[2].id;
  s.athlete = athlete;
  s.kettlebell = {plans:{[s.plan[1].id]:{rounds:2}}, sessions:[]};
  s.activities = [{id:'x', date:s.plan[0].id, planId:s.plan[0].id, durationSeconds:2400, distanceMeters:7000, avgHeartRate:150, sources:[]}];
  const view = workoutsView(s);
  assert.ok(view.structures[s.plan[0].id]);
  assert.equal(view.structures[s.plan[1].id], undefined);
  assert.equal(view.structures[s.plan[3].id], undefined);
  assert.ok(view.checks[s.plan[0].id]);
});

function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};}

test('browser demo state includes structures that follow threshold changes', async () => {
  const demo = createDemoService(storage());
  let s = await demo.request('state');
  const id = s.plan.find(d => d.type === 'Interval').id;
  assert.equal(s.workouts.structures[id].basis.kind, 'rpe');
  s = await demo.request('athlete', {athlete:{thresholdPaceSecPerKm:300}});
  assert.equal(s.workouts.structures[id].basis.kind, 'pace');
  assert.equal(s.workouts.structures[id].steps[1].steps[0].target.low, 279);
});
