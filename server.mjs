import http from 'node:http';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openStore,initialState} from './src/store.mjs';
import {coach,budget,validatePlan} from './src/coach.mjs';
import {openVault} from './src/vault.mjs';
import {defaultConnections,llmEnvironment,validateEndpoint} from './src/providers.mjs';
import {normalizeActivity,parseFit,importActivities,comparison,activitySummary,dateAt} from './src/activities.mjs';
import {createMcp} from './src/mcp.mjs';
import {createStrava} from './src/strava.mjs';
const dataDir=process.env.DATA_DIR||'data';const store=await openStore(dataDir),vault=await openVault(dataDir);const port=Number(process.env.PORT||3140);let busy=false;
const base=`http://127.0.0.1:${port}`,mcp=createMcp(vault,base+'/auth/mcp/callback'),strava=createStrava(vault,base+'/auth/strava/callback');
const activityVersion=s=>JSON.stringify(s.activities.map(a=>[a.id,a.planId,a.durationSeconds,a.trainingType]));
function guardRecordedPlan(s,plan){if(plan&&plan.some((p,i)=>s.activities.some(a=>a.planId===p.id)&&(p.type!==s.plan[i].type||p.minutes!==s.plan[i].minutes)))throw Error('提案更動了已有實際結果的課表，請重新規劃尚未執行的課程');}
function view(s){return {...s,budget:budget(s),comparison:comparison(s),mode:s.connections.llm.mode==='byok'?'live':'mock',connections:{...s.connections,llm:{...s.connections.llm,hasKey:Boolean(vault.get().llmKey)},mcp:{...s.connections.mcp,hasBearer:Boolean(vault.get().mcpBearer)},strava:{...s.connections.strava,configured:strava.configured(),connected:Boolean(vault.get().stravaTokens)}},summaries:Object.fromEntries(s.activities.map(a=>[a.id,activitySummary(a)]))};}
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function raw(req,max=100000){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('輸入過長');chunks.push(chunk);}return Buffer.concat(chunks);}
async function body(req){return JSON.parse((await raw(req)).toString()||'{}');}
http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' https://tile.openstreetmap.org; frame-ancestors 'none'; base-uri 'none'");
 if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return send(res,403,{error:'不允許的 Host'});
 const url=new URL(req.url,base);
 if(req.method==='GET'&&url.pathname.startsWith('/auth/')){
  if(busy)return send(res,409,{error:'另一個操作進行中，請稍後重新整理'});busy=true;
  try{if(url.searchParams.has('error'))throw Error('使用者拒絕授權');
   if(url.pathname==='/auth/strava/callback')await strava.finish(url.searchParams.get('code'),url.searchParams.get('state'),url.searchParams.get('scope')||'');
   else if(url.pathname==='/auth/mcp/callback')await mcp.finish(store.get().connections.mcp.url,url.searchParams.get('code'),url.searchParams.get('state'));
   else throw Error('找不到授權流程');
   res.writeHead(302,{Location:'/'});res.end();
  }catch{send(res,400,{error:'授權失敗、被拒絕或已過期。請返回 AIAC 重新連接。'});}finally{busy=false;}return;
 }
 if(req.method==='GET'&&req.url==='/api/state')return send(res,200,view(store.get()));
 if(req.url.startsWith('/api/')&&req.method==='POST'){
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return send(res,403,{error:'不允許跨站修改'});
  const isFit=req.url==='/api/import-fit';
  if(req.headers['content-type']!==(isFit?'application/octet-stream':'application/json'))return send(res,415,{error:'請使用指定的檔案或 JSON 格式'});
  if(busy)return send(res,409,{error:'另一個操作進行中，請稍後重試'});busy=true;
  try{
   const b=isFit?{}:await body(req);let s=store.get();
   if(isFit){
    const buffer=await raw(req,20*1024*1024);const items=parseFit(buffer,s.context.timezone);const activityIds=[];const imported=importActivities(s,items,activityIds);await mkdir(join(dataDir,'uploads'),{recursive:true});if(imported.added)await writeFile(join(dataDir,'uploads',items[0].fingerprint.split(':')[0]+'.fit'),buffer,{mode:0o600});await store.save(s);return send(res,200,{...view(s),imported,activityIds});
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
    const result=await strava.sync(s.context.timezone,Math.floor(Date.parse(s.plan[0].id+'T00:00:00Z')/1000)-86400);const imported=importActivities(s,result.activities);s.connections.strava.lastSync=new Date().toISOString();await store.save(s);return send(res,200,{...view(s),imported,complete:result.complete});
   }else if(req.url==='/api/strava-disconnect')await strava.disconnect();
   else if(req.url==='/api/activities'){
    if(!Array.isArray(b.activities)||b.activities.length>1000)throw Error('最多匯入 1000 筆活動');
    const source=['manual','garmin-export','apple-export','strava-mcp','mcp'].includes(b.source)?b.source:'manual';
    if(b.activities.some(a=>a.planId&&!s.plan.some(p=>p.id===a.planId)))throw Error('活動對應的課表日期不存在');
    const items=b.activities.map(a=>normalizeActivity(a,source,s.context.timezone));const imported=importActivities(s,items);await store.save(s);return send(res,200,{...view(s),imported});
   }else if(req.url==='/api/activity-link'){
    const a=s.activities.find(a=>a.id===b.id);if(!a||b.planId&&!s.plan.some(p=>p.id===b.planId))throw Error('活動或課表不存在');
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
   }else if(req.url==='/api/plan'){
    const next=validatePlan(b.plan.map((p,i)=>({...p,completed:s.plan[i]?.completed})),s.plan);
    if(!b.plan.every(p=>typeof p.completed==='boolean'))throw Error('完成狀態不正確');next.forEach((p,i)=>p.completed=b.plan[i].completed);
    s.revisions.push({at:new Date().toISOString(),reason:'使用者手動編輯',before:s.plan,after:next});s.plan=next;
   }else if(req.url==='/api/coach'){
    if(typeof b.message!=='string'||b.message.length>6000)throw Error('訊息長度不正確');
    const env=llmEnvironment(s.connections.llm,vault.get());let attempt;
    const analysisActivity=b.activityId?s.activities.find(a=>a.id===b.activityId):null;if(b.activityId&&!analysisActivity)throw Error('找不到指定活動');
    if(analysisActivity&&env.LLM_MODE==='live'&&analysisActivity.sources.some(x=>x.source.startsWith('strava')))throw Error('Strava 匯入資料目前限本地摘要與課表對照；官方 MCP 的 AI 存取需依服務商支援與資料政策使用，不會直接送至自訂 LLM');
    if(env.LLM_MODE==='live'){
     const day=dateAt(new Date(),s.context.timezone);const count=s.connections.usage.filter(u=>u.day===day).length;if(count>=s.connections.llm.dailyLimit)throw Error('今日 LLM 呼叫上限已達；請明天再試或調整使用額度');
     attempt={id:randomUUID(),day,at:new Date().toISOString(),status:'attempted',model:env.LLM_MODEL,maxOutputTokens:s.connections.llm.maxOutputTokens};s.connections.usage.push(attempt);await store.save(s);
    }
    let result;try{result=await coach({...s,analysisActivity},b.message,b.kind,env);guardRecordedPlan(s,result.proposedPlan);}catch(e){if(attempt){attempt.status='failed';await store.save(s);}throw e;}
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
 const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/route-map.js':['route-map.js','text/javascript'],'/vendor/leaflet.js':['../node_modules/leaflet/dist/leaflet.js','text/javascript'],'/vendor/leaflet.css':['../node_modules/leaflet/dist/leaflet.css','text/css'],'/assets/author-mark.svg':['assets/author-mark.svg','image/svg+xml']};
 if(req.method==='GET'&&files[req.url]){const [file,type]=files[req.url];res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(await readFile(new URL('./public/'+file,import.meta.url)));}else send(res,404,{error:'Not found'});
}).listen(port,'127.0.0.1',()=>console.log(`AIAC running at http://127.0.0.1:${port} · ${store.get().connections.llm.mode} · local data only`));
