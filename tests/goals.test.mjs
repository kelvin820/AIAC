import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateGoal, metricProgress, goalProgress, goalsSummary, goalsForCoach, applyGoalAction, trainingSessions, metricValue} from '../src/goals.mjs';
import {defaultAthlete} from '../src/training-load.mjs';
import {createDemoService} from '../src/demo-service.mjs';

const NOW = '2026-11-13T00:00:00.000Z';
const run = (id, date, minutes = 50, extra = {}) => ({id, date, durationSeconds:minutes * 60, distanceMeters:9000, avgHeartRate:150, sport:'running', sources:[{source:'manual', sourceId:id}], ...extra});
const baseState = extra => ({context:{date:'2026-11-13'}, athlete:{...defaultAthlete(), maxHeartRate:190, restingHeartRate:50}, activities:[], goals:[], kettlebell:{sessions:[]}, ...extra});

test('goal validation requires the fields each type needs', () => {
  assert.throws(() => validateGoal({type:'race'}), /類型/);
  assert.throws(() => validateGoal({type:'event', title:'台北馬'}), /比賽日期/);
  assert.throws(() => validateGoal({type:'event', title:'  ', targetDate:'2026-12-20'}), /目標名稱/);
  assert.throws(() => validateGoal({type:'event', title:'x', targetDate:'2026-02-30'}), /日期/);
  assert.throws(() => validateGoal({type:'consistency', title:'規律'}), /每週次數/);
  assert.throws(() => validateGoal({type:'performance', title:'x', metric:'weightKg', startValue:80, targetValue:75}), /指標/);
  assert.throws(() => validateGoal({type:'body', title:'x', metric:'weightKg', startValue:80, targetValue:80}), /不可相同/);
  const event = validateGoal({type:'event', title:'台北馬拉松', targetDate:'2026-12-20', distanceKm:'42.195', targetTimeSeconds:'14400', priority:'high'}, NOW);
  assert.deepEqual([event.distanceKm, event.targetTimeSeconds, event.priority, event.status, event.createdAt], [42.2, 14400, 'high', 'active', NOW]);
  const custom = validateGoal({type:'performance', title:'深蹲', metric:'custom', unit:'kg', startValue:60, targetValue:100, currentValue:75}, NOW);
  assert.deepEqual([custom.unit, custom.currentValue], ['kg', 75]);
  assert.equal(validateGoal({type:'performance', title:'CTL', metric:'ctl', startValue:20, targetValue:50}).currentValue, null);
});

test('metric progress works for targets above and below the start', () => {
  assert.equal(metricProgress(20, 35, 50), 0.5);
  assert.equal(metricProgress(80, 77, 74), 0.5);
  assert.equal(metricProgress(300, 330, 270), 0);
  assert.equal(metricProgress(300, 250, 270), 1);
  assert.equal(metricProgress(300, null, 270), null);
});

test('automatic metrics read thresholds and activities and say where they came from', () => {
  const state = baseState({athlete:{...defaultAthlete(), thresholdPaceSecPerKm:285, weightKg:76.4}, activities:[run('a', '2026-11-02', 60), run('b', '2026-10-27', 120)]});
  assert.deepEqual(metricValue('thresholdPace', state, '2026-11-13'), {value:285, source:'訓練閾值設定'});
  assert.deepEqual(metricValue('weightKg', state, '2026-11-13'), {value:76.4, source:'訓練閾值設定'});
  assert.equal(metricValue('weeklyMinutes', state, '2026-11-13').value, Math.round(180 / 4));
  assert.equal(metricValue('thresholdPace', baseState(), '2026-11-13'), null);
  assert.equal(metricValue('ctl', baseState(), '2026-11-13'), null);
  const pace = validateGoal({type:'performance', title:'配速', metric:'thresholdPace', startValue:300, targetValue:270});
  const progress = goalProgress(pace, state, '2026-11-13');
  assert.equal(progress.current, 285);
  assert.equal(progress.ratio, 0.5);
  assert.equal(goalProgress(pace, baseState(), '2026-11-13').source, '尚無資料，請先補上對應數值');
});

test('consistency counts sessions per week, including kettlebell sessions once', () => {
  const session = {id:'kb1', plan:{date:'2026-11-11'}, log:[{kind:'work', seconds:1200, round:0}]};
  const state = baseState({
    activities:[run('a', '2026-11-09'), run('b', '2026-11-10'), run('device', '2026-11-11', 20, {kettlebellSessionId:'kb1'}),
      run('c', '2026-11-02'), run('d', '2026-11-03'), run('e', '2026-11-04'), run('f', '2026-10-27')],
    kettlebell:{sessions:[session]},
  });
  assert.equal(trainingSessions(state).length, 7);
  const goal = validateGoal({type:'consistency', title:'每週 3 次', sessionsPerWeek:3});
  const progress = goalProgress(goal, state, '2026-11-13');
  assert.equal(progress.thisWeek, 3);
  assert.equal(progress.ratio, 1);
  assert.equal(progress.weeksMet, 1);
  assert.equal(progress.weeksChecked, 8);
});

test('summary orders goals and picks the primary active goal that is not past', () => {
  const state = baseState({goals:[
    validateGoal({id:'low', type:'consistency', title:'低', sessionsPerWeek:2, priority:'low'}, NOW),
    validateGoal({id:'past', type:'event', title:'已過', targetDate:'2026-11-01', priority:'high'}, NOW),
    validateGoal({id:'race', type:'event', title:'賽事', targetDate:'2026-12-20', priority:'high'}, NOW),
    validateGoal({id:'done', type:'consistency', title:'完成', sessionsPerWeek:2, priority:'high', status:'completed'}, NOW),
  ]});
  const summary = goalsSummary(state);
  assert.deepEqual(summary.goals.map(g => g.id), ['past', 'race', 'low', 'done']);
  assert.equal(summary.primaryId, 'race');
  assert.equal(summary.goals[1].progress.daysLeft, 37);
  assert.equal(summary.goals[1].progress.weeksLeft, 5);
  assert.deepEqual(goalsForCoach(state).map(g => g.title), ['已過', '賽事', '低']);
  assert.equal(goalsSummary(baseState()).primaryId, null);
});

test('goal actions create, update in place, keep createdAt and delete', () => {
  const state = baseState();
  applyGoalAction(state, {action:'save', goal:{type:'consistency', title:'每週 4 次', sessionsPerWeek:4}}, NOW);
  const id = state.goals[0].id;
  applyGoalAction(state, {action:'save', goal:{id, type:'consistency', title:'每週 5 次', sessionsPerWeek:5, status:'completed'}}, '2026-11-20T00:00:00.000Z');
  assert.equal(state.goals.length, 1);
  assert.deepEqual([state.goals[0].title, state.goals[0].status, state.goals[0].createdAt, state.goals[0].updatedAt], ['每週 5 次', 'completed', NOW, '2026-11-20T00:00:00.000Z']);
  assert.throws(() => applyGoalAction(state, {action:'save', goal:{id:'missing', type:'consistency', title:'x', sessionsPerWeek:1}}, NOW), /找不到/);
  assert.throws(() => applyGoalAction(state, {action:'rename'}, NOW), /操作/);
  applyGoalAction(state, {action:'delete', id}, NOW);
  assert.deepEqual(state.goals, []);
  assert.throws(() => applyGoalAction(state, {action:'delete', id}, NOW), /找不到/);
});

function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};}

test('browser demo stores goals, returns progress and keeps them through backup', async () => {
  const demo = createDemoService(storage());
  let s = await demo.request('state');
  assert.deepEqual(s.goals, []);
  assert.deepEqual(s.goalsView, {goals:[], primaryId:null});
  await assert.rejects(demo.request('goal', {action:'save', goal:{type:'event', title:'賽事'}}), /比賽日期/);
  s = await demo.request('goal', {action:'save', goal:{type:'event', title:'台北馬拉松', targetDate:'2099-12-20', priority:'high'}});
  assert.equal(s.goalsView.primaryId, s.goals[0].id);
  assert.equal(s.goalsView.goals[0].progress.kind, 'event');
  const backup = JSON.parse(JSON.stringify(await demo.request('backup')));
  assert.equal(backup.data.goals[0].title, '台北馬拉松');
  const restored = await createDemoService(storage()).request('backup-restore', backup);
  assert.equal(restored.goals[0].id, s.goals[0].id);
  backup.data.goals[0].type = 'unknown';
  await assert.rejects(createDemoService(storage()).request('backup-restore', backup), /目標/);
  delete backup.data.goals;
  assert.deepEqual((await createDemoService(storage()).request('backup-restore', backup)).goals, []);
});
