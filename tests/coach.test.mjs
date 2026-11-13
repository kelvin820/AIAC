import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initialState,openStore} from '../src/store.mjs';
import {mockCoach,coach,budget,validatePlan,guardRecordedPlan} from '../src/coach.mjs';

test('an unlinked workout is visible to mock coaching and protects its date from proposals',()=>{
 const state=initialState();
 const day=state.plan[1];
 state.context.date=day.id;
 state.activities=[{date:day.id,planId:null,durationSeconds:1800}];
 const result=mockCoach(state,'今天只有 30 分鐘','chat');
 assert.equal(result.proposedPlan,null);
 assert.match(result.why,/1 筆活動待對應/);
 const proposal=state.plan.map(entry=>entry.id===day.id?{...entry,minutes:entry.minutes+1}:entry);
 assert.throws(()=>guardRecordedPlan(state,proposal),/已有活動紀錄/);
});
test('morning adjustment uses check-in intent and honors zero available time',()=>{
 const state=initialState();
 const day=state.plan[1];
 state.context={...state.context,date:day.id,minutes:25,trainingIntent:'adjust',motivation:'想把間歇改成輕鬆跑'};
 const suggestion=mockCoach(state,'請依今天的情境調整','morning');
 assert.equal(suggestion.proposedPlan[1].minutes,25);
 assert.equal(suggestion.proposedPlan[1].type,'Zone2');
 assert.equal(suggestion.proposedPlan[3].type,'Interval');
 state.context.minutes=0;
 assert.equal(mockCoach(state,'請依今天的情境調整','morning').proposedPlan,null);
});
test('motivation swap retains quality stimulus and does not mutate current plan',()=>{const s=initialState();s.context.date=s.plan[1].id;const before=structuredClone(s.plan);const r=mockCoach(s,'今天不想跑 Interval，改 Zone2 好嗎？','chat');assert.equal(r.proposedPlan[1].type,'Zone2');assert.equal(r.proposedPlan[3].type,'Interval');assert.deepEqual(s.plan,before);assert.equal(budget(s,r.proposedPlan).quality,1);});
test('missing data is explicit and no fabricated recovery score',()=>{const r=mockCoach(initialState(),'','morning');assert.ok(r.uncertainties.includes('缺少睡眠資料'));assert.equal(r.proposedPlan,null);});
test('reported severe symptoms override training request',()=>{const s=initialState();s.context.date=s.plan[1].id;const r=mockCoach(s,'胸痛但想改 Zone2','chat');assert.equal(r.proposedPlan,null);assert.match(r.text,/停止運動/);});
test('thunderstorm never assumes indoor equipment',()=>{const r=mockCoach(initialState(),'外面雷雨','chat');assert.match(r.text,/不假設有跑步機/);});
test('rejects invented dates, invalid durations and completion changes',()=>{const s=initialState();for(const patch of [{id:'2099-01-01'},{minutes:-10},{minutes:NaN},{completed:true},{type:'Magic'}]){const p=structuredClone(s.plan);Object.assign(p[0],patch);assert.throws(()=>validatePlan(p,s.plan));}});
test('budget uses deterministic completed minutes and quality count',()=>{const s=initialState();s.plan[0].completed=true;s.activities.push({date:s.plan[0].id,durationSeconds:900});assert.deepEqual(budget(s),{target:240,planned:220,completed:15,quality:1});});
test('profile, memory and conversation survive store reopening',async()=>{const dir=await mkdtemp(join(process.cwd(),'data-test-'));try{const store=await openStore(dir),s=store.get();s.profile.name='Tester';s.messages.push({role:'user',text:'只有 30 分鐘'});s.memories.push({text:'喜歡早晨',confirmed:true});await store.save(s);assert.deepEqual((await openStore(dir)).get(),s);}finally{await rm(dir,{recursive:true,force:true});}});
test('live configuration failure does not silently fall back to mock',async()=>{await assert.rejects(coach(initialState(),'test','chat',{LLM_MODE:'live'}),/LLM_API_KEY/);});
test('live provider contract sends structured context and checks proposal',async()=>{const original=globalThis.fetch;let request;globalThis.fetch=async(url,opts)=>{request=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({text:'建議',why:'原因',planB:'替代',uncertainties:[],proposedPlan:null})}}]})};};try{const r=await coach(initialState(),'今天只有30分鐘','chat',{LLM_MODE:'live',LLM_API_KEY:'test',LLM_BASE_URL:'https://example.invalid/v1',LLM_MODEL:'test'});assert.equal(r.mode,'live');assert.ok(JSON.parse(request.messages[1].content).budget);assert.equal(request.model,'test');}finally{globalThis.fetch=original;}});
