import http from 'node:http';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore,initialState} from './src/store.mjs';
import {coach,budget,validatePlan,guardRecordedPlan} from './src/coach.mjs';
import {openVault} from './src/vault.mjs';
import {defaultConnections,llmEnvironment,validateEndpoint} from './src/providers.mjs';
import {normalizeActivity,parseFit,importActivities,comparison,activitySummary,dateAt} from './src/activities.mjs';
import {createMcp} from './src/mcp.mjs';
import {createStrava} from './src/strava.mjs';
import {createGarmin} from './src/garmin.mjs';
import {createIntervals,syncIntervals} from './src/intervals.mjs';
import {fitActivityData} from './src/fit-core.mjs';
import {syncStrava,syncStravaIfDue} from './src/strava-sync.mjs';
import {backupLimit,exportBackup,restoreBackup} from './src/backup.mjs';
import {advanceToToday,ensurePlanWeek,hasPlanDate,selectPlanWeek,todayIn} from './src/plan-weeks.mjs';
import {loadSummary,validateAthlete} from './src/training-load.mjs';
import {performanceData} from './src/performance.mjs';
import {applyGoalAction,goalsSummary} from './src/goals.mjs';
import {activePlanStatus,trainingPlanAction} from './src/training-plan.mjs';
import {workoutsView} from './src/workout-structure.mjs';
import {wellnessAction,wellnessView} from './src/wellness.mjs';
import {updateKettlebell} from './public/kettlebell-core.js';

const garmin=createGarmin(process.env.GARMIN_PERSONAL_API_KEY);
const intervals=createIntervals({apiKey:process.env.INTERVALS_API_KEY,athleteId:process.env.INTERVALS_ATHLETE_ID});let nextIntervalsSync=0;
let nextGarminSync=0;
const dataDir=process.env.DATA_DIR||'data';const store=await openStore(dataDir),vault=await openVault(dataDir);const port=Number(process.env.PORT||3140);let busy=false;
const base=`http://127.0.0.1:${port}`,mcp=createMcp(vault,base+'/auth/mcp/callback'),strava=createStrava(vault,base+'/auth/strava/callback');
const activityVersion=s=>JSON.stringify(s.activities.map(a=>[a.id,a.planId,a.durationSeconds,a.trainingType,...(a.kettlebellSessionId?[a.kettlebellSessionId]:[])]));
function view(s){return {...s,budget:budget(s),comparison:comparison(s),load:loadSummary(s),performance:performanceData(s),goalsView:goalsSummary(s),planStatus:activePlanStatus(s,todayIn(s.context.timezone)),workouts:workoutsView(s),wellnessView:wellnessView(s,todayIn(s.context.timezone)),mode:s.connections.llm.mode==='byok'?'live':'mock',connections:{...s.connections,intervals:{...(s.connections.intervals??{}),configured:intervals.configured(),nextSync:intervals.configured()&&Number.isFinite(nextIntervalsSync)&&nextIntervalsSync?new Date(nextIntervalsSync).toISOString():null},garmin:{...s.connections.garmin,configured:garmin.configured(),nextSync:garmin.configured()&&Number.isFinite(nextGarminSync)&&nextGarminSync?new Date(nextGarminSync).toISOString():null},llm:{...s.connections.llm,hasKey:Boolean(vault.get().llmKey)},mcp:{...s.connections.mcp,hasBearer:Boolean(vault.get().mcpBearer)},strava:{...s.connections.strava,configured:strava.configured(),connected:Boolean(vault.get().stravaTokens)}},summaries:Object.fromEntries(s.activities.map(a=>[a.id,activitySummary(a)]))};}
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function raw(req,max=100000){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('輸入過長');chunks.push(chunk);}return Buffer.concat(chunks);}
async function body(req,max){return JSON.parse((await raw(req,max)).toString()||'{}');}
async function readActivityFit(activity){
 const source=activity?.sources.find(entry=>entry.source==='fit');
 const match=/^([a-f0-9]{64}):(\d+)$/.exec(source?.sourceId??'');
 if(!match)throw Error('找不到這筆活動的原始 FIT。');
 const [,hash,index]=match;
 try{return {bytes:await readFile(join(dataDir,'uploads',hash+'.fit')),index:Number(index),sourceId:source.sourceId};}
 catch(error){if(error.code!=='ENOENT')throw error;throw Error('本機沒有原始 FIT，請重新匯入。');}
}

async function workoutForCoach(activity,env){
 if(!activity||env.LLM_MODE!=='live'||!activity.sources.some(source=>source.source.startsWith('strava')))return activity;
 if(!activity.sources.some(source=>source.source==='fit')){
  throw Error('這筆活動的來源是 Strava。若要用外部模型分析，請先匯入原始 FIT。');
 }
 const {bytes,index,sourceId}=await readActivityFit(activity);
 const fit=parseFit(bytes,activity.timezone)[index];
 if(fit?.sourceId!==sourceId)throw Error('原始 FIT 與活動不符，請重新匯入。');
 return {...fit,id:activity.id,planId:activity.planId,trainingType:activity.trainingType,kettlebellSessionId:activity.kettlebellSessionId};
}

http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' https://tile.openstreetmap.org; frame-ancestors 'none'; base-uri 'none'");
 if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return send(res,403,{error:'不允許的 Host'});
 const url=new URL(req.url,base);
 if(req.method==='GET'&&url.pathname.startsWith('/auth/')){
  if(busy)return send(res,409,{error:'另一個操作進行中，請稍後重新整理'});busy=true;
  try{if(url.searchParams.has('error'))throw Error('使用者拒絕授權');
   if(url.pathname==='/auth/strava/callback'){
    const athleteId=await strava.finish(url.searchParams.get('code'),url.searchParams.get('state'),url.searchParams.get('scope')||'');
    const state=store.get();
    const previous=state.connections.strava;
    state.connections.strava=athleteId!==null&&athleteId===previous.athleteId
      ? {athleteId,cursor:previous.cursor,lastSync:previous.lastSync} : {athleteId};
    await store.save(state);
   }
   else if(url.pathname==='/auth/mcp/callback')await mcp.finish(store.get().connections.mcp.url,url.searchParams.get('code'),url.searchParams.get('state'));
   else throw Error('找不到授權流程');
   res.writeHead(302,{Location:'/'});res.end();
  }catch{send(res,400,{error:'授權失敗、被拒絕或已過期。請返回 AIAC 重新連接。'});}finally{busy=false;}return;
 }
 if(req.method==='GET'&&req.url==='/api/backup')return send(res,200,exportBackup(store.get()));
 if(req.method==='GET'&&req.url==='/api/state'){let s=store.get();if(!busy&&advanceToToday(s,todayIn(s.context.timezone))){busy=true;try{s=await store.save(s);}catch(e){return send(res,500,{error:e.message});}finally{busy=false;}}return send(res,200,view(s));}
 if(req.url.startsWith('/api/')&&req.method==='POST'){
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return send(res,403,{error:'不允許跨站修改'});
  const isFit=req.url==='/api/import-fit';
  if(req.headers['content-type']!==(isFit?'application/octet-stream':'application/json'))return send(res,415,{error:'請使用指定的檔案或 JSON 格式'});
  if(busy)return send(res,409,{error:'另一個操作進行中，請稍後重試'});busy=true;
  try{
   const b=isFit?{}:await body(req,req.url==='/api/backup-restore'?backupLimit:undefined);let s=store.get();
   if(isFit){
    const buffer=await raw(req,20*1024*1024);const items=parseFit(buffer,s.context.timezone);const activityIds=[];const imported=importActivities(s,items,activityIds);await mkdir(join(dataDir,'uploads'),{recursive:true});await writeFile(join(dataDir,'uploads',items[0].fingerprint.split(':')[0]+'.fit'),buffer,{mode:0o600});await store.save(s);return send(res,200,{...view(s),imported,activityIds});
   }else if(req.url==='/api/connections'){
    const mode=b.mode;if(!['mock','byok','managed'].includes(mode))throw Error('分析模式不正確');if(mode==='managed')throw Error('AIAC 付費代管尚未開通，不會使用開發者共享 Key');
    const dailyLimit=Number(b.dailyLimit),maxOutputTokens=Number(b.maxOutputTokens);
    if(!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>100||!Number.isInteger(maxOutputTokens)||maxOutputTokens<128||maxOutputTokens>4096)throw Error('每日次數 1–100；單次輸出 128–4096 tokens');
    const baseUrl=validateEndpoint(b.baseUrl,{local:true});if(mode==='byok'&&(!b.model?.trim()||!b.consent))throw Error('請填模型名稱並確認資料傳送與費用');
    const secret=vault.get();if(b.clearKey)delete secret.llmKey;else if(b.apiKey?.trim())secret.llmKey=b.apiKey.trim();if(mode==='byok'&&!secret.llmKey)throw Error('請貼上自己的 API Key');
    await vault.save(secret);s.connections.llm={mode,baseUrl,model:String(b.model||'').slice(0,200),dailyLimit,maxOutputTokens};
   }else if(req.url==='/api/mcp-settings'){
    const endpoint=validateEndpoint(b.url,{local:true});const secrets=vault.get();if(endpoint!==s.connections.mcp.url){for(const k of ['mcpBearer','mcpTokens','mcpClient','mcpVerifier'])delete secrets[k];mcp.clear();}
    if(b.clearBearer)delete secrets.mcpBearer;else if(b.bearer?.trim())secrets.mcpBearer=b.bearer.trim();await vault.save(secrets);s.connections.mcp={url:endpoint,status:'disconnected'};
   }else if(req.url==='/api/mcp-connect'){
    const result=await mcp.list(s.connections.mcp.url);s.connections.mcp.status=result.status;await store.save(s);return send(res,200,{...view(s),mcpResult:result});
   }else if(req.url==='/api/mcp-call'){
    if(!b.confirm||typeof b.name!=='string'||!b.arguments||typeof b.arguments!=='object'||Array.isArray(b.arguments))throw Error('請選擇唯讀工具、填寫 JSON 參數並確認執行');
    const result=await mcp.call(s.connections.mcp.url,b.name,b.arguments);return send(res,200,{...view(s),mcpResult:result});
   }else if(req.url==='/api/mcp-disconnect'){
    const secrets=vault.get();for(const k of ['mcpBearer','mcpTokens','mcpClient','mcpVerifier'])delete secrets[k];await vault.save(secrets);mcp.clear();s.connections.mcp.status='disconnected';
   }else if(req.url==='/api/strava-authorize')return send(res,200,{url:strava.authorize()});
   else if(req.url==='/api/strava-sync'){
    if(!strava.configured()||!strava.connected())throw Error('請先設定並連接 Strava。');
    const result=await syncStrava(store,strava,Date.now(),{backfill:b.backfill===true});return send(res,200,{...view(result.state),imported:result.imported,complete:result.complete});
   }else if(req.url==='/api/intervals-sync'){
    const backfillDays=b.backfillDays===undefined?null:Number(b.backfillDays);
    if(backfillDays!==null&&![30,90,180,365].includes(backfillDays))throw Error('補抓天數需為 30、90、180 或 365');
    let result;try{result=await syncIntervals(s,intervals,{today:todayIn(s.context.timezone),backfillDays});}finally{await store.save(s);}
    nextIntervalsSync=Date.now()+15*60*1000;return send(res,200,{...view(s),imported:result});
   }else if(req.url==='/api/garmin-sync'){
    const imported=await syncGarmin(s);return send(res,200,{...view(s),imported});
   }else if(req.url==='/api/fit-activity-data'){
    const {bytes,index}=await readActivityFit(s.activities.find(a=>a.id===b.id));
    return send(res,200,fitActivityData(bytes,index));
   }else if(req.url==='/api/strava-activity-data'){
    const activity=s.activities.find(a=>a.id===b.id);
    const source=activity?.sources.find(x=>x.source==='strava');
    if(!source)throw Error('找不到這筆 Strava 活動');
    return send(res,200,await strava.activityData(source.sourceId));
   }else if(req.url==='/api/strava-disconnect'){await strava.disconnect();s.connections.strava={};}
   else if(req.url==='/api/activities'){
    if(!Array.isArray(b.activities)||b.activities.length>1000)throw Error('最多匯入 1000 筆活動');
    const source=['manual','garmin-export','apple-export','strava-mcp','mcp'].includes(b.source)?b.source:'manual';
    if(b.activities.some(a=>a.planId&&!hasPlanDate(s,a.planId)))throw Error('活動對應的課表日期不存在');
    const items=b.activities.map(a=>normalizeActivity(a,source,s.context.timezone));const imported=importActivities(s,items);await store.save(s);return send(res,200,{...view(s),imported});
   }else if(req.url==='/api/activity-link'){
    const a=s.activities.find(a=>a.id===b.id);if(!a||b.planId&&!hasPlanDate(s,b.planId))throw Error('活動或課表不存在');
    if(a.kettlebellSessionId)throw Error('這筆活動已對應壺鈴課，請先在壺鈴結果解除對應。');
    const types=['Unknown','Zone2','Interval','Tempo','Recovery','Rest','Long Run','Indoor'];if(!types.includes(b.trainingType))throw Error('訓練類型不正確');a.planId=b.planId||null;a.trainingType=b.trainingType;
   }else if(req.url==='/api/activity-delete'){
    s.activities=s.activities.filter(a=>a.id!==b.id);
   }else if(req.url==='/api/settings'){
    for(const key of ['name','goal','experience','preferences','constraints'])if(typeof b.profile?.[key]!=='string'||b.profile[key].length>3000)throw Error('個人設定格式不正確');
    if(!Number.isFinite(Number(b.profile.weeklyMinutes))||b.profile.weeklyMinutes<0||b.profile.weeklyMinutes>2000)throw Error('每週目標需介於 0–2000 分鐘');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(b.context?.date)||!Number.isFinite(Number(b.context.minutes))||b.context.minutes<0||b.context.minutes>180)throw Error('日期或可用時間不正確');
    try{new Intl.DateTimeFormat('en',{timeZone:b.context.timezone});}catch{throw Error('請提供有效時區');}
    s.profile=Object.fromEntries(['name','goal','experience','preferences','constraints','weeklyMinutes'].map(k=>[k,b.profile[k]]));s.profile.weeklyMinutes=Number(s.profile.weeklyMinutes);
    s.context=Object.fromEntries(['date','timezone','location','minutes','sleep','feeling','weather','motivation','equipment'].map(k=>[k,b.context[k]??'']));s.context.minutes=Number(s.context.minutes);
    if(['follow','adjust'].includes(b.context.trainingIntent))s.context.trainingIntent=b.context.trainingIntent;
   }else if(req.url==='/api/wellness'){
    wellnessAction(s,b,todayIn(s.context.timezone),new Date().toISOString());
   }else if(req.url==='/api/training-plan'){
    const result=trainingPlanAction(s,b,todayIn(s.context.timezone),new Date().toISOString());
    if(b.action==='preview')return send(res,200,{preview:result});
   }else if(req.url==='/api/goal'){
    applyGoalAction(s,b,new Date().toISOString());
   }else if(req.url==='/api/athlete'){
    s.athlete=validateAthlete(b.athlete);
   }else if(req.url==='/api/backup-restore'){
    s=restoreBackup(s,b);
   }else if(req.url==='/api/kettlebell'){
    updateKettlebell(s,b);
    if(b.action==='save')ensurePlanWeek(s,b.date);
   }else if(req.url==='/api/plan-week'){
    selectPlanWeek(s,b.date);
   }else if(req.url==='/api/plan'){
    const next=validatePlan(b.plan.map((p,i)=>({...p,completed:s.plan[i]?.completed})),s.plan);
    if(!b.plan.every(p=>typeof p.completed==='boolean'))throw Error('完成狀態不正確');next.forEach((p,i)=>p.completed=b.plan[i].completed);
    s.revisions.push({at:new Date().toISOString(),reason:'使用者手動編輯',before:s.plan,after:next});s.plan=next;
   }else if(req.url==='/api/coach'){
    if(['morning','chat'].includes(b.kind)&&!s.plan.some(day=>day.id===s.context.date))throw Error('情境日期不在目前選取的課表。請切換到對應週次後再詢問教練。');
    if(typeof b.message!=='string'||b.message.length>6000)throw Error('訊息長度不正確');
    const env=llmEnvironment(s.connections.llm,vault.get());let attempt;
    const selected=b.activityId?s.activities.find(a=>a.id===b.activityId):null;if(b.activityId&&!selected)throw Error('找不到指定活動');
    const analysisActivity=await workoutForCoach(selected,env);
    if(env.LLM_MODE==='live'){
     const day=dateAt(new Date(),s.context.timezone);const count=s.connections.usage.filter(u=>u.day===day).length;if(count>=s.connections.llm.dailyLimit)throw Error('今日 LLM 呼叫上限已達；請明天再試或調整使用額度');
     attempt={id:randomUUID(),day,at:new Date().toISOString(),status:'attempted',model:env.LLM_MODEL,maxOutputTokens:s.connections.llm.maxOutputTokens};s.connections.usage.push(attempt);await store.save(s);
    }
    const activities=analysisActivity!==selected?s.activities.map(activity=>activity.id===selected.id?analysisActivity:activity):s.activities;
    let result;try{result=await coach({...s,activities,analysisActivity},b.message,b.kind,env);guardRecordedPlan(s,result.proposedPlan);}catch(e){if(attempt){attempt.status='failed';await store.save(s);}throw e;}
    if(attempt){attempt.status='success';attempt.tokens=result.usage;}
    const id=randomUUID();
    s.messages.push({role:'user',text:b.message,at:new Date().toISOString()},{role:'assistant',text:result.text,at:new Date().toISOString(),recommendationId:id});
    s.recommendations.push({id,at:new Date().toISOString(),kind:b.kind,activityId:b.activityId||null,...result,status:'pending',activityVersion:activityVersion(s),context:structuredClone(s.context),profile:structuredClone(s.profile),planBefore:structuredClone(s.plan),budget:budget(s),historyRange:{messages:Math.min(s.messages.length-2,12)},dnaVersion:'1.0'});
   }else if(req.url==='/api/decision'){
    const r=s.recommendations.find(r=>r.id===b.id);if(!r||r.status!=='pending'||!r.proposedPlan)throw Error('找不到待確認課表');
    if(!['accepted','rejected'].includes(b.decision))throw Error('決定格式不正確');
    if(b.decision==='accepted'){
     if(JSON.stringify(r.planBefore)!==JSON.stringify(s.plan))throw Error('課表已變更，請重新向教練提出調整');
     if(r.activityVersion&&r.activityVersion!==activityVersion(s))throw Error('實際活動已變更，請重新產生提案');guardRecordedPlan(s,r.proposedPlan);
     const next=validatePlan(r.proposedPlan,s.plan);s.revisions.push({at:new Date().toISOString(),reason:r.text,before:s.plan,after:next,recommendationId:r.id});s.plan=next;
    }r.status=b.decision;
   }else if(req.url==='/api/memory'){
    if(b.action==='delete')s.memories=s.memories.filter(m=>m.id!==b.id);
    else {if(typeof b.text!=='string'||!b.text.trim()||b.text.length>2000)throw Error('記憶內容不正確');const m=s.memories.find(m=>m.id===b.id);if(m){m.text=b.text;m.updatedAt=new Date().toISOString();}else s.memories.push({id:randomUUID(),text:b.text,confirmed:true,source:'user',at:new Date().toISOString()});}
   }else if(req.url==='/api/reset'){if(b.confirm!=='DELETE')throw Error('請輸入 DELETE');s=initialState();s.activities=[];s.connections=defaultConnections();await vault.save({});mcp.clear();await rm(join(dataDir,'uploads'),{recursive:true,force:true});}
   else return send(res,404,{error:'找不到操作'});
   await store.save(s);send(res,200,view(s));
  }catch(e){send(res,400,{error:e.name==='TimeoutError'?'LLM 回應逾時，未修改課表':e.message});}finally{busy=false;}return;
 }
 const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/route-map.js':['route-map.js','text/javascript'],'/kettlebell-core.js':['kettlebell-core.js','text/javascript'],'/kettlebell-ui.js':['kettlebell-ui.js','text/javascript'],'/kettlebell-guidance.js':['kettlebell-guidance.js','text/javascript'],'/kettlebell-demo.js':['kettlebell-demo.js','text/javascript'],'/kettlebell-motion.js':['kettlebell-motion.js','text/javascript'],'/training-research.js':['training-research.js','text/javascript'],'/vendor/three.module.js':['../node_modules/three/build/three.module.js','text/javascript'],'/vendor/three.core.js':['../node_modules/three/build/three.core.js','text/javascript'],'/vendor/leaflet.js':['../node_modules/leaflet/dist/leaflet.js','text/javascript'],'/vendor/leaflet.css':['../node_modules/leaflet/dist/leaflet.css','text/css'],'/assets/author-mark.svg':['assets/author-mark.svg','image/svg+xml'],'/assets/fonts/archivo-latin.woff2':['assets/fonts/archivo-latin.woff2','font/woff2']};
 if(req.method==='GET'&&Object.hasOwn(files,req.url)){
  const [file,type]=files[req.url];
  try{const contents=await readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{'Content-Type':type.startsWith('font/')?type:type+'; charset=utf-8'});res.end(contents);}
  catch{send(res,404,{error:'找不到本機資源。若剛更新 AIAC，請重新安裝依賴。'});}
 }else send(res,404,{error:'Not found'});
}).listen(port,'127.0.0.1',()=>console.log(`AIAC running at http://127.0.0.1:${port} · ${store.get().connections.llm.mode} · local data only`));

async function importGarminActivities(s){
 const imported={added:0,duplicates:0,files:0,withoutFit:0,more:false};
 const known=new Set(s.activities.flatMap(a=>a.sources.filter(source=>source.source==='garmin-connect').map(source=>source.sourceId)));
 let downloads=0;
 const uploadDir=join(dataDir,'uploads');
 for(let start=0;start<150;start+=30){
  const rows=await garmin.list(s.context.timezone,start);
  for(const row of rows){
   const id=String(row.activityId??'');
   if(known.has(id))continue;
   if(downloads===10){imported.more=true;break;}
   downloads++;
   const buffer=await garmin.fit(id);
   if(!buffer){imported.withoutFit++;continue;}
   const items=parseFit(buffer,s.context.timezone);
   for(const item of items){
    if(typeof row.activityName==='string'&&row.activityName.trim())item.name=row.activityName.trim().slice(0,200);
    item.sources.push({source:'garmin-connect',sourceId:id});
   }
   await mkdir(uploadDir,{recursive:true});
   await writeFile(join(uploadDir,items[0].fingerprint.split(':')[0]+'.fit'),buffer,{mode:0o600});
   const counts=importActivities(s,items);
   await store.save(s);
   known.add(id);
   imported.files++;
   imported.added+=counts.added;
   imported.duplicates+=counts.duplicates;
  }
  if(imported.more||rows.length<30)break;
  if(start===120)imported.more=true;
 }
 return imported;
}

async function syncGarmin(s){
 const status=s.connections.garmin??={};
 try{
  const imported=await importGarminActivities(s);
  status.lastSync=new Date().toISOString();
  delete status.lastError;
  nextGarminSync=Date.now()+15*60*1000;
  await store.save(s);
  return imported;
 }catch(error){
  const rejected=error.code==='GARMIN_KEY_REJECTED';
  nextGarminSync=rejected?Infinity:Date.now()+15*60*1000;
  status.lastError=error.name==='TimeoutError'?'Garmin 同步逾時，稍後會自動重試。'
   :error.message==='fetch failed'?'暫時無法連到 Garmin，稍後會自動重試。':error.message;
  await store.save(s);
  throw Error(status.lastError);
 }
}

async function backgroundIntervalsSync(){
 const s=store.get();
 if(s.connections.intervals?.rejected){nextIntervalsSync=Infinity;return;}
 try{await syncIntervals(s,intervals,{today:todayIn(s.context.timezone)});}catch{ /* Status keeps the error; the data page shows it. */ }
 finally{await store.save(s);nextIntervalsSync=Date.now()+15*60*1000;}
}

async function backgroundSync(){
 if(busy)return;
 // intervals.icu is the primary source; it runs on its own 15-minute schedule.
 if(intervals.configured()&&Date.now()>=nextIntervalsSync){busy=true;try{await backgroundIntervalsSync();}finally{busy=false;}return;}
 if(garmin.configured()&&Date.now()<nextGarminSync)return;
 busy=true;
 try{
  if(garmin.configured())await syncGarmin(store.get());
  else await syncStravaIfDue(store,strava);
 }catch{ /* Manual sync shows provider errors. */ }
 finally{busy=false;}
}
setTimeout(backgroundSync,0).unref();
setInterval(backgroundSync,30_000).unref();
