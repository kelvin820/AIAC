import {test} from 'node:test';
import assert from 'node:assert/strict';
import {todayBudget, budgetFromState, DEFAULT_SESSION} from '../src/daily-budget.mjs';
import {initialState} from '../src/initial-state.mjs';

const ready = (status, flags = 0, signals = []) => ({status, flags, signals});
const tempo = {type:'Tempo', minutes:50};

test('no signals keeps the plan and never adds load', () => {
  const r = todayBudget({planDay:tempo, readiness:ready('good'), tsb:-5});
  assert.equal(r.decision, 'as-planned');
  assert.deepEqual([r.session.type, r.session.minutes], ['Tempo', 50]);
  assert.ok(r.reasons.some(x => x.key === 'good'));
  const fresh = todayBudget({planDay:{type:'Zone2', minutes:30}, readiness:ready('good'), tsb:20});
  assert.equal(fresh.session.minutes, 30);
});

test('without a plan the default is an easy 40 minutes', () => {
  const r = todayBudget({});
  assert.deepEqual([r.session.type, r.session.minutes], [DEFAULT_SESSION.type, 40]);
  assert.ok(r.reasons.some(x => x.key === 'no-plan'));
  assert.ok(r.reasons.some(x => x.key === 'no-readiness'));
});

test('low readiness turns any session into recovery at 0.7x time', () => {
  const r = todayBudget({planDay:{type:'Long Run', minutes:100}, readiness:ready('low', 2, [{key:'hrv', label:'HRV', text:'低於個人基準 60 ms', state:'flag'}])});
  assert.equal(r.decision, 'reduced');
  assert.deepEqual([r.session.type, r.session.minutes], ['Recovery', 70]);
  assert.ok(r.reasons.some(x => x.text.includes('HRV')));
});

test('watch, deep fatigue or a spike yesterday drop quality sessions to easy, same time', () => {
  for (const input of [{readiness:ready('watch', 1)}, {tsb:-30}, {yesterdayLoad:130, avgDailyLoad:50}]) {
    const r = todayBudget({planDay:tempo, ...input});
    assert.deepEqual([r.session.type, r.session.minutes, r.decision], ['Zone2', 50, 'reduced']);
  }
  // Easy days are left alone by these rules.
  assert.equal(todayBudget({planDay:{type:'Zone2', minutes:40}, readiness:ready('watch', 1), tsb:-30}).decision, 'as-planned');
});

test('the most severe rule wins and every triggered rule is listed', () => {
  const r = todayBudget({planDay:{type:'Interval', minutes:60}, readiness:ready('low', 3), tsb:-45, yesterdayLoad:200, avgDailyLoad:40});
  assert.equal(r.decision, 'rest-or-recovery');
  assert.deepEqual([r.session.type, r.session.minutes], ['Recovery', 20]);
  const keys = r.reasons.filter(x => 'applied' in x).map(x => [x.key, x.applied]);
  assert.deepEqual(keys, [['tsb-overreaching', true], ['readiness-low', false], ['tsb-caution', false], ['yesterday-spike', false]]);
});

test('planned rest stays rest', () => {
  assert.equal(todayBudget({planDay:{type:'Rest', minutes:0}, tsb:-50}).decision, 'rest');
});

test('budget from state reads the plan day, wellness and yesterday load', () => {
  const s = initialState();
  const today = s.plan[2].id;
  s.plan[2] = {...s.plan[2], type:'Interval', minutes:45};
  const yesterday = s.plan[1].id;
  s.activities = [{id:'a1', date:yesterday, durationSeconds:7200, sport:'running', intervalsLoad:150}];
  const r = budgetFromState(s, today);
  assert.equal(r.planned.type, 'Interval');
  assert.equal(r.session.type, 'Zone2');
  assert.ok(r.reasons.some(x => x.key === 'yesterday-spike' && x.applied));
});
