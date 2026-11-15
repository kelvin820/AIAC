import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prescriptionView, prescriptionForCoach} from '../src/prescription.mjs';
import {initialState} from '../src/initial-state.mjs';
import {validateAthlete} from '../src/training-load.mjs';

test('prescription combines today\'s budget and substitutes for the adjusted session', () => {
  const s = initialState();
  const today = s.plan[2].id;
  s.plan[2] = {...s.plan[2], type:'Tempo', minutes:50};
  s.athlete = {...s.athlete, lthr:170};
  s.wellness = [{date:today, hrv:null, restingHr:null, sleepHours:5, fatigue:5, soreness:null, sleepQuality:null, stress:null, mood:null, weightKg:null, notes:''}];
  const p = prescriptionView(s, today);
  assert.equal(p.budget.session.type, 'Recovery');
  assert.equal(p.budget.session.minutes, 35);
  assert.deepEqual(p.substitutes.map(x => x.mode), ['treadmill', 'bike-indoor', 'bike-outdoor', 'elliptical']);
  assert.equal(p.substitutes[1].minutes, 55);
  const coach = prescriptionForCoach(p);
  assert.deepEqual(coach.session, {type:'Recovery', minutes:35});
  assert.ok(coach.reasons.length >= 2);
  assert.match(coach.substitutes[1].howCalculated, /× 1\.5/);
});

test('a kettlebell day has no running budget; rest has no substitutes', () => {
  const s = initialState();
  const today = s.plan[0].id;
  s.kettlebell = {plans:{[today]:{}}, sessions:[]};
  assert.deepEqual(prescriptionView(s, today), {date:today, kettlebell:true, budget:null, substitutes:[]});
  assert.deepEqual(prescriptionForCoach(prescriptionView(s, today)), {kettlebell:true});
  const r = initialState();
  r.plan[0] = {...r.plan[0], type:'Rest', minutes:0};
  assert.deepEqual(prescriptionView(r, r.plan[0].id).substitutes, []);
});

test('bike threshold heart rate is a validated athlete field', () => {
  assert.equal(validateAthlete({bikeLthr:'158'}).bikeLthr, 158);
  assert.throws(() => validateAthlete({bikeLthr:300}), /bikeLthr/);
});
