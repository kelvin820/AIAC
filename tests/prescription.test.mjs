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
  const k = prescriptionView(s, today);
  assert.deepEqual([k.kettlebell, k.budget, k.substitutes, k.environment.status], [true, null, [], 'none']);
  assert.deepEqual(prescriptionForCoach(prescriptionView(s, today)), {kettlebell:true});
  const r = initialState();
  r.plan[0] = {...r.plan[0], type:'Rest', minutes:0};
  assert.deepEqual(prescriptionView(r, r.plan[0].id).substitutes, []);
});

test('bike threshold heart rate is a validated athlete field', () => {
  assert.equal(validateAthlete({bikeLthr:'158'}).bikeLthr, 158);
  assert.throws(() => validateAthlete({bikeLthr:300}), /bikeLthr/);
});

test('environment comes from the stored forecast at the departure hour, only for the same place', async () => {
  const {DEFAULT_SETTINGS} = await import('../src/weather.mjs');
  const s = initialState();
  const today = s.plan[1].id;
  s.plan[1] = {...s.plan[1], type:'Zone2', minutes:40};
  const hours = [`${today}T05:00`, `${today}T06:00`];
  s.weather = {fetchedAt:'x', latitude:DEFAULT_SETTINGS.latitude, longitude:DEFAULT_SETTINGS.longitude,
    raw:{weather:{hourly:{time:hours, temperature_2m:[20, 21], wind_speed_10m:[2, 3]}}, air:{hourly:{time:hours, us_aqi:[170, 40]}}}};
  const early = new Date(`${today}T04:00:00+08:00`);
  const p = prescriptionView(s, today, early);
  assert.equal(p.environment.status, 'ok');
  assert.equal(p.environment.conditions.hour, `${today}T05:00`);
  assert.equal(p.environment.guide.air.level, 'indoor');
  assert.equal(prescriptionForCoach(p).environment.air, '不建議戶外');
  s.prescriptionSettings = {...DEFAULT_SETTINGS, latitude:24};
  assert.equal(prescriptionView(s, today, early).environment.status, 'none');
});
