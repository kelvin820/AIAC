import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planBlocks, weekTargets, layoutWeek, validatePlanSettings, generatePlan, trainingPlanAction, activePlanStatus, rampBaseMinutes, recentWeeklyAverage, validateStoredPlans} from '../src/training-plan.mjs';
import {initialState} from '../src/initial-state.mjs';
import {createDemoService} from '../src/demo-service.mjs';

const TODAY = '2026-11-13'; // Friday; its week starts Monday 2026-11-09
const settings = extra => validatePlanSettings({weeks:10, weeklyMinutes:300, daysPerWeek:5, longRunDay:5, qualityPerWeek:2, recoveryRhythm:4, ...extra}, TODAY);
const week = (d, extra = {}) => ({id:d, type:'Zone2', minutes:30, completed:false, ...extra});
function stateAt(extra = {}) {
  const s = initialState();
  s.context.date = TODAY;
  s.plan = ['09', '10', '11', '12', '13', '14', '15'].map(d => week(`2026-11-${d}`));
  s.planHistory = {};
  return Object.assign(s, extra);
}

test('blocks: base about 40%, build, taper by length, race week last', () => {
  assert.deepEqual(planBlocks(17, true), [{type:'base', weeks:6}, {type:'build', weeks:8}, {type:'taper', weeks:2}, {type:'race', weeks:1}]);
  assert.deepEqual(planBlocks(5, false), [{type:'base', weeks:2}, {type:'build', weeks:2}, {type:'taper', weeks:1}]);
  assert.deepEqual(planBlocks(2, false), [{type:'base', weeks:2}]);
  assert.deepEqual(planBlocks(1, true), [{type:'base', weeks:1}]);
});

test('weekly targets: ramp cap from recent volume, recovery weeks x0.6, taper steps down', () => {
  assert.equal(rampBaseMinutes(0), 240);
  assert.equal(rampBaseMinutes(250), 300);
  const t = weekTargets(settings(), 0);
  assert.deepEqual(t.map(w => w.targetMinutes), [240, 265, 290, 175, 300, 300, 300, 180, 225, 150]);
  assert.deepEqual(t.map(w => w.isRecovery), [false, false, false, true, false, false, false, true, false, false]);
  assert.deepEqual(t.map(w => w.block), ['base', 'base', 'base', 'build', 'build', 'build', 'build', 'build', 'taper', 'taper']);
  assert.equal(t[0].weekStart, '2026-11-09');
  assert.equal(t[9].weekStart, '2027-01-11');
  assert.ok(weekTargets(settings({recoveryRhythm:0}), 1000).every(w => !w.isRecovery && (w.block !== 'base' && w.block !== 'build' || w.targetMinutes === 300)));
});

test('day layout: long run on its day, quality days never next to it or each other, valid minutes', () => {
  for (const daysPerWeek of [2, 3, 4, 5, 6, 7]) {
    for (const longRunDay of [0, 3, 5, 6]) {
      const s = settings({daysPerWeek, longRunDay});
      for (const w of weekTargets(s, 300)) {
        const days = layoutWeek(w, s);
        assert.equal(days.filter(d => d.minutes > 0).length <= daysPerWeek, true);
        assert.ok(days.every(d => Number.isInteger(d.minutes) && d.minutes >= 0 && d.minutes <= 180));
        const hard = days.map((d, i) => ['Interval', 'Tempo', 'Long Run'].includes(d.type) ? i : -1).filter(i => i >= 0);
        for (let i = 1; i < hard.length; i++) assert.notEqual(hard[i] - hard[i - 1], 1, `${daysPerWeek}d L${longRunDay} ${w.block}`);
        if (daysPerWeek >= 3 && w.block !== 'race') assert.equal(days[longRunDay].type, 'Long Run');
        if (w.isRecovery) assert.ok(!days.some(d => d.type === 'Interval' || d.type === 'Tempo'));
      }
    }
  }
  assert.equal(validatePlanSettings({daysPerWeek:3, qualityPerWeek:2, weeks:4, weeklyMinutes:200}, TODAY).qualityPerWeek, 1);
});

test('settings are validated and plans cannot start in the past', () => {
  assert.throws(() => settings({weeks:60}), /計畫週數/);
  assert.throws(() => settings({daysPerWeek:8}), /每週訓練天數/);
  assert.throws(() => settings({recoveryRhythm:1}), /恢復週/);
  assert.throws(() => validatePlanSettings({startDate:'2026-11-02', weeklyMinutes:300}, TODAY), /過去/);
  assert.equal(validatePlanSettings({startDate:'2026-11-18', weeklyMinutes:300}, TODAY).startWeek, '2026-11-16');
});

test('an event goal sets the plan length and puts race day on the goal date', () => {
  const s = stateAt({goals:[{id:'race', type:'event', targetDate:'2027-03-07', targetTimeSeconds:14340}]});
  const preview = trainingPlanAction(s, {action:'preview', settings:{goalId:'race', weeklyMinutes:300, daysPerWeek:4, longRunDay:5}}, TODAY, 'now');
  assert.equal(preview.settings.weeks, 17);
  assert.equal(preview.blocks.at(-1).type, 'race');
  const raceWeek = preview.weeks.at(-1).days;
  assert.deepEqual(raceWeek.map(d => d.type), ['Rest', 'Zone2', 'Rest', 'Zone2', 'Rest', 'Rest', 'Long Run']);
  assert.equal(raceWeek[6].id, '2027-03-07');
  assert.equal(raceWeek[6].minutes, 180);
  assert.throws(() => trainingPlanAction(s, {action:'preview', settings:{goalId:'nope', weeklyMinutes:300}}, TODAY, 'now'), /目標/);
  assert.deepEqual(s.trainingPlans, []);
});

test('recent average counts the last four full weeks, including kettlebell sessions', () => {
  const s = stateAt({activities:[{date:'2026-11-02', durationSeconds:3600}, {date:'2026-10-12', durationSeconds:7200}, {date:'2026-11-10', durationSeconds:9999}, {date:'2026-10-05', durationSeconds:9999}],
    kettlebell:{plans:{}, sessions:[{id:'k', plan:{date:'2026-10-20'}, log:[{kind:'work', seconds:1200}]}]}});
  assert.equal(recentWeeklyAverage(s, TODAY), Math.round((60 + 120 + 20) / 4));
});

test('applying writes future days only, keeps recorded and kettlebell days, logs a revision', () => {
  const s = stateAt({
    activities:[{id:'a', date:'2026-11-14', planId:'2026-11-14', durationSeconds:3000}],
    kettlebell:{plans:{'2026-11-17':{rounds:1}}, sessions:[]},
  });
  s.planHistory['2026-11-16'] = ['16', '17', '18', '19', '20', '21', '22'].map(d => week(`2026-11-${d}`, {completed:d === '18'}));
  const preview = trainingPlanAction(s, {action:'preview', settings:{weeks:2, weeklyMinutes:300, daysPerWeek:5, longRunDay:5}}, TODAY, 'now');
  assert.deepEqual(preview.apply.skipped.map(x => [x.date, x.reason]), [
    ['2026-11-09', '已過去'], ['2026-11-10', '已過去'], ['2026-11-11', '已過去'], ['2026-11-12', '已過去'], ['2026-11-14', '已有實際紀錄'], ['2026-11-17', '已排壺鈴課']]);
  assert.equal(preview.apply.written, 8);
  const record = trainingPlanAction(s, {action:'apply', settings:{name:'冬季基礎', weeks:2, weeklyMinutes:300, daysPerWeek:5, longRunDay:5}}, TODAY, '2026-11-13T08:00:00.000Z');
  assert.deepEqual(s.plan.slice(0, 4), stateAt().plan.slice(0, 4));
  assert.deepEqual(s.plan[5], week('2026-11-14'));
  assert.equal(s.plan[6].type, preview.weeks[0].days[6].type);
  assert.deepEqual(s.planHistory['2026-11-16'][1], week('2026-11-17'));
  assert.equal(s.planHistory['2026-11-16'][2].completed, true);
  assert.equal(s.planHistory['2026-11-16'][5].type, 'Long Run');
  assert.equal(s.revisions.at(-1).reason, '套用訓練計畫：冬季基礎');
  assert.equal(record.status, 'active');
  assert.equal(activePlanStatus(s, TODAY).week.number, 1);
  assert.equal(activePlanStatus(s, '2026-11-18').week.blockName, '基礎期');
  assert.equal(activePlanStatus(s, '2026-12-01').finished, true);
  trainingPlanAction(s, {action:'apply', settings:{name:'第二版', weeks:1, weeklyMinutes:200}}, TODAY, 'later');
  assert.deepEqual(s.trainingPlans.map(p => [p.settings.name, p.status]), [['第二版', 'active'], ['冬季基礎', 'replaced']]);
  trainingPlanAction(s, {action:'archive', id:s.trainingPlans[0].id}, TODAY, 'later');
  assert.equal(activePlanStatus(s, TODAY), null);
  assert.throws(() => trainingPlanAction(s, {action:'archive', id:'x'}, TODAY, 'later'), /找不到/);
});

test('stored plans are validated on restore and old backups have none', () => {
  assert.deepEqual(validateStoredPlans(undefined), []);
  const s = stateAt();
  trainingPlanAction(s, {action:'apply', settings:{weeks:3, weeklyMinutes:300}}, TODAY, '2026-11-13T08:00:00.000Z');
  assert.equal(validateStoredPlans(s.trainingPlans).length, 1);
  assert.throws(() => validateStoredPlans([{...s.trainingPlans[0], status:'??'}]), /訓練計畫/);
  assert.throws(() => validateStoredPlans([s.trainingPlans[0], {...s.trainingPlans[0], id:'b'}]), /訓練計畫/);
});

function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};}

test('browser demo previews without saving, applies, and backs up the plan', async () => {
  const local = storage(), demo = createDemoService(local);
  const before = await demo.request('state');
  const {preview} = await demo.request('training-plan', {action:'preview', settings:{weeks:4, weeklyMinutes:240, daysPerWeek:4}});
  assert.equal(preview.weeks.length, 4);
  assert.deepEqual((await createDemoService(local).request('state')).trainingPlans, []);
  const after = await demo.request('training-plan', {action:'apply', settings:{name:'試用計畫', weeks:4, weeklyMinutes:240, daysPerWeek:4}});
  assert.equal(after.trainingPlans[0].settings.name, '試用計畫');
  assert.equal(after.planStatus.name, '試用計畫');
  assert.notDeepEqual(after.plan, before.plan);
  const backup = JSON.parse(JSON.stringify(await demo.request('backup')));
  const restored = await createDemoService(storage()).request('backup-restore', backup);
  assert.equal(restored.trainingPlans[0].id, after.trainingPlans[0].id);
});
