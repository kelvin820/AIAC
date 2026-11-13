import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Encoder,Profile} from '@garmin/fitsdk';
import {createDemoService} from '../src/demo-service.mjs';
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};}
test('browser demo completes coaching loop, persists locally and isolates visitors',async()=>{
 const local=storage(),one=createDemoService(local),two=createDemoService(storage());let s=await one.request('state');s.context.date=s.plan[1].id;s.profile.name='Visitor A';await one.request('settings',{profile:s.profile,context:s.context});s=await one.request('coach',{kind:'chat',message:'今天不想跑 Interval，改 Zone2 好嗎？'});const r=s.recommendations.at(-1);assert.equal(s.plan[1].type,'Interval');s=await one.request('decision',{id:r.id,decision:'accepted'});assert.equal(s.plan[1].type,'Zone2');assert.equal((await createDemoService(local).request('state')).profile.name,'Visitor A');assert.equal((await two.request('state')).profile.name,'');await assert.rejects(one.request('connections',{mode:'byok',apiKey:'test-secret'}));assert.ok(!local.getItem('aiac-browser-demo-v1').includes('test-secret'));
});
test('browser FIT import uses SDK, local SHA-256 dedup and plan matching',async()=>{
 const demo=createDemoService(storage());let s=await demo.request('state');const e=new Encoder(),start=new Date(s.plan[0].id+'T07:00:00+08:00');e.onMesg(Profile.MesgNum.FILE_ID,{type:'activity',manufacturer:'development',timeCreated:start});e.onMesg(Profile.MesgNum.SESSION,{startTime:start,timestamp:new Date(+start+1800000),sport:'running',totalTimerTime:1800,totalDistance:5000});const file=new File([e.close()],'test.fit');s=await demo.importFit(file);assert.equal(s.imported.added,1);s=await demo.importFit(file);assert.equal(s.imported.duplicates,1);s=await demo.request('activity-link',{id:s.activities[0].id,planId:s.plan[0].id,trainingType:'Zone2'});assert.equal(s.comparison[0].actualMinutes,30);assert.equal(s.budget.completed,30);
});
test('browser save failure does not silently keep unsaved state',async()=>{const local=storage(),demo=createDemoService(local);const s=await demo.request('state');s.profile.name='Should not save';local.setItem=()=>{throw Error('quota');};await assert.rejects(demo.request('settings',{profile:s.profile,context:s.context}),/空間不足/);assert.equal((await demo.request('state')).profile.name,'');});

test('switching weeks preserves existing plans and linked actuals after reopening', async () => {
 const local=storage();
 const demo=createDemoService(local);
 const original=await demo.request('state');
 const monday=original.plan[0].id;
 const followingWeek=new Date(`${monday}T12:00:00Z`);
 followingWeek.setUTCDate(followingWeek.getUTCDate()+7);
 await demo.request('activities',{source:'manual',activities:[{startedAt:`${monday}T07:00:00+08:00`,durationSeconds:1200,sport:'running',planId:monday,trainingType:'Zone2'}]});
 const next=await demo.request('plan-week',{date:followingWeek.toISOString().slice(0,10)});
 assert.equal(next.budget.planned,0);
 assert.equal(next.budget.completed,0);
 assert.equal(next.activities[0].planId,monday);
 assert.deepEqual(next.currentWeek.plan,original.plan);
 assert.equal(next.currentWeek.budget.completed,20);
 assert.equal(next.currentWeek.comparison[0].actualMinutes,20);
 await assert.rejects(demo.request('plan-week',{date:'2026-02-30'}),/有效日期/);
 const reopened=createDemoService(local);
 const prior=await reopened.request('plan-week',{date:monday});
 assert.deepEqual(prior.plan,original.plan);
 assert.equal(prior.comparison[0].actualMinutes,20);
});

test('backup transfers training history without connection settings and rejects corrupt data atomically', async () => {
 const source=createDemoService(storage());
 const original=await source.request('state');
 const date=original.plan[0].id;
 original.profile.name='Backup athlete';
 await source.request('settings',{profile:original.profile,context:original.context});
 await source.request('activities',{source:'manual',activities:[{startedAt:date+'T07:00:00+08:00',durationSeconds:1200,planId:date,trainingType:'Zone2'}]});
 await source.request('coach',{kind:'chat',message:'今天的課表怎麼調整？'});
 const next=new Date(date+'T12:00:00Z');
 next.setUTCDate(next.getUTCDate()+7);
 await source.request('plan-week',{date:next.toISOString().slice(0,10)});
 const backup=JSON.parse(JSON.stringify(await source.request('backup')));
 assert.equal(backup.data.connections,undefined);
 const target=createDemoService(storage());
 const restored=await target.request('backup-restore',backup);
 assert.equal(restored.profile.name,'Backup athlete');
 assert.equal(restored.recommendations.length,1);
 assert.equal(restored.activities[0].planId,date);
 assert.deepEqual(restored.planHistory[date],original.plan);
 backup.data.activities[0].route=[[999,0],[0,0]];
 await assert.rejects(target.request('backup-restore',backup),/GPS 路線/);
 const {lastOpenedOn,...afterFailedRestore}=await target.request('state');
 assert.equal(typeof lastOpenedOn,'string');
 assert.deepEqual(afterFailedRestore,restored);
});

test('opening on a new day moves context to today and follows the plan to that week', async () => {
 const local=storage();
 let s=await createDemoService(local).request('state');
 const today=s.context.date,thisMonday=s.plan[0].id;
 const lastWeek=new Date(`${today}T12:00:00Z`);lastWeek.setUTCDate(lastWeek.getUTCDate()-7);
 const past=lastWeek.toISOString().slice(0,10);
 const demo=createDemoService(local);
 await demo.request('plan-week',{date:past});
 s=await demo.request('settings',{profile:s.profile,context:{...s.context,date:past}});
 // Same day: a past date the user picked is kept.
 s=await createDemoService(local).request('state');
 assert.equal(s.context.date,past);
 // Next day: simulate the last open being yesterday.
 const stored=JSON.parse(local.getItem('aiac-browser-demo-v1'));stored.lastOpenedOn=past;local.setItem('aiac-browser-demo-v1',JSON.stringify(stored));
 s=await createDemoService(local).request('state');
 assert.equal(s.context.date,today);
 assert.equal(s.plan[0].id,thisMonday);
 assert.ok(s.planHistory[s.plan[0].id]===undefined&&Object.keys(s.planHistory).length===1);
});
