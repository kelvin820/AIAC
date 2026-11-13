import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceToToday,todayIn} from '../src/plan-weeks.mjs';

const week = monday => Array.from({length:7}, (_, i) => {
  const d = new Date(`${monday}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
  return {id:d.toISOString().slice(0, 10), type:'Zone2', minutes:30, completed:false};
});

test('new day moves stale context date and the followed week, keeping history', () => {
  const s = {context:{date:'2026-11-06'}, plan:week('2026-11-02'), lastOpenedOn:'2026-11-06'};
  assert.equal(advanceToToday(s, '2026-11-10'), true);
  assert.equal(s.context.date, '2026-11-10');
  assert.equal(s.plan[0].id, '2026-11-09');
  assert.deepEqual(s.planHistory['2026-11-02'], week('2026-11-02'));
  assert.equal(s.lastOpenedOn, '2026-11-10');
});

test('a week the user browsed to is not changed when the day rolls over', () => {
  const s = {context:{date:'2026-11-06'}, plan:week('2026-11-16'), lastOpenedOn:'2026-11-06'};
  advanceToToday(s, '2026-11-10');
  assert.equal(s.context.date, '2026-11-10');
  assert.equal(s.plan[0].id, '2026-11-16');
});

test('same day, future context date or invalid today leave state alone', () => {
  const s = {context:{date:'2026-11-01'}, plan:week('2026-10-26'), lastOpenedOn:'2026-11-10'};
  assert.equal(advanceToToday(s, '2026-11-10'), false);
  assert.equal(s.context.date, '2026-11-01');
  const future = {context:{date:'2026-11-20'}, plan:week('2026-11-16')};
  advanceToToday(future, '2026-11-10');
  assert.equal(future.context.date, '2026-11-20');
  assert.throws(() => advanceToToday(future, '2026-13-01'), /有效日期/);
});

test('today is computed in the context timezone', () => {
  const now = new Date('2026-11-09T17:30:00Z');
  assert.equal(todayIn('Asia/Taipei', now), '2026-11-10');
  assert.equal(todayIn('America/Los_Angeles', now), '2026-11-09');
});
