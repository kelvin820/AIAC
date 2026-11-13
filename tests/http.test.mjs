import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {once} from 'node:events';
import {Encoder,Profile} from '@garmin/fitsdk';
test('HTTP coaching loop, accept/reject, stale proposal, and restart persistence',async()=>{
 const dir=await mkdtemp(join(process.cwd(),'data-test-http-'));const port=33147;let child;
 async function start(){child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,DATA_DIR:dir,PORT:String(port),LLM_MODE:'mock'},stdio:['ignore','pipe','pipe']});await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('server exited before ready');})]);}
 async function stop(){const ended=once(child,'exit');child.kill();await ended;child=null;}
 async function call(path,body){const r=await fetch(`http://127.0.0.1:${port}/api/`+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();return {status:r.status,data};}
 try{
  await start();assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,200);
  const athlete=await call('athlete',{athlete:{maxHeartRate:190,restingHeartRate:50,lthr:'abc'}});assert.equal(athlete.status,400);assert.match(athlete.data.error,/lthr/);
  const preview=(await call('training-plan',{action:'preview',settings:{weeks:3,weeklyMinutes:240,daysPerWeek:4}})).data;assert.equal(preview.preview.weeks.length,3);assert.deepEqual((await call('state')).data.trainingPlans,[]);
  const badPlan=await call('training-plan',{action:'apply',settings:{weeks:99,weeklyMinutes:240}});assert.equal(badPlan.status,400);assert.match(badPlan.data.error,/計畫週數/);
  const applied=(await call('training-plan',{action:'apply',settings:{name:'HTTP 計畫',startDate:'2099-01-05',weeks:3,weeklyMinutes:240,daysPerWeek:4}})).data;assert.equal(applied.planStatus.name,'HTTP 計畫');
  await call('training-plan',{action:'archive',id:applied.trainingPlans[0].id});
  const today=(await call('state')).data.wellnessView.today;
  const badWell=await call('wellness',{action:'save',entry:{date:today,hrv:999}});assert.equal(badWell.status,400);assert.match(badWell.data.error,/HRV/);
  let well=(await call('wellness',{action:'save',entry:{date:today,sleepHours:7.5,restingHr:52}})).data;assert.equal(well.wellness.length,1);assert.equal(well.wellnessView.readiness.status,'insufficient');
  well=(await call('wellness',{action:'delete',date:today})).data;assert.deepEqual(well.wellness,[]);
  const badGoal=await call('goal',{action:'save',goal:{type:'event',title:'賽事'}});assert.equal(badGoal.status,400);assert.match(badGoal.data.error,/比賽日期/);
  let withGoal=(await call('goal',{action:'save',goal:{type:'consistency',title:'每週 3 次',sessionsPerWeek:3}})).data;assert.equal(withGoal.goals.length,1);assert.equal(withGoal.goalsView.goals[0].progress.kind,'consistency');
  withGoal=(await call('goal',{action:'delete',id:withGoal.goals[0].id})).data;assert.deepEqual(withGoal.goals,[]);
  const saved=(await call('athlete',{athlete:{maxHeartRate:190,restingHeartRate:50}})).data;assert.equal(saved.athlete.maxHeartRate,190);assert.equal(saved.load.athleteComplete,true);assert.equal(saved.load.today,null);
  assert.equal((await fetch(`http://127.0.0.1:${port}/assets/fonts/archivo-latin.woff2`)).headers.get('content-type'),'font/woff2');
  let s=(await call('state')).data;s.context.date=s.plan[1].id;s.profile.name='HTTP Test';
  s=(await call('settings',{profile:s.profile,context:s.context})).data;
  s=(await call('coach',{kind:'morning',message:'早安，今天怎麼練？'})).data;assert.equal(s.recommendations.length,1);
  s=(await call('coach',{kind:'chat',message:'今天不想跑 Interval，改 Zone2 好嗎？'})).data;assert.equal(s.plan[1].type,'Interval');let r=s.recommendations.at(-1);
  s=(await call('decision',{id:r.id,decision:'rejected'})).data;assert.equal(s.plan[1].type,'Interval');
  s=(await call('coach',{kind:'chat',message:'今天不想跑 Interval，改 Zone2 好嗎？'})).data;r=s.recommendations.at(-1);
  s=(await call('decision',{id:r.id,decision:'accepted'})).data;assert.equal(s.plan[1].type,'Zone2');assert.equal(s.plan[3].type,'Interval');assert.equal(s.revisions.length,1);
  await stop();await start();assert.deepEqual((await call('state')).data,s);
  const encoder=new Encoder();const activityStart=new Date(s.plan[0].id+'T07:00:00+08:00');encoder.onMesg(Profile.MesgNum.FILE_ID,{type:'activity',manufacturer:'development',timeCreated:activityStart});encoder.onMesg(Profile.MesgNum.SESSION,{timestamp:new Date(+activityStart+1800000),startTime:activityStart,sport:'running',totalTimerTime:1800,totalDistance:5000});const fit=Buffer.from(encoder.close());
  const upload=()=>fetch(`http://127.0.0.1:${port}/api/import-fit`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:fit}).then(r=>r.json());
  s=await upload();assert.equal(s.imported.added,1);s=await upload();assert.equal(s.imported.duplicates,1);assert.equal(s.activities.length,1);const a=s.activities[0];
  s=(await call('activity-link',{id:a.id,planId:s.plan[0].id,trainingType:'Zone2'})).data;assert.equal(s.comparison[0].actualMinutes,30);assert.equal(s.budget.completed,30);
  s=(await call('coach',{kind:'chat',message:'我今天只有 30 分鐘'})).data;r=s.recommendations.at(-1);s.plan[0].minutes=35;
  await call('plan',{plan:s.plan});assert.equal((await call('decision',{id:r.id,decision:'accepted'})).status,400);
  const bad=await fetch(`http://127.0.0.1:${port}/api/reset`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.invalid'},body:'{"confirm":"DELETE"}'});assert.equal(bad.status,403);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:s.context.timezone}).format(new Date());
  const savedCircuit=await call('kettlebell',{action:'save',date,minutes:30,count:5,rounds:4,pace:'steady',weights:[8,12],familiar:[]});
  assert.equal(savedCircuit.status,200);assert.equal(savedCircuit.data.kettlebell.plans[date].rounds,4);
  const started=(await call('kettlebell',{action:'start',date})).data.kettlebell.active;
  const paused=await call('kettlebell',{action:'pause',id:started.id,rev:started.rev});
  assert.equal(paused.status,200);assert.equal(paused.data.kettlebell.active.deadline,null);
  await stop();await start();
  assert.deepEqual((await call('state')).data.kettlebell.active,paused.data.kettlebell.active);
  assert.equal((await call('backup')).data.data.kettlebell.plans[date].rounds,4);
 }finally{if(child)await stop();await rm(dir,{recursive:true,force:true});}
});
