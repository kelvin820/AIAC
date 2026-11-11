import {clearRouteMap, showRouteMap} from './route-map.js';

let state;let pending=false;
let previewActivityId;
const collapsedRouteIds=new Set();
const routeVisibility=new IntersectionObserver(entries=>{
 for(const {target,isIntersecting} of entries){
  if(!isIntersecting||!target.open||!target.isConnected)continue;
  routeVisibility.unobserve(target);
  const activity=state.activities.find(item=>item.id===target.dataset.routeActivity);
  if(activity?.route?.length>=2)showRouteMap(target.querySelector('[data-activity-map]'),activity.route);
 }
});
document.addEventListener('click',e=>{const dialog=document.querySelector('#creator-dialog');if(e.target.closest('[data-creator-open]'))dialog.showModal();if(e.target.closest('[data-creator-close]')||e.target===dialog)dialog.close();});
let mcpTools=[],mcpOutput=null;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types=['Zone2','Interval','Tempo','Recovery','Rest','Long Run','Indoor'];
function formatPace(seconds) {
 if (!Number.isFinite(seconds)) return '—';
 const rounded = Math.round(seconds);
 return Math.floor(rounded / 60) + ':' + String(rounded % 60).padStart(2, '0');
}
function suggestedActivity(day, comparison, activities) {
 if(day.minutes<=0||day.type==='Rest'||comparison.activityIds.length)return null;
 const sameDay=activities.filter(activity=>activity.date===day.id&&activity.durationSeconds>0);
 return sameDay.length===1&&!sameDay[0].planId?sameDay[0]:null;
}

function renderPlanActivitySuggestion(day, comparison) {
 const activity=suggestedActivity(day,comparison,state.activities);
 if(!activity)return '';
 return `<span>${esc(activity.name)} · ${(activity.durationSeconds/60).toFixed(1)} 分鐘</span>
  <button type="button" class="secondary" data-plan-link-activity="${esc(activity.id)}" data-plan-link-date="${esc(day.id)}">對應這筆活動</button>`;
}
function renderStravaFacts(activity) {
 const metrics=activity.stravaMetrics??{};
 const fields=[
  ['elevationGain','累積爬升','m'],['maxHeartRate','最高心率','bpm'],
  ['averageCadence','平均步頻／踏頻','rpm'],['averageWatts','平均功率','W'],
  ['maxWatts','最高功率','W'],['weightedWatts','加權功率','W'],['kilojoules','做功','kJ'],
  ['averageSpeed','平均速度','m/s'],['maxSpeed','最高速度','m/s'],['elapsedSeconds','經過時間','秒'],
 ];
 const facts=fields.filter(([key])=>Number.isFinite(metrics[key]))
  .map(([key,label,unit])=>`${label} ${Number(metrics[key].toFixed(2))} ${unit}`);
 const details=globalThis.AIAC_DEMO?'':`<details class="activity-route strava-detail" data-strava-detail="${esc(activity.id)}">
  <summary>Strava 訓練曲線與分段</summary>
  <div class="actions">
   <button class="secondary" data-strava-charts>載入曲線與分段</button>
   <button class="secondary" data-strava-download>下載詳情與逐點資料（JSON）</button>
  </div>
  <div data-strava-chart-output aria-live="polite"></div>
  <div data-strava-lap-output></div>
 </details>`;
 return `${facts.length?`<p class="small">${facts.join(' · ')}</p>`:''}${details}`;
}

function renderActivityCharts(container, streams) {
 const fields=[
  ['heartrate','心率','bpm'],['velocity_smooth','速度','km/h',3.6],
  ['altitude','海拔','m'],['cadence','步頻／踏頻（裝置原值）','rpm'],
  ['watts','功率','W'],['grade_smooth','坡度','%'],['temp','溫度','°C'],
  ['verticalOscillation','垂直振幅','mm'],['stanceTime','觸地時間','ms'],
  ['verticalRatio','垂直比','%'],['stepLength','步幅','mm'],
 ];
 const time=streams?.time?.data;
 const figures=[];
 for(const [key,label,unit,multiplier=1] of fields){
  const samples=streams?.[key]?.data;
  if(!Array.isArray(samples)||samples.length<2)continue;
  let min=Infinity,max=-Infinity,count=0;
  for(const sample of samples){
   if(!Number.isFinite(sample))continue;
   min=Math.min(min,sample*multiplier);
   max=Math.max(max,sample*multiplier);
   count++;
  }
  if(count<2)continue;
  const duration=time?.at(-1)-time?.[0];
  const useTime=Array.isArray(time)&&time.length===samples.length&&duration>0
   &&time.every((value,index)=>Number.isFinite(value)&&(index===0||value>=time[index-1]));
  const figure=document.createElement('figure');
  figure.className='strava-chart';
  const caption=document.createElement('figcaption');
  caption.textContent=`${label} · ${Number(min.toFixed(1))}–${Number(max.toFixed(1))} ${unit}`;
  const canvas=document.createElement('canvas');
  canvas.width=640;
  canvas.height=144;
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label',caption.textContent);
  const context=canvas.getContext('2d');
  context.strokeStyle='#22785a';
  context.lineWidth=2.5;
  context.beginPath();
  let connected=false;
  for(const [index,sample] of samples.entries()){
   if(!Number.isFinite(sample)){connected=false;continue;}
   const progress=useTime?(time[index]-time[0])/duration:index/(samples.length-1);
   const x=5+630*progress;
   const y=max===min?72:134-124*(sample*multiplier-min)/(max-min);
   if(connected)context.lineTo(x,y);
   else context.moveTo(x,y);
   connected=true;
  }
  context.stroke();
  const axis=document.createElement('p');
  axis.className='small';
  axis.textContent=useTime?`活動經過時間 · ${Math.round(time[0])}–${Math.round(time.at(-1))} 秒`:'依取樣順序';
  figure.append(caption,canvas,axis);
  figures.push(figure);
 }
 container.replaceChildren(...figures);
 if(!figures.length)container.textContent='這筆活動沒有可繪製的逐點數據。';
}

function renderStravaLaps(container, activity) {
 const sections=[
  ['Strava 分圈',activity?.laps],
  ['Strava 公里分段',activity?.splits_metric],
 ];
 const tables=sections.flatMap(([label,rows])=>{
  if(!Array.isArray(rows)||!rows.length)return [];
  const laps=rows.map((row,index)=>{
   const duration=row.moving_time??row.elapsed_time;
   const durationSeconds=Number.isFinite(duration)&&duration>=0?duration:null;
   const distanceMeters=Number.isFinite(row.distance)&&row.distance>=0?row.distance:null;
   return {
    lap:index+1,
    durationSeconds,
    distanceMeters,
    avgHeartRate:Number.isFinite(row.average_heartrate)&&row.average_heartrate>0?Math.round(row.average_heartrate):null,
    paceSecondsPerKm:durationSeconds>0&&distanceMeters>0?durationSeconds*1000/distanceMeters:null,
   };
  });
  return [renderLapFacts(laps,label)];
 });
 container.innerHTML=tables.join('')||'<p class="small">Strava 未提供分圈或公里分段。</p>';
}

function renderLapFacts(laps,label='FIT 分圈') {
 if (!laps.length) return '<p class="small">此活動沒有分圈資料。</p>';
 const rows = laps.map(lap => `<tr>
  <th scope="row">${lap.lap}</th>
  <td>${lap.durationSeconds === null ? '—' : Math.round(lap.durationSeconds) + ' 秒'}</td>
  <td>${lap.distanceMeters === null ? '—' : (lap.distanceMeters / 1000).toFixed(2) + ' km'}</td>
  <td>${formatPace(lap.paceSecondsPerKm)}</td>
  <td>${lap.avgHeartRate ?? '—'}</td>
 </tr>`).join('');
 return `<details><summary>查看 ${label}（${laps.length} 筆）</summary>
  <div class="lap-table"><table aria-label="${label}">
   <thead><tr><th scope="col">序號</th><th scope="col">時間</th><th scope="col">距離</th><th scope="col">配速 / km</th><th scope="col">平均心率 / bpm</th></tr></thead>
   <tbody>${rows}</tbody>
  </table></div></details>`;
}
function notice(text){$('#notice').textContent=text;}
async function api(path,body){if(globalThis.AIAC_DEMO)return globalThis.AIAC_DEMO.request(path,body);const res=await fetch('/api/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await res.json();if(!res.ok)throw Error(data.error||'無法連接伺服器');return data;}
async function action(fn){if(pending)return;pending=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){notice(e.message);}finally{pending=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);globalThis.AIAC_DEMO?.decorate();}}
function formValue(id){return Object.fromEntries(new FormData($(id)));}
function planWeekDate(direction){
 if(direction==='today')return new Intl.DateTimeFormat('en-CA',{timeZone:state.context.timezone}).format(new Date());
 const day=new Date(state.plan[0].id+'T12:00:00Z');
 day.setUTCDate(day.getUTCDate()+Number(direction));
 return day.toISOString().slice(0,10);
}
document.querySelector('.week-navigation').addEventListener('click',event=>{
 const button=event.target.closest('[data-plan-week]');
 if(!button||!state)return;
 const edited=Array.from(document.querySelectorAll('.plan-row')).some((row,index)=>{
  const saved=state.plan[index];
  return row.querySelector('select').value!==saved.type||Number(row.querySelector('[name=minutes]').value)!==saved.minutes;
 });
 if(edited&&!window.confirm('切換週次會放棄尚未儲存的課表變更。確定切換？'))return;
 action(async()=>{state=await api('plan-week',{date:planWeekDate(button.dataset.planWeek)});render();notice('已開啟 '+state.plan[0].id+' 這一週的課表。');});
});
function fill(id,value){for(const [k,v]of Object.entries(value)){const input=$(id).elements.namedItem(k);if(input)input.value=v;}}
function settings(){return {profile:{...state.profile,...formValue('#profile-form')},context:{...state.context,...formValue('#context-form')}};}
function planDiff(r){if(!r.proposedPlan)return '';const before=r.planBefore,after=r.proposedPlan;const sum=a=>a.reduce((n,d)=>n+d.minutes,0);return `<div class="tag">課表提案 · ${r.status==='accepted'?'已接受':r.status==='rejected'?'已拒絕':'等待你確認'}</div>${after.map((d,i)=>d.type!==before[i].type||d.minutes!==before[i].minutes?`<div class="diff">${esc(d.id)}<br>${esc(before[i].type)} ${before[i].minutes} 分 → <strong>${esc(d.type)} ${d.minutes} 分</strong></div>`:'').join('')}<p class="small">整週規劃 ${sum(before)} → ${sum(after)} 分鐘 · 品質課 ${before.filter(d=>['Interval','Tempo'].includes(d.type)).length} → ${after.filter(d=>['Interval','Tempo'].includes(d.type)).length} 次<br>時間相同不代表訓練刺激等效。</p>${r.status==='pending'?`<div class="actions"><button class="primary" data-decision="accepted" data-id="${esc(r.id)}">接受並套用課表</button><button class="secondary" data-decision="rejected" data-id="${esc(r.id)}">保留原課表</button></div>`:''}`;}
function render(){
 $('#mode').textContent=state.mode==='live'?'● LIVE · 外部 LLM':'● MOCK · 流程示範';fill('#profile-form',state.profile);fill('#context-form',state.context);
 const b=state.budget;$('#budget').innerHTML=`<div class="budget-number">${b.completed.toFixed(1)}<span> / ${b.target} 分鐘實際活動</span></div><div class="track"><progress value="${b.completed}" max="${Math.max(b.target,1)}" aria-label="每週實際訓練時間進度"></progress></div><div class="stats"><span>規劃 ${b.planned} 分鐘</span><span>預計品質課 ${b.quality} 次</span></div><p class="small">剩餘時間目標 ${Math.max(0,b.target-b.completed).toFixed(1)} 分鐘；不代表應全部補足。<br>以活動實際時間加總；課表完成度與訓練目的另行比較。</p>`;
 const r=state.recommendations.at(-1);$('#recommendation').innerHTML=r?`<div class="tag">${r.mode==='mock'?'MOCK · 非真實 AI 建議':esc(r.model)} · ${esc(r.at.slice(0,10))}</div><h2>今天，我們可以這樣練。</h2><p>${esc(r.text)}</p><p><strong>為什麼</strong><br>${esc(r.why)}</p><p><strong>Plan B</strong><br>${esc(r.planB)}</p><p class="small">缺失與不確定性：${r.uncertainties.map(esc).join(' · ')}</p>${planDiff(r)}`:'<div class="tag">YOUR NEXT STEP</div><h2>先告訴我，今天的你。</h2><p class="muted">填入今天的情境，產生第一份 Morning Coaching。<br>不用有完美的數據，從你知道的開始。</p>';
 $('#messages').innerHTML=state.messages.length?state.messages.map(m=>`<div class="message ${m.role==='user'?'user':''}"><span class="who">${m.role==='user'?'YOU':'AIAC COACH'}</span>${esc(m.text)}</div>`).join(''):'<div class="message"><span class="who">AIAC COACH</span>你好，我們先從今天開始。你有多少時間？想練什麼，又有哪些顧慮？</div>';$('#messages').scrollTop=$('#messages').scrollHeight;
 const latestStrava=state.activities.filter(activity=>activity.sources.some(source=>source.source==='strava')).sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0];
 if(latestStrava){const latest=document.createElement('p');latest.className='small';latest.textContent='最近同步活動 · '+latestStrava.date+' · '+state.summaries[latestStrava.id].facts;$('#budget').append(latest);}
 $('#plan-version').textContent=`${state.plan[0].id} — ${state.plan[6].id} · v${state.revisions.length+1}`;
 $('#budget-week-title').textContent=`${state.plan[0].id.slice(5)} 至 ${state.plan[6].id.slice(5)} 週節奏`;
 $('#plan-rows').innerHTML=state.plan.map((d,i)=>{const c=state.comparison[i];return `<div class="plan-row" data-index="${i}"><div class="plan-date">${esc(d.id)}<span>${['MON','TUE','WED','THU','FRI','SAT','SUN'][i]} ${d.id===state.context.date?'· TODAY':''}</span></div><label>教練預計訓練<select name="type">${types.map(t=>`<option ${t===d.type?'selected':''}>${t}</option>`).join('')}</select></label><label>預計分鐘<input name="minutes" type="number" min="0" max="180" value="${d.minutes}" required></label><div class="actual-result"><strong>${c.activityIds.length?c.actualMinutes.toFixed(1)+' 分鐘':'—'}</strong><span>${c.activityIds.length?esc(c.actualTypes.join(' + ')):'未登錄實際結果'}</span><span>${c.ratio!==null&&c.activityIds.length?(c.ratio*100).toFixed(0)+'% 時間完成度':esc(c.status)}</span><span>${esc(c.stimulus)}${c.distanceMeters===null?'':' · '+(c.distanceMeters/1000).toFixed(2)+' km'}</span>${renderPlanActivitySuggestion(d,c)}</div></div>`;}).join('');
 const planDates=new Set(state.plan.map(day=>day.id));
 const unlinked=state.activities.filter(activity=>!activity.planId&&planDates.has(activity.date)).length;
 const linked=state.comparison.reduce((n,c)=>n+c.actualMinutes,0);$('#weekly-comparison').innerHTML=`<div class="comparison-summary"><div><span>教練預計</span><strong>${b.planned} 分鐘</strong></div><div><span>對應課表的實際結果</span><strong>${linked.toFixed(1)} 分鐘</strong></div><div><span>整週時間完成度</span><strong>${b.planned?(linked/b.planned*100).toFixed(0)+'%':'未設定'}</strong></div></div>${unlinked?`<p class="small">本週有 ${unlinked} 筆活動尚未對應課表。</p>`:''}<p class="small">完成度允許超過 100%；時間相符不代表間歇、Zone2 等訓練刺激等效。下方編輯只改預計課程，不改實際紀錄。舊版勾選不會被當成實際分鐘數。</p>`;
 renderConnections();
 $('#memories').innerHTML=state.memories.map(m=>`<div class="memory-item"><label>已確認 · 使用者提供<textarea data-memory="${esc(m.id)}" rows="2">${esc(m.text)}</textarea></label><button data-memory-save="${esc(m.id)}">儲存更正</button><button data-memory-delete="${esc(m.id)}">刪除</button></div>`).join('')||'<p class="small">還沒有長期記憶。由你決定哪些資訊值得留下。</p>';
 $('#journal-items').innerHTML=[...state.recommendations.map(r=>({at:r.at,html:`<article class="card journal-entry"><div class="tag">${esc(r.mode)} · ${esc(r.kind)} · ${esc(r.model)}</div><h2>${esc(new Date(r.at).toLocaleString('zh-TW',{timeZone:state.context.timezone}))}</h2><p>${esc(r.text)}</p>${planDiff(r)}<details><summary>檢視當時情境與決策摘要</summary><pre>${esc(JSON.stringify(r,null,2))}</pre></details></article>`})),...state.revisions.map(r=>({at:r.at,html:`<article class="card journal-entry"><div class="tag">PLAN REVISION</div><h2>${esc(r.at)}</h2><p>${esc(r.reason)}</p><details><summary>調整前後紀錄</summary><pre>${esc(JSON.stringify(r,null,2))}</pre></details></article>`}))].sort((a,b)=>b.at.localeCompare(a.at)).map(x=>x.html).join('')||'<article class="card"><p class="muted">你的第一段 Coaching 對話，會從這裡開始保存。</p></article>';
}
document.addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(tab){document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==tab.dataset.tab);document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab.dataset.tab));}const prompt=e.target.closest('[data-prompt]');if(prompt){$('#chat-input').value=prompt.dataset.prompt;$('#chat-input').focus();}const decision=e.target.closest('[data-decision]');if(decision)action(async()=>{state=await api('decision',{id:decision.dataset.id,decision:decision.dataset.decision});render();notice(decision.dataset.decision==='accepted'?'已套用課表並保存修改紀錄。':'已保留原課表，拒絕紀錄已保存。');});const save=e.target.closest('[data-memory-save]'),del=e.target.closest('[data-memory-delete]');if(save||del)action(async()=>{const id=save?.dataset.memorySave||del.dataset.memoryDelete;state=await api('memory',save?{id,text:document.querySelector(`[data-memory="${id}"]`).value}:{id,action:'delete'});render();notice('記憶已更新。');});});
$('#profile-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{state=await api('settings',settings());render();notice('個人設定與目前情境已保存。');});});
$('#context-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{state=await api('settings',settings());notice(state.mode==='mock'?'正在產生 Mock 流程示範…':'正在向設定的 LLM 產生建議…');state=await api('coach',{kind:'morning',message:'請根據今天的完整情境，提供 Morning Coaching，包含時間、場地、課程結構、理由、風險、Plan B 與 Weekly Budget 影響。'});render();notice('建議已保存。'+(state.mode==='mock'?'目前為 Mock Mode，尚未呼叫真實 LLM。':''));});});
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();const message=$('#chat-input').value;action(async()=>{state=await api('settings',settings());notice('教練正在回應…');state=await api('coach',{kind:'chat',message});$('#chat-input').value='';render();notice('對話已保存；若有調課提案，請在建議卡片確認。');});});
$('#plan-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{const plan=[...document.querySelectorAll('.plan-row')].map((row,i)=>({...state.plan[i],type:row.querySelector('select').value,minutes:Number(row.querySelector('[name=minutes]').value)}));state=await api('plan',{plan});render();notice('預計課表已保存；實際結果保持獨立。');});});
$('#memory-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{state=await api('memory',formValue('#memory-form'));$('#memory-form').reset();render();notice('已保存你確認的長期記憶。');});});
$('#reset').addEventListener('click',()=>{const confirm=window.prompt('刪除本地個人設定、對話、記憶及日誌，並還原示範課表。輸入 DELETE 確認：');if(confirm==='DELETE')action(async()=>{state=await api('reset',{confirm});render();notice('個人資料已刪除，已還原初始示範狀態。');});});

let backupToRestore;
function closeBackupReview(){
 backupToRestore=undefined;
 $('#backup-review').hidden=true;
}
$('#backup-export').addEventListener('click',()=>action(async()=>{
 const backup=await api('backup');
 const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'}));
 const download=document.createElement('a');
 download.href=url;
 download.download='AIAC-backup-'+backup.exportedAt.slice(0,10)+'.json';
 download.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 notice('已下載 AIAC 備份。');
}));
$('#backup-select').addEventListener('click',()=>$('#backup-file').click());
$('#backup-file').addEventListener('change',event=>{
 const file=event.target.files[0];
 event.target.value='';
 if(!file)return;
 closeBackupReview();
 action(async()=>{
  if(file.size>10*1024*1024)throw Error('備份檔最大 10 MB。');
  let backup;
  try{backup=JSON.parse(await file.text());}catch{throw Error('無法讀取此備份，請選擇 AIAC 的 JSON 備份檔。');}
  const data=backup?.data;
  if(backup?.format!=='aiac-backup'||backup.version!==1||!Array.isArray(data?.activities)||!Array.isArray(data?.plan)||!data.planHistory)throw Error('這不是支援的 AIAC 備份格式。');
  backupToRestore=backup;
  $('#backup-summary').textContent=`${file.name} 包含 ${1+Object.keys(data.planHistory).length} 週課表和 ${data.activities.length} 筆活動。確認後會取代目前的訓練資料與教練紀錄。`;
  $('#backup-review').hidden=false;
 });
});
$('#backup-cancel').addEventListener('click',closeBackupReview);
$('#backup-restore').addEventListener('click',()=>action(async()=>{
 if(!backupToRestore)return;
 state=await api('backup-restore',backupToRestore);
 closeBackupReview();
 render();
 notice('已還原課表、活動與教練紀錄。');
}));
function filterActivities(){
 const query=$('#activity-search').value.trim().toLocaleLowerCase();
 const source=$('#activity-source-filter').value;
 const activities=new Map(state.activities.map(activity=>[activity.id,activity]));
 let visible=0;
 for(const card of $('#activities').querySelectorAll('[data-activity-id]')){
  const activity=activities.get(card.dataset.activityId);
  const matchesSource=!source||activity.sources.some(entry=>entry.source===source);
  const matchesQuery=!query||[activity.name,activity.date,activity.sport,activity.trainingType]
   .some(value=>String(value??'').toLocaleLowerCase().includes(query));
  card.hidden=!(matchesSource&&matchesQuery);
  if(!card.hidden)visible++;
 }
 $('#activity-filter-status').textContent=state.activities.length
  ? visible ? `顯示 ${visible} / ${state.activities.length} 筆活動` : '沒有符合條件的活動。'
  : '';
}

function refreshActivityFilters(){
 const select=$('#activity-source-filter');
 const selected=select.value;
 const sources=[...new Set(state.activities.flatMap(activity=>activity.sources.map(entry=>entry.source)))].sort();
 const labels={strava:'Strava',fit:'FIT','garmin-connect':'Garmin Connect',manual:'手動登錄','garmin-export':'Garmin 匯出','apple-export':'Apple 匯出','strava-mcp':'Strava MCP',mcp:'MCP'};
 select.replaceChildren(new Option('所有來源',''),...sources.map(source=>new Option(Object.hasOwn(labels,source)?labels[source]:source,source)));
 select.value=sources.includes(selected)?selected:'';
 filterActivities();
}

function renderConnections(){
 $('#garmin-status').textContent=globalThis.AIAC_DEMO?'請使用本機版同步 Garmin。'
  :state.connections.garmin?.configured?'已載入 Personal API Key。本機服務執行時會自動同步 Garmin。':'請在本機 .env 設定 GARMIN_PERSONAL_API_KEY，再重啟 AIAC。';
 for(const details of $('#activities').querySelectorAll('[data-route-activity]')){
  routeVisibility.unobserve(details);
  clearRouteMap(details.querySelector('[data-activity-map]'));
 }
 if(previewActivityId&&!state.activities.some(a=>a.id===previewActivityId)){
  const preview=$('#fit-route-preview');clearRouteMap(preview);preview.hidden=true;previewActivityId=undefined;
 }
 const c=state.connections;fill('#llm-form',c.llm);$('#llm-form').elements.apiKey.value='';$('#llm-form').elements.consent.checked=c.llm.mode==='byok';
 $('#key-status').textContent=c.llm.hasKey?'已儲存 Key，不會回傳至瀏覽器；留白保留。':'尚未設定使用者 Key。';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:state.context.timezone}).format(new Date());const usage=c.usage.filter(u=>u.day===today),tokens=usage.reduce((n,u)=>n+(u.tokens?.total_tokens||0),0);$('#usage').innerHTML=`<p class="tag">今日 ${usage.length} / ${c.llm.dailyLimit} 次 · 已回報 ${tokens} tokens</p><p class="small">${usage.filter(u=>u.status==='failed').length} 次失敗；實際費用以供應商帳單為準。</p>`;
 fill('#mcp-form',c.mcp);$('#mcp-form').elements.bearer.value='';$('#mcp-status').textContent=`狀態：${c.mcp.status} ${c.mcp.hasBearer?'· 已保存 Bearer':''}。移除本機授權不等於撤銷服務商授權，請到服務商帳戶撤銷。`;
 const strava=c.strava;
 const syncTime=value=>new Date(value).toLocaleString('zh-TW',{timeZone:state.context.timezone,hour12:false});
 const stravaLabel=strava.status==='reauthorize'?'授權已失效':strava.connected?'已連接 Strava':strava.configured?'等待你在 Strava 授權':'AIAC 尚未開通 Strava 連線';
 $('#strava-status').innerHTML=`<p class="tag">${stravaLabel}</p><p class="small">${strava.lastSync?'最近成功同步 '+esc(syncTime(strava.lastSync)):'尚未同步。'}${strava.nextSync?' · 下次同步 '+esc(syncTime(strava.nextSync)):''}</p>${strava.connected?'<p class="small">Strava 活動可在本機查看與對照課表。</p>':''}${strava.lastError?`<p role="status">${esc(strava.lastError)}</p>`:''}`;
 $('#activities').innerHTML=state.activities.length?state.activities.slice().reverse().map(a=>{const summary=state.summaries[a.id];const linkableDays=[...state.plan,...Object.values(state.planHistory??{}).flat()].sort((a,b)=>a.id.localeCompare(b.id));return `<article class="activity-entry" data-activity-id="${esc(a.id)}"><div class="tag">${esc(a.sources.map(s=>s.source).join(' / '))} · ${esc(a.date)} · ${esc(a.timezone)}</div><h2>${esc(a.name)}</h2><p>${esc(summary.facts)}</p>${a.sources.some(s=>s.source==="strava")&&!a.sources.some(s=>s.source==="garmin-connect")?renderStravaFacts(a):""}<p class="small">${summary.pace===null?'配速未知':'平均配速 '+formatPace(summary.pace)+' / km'} · ${esc(summary.uncertainties.join(' · '))}</p>${a.sources.some(s=>s.source==='fit')?(globalThis.AIAC_DEMO?renderLapFacts(summary.laps):'<details class="activity-route"><summary>FIT 訓練曲線與分圈</summary><button class="secondary" data-fit-charts>載入 FIT 曲線與分圈</button><div data-fit-chart-output aria-live="polite"></div></details>'):''}${a.route?.length>=2?`<details class="activity-route" data-route-activity="${esc(a.id)}" ${collapsedRouteIds.has(a.id)?"":"open"}><summary>GPS 軌跡地圖</summary><div data-activity-map></div></details>`:a.sources.some(s=>s.source==='fit')?'<p class="small">如有原始 FIT，可重新匯入以補上 GPS 軌跡。</p>':''}<div class="fields"><label>對應課表<select data-link-date="${esc(a.id)}"><option value="">尚未對應（不計課表完成度）</option>${linkableDays.map(p=>`<option value="${p.id}" ${a.planId===p.id?'selected':''}>${p.id} · ${p.type} ${p.minutes} 分</option>`).join('')}</select></label><label>實際訓練目的 · 使用者確認<select data-link-type="${esc(a.id)}">${['Unknown',...types].map(t=>`<option ${a.trainingType===t?'selected':''}>${t}</option>`).join('')}</select></label></div><div class="actions"><button class="secondary" data-link-save="${esc(a.id)}">儲存對應與目的</button><button class="secondary" data-analyze="${esc(a.id)}">請教練分析（依目前 LLM 設定）</button><button class="secondary" data-delete-activity="${esc(a.id)}">移除活動</button></div><p class="small">${esc(summary.note)}</p></article>`;}).join(''):'<p class="muted">還沒有實際活動。拖入 FIT 或在週計畫手動登錄結果。</p>';
 refreshActivityFilters();
 for(const details of $('#activities').querySelectorAll('[data-route-activity][open]'))routeVisibility.observe(details);
 $('#actual-form').elements.planId.innerHTML=state.plan.map(p=>`<option value="${p.id}" ${p.id===state.context.date?'selected':''}>${p.id} · ${p.type}</option>`).join('');
 globalThis.AIAC_DEMO?.decorate();
}
const manualCard=document.createElement('article');manualCard.className='card';manualCard.innerHTML=`<h2>登錄實際訓練結果</h2><p class="small">沒有連接裝置也能記錄結果。這會新增實際活動，保留教練原預計課程。每次提交新增一筆，可在資料頁移除誤登活動。</p><form id="actual-form"><div class="fields"><label>對應課表<select name="planId"></select></label><label>實際訓練目的<select name="trainingType"><option>Unknown</option>${types.map(t=>`<option>${t}</option>`).join('')}</select></label><label>開始時間（依今日情境時區）<input name="time" type="time" value="07:00" required></label><label>實際分鐘<input name="minutes" type="number" min="0" max="1440" step="0.1" required></label><label>距離 km（選填）<input name="distanceKm" type="number" min="0" max="1000" step="0.01"></label><label>平均心率 bpm（選填）<input name="avgHeartRate" type="number" min="1" max="250"></label></div><label>實際感受／備註<textarea name="notes" rows="2"></textarea></label><button class="primary">保存實際結果</button> <button type="button" class="secondary" data-tab="connections">FIT 匯入 / 管理活動 →</button></form>`;$('#plan').append(manualCard);
function fitFeedback(text,kind,showActivity=false){$('#fit-feedback').hidden=false;$('#fit-feedback').dataset.status=kind;$('#fit-status').textContent=text;$('#fit-view').hidden=!showActivity;}
async function uploadFit(file){
 if(!file)return;
 const preview=$('#fit-route-preview');clearRouteMap(preview);preview.hidden=true;previewActivityId=undefined;
 fitFeedback(`正在讀取 ${file.name}…`,'working');$('#fit-drop').setAttribute('aria-busy','true');
 try{
  if(!state)throw Error('試用版尚未完成載入，請重新整理後再試。');
  if(!file.name.toLowerCase().endsWith('.fit'))throw Error('請選擇活動的 .fit 檔；如果是 ZIP，請先解壓縮。');
  if(file.size===0||file.size>20*1024*1024)throw Error('檔案必須有內容且不超過 20 MB。');
  const previousIds=new Set(state.activities.map(a=>a.id));
  if(globalThis.AIAC_DEMO)state=await globalThis.AIAC_DEMO.importFit(file);
  else{const r=await fetch('/api/import-fit',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});const data=await r.json();if(!r.ok)throw Error(data.error);state=data;}
  render();
  const {added,duplicates}=state.imported;
  const importedActivities=state.activityIds.map(id=>state.activities.find(a=>a.id===id));
  const first=importedActivities.find(a=>a&&!previousIds.has(a.id));
  const result=added?`已匯入 ${added} 筆${duplicates?`，略過 ${duplicates} 筆重複活動`:''}。${first?`\n${first.date} · ${state.summaries[first.id].facts}`:''}\n選擇對應課程後，才會計入課表完成度。`:`這份檔案的 ${duplicates} 筆活動已存在，沒有重複計算。`;
  const mappedActivity=importedActivities.find(a=>a?.route?.length>=2);
  fitFeedback(result+(mappedActivity?'':'\n這份活動沒有可繪製的 GPS 軌跡。'),'success',true);
  if(mappedActivity){
   previewActivityId=mappedActivity.id;
   preview.hidden=false;
   showRouteMap(preview,mappedActivity.route);
  }
 }catch(e){fitFeedback(`無法匯入 ${file.name}\n${e.message}`,'error');}
 finally{$('#fit-drop').removeAttribute('aria-busy');}
}
function chooseFit(){if(!pending)$('#fit-file').click();}
$('#fit-drop').addEventListener('click',chooseFit);
$('#fit-drop').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseFit();}});
$('#fit-drop').addEventListener('dragover',e=>{e.preventDefault();$('#fit-drop').classList.add('dragging');});
$('#fit-drop').addEventListener('dragleave',()=>$('#fit-drop').classList.remove('dragging'));
$('#fit-drop').addEventListener('drop',e=>{e.preventDefault();$('#fit-drop').classList.remove('dragging');if(!pending)action(()=>uploadFit(e.dataTransfer.files[0]));});
$('#fit-file').addEventListener('change',e=>{const file=e.target.files[0];e.target.value='';if(!pending)action(()=>uploadFit(file));});
$('#fit-view').addEventListener('click',()=>{$('#activities').scrollIntoView({block:'start'});});
$('#activities').addEventListener('toggle',event=>{
 const details=event.target.closest('[data-route-activity]');
 if(!details)return;
 const container=details.querySelector('[data-activity-map]');
 if(details.open){
  collapsedRouteIds.delete(details.dataset.routeActivity);
  if(!container.hasChildNodes())routeVisibility.observe(details);
 }else{
  collapsedRouteIds.add(details.dataset.routeActivity);
  routeVisibility.unobserve(details);
  clearRouteMap(container);
 }
},true);
$('#actual-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{const b=formValue('#actual-form');const offsetDate=new Date(b.planId+'T'+b.time+':00Z');const tz=state.context.timezone;const parts=new Intl.DateTimeFormat('en-US',{timeZone:tz,timeZoneName:'longOffset'}).formatToParts(offsetDate);const offset=parts.find(p=>p.type==='timeZoneName').value.replace('GMT','')||'+00:00';const startedAt=new Date(b.planId+'T'+b.time+':00'+offset).toISOString();state=await api('activities',{source:'manual',activities:[{startedAt,planId:b.planId,trainingType:b.trainingType,durationSeconds:Number(b.minutes)*60,distanceMeters:b.distanceKm===''?null:Number(b.distanceKm)*1000,avgHeartRate:b.avgHeartRate===''?null:Number(b.avgHeartRate),sport:'running',name:'手動登錄訓練',notes:b.notes}]});render();notice('實際結果已保存，完成度已更新。');});});
$('#llm-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{const b=formValue('#llm-form');b.consent=$('#llm-form').elements.consent.checked;state=await api('connections',b);render();notice('分析設定已保存，未呼叫模型。');});});
$('#clear-key').addEventListener('click',()=>action(async()=>{state=await api('connections',{...state.connections.llm,mode:'mock',clearKey:true});render();notice('Key 已移除，已切回 Mock。');}));
$('#mcp-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{state=await api('mcp-settings',formValue('#mcp-form'));mcpTools=[];$('#mcp-tool-form').hidden=true;$('#mcp-output').textContent='';render();notice('接口已保存，尚未執行工具。');});});
function showMcp(result){if(result.authorizationUrl){$('#mcp-tools').innerHTML=`<p>需要服務商 OAuth 授權：<a target="_blank" rel="noreferrer" href="${esc(result.authorizationUrl)}">前往登入與授權 ↗</a></p>`;return;}if(result.tools){mcpTools=result.tools;$('#mcp-tools').innerHTML=`<p class="small">找到 ${mcpTools.length} 個工具，${mcpTools.filter(t=>t.readOnly).length} 個明確標記唯讀。工具回傳不會自動寫入個人記憶或呼叫 LLM。</p>`;$('#mcp-tool').innerHTML=mcpTools.filter(t=>t.readOnly).map(t=>`<option>${esc(t.name)}</option>`).join('');$('#mcp-tool-form').hidden=!mcpTools.some(t=>t.readOnly);showSchema();}if(result.result){mcpOutput=result.result;$('#mcp-output').innerHTML=`<h3>工具結果預覽</h3><pre>${esc(JSON.stringify(mcpOutput,null,2))}</pre><p class="small">若工具回傳標準活動陣列，或 structuredContent.activities，可確認後匯入；其他結構請自行轉換為上方標準 JSON。不把自由文字猜成訓練數據。</p><button id="import-mcp-output" class="secondary">將標準活動結果匯入</button>`;}}
function showSchema(){const tool=mcpTools.find(t=>t.name===$('#mcp-tool').value);$('#mcp-schema').textContent=tool?JSON.stringify(tool.inputSchema,null,2):'';}
$('#mcp-tool').addEventListener('change',showSchema);
$('#mcp-connect').addEventListener('click',()=>action(async()=>{notice('連接 MCP 中…');const r=await api('mcp-connect',{});state=r;render();showMcp(r.mcpResult);notice('MCP 狀態已更新；未呼叫 LLM。');}));
$('#mcp-disconnect').addEventListener('click',()=>action(async()=>{state=await api('mcp-disconnect',{});mcpTools=[];$('#mcp-tool-form').hidden=true;$('#mcp-tools').textContent='';$('#mcp-output').textContent='';render();notice('本機 MCP 授權已移除；如需撤銷遠端授權，請到服務商帳戶設定。');}));
$('#mcp-tool-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{const args=JSON.parse($('#mcp-args').value);const r=await api('mcp-call',{name:$('#mcp-tool').value,arguments:args,confirm:true});showMcp(r.mcpResult);notice('唯讀工具已執行，結果尚未匯入。');});});
$('#strava-login').addEventListener('click',()=>action(async()=>{
 if(!state?.connections?.strava?.configured)throw Error('AIAC 尚未開通 Strava 連線。開通後，請在 Strava 登入並授權。');
 const r=await api('strava-authorize',{});
 window.location.assign(r.url);
}));
for(const [id,backfill] of [['#strava-sync',false],['#strava-backfill',true]]){
 $(id).addEventListener('click',()=>action(async()=>{
  notice('正在讀取 Strava 活動…');
  state=await api('strava-sync',{backfill});
  render();
  notice(`已匯入 ${state.imported.added} 筆，重複 ${state.imported.duplicates} 筆。${state.complete?'':'已達單次讀取上限，結果非完整歷史。'}`);
 }));
}
$('#garmin-sync').addEventListener('click',()=>action(async()=>{
 notice('正在下載並解析 Garmin 原始 FIT…');
 state=await api('garmin-sync',{});
 render();
 const {files,added,duplicates,withoutFit,more}=state.imported;
 notice(`已讀取 ${files} 個 FIT，新增 ${added} 筆，合併或去重 ${duplicates} 筆。${withoutFit?` ${withoutFit} 筆沒有可用 FIT。`:''}${more?' 可再次同步以讀取下一批。':''}`);
}));
$('#strava-disconnect').addEventListener('click',()=>action(async()=>{state=await api('strava-disconnect',{});render();notice('Strava 已撤銷連接；已匯入的活動仍保留。');}));
$('#import-json').addEventListener('click',()=>action(async()=>{state=await api('activities',{source:$('#json-source').value,activities:JSON.parse($('#activity-json').value)});render();notice(`已新增 ${state.imported.added} 筆活動。`);}));
document.addEventListener('click',e=>{const save=e.target.closest('[data-link-save]'),del=e.target.closest('[data-delete-activity]'),analyze=e.target.closest('[data-analyze]');if(save)action(async()=>{const id=save.dataset.linkSave;state=await api('activity-link',{id,planId:document.querySelector(`[data-link-date="${id}"]`).value,trainingType:document.querySelector(`[data-link-type="${id}"]`).value});render();notice('課表對應已保存，時間與目的完成度已重新計算。');});if(del&&window.confirm('確定移除此活動紀錄？原始 FIT 檔會保留到重設全部資料。'))action(async()=>{state=await api('activity-delete',{id:del.dataset.deleteActivity});render();notice('活動紀錄已移除。');});if(analyze)action(async()=>{notice('正在依目前的模型設定分析…');state=await api('coach',{kind:'workout',message:'請分析這份實際訓練結果，對照預計課表並區分事實與假設。',activityId:analyze.dataset.analyze});render();document.querySelector('nav [data-tab=today]').click();notice('分析已保存至 Coaching 與日誌。');});if(e.target.id==='import-mcp-output')action(async()=>{let data=mcpOutput.structuredContent;if(!data){const t=mcpOutput.content?.find(c=>c.type==='text');data=JSON.parse(t?.text||'null');}const activities=Array.isArray(data)?data:data?.activities;state=await api('activities',{source:new URL(state.connections.mcp.url).hostname==='mcp.strava.com'?'strava-mcp':'mcp',activities});render();notice(`已新增 ${state.imported.added} 筆、重複 ${state.imported.duplicates} 筆。`);});});
$('#activity-search').addEventListener('input',()=>{if(state)filterActivities();});
$('#activity-source-filter').addEventListener('change',()=>{if(state)filterActivities();});
$('#plan-rows').addEventListener('click',event=>{
 const button=event.target.closest('[data-plan-link-activity]');
 if(!button)return;
 action(async()=>{
  const id=button.dataset.planLinkActivity;
  const activity=state.activities.find(item=>item.id===id);
  state=await api('activity-link',{id,planId:button.dataset.planLinkDate,trainingType:activity.trainingType});
  render();
  notice('已對應當天課表，時間完成度已更新。');
 });
});
try{state=await api('state');render();}catch(e){notice('無法讀取本地資料：'+e.message);}

const stravaDetailCache=new WeakMap();
$('#activities').addEventListener('click', event=>{
 const button=event.target.closest('[data-fit-charts]');
 if(!button)return;
 const output=button.closest('details').querySelector('[data-fit-chart-output]');
 if(output.childNodes.length)return;
 action(async()=>{
  notice('正在解析本機 FIT…');
  const id=button.closest('[data-activity-id]').dataset.activityId;
  const data=await api('fit-activity-data',{id});
  renderActivityCharts(output,data.streams);
  output.insertAdjacentHTML('beforeend',renderLapFacts(data.laps??[]));
  notice('');
 });
});
$('#activities').addEventListener('click', event => {
 const button=event.target.closest('[data-strava-download],[data-strava-charts]');
 if(!button)return;
 const panel=button.closest('[data-strava-detail]');
 const id=panel.dataset.stravaDetail;
 action(async()=>{
  notice('正在讀取 Strava 詳情與逐點資料…');
  let data=stravaDetailCache.get(panel);
  if(!data){
   data=await api('strava-activity-data',{id});
   stravaDetailCache.set(panel,data);
  }
  if(button.hasAttribute('data-strava-charts')){
   renderActivityCharts(panel.querySelector('[data-strava-chart-output]'),data.streams);
   renderStravaLaps(panel.querySelector('[data-strava-lap-output]'),data.activity);
   notice('');
   return;
  }
  const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
  const download=document.createElement('a');
  download.href=url;
  download.download='AIAC-Strava-'+id+'.json';
  download.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  notice(data.streams?'已下載 Strava 詳情與逐點資料。':'已下載活動詳情，Strava 未提供逐點資料。');
 });
});
