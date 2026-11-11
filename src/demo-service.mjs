import {exportBackup,restoreBackup} from './backup.mjs';
import {initialState} from './initial-state.mjs';
import {hasPlanDate,selectPlanWeek} from './plan-weeks.mjs';
import {budget,mockCoach,validatePlan} from './coach.mjs';
import {normalizeActivity,importActivities,comparison,activitySummary} from './activity-core.mjs';
import {decodeFitBytes} from './fit-core.mjs';
const key='aiac-browser-demo-v1';
const version=s=>JSON.stringify(s.activities.map(a=>[a.id,a.planId,a.durationSeconds,a.trainingType]));
export function createDemoService(storage){
 let state;try{state=JSON.parse(storage.getItem(key)||'null')||initialState();}catch{throw Error('無法讀取瀏覽器試用資料，請允許此網站的儲存權限或清除已損壞資料。');}
 function view(s){return {...structuredClone(s),mode:'mock',demo:true,budget:budget(s),comparison:comparison(s),connections:{...structuredClone(s.connections),llm:{...s.connections.llm,hasKey:false},mcp:{...s.connections.mcp,hasBearer:false},strava:{configured:false,connected:false}},summaries:Object.fromEntries(s.activities.map(a=>[a.id,activitySummary(a)]))};}
 function save(s){try{storage.setItem(key,JSON.stringify(s));}catch{throw Error('瀏覽器儲存空間不足，未保存變更。可先移除舊活動或重設試用資料。');}state=s;return view(s);}
 return {
  async request(path,b={}){
   const s=structuredClone(state);if(path==='state')return view(s);
   if(path==='backup')return exportBackup(s);
   if(path==='backup-restore')return save(restoreBackup(s,b));
   if(path==='settings'){
    if(!b.profile||!b.context)throw Error('設定格式不正確');
    if(!Number.isFinite(Number(b.context.minutes))||b.context.minutes<0||b.context.minutes>180||!Number.isFinite(Number(b.profile.weeklyMinutes))||b.profile.weeklyMinutes<0||b.profile.weeklyMinutes>2000)throw Error('請檢查時間與每週目標');
    new Intl.DateTimeFormat('en',{timeZone:b.context.timezone});s.profile={...b.profile,weeklyMinutes:Number(b.profile.weeklyMinutes)};s.context={...b.context,minutes:Number(b.context.minutes)};
   }else if(path==='plan-week'){
    selectPlanWeek(s,b.date);
   }else if(path==='plan'){
    const next=validatePlan(b.plan,s.plan);s.revisions.push({at:new Date().toISOString(),reason:'手動編輯預計課表',before:s.plan,after:next});s.plan=next;
   }else if(path==='coach'){
    if(['morning','chat'].includes(b.kind)&&!s.plan.some(day=>day.id===s.context.date))throw Error('情境日期不在目前選取的課表。請切換到對應週次後再詢問教練。');
    if(typeof b.message!=='string'||b.message.length>6000)throw Error('訊息需在 6000 字內');
    const a=b.activityId?s.activities.find(a=>a.id===b.activityId):null;if(b.activityId&&!a)throw Error('找不到活動');
    const result={...mockCoach({...s,analysisActivity:a},b.message,b.kind),model:'browser-mock-v1',mode:'mock'};const id=crypto.randomUUID(),at=new Date().toISOString();
    s.messages.push({role:'user',text:b.message,at},{role:'assistant',text:result.text,at,recommendationId:id});s.recommendations.push({id,at,kind:b.kind,...result,status:'pending',activityId:b.activityId||null,activityVersion:version(s),context:structuredClone(s.context),profile:structuredClone(s.profile),planBefore:structuredClone(s.plan),budget:budget(s)});
   }else if(path==='decision'){
    const r=s.recommendations.find(r=>r.id===b.id);if(!r||r.status!=='pending'||!r.proposedPlan||!['accepted','rejected'].includes(b.decision))throw Error('沒有可確認的提案');
    if(b.decision==='accepted'){if(JSON.stringify(r.planBefore)!==JSON.stringify(s.plan)||r.activityVersion!==version(s))throw Error('課表或實際活動已變更，請重新產生提案');const next=validatePlan(r.proposedPlan,s.plan);s.revisions.push({at:new Date().toISOString(),reason:r.text,before:s.plan,after:next});s.plan=next;}r.status=b.decision;
   }else if(path==='activities'){
    if(!Array.isArray(b.activities)||b.activities.length>1000)throw Error('請提供最多 1000 筆的標準活動陣列');if(b.activities.some(a=>a.planId&&!hasPlanDate(s,a.planId)))throw Error('對應課表日期不存在');
    const result=importActivities(s,b.activities.map(a=>normalizeActivity(a,b.source||'manual',s.context.timezone)));return {...save(s),imported:result};
   }else if(path==='activity-link'){
    const a=s.activities.find(a=>a.id===b.id);if(!a||b.planId&&!hasPlanDate(s,b.planId))throw Error('活動或課表不存在');if(!['Unknown','Zone2','Interval','Tempo','Recovery','Rest','Long Run','Indoor'].includes(b.trainingType))throw Error('訓練類型不正確');a.planId=b.planId||null;a.trainingType=b.trainingType;
   }else if(path==='activity-delete')s.activities=s.activities.filter(a=>a.id!==b.id);
   else if(path==='memory'){
    if(b.action==='delete')s.memories=s.memories.filter(m=>m.id!==b.id);else{if(typeof b.text!=='string'||!b.text.trim()||b.text.length>2000)throw Error('請填寫 2000 字以內的記憶');const m=s.memories.find(m=>m.id===b.id);if(m)m.text=b.text;else s.memories.push({id:crypto.randomUUID(),text:b.text,confirmed:true,source:'user',at:new Date().toISOString()});}
   }else if(path==='reset'){if(b.confirm!=='DELETE')throw Error('請確認刪除');return save(initialState());}
   else throw Error('此線上試用版僅提供瀏覽器內的 Mock 與 FIT 功能。LLM Key、Strava／MCP 授權請使用 Repository 的本機完整版本。');
   return save(s);
  },
  async importFit(file){if(file.size>20*1024*1024)throw Error('FIT 最大 20 MB');const bytes=new Uint8Array(await file.arrayBuffer());const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');const items=decodeFitBytes(bytes,state.context.timezone,digest);const s=structuredClone(state),activityIds=[];const imported=importActivities(s,items,activityIds);return {...save(s),imported,activityIds};}
 };
}
