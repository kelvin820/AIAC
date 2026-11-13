import assert from 'node:assert/strict';
import {test} from 'node:test';
import {allowedMoves,buildCircuit,circuitPhases,currentPhase,findCircuitMatches,plannedSeconds,remainingMs,sessionTotals,updateKettlebell} from '../public/kettlebell-core.js';
import {createDemoService} from '../src/demo-service.mjs';
import {exportBackup,restoreBackup} from '../src/backup.mjs';
import {budget} from '../src/coach.mjs';
import {comparison,normalizeActivity} from '../src/activity-core.mjs';
import {initialState} from '../src/initial-state.mjs';
import {performanceData} from '../src/performance.mjs';
import {activityLoad,loadSummary} from '../src/training-load.mjs';

const date='2026-11-11';
const base={date,minutes:30,count:5,rounds:4,pace:'steady',weights:[12,8,8],familiar:[]};

test('circuit fits the available time without cutting rest and gates technical movements',()=>{
 const plan=buildCircuit({...base,minutes:22,rounds:5});
 assert.equal(plan.rounds,3);
 assert.ok(plannedSeconds(plan)<=22*60);
 assert.deepEqual(plan.weights,[8,12]);
 assert.equal(circuitPhases(plan).filter(phase=>phase.kind==='rest').length,2);
 assert.equal(circuitPhases(plan).filter(phase=>phase.kind==='work').length,15);
 assert.ok(!allowedMoves('deadlift',[]).includes('swing'));
 assert.equal(buildCircuit({...base,pace:'interval',familiar:['swing']}).moves[0],'swing');
 assert.throws(()=>buildCircuit({...base,moves:['swing',...plan.moves.slice(1)]}),/熟悉/);
 assert.throws(()=>buildCircuit({...base,minutes:10}),/至少需要/);
});

function fixture(){
 const s=initialState();
 s.plan=s.plan.map((day,index)=>({...day,id:`2026-11-${String(9+index).padStart(2,'0')}`}));
 const before=structuredClone(s.plan);
 let now=Date.parse(date+'T10:00:00+08:00');
 const send=(action,rest={})=>updateKettlebell(s,{date,action,id:s.kettlebell?.active?.id,rev:s.kettlebell?.active?.rev,...rest},{now,makeId:()=> 'session-a'});
 const advance=seconds=>{now+=seconds*1000;};
 const remaining=()=>remainingMs(s.kettlebell.active,now);
 return {s,before,send,advance,remaining};
}

test('timer pauses across elapsed time, keeps per-station substitutions, and records partial work without marking a run',()=>{
 const {s,before,send,advance,remaining}=fixture();
 send('save',base);send('start');
 assert.deepEqual(s.kettlebell.plans[date].original,{type:'Recovery',minutes:25});
 advance(10);send('pause');const pauseLeft=remaining();advance(200);assert.equal(remaining(),pauseLeft);
 send('resume');advance(5);send('next');
 assert.equal(s.kettlebell.active.log[0].seconds,15);
 assert.equal(remaining(),25000);
 send('replace',{move:'wide-deadlift'});
 send('resume');advance(12);
 assert.throws(()=>send('replace',{move:'deadlift'}),/啟動前/);
 assert.throws(()=>send('next',{rev:0}),/進度已更新/);
 send('next',{kg:8,reps:6});
 assert.equal(currentPhase(s.kettlebell.active).kind,'transition');
 advance(40);send('extend');assert.equal(remaining(),15000);
 advance(7);send('finish');send('finish',{id:'session-a'});
 assert.deepEqual(s.plan,before);
 assert.equal(s.kettlebell.active,null);
 assert.equal(s.kettlebell.sessions.length,1);
 const [session]=s.kettlebell.sessions;
 assert.equal(session.plan.moves[0],'wide-deadlift');
 assert.deepEqual(session.log[1],{kind:'work',round:0,slot:0,seconds:12,move:'wide-deadlift',kg:8,reps:6});
 assert.deepEqual(sessionTotals(session),{rounds:0,slots:1,workSeconds:12,totalSeconds:69});
 assert.equal(comparison(s)[2].actualMinutes,0);
 assert.equal(budget(s).completed,69/60);
 assert.equal(budget(s).planned,((budget({...s,kettlebell:undefined}).planned-25)*60+plannedSeconds(s.kettlebell.plans[date]))/60);
 const backup=JSON.parse(JSON.stringify(exportBackup(s)));
 assert.deepEqual(restoreBackup(initialState(),backup).kettlebell,s.kettlebell);
 backup.data.kettlebell.sessions[0].log[1].move='invalid';
 assert.throws(()=>restoreBackup(initialState(),backup),/壺鈴課表/);
});

test('finished rounds require every station and a skipped station remains empty',()=>{
 const {s,send,advance}=fixture();
 send('save',{...base,count:4,rounds:2});send('start');
 const skipIndex=11;
 while(s.kettlebell.active){
  const session=s.kettlebell.active,phase=currentPhase(session);
  if(session.index===skipIndex){send('next',{skip:true});continue;}
  if(session.deadline===null)send('resume');
  advance(phase.seconds+15);send('next');
 }
 const [session]=s.kettlebell.sessions;
 assert.equal(session.log[skipIndex].kind,'work');
 assert.deepEqual(sessionTotals(session),{rounds:1,slots:7,workSeconds:175,totalSeconds:760});
});

test('demo reopens a paused circuit and persists its plan when changing weeks',async()=>{
 const values=new Map();
 const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const one=createDemoService(storage), state=await one.request('state'),today=state.context.date;
 const future=new Date(Date.parse(today)+14*86400000).toISOString().slice(0,10);
 await one.request('kettlebell',{...base,date:future,action:'save'});
 const futureView=await one.request('plan-week',{date:future});
 assert.equal(futureView.budget.planned,plannedSeconds(futureView.kettlebell.plans[future])/60);
 await assert.rejects(one.request('kettlebell',{date:future,action:'start'}),/課表日期當天/);
 await one.request('kettlebell',{...base,date:today,action:'save'});
 const {kettlebell:{active}}=await one.request('kettlebell',{date:today,action:'start'});
 const paused=await one.request('kettlebell',{action:'pause',id:active.id,rev:active.rev});
 const two=createDemoService(storage);
 assert.deepEqual((await two.request('state')).kettlebell.active,paused.kettlebell.active);
 assert.equal((await two.request('backup')).data.kettlebell.active.deadline,null);
 assert.equal((await two.request('reset',{confirm:'DELETE'})).kettlebell,undefined);
});

test('confirming Garmin and Strava for one circuit retains measured data and counts the timer only once',()=>{
 const {s,send,advance}=fixture();
 send('save',base);send('start');advance(60);send('finish');
 const [session]=s.kettlebell.sessions;
 const activity=(offset,sport,source='fit',planId=null)=>normalizeActivity({startedAt:new Date(session.startedAt+offset*1000),durationSeconds:75,sport,avgHeartRate:141,planId},source,'Asia/Taipei');
 const garmin=activity(2,'training','garmin-connect'), strava=activity(-3,'WeightTraining','strava');
 const run=activity(2,'running'), later=activity(1800,'strengthTraining'), linkedRunDay=activity(-1,'Workout','fit',date);
 s.activities=[strava,garmin,run,later,linkedRunDay];
 assert.deepEqual(findCircuitMatches(s,session).map(a=>a.id),[garmin.id,strava.id]);
 assert.equal(budget(s).completed,435/60);
 const link=(a,action='match-activity')=>send(action,{id:session.id,activityId:a.id});
 assert.throws(()=>link(run),/類型/);
 assert.throws(()=>link(later),/時間/);
 assert.throws(()=>link(linkedRunDay),/已有課表對應/);
 link(garmin);link(strava);link(strava);
 assert.equal(budget(s).completed,285/60);
 assert.equal(comparison(s)[2].actualMinutes,75/60);
 assert.equal(sessionTotals(session).totalSeconds,60);
 assert.equal(garmin.avgHeartRate,141);
 assert.equal(strava.durationSeconds,75);
 assert.deepEqual(findCircuitMatches(s,session),[]);
 const performance=performanceData(s,date);
 assert.equal(performance.activities.reduce((sum,a)=>sum+a.minutes,0),budget(s).completed);
 assert.equal(performance.activities.filter(a=>a.type==='Kettlebell').length,1);
 const load=loadSummary(s,date);
 assert.equal(load.perActivity[session.id].score,activityLoad(strava,s.athlete).score);
 assert.equal(load.series.at(-1).load,performance.activities.reduce((sum,a)=>sum+a.load,0));

 const backup=JSON.parse(JSON.stringify(exportBackup(s)));
 assert.deepEqual(restoreBackup(initialState(),backup).activities,s.activities);
 backup.data.activities[0].kettlebellSessionId='missing';
 assert.throws(()=>restoreBackup(initialState(),backup),/壺鈴活動對應/);
 link(strava,'unmatch-activity');
 assert.equal(budget(s).completed,360/60);
 assert.equal(strava.kettlebellSessionId,undefined);
 assert.equal(s.activities.length,5);
});

test('a paired recording in a different timezone week is counted only on the circuit day',()=>{
 const {s}=fixture();
 const sunday=s.plan[6].id,now=Date.parse(sunday+'T23:50:00+08:00');
 const send=(action,extra={},offset=0)=>updateKettlebell(s,{...base,date:sunday,action,...extra},{now:now+offset});
 send('save');send('start');send('finish',{id:s.kettlebell.active.id,rev:s.kettlebell.active.rev},45000);
 const [session]=s.kettlebell.sessions;
 const device=normalizeActivity({startedAt:new Date(session.startedAt),durationSeconds:60,sport:'HIIT'},'fit','Pacific/Auckland');
 const otherWeek=s.plan.map((day,index)=>({...day,id:`2026-11-${16+index}`}));
 assert.equal(device.date,otherWeek[0].id);
 s.activities.push(device);
 send('match-activity',{id:session.id,activityId:device.id});
 assert.equal(budget(s,s.plan).completed,45/60);
 assert.equal(budget(s,otherWeek).completed,0);
});
