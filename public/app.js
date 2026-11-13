import {clearRouteMap, showRouteMap} from './route-map.js';
import {plannedSeconds,sessionTotals} from './kettlebell-core.js';
import {circuitButton,findCircuit,findCircuitResult,mountKettlebell} from './kettlebell-ui.js';

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
 const sameDay=activities.filter(activity=>activity.date===day.id&&activity.durationSeconds>0&&!activity.kettlebellSessionId);
 return sameDay.length===1&&!sameDay[0].planId?sameDay[0]:null;
}

function renderPlanActivitySuggestion(day, comparison) {
 const activity=suggestedActivity(day,comparison,state.activities);
 if(!activity)return '';
 return `<span>${esc(activity.name)} · ${(activity.durationSeconds/60).toFixed(1)} 分鐘</span>
  <button type="button" class="secondary" data-plan-link-activity="${esc(activity.id)}" data-plan-link-date="${esc(day.id)}">對應這筆活動</button>`;
}

function renderDailyOverview() {
 const date=planWeekDate('today');
 $('#today-date').textContent=new Intl.DateTimeFormat('zh-TW',{dateStyle:'full',timeZone:state.context.timezone}).format(new Date());
 const plans=[...state.plan,...Object.values(state.planHistory??{}).flat()];
 const day=plans.find(item=>item.id===date);
 const linked=state.activities.filter(activity=>activity.planId===date);
 const todayActivities=state.activities.filter(activity=>activity.date===date);
 const suggestion=day?renderPlanActivitySuggestion(day,{activityIds:linked.map(activity=>activity.id)}):'';
 const recent=state.activities.filter(activity=>activity.sources.some(source=>['garmin-connect','strava'].includes(source.source)))
  .sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,3);
 const card=activity=>`<li><button type="button" class="activity-shortcut" data-open-activity="${esc(activity.id)}">
  <strong>${esc(activity.name)}</strong>
  <span>${esc(activity.date.slice(5))} · ${(activity.durationSeconds/60).toFixed(1)} 分鐘</span>
  </button><span class="status-pill ${activity.planId||activity.kettlebellSessionId?'is-linked':''}">${activity.kettlebellSessionId?'已對應壺鈴':activity.planId?'已對應':'待對應'}</span></li>`;
 const remaining=todayActivities.filter(activity=>!activity.planId&&!activity.kettlebellSessionId);
 const circuit=findCircuit(state,date), result=findCircuitResult(state,date), active=state.kettlebell?.active;
 $('#daily-overview').innerHTML=`<h2>今日課表</h2>${circuit?`
  <div class="session-title">全身壺鈴間歇</div>
  <p class="session-detail">預計 ${circuit.rounds} 輪 · ${(plannedSeconds(circuit)/60).toFixed(1)} 分鐘${result?`<br>實際 ${sessionTotals(result).rounds} / ${circuit.rounds} 完整輪`:' · '+(active?.plan.date===date?'訓練中':'待開始')}</p>
  ${circuit.original?`<p class="small">原定 ${esc(circuit.original.type)} · ${circuit.original.minutes} 分鐘</p>`:''}`:`
  <div class="session-title">${day?esc(day.type==='Rest'?'休息':day.type):'尚未安排'}</div>
  <p class="session-detail">${day?`預計 ${day.minutes} 分鐘`:'可從週課表新增今天的訓練。'}
  ${linked.length?` · 實際 ${linked.reduce((sum,activity)=>sum+activity.durationSeconds/60,0).toFixed(1)} 分鐘`:''}</p>
  ${suggestion?`<div class="session-match">${suggestion}</div>`:remaining.length?`<ul class="daily-activities">${remaining.map(card).join('')}</ul>`:''}`}
  <div class="actions kb-entry">${circuitButton(active?.plan.date??date,active?'繼續壺鈴訓練':result?'查看壺鈴結果':circuit?'開啟壺鈴課':day?.minutes>0?'改做壺鈴間歇':'安排壺鈴間歇',circuit||active?'primary':'secondary')}<button type="button" class="text-button" data-tab="training-research">訓練研究 ↗</button></div>
  <button type="button" class="text-button session-link" data-tab="plan">開啟週課表 →</button>`;
 $('#daily-recent').innerHTML=recent.length?`<ul class="daily-activities">${recent.map(card).join('')}</ul>`
  :'<p class="small">尚無同步活動。<button type="button" class="text-button" data-tab="connections">連接裝置 →</button></p>';
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
function showPage(id){
 const previous=document.querySelector('.page:not([hidden])');
 for(const page of document.querySelectorAll('.page'))page.hidden=page.id!==id;
 for(const button of document.querySelectorAll('nav [data-tab]')){
  const active=button.dataset.tab===id;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
 }
 if(previous?.id!==id)window.scrollTo(0,0);
}

$('.section-switcher').addEventListener('click',event=>{
 const selected=event.target.closest('[data-settings-panel]');
 if(!selected)return;
 for(const button of $('.section-switcher').querySelectorAll('button')){
  button.setAttribute('aria-pressed',String(button===selected));
 }
 for(const panel of document.querySelectorAll('[data-settings-content]')){
  panel.hidden=panel.dataset.settingsContent!==selected.dataset.settingsPanel;
 }
});
async function api(path,body){if(globalThis.AIAC_DEMO)return globalThis.AIAC_DEMO.request(path,body);const res=await fetch('/api/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await res.json();if(!res.ok)throw Error(data.error||'無法連接伺服器');return data;}
async function action(fn){if(pending)return;pending=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){notice(e.message);}finally{pending=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);globalThis.AIAC_DEMO?.decorate();}}
function formValue(id){return Object.fromEntries(new FormData($(id)));}
function planWeekDate(direction){
 if(direction==='today')return new Intl.DateTimeFormat('en-CA',{timeZone:state.context.timezone}).format(new Date());
 const day=new Date(state.plan[0].id+'T12:00:00Z');
 day.setUTCDate(day.getUTCDate()+Number(direction));
 return day.toISOString().slice(0,10);
}
const kettlebell=mountKettlebell({getState:()=>state,today:()=>planWeekDate('today'),showPage,notify:notice,escape:esc,submit:(command,onSaved)=>action(async()=>{
 state=await api('kettlebell',command);
 onSaved?.();render();
 const result=state.kettlebell?.sessions.find(session=>session.id===command.id);
 if(command.action==='match-activity'){notice('已對應壺鈴課。裝置資料保留，週總時間只算一次。');return;}
 if(command.action==='unmatch-activity'){notice('已解除對應。裝置活動重新單獨計入週總時間。');return;}
 if(result)kettlebell.openResult(result.plan.date);
 notice(command.action==='save'?'壺鈴課已加入週課表。':command.action==='remove'?'已移除壺鈴課，原週課表可見。':result?'壺鈴結果已保存，週課表已更新。':command.action==='finish'?'已結束，沒有可保存的訓練時間。':'');
})});
function setWeekEditing(editing){
 $('#plan-rows').hidden=editing;
 $('#plan-form').hidden=!editing;
 $('#week-edit').hidden=editing;
 $('#week-log-activity').hidden=editing;
 $('#manual-activity').hidden=editing;
}

function renderWeekEditor(){
 $('#plan-edit-rows').innerHTML=state.plan.map(day=>`<div class="plan-row">
  <strong>${esc(day.id)}${findCircuit(state,day.id)?' · 壺鈴課下的原課表':''}</strong>
  <label>預計課程<select name="type">${types.map(type=>`<option ${type===day.type?'selected':''}>${type}</option>`).join('')}</select></label>
  <label>預計分鐘<input name="minutes" type="number" min="0" max="180" value="${day.minutes}" required></label>
 </div>`).join('');
}

function linkedMinutes(day){
 const session=findCircuitResult(state,day.planId);
 if(session)return sessionTotals(session).totalSeconds/60;
 return findCircuit(state,day.planId)?0:day.actualMinutes;
}

function renderWeeklyPlan(){
 const date=planWeekDate('today');
 const [first]=state.plan;
 $('#plan-version').textContent=`${first.id} 至 ${state.plan.at(-1).id}`;
 const planned=state.budget.planned;
 const actual=state.comparison.reduce((sum,day)=>sum+linkedMinutes(day),0);
 const weekDates=new Set(state.plan.map(day=>day.id));
 const unlinked=state.activities.filter(activity=>!activity.planId&&!activity.kettlebellSessionId&&weekDates.has(activity.date)).length;
 const sessionsWithDevices=new Set(state.activities.map(activity=>activity.kettlebellSessionId).filter(Boolean));
 $('#weekly-comparison').innerHTML=`<dl class="week-totals">
  <div><dt>整週時間完成度</dt><dd>${planned?(actual/planned*100).toFixed(0)+'%':'—'}</dd></div>
  <div><dt>預計訓練</dt><dd>${Number(planned.toFixed(1))} <small>分</small></dd></div>
  <div><dt>已對應的實際訓練</dt><dd>${actual.toFixed(1)} <small>分</small></dd></div>
 </dl>${unlinked?`<p class="week-unlinked">本週有 ${unlinked} 筆活動待對應。<button type="button" class="text-button" data-tab="activity-log">查看活動 →</button></p>`:''}`;
 $('#plan-rows').innerHTML=state.plan.map((day,index)=>{
  const result=state.comparison[index];
  const recorded=result.activityIds.length>0;
  const today=day.id===date;
  const ratio=recorded&&result.ratio!==null?`${(result.ratio*100).toFixed(0)}%`:null;
  const status=recorded?result.status:day.completed?'舊版已勾選':day.minutes===0?'—':'待記錄';
  const types=result.actualTypes.map(type=>type==='Unknown'?'目的待確認':type);
  const circuit=findCircuit(state,day.id), session=findCircuitResult(state,day.id), stats=session?sessionTotals(session):null;
  const weekday=['週一','週二','週三','週四','週五','週六','週日'][index];
  if(circuit)return `<article class="week-day${today?' is-today':''} kb-week-day">
   <div class="week-day-date"><strong>${weekday}</strong><span>${esc(day.id.slice(5))}${today?' · 今天':''}</span></div>
   <div class="week-day-planned"><span class="week-label">預計</span><strong>全身壺鈴間歇</strong><span>${circuit.rounds} 輪 · ${(plannedSeconds(circuit)/60).toFixed(1)} 分鐘</span>${circuit.original?`<span>原定 ${esc(circuit.original.type)} · ${circuit.original.minutes} 分鐘</span>`:''}</div>
   <div class="week-day-actual"><span class="week-label">實際</span><strong>${stats?`${(stats.totalSeconds/60).toFixed(1)} 分鐘`:'—'}</strong><span>${stats?`動作 ${(stats.workSeconds/60).toFixed(1)} 分鐘`:state.kettlebell.active?.plan.date===day.id?'訓練中':'待記錄'}</span>${session&&sessionsWithDevices.has(session.id)?'<span>已對應裝置資料</span>':''}${recorded?`<span>原課另有 ${result.actualMinutes.toFixed(1)} 分鐘已對應活動</span>`:''}</div>
   <div class="week-day-progress"><span class="week-label">完整輪數</span><strong>${stats?`${stats.rounds} / ${circuit.rounds} 輪`:'—'}</strong>${circuitButton(day.id,stats?'查看結果':'查看壺鈴課')}</div></article>`;
  return `<article class="week-day${today?' is-today':''}">
   <div class="week-day-date"><strong>${weekday}</strong>
    <span>${esc(day.id.slice(5))}${today?' · 今天':''}</span></div>
   <div class="week-day-planned"><span class="week-label">預計</span><strong>${esc(day.type==='Rest'?'休息':day.type)}</strong><span>${day.minutes} 分鐘</span></div>
   <div class="week-day-actual"><span class="week-label">實際</span><strong>${recorded?`${result.actualMinutes.toFixed(1)} 分鐘`:'—'}</strong>
    ${recorded?`<span>${esc(types.join('、'))}${result.distanceMeters===null?'':` · ${(result.distanceMeters/1000).toFixed(2)} km`}</span>`:''}
    ${renderPlanActivitySuggestion(day,result)}</div>
   <div class="week-day-progress"><span class="week-label">時間完成度</span><strong>${ratio??esc(status)}</strong>
    ${recorded?`<span>${esc(result.stimulus)}</span>`:''}${day.id>=date?circuitButton(day.id,day.minutes>0?'改做壺鈴':'排壺鈴課','text-button'):''}</div>
  </article>`;
 }).join('');
 renderWeekEditor();
 setWeekEditing(false);
}

$('#week-edit').addEventListener('click',()=>{
 setWeekEditing(true);
 $('#plan-edit-rows select')?.focus();
});
$('#week-edit-cancel').addEventListener('click',()=>{
 renderWeekEditor();
 setWeekEditing(false);
 $('#week-edit').focus();
});
$('#week-log-activity').addEventListener('click',()=>{
 const manual=$('#manual-activity');
 manual.open=true;
 manual.scrollIntoView({block:'start'});
 manual.querySelector('select').focus({preventScroll:true});
});
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
const typeNames={Zone2:'Zone2',Recovery:'恢復',Tempo:'Tempo',Interval:'Interval','Long Run':'長跑',Indoor:'室內',Rest:'休息',Kettlebell:'壺鈴'};
function effectiveDay(day){
 const circuit=findCircuit(state,day.id);
 return circuit?{...day,type:'Kettlebell',minutes:plannedSeconds(circuit)/60}:day;
}
function dayActivities(date){
 const activities=state.activities.filter(a=>a.date===date&&!a.kettlebellSessionId);
 const session=findCircuitResult(state,date);
 if(session)activities.push({id:session.id,date,name:'全身壺鈴間歇',durationSeconds:sessionTotals(session).totalSeconds,kettlebell:true});
 return activities;
}
function weekChart(){
 const days=state.plan.map(effectiveDay);
 const actual=days.map(day=>dayActivities(day.id).reduce((sum,a)=>sum+a.durationSeconds/60,0));
 const planned=days.map(day=>day.minutes);
 const top=Math.max(30,Math.ceil(Math.max(...planned,...actual)/30)*30),W=560,H=200,L=30,R=6,T=12,B=28,ph=H-T-B,slot=(W-L-R)/7;
 const y=v=>T+ph-(v/top)*ph;
 const grid=[0,top/2,top].map(v=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('');
 const bars=days.map((d,i)=>{const x=L+i*slot,pw=slot*.56,px=x+(slot-pw)/2,aw=slot*.34,ax=x+(slot-aw)/2,c=state.comparison[i],t=d.type==='Kettlebell'?d.type:c.actualTypes.find(t=>t!=='Unknown')||d.type;
  const plan=d.minutes?`<rect class="plan" x="${px}" y="${y(d.minutes)}" width="${pw}" height="${(d.minutes/top)*ph}" rx="3"/>`:'';
  const act=actual[i]?`<rect class="bar" data-type="${esc(t)}" x="${ax}" y="${y(actual[i])}" width="${aw}" height="${(actual[i]/top)*ph}" rx="2"><title>${esc(d.id)} 實際 ${actual[i].toFixed(1)} 分鐘</title></rect>`:'';
  return plan+act+`<text class="axis${d.id===state.context.date?' today':''}" x="${x+slot/2}" y="${H-8}" text-anchor="middle">${'一二三四五六日'[i]}</text>`;}).join('');
 const used=[...new Set(days.map(d=>d.type).filter(t=>t!=='Rest'))];
 return `<svg class="week-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="本週每日預計與實際分鐘">${grid}${bars}</svg><div class="chart-legend"><span><i class="planned"></i>預計</span>${used.map(t=>`<span><i data-type="${esc(t)}"></i>${esc(typeNames[t]||t)}</span>`).join('')}</div>`;
}
function renderKpis(b){
 const linked=state.comparison.reduce((sum,day)=>sum+linkedMinutes(day),0);
 const pct=b.planned?Math.round(linked/b.planned*100):null;
 const planned=state.plan.map(effectiveDay).filter(day=>day.minutes>0);
 const done=planned.filter(day=>day.type==='Kettlebell'
  ?findCircuitResult(state,day.id)&&sessionTotals(findCircuitResult(state,day.id)).rounds===findCircuit(state,day.id).rounds
  :state.comparison.find(result=>result.planId===day.id)?.ratio>=1).length;
 const days=planned.length;
 const kpiIcon=d=>`<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;$('#kpis').innerHTML=`<div class="kpi lead" data-ic="pulse"><span>${kpiIcon('<path d="M3 12h4l2-6 4 12 2-6h6"/>')}本週實際</span><strong>${b.completed.toFixed(0)}<small>/ ${b.target} 分鐘</small></strong><em>週目標 ${b.target?Math.round(b.completed/b.target*100):0}%</em></div><div class="kpi" data-ic="plan"><span>${kpiIcon('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>')}課表規劃</span><strong>${b.planned}<small>分鐘</small></strong><em>${days} 個訓練日</em></div><div class="kpi" data-ic="target"><span>${kpiIcon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/>')}課表完成度</span><strong>${pct===null?'—':pct}<small>%</small></strong><em>已完成 ${done} / ${days} 天</em></div><div class="kpi" data-ic="bolt"><span>${kpiIcon('<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>')}品質課</span><strong>${b.quality}<small>次</small></strong><em>Interval／Tempo</em></div>`;
}
const loadSourceNames={power:'功率 TSS','heart-rate':'心率 HRSS',pace:'配速分數','estimate-heart-rate':'心率估算','estimate-duration':'時間估算',none:'無'};
const confidenceNames={high:'高可信度',medium:'中可信度',low:'低可信度・估算'};
const signed=v=>(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1);
function loadSparkline(series){
 const pts=series.slice(-42);if(pts.length<2)return '';
 const W=320,H=70,P=4,vals=pts.flatMap(p=>[p.ctl,p.atl,p.tsb]),hi=Math.max(1,...vals),lo=Math.min(0,...vals),x=i=>P+i*(W-2*P)/(pts.length-1),y=v=>H-P-(v-lo)/(hi-lo||1)*(H-2*P);
 const line=(k,c)=>`<polyline class="${c}" points="${pts.map((p,i)=>`${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ')}"/>`;
 return `<svg class="load-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="近 ${pts.length} 天體能、疲勞、狀態走勢"><line class="zero" x1="${P}" x2="${W-P}" y1="${y(0)}" y2="${y(0)}"/>${line('tsb','tsb')}${line('atl','atl')}${line('ctl','ctl')}</svg>`;
}
function renderLoad(){
 const L=state.load,t=L.today;
 const setup=L.athleteComplete?'':`<p class="load-hint">尚未設定最大／安靜心率，負荷以估算為主。<button class="text-button" type="button" data-tab="profile">設定訓練閾值</button></p>`;
 if(!t){$('#load-card').innerHTML=`<div class="card-title"><h2>訓練負荷與狀態</h2><span>CTL · ATL · TSB</span></div><p class="muted">匯入或登錄第一筆活動後，這裡會顯示體能、疲勞與狀態。</p>${setup}`;return;}
 const c=L.change,metric=(cls,label,sub,val,delta)=>`<div class="load-metric ${cls}"><span>${label}<small>${sub}</small></span><strong>${cls==='tsb'?signed(val):val.toFixed(1)}</strong>${delta===undefined?'':`<em class="${delta>=0?'up':'down'}">${delta>=0?'▲':'▼'} ${Math.abs(delta).toFixed(1)}<small> 7 天</small></em>`}</div>`;
 const est=L.confidence.low,young=L.historyDays<42;
 $('#load-card').innerHTML=`<div class="card-title"><h2>訓練負荷與狀態</h2><span class="form-chip" data-form="${esc(t.status.key)}">${esc(t.status.label)}</span></div><div class="load-metrics">${metric('ctl','體能','CTL',t.ctl,c?.ctl)}${metric('atl','疲勞','ATL',t.atl,c?.atl)}${metric('tsb','狀態','TSB',t.tsb,c?.tsb)}</div><p class="load-advice">${esc(t.status.advice)}</p>${loadSparkline(L.series)}<div class="chart-legend"><span><i class="lg-ctl"></i>體能</span><span><i class="lg-atl"></i>疲勞</span><span><i class="lg-tsb"></i>狀態</span></div><p class="small">${young?`目前只有 ${L.historyDays} 天紀錄，體能需約 6 週資料才穩定。`:''}${est?`${est} 筆活動的負荷為估算。`:''}數值為本地計算，不呼叫 LLM。</p>${setup}`;
}
function parsePace(text){if(!text)return null;const m=/^(\d{1,2}):([0-5]\d)$/.exec(text.trim());if(!m)throw Error('臨界配速請用「分:秒」格式，例如 5:00');return Number(m[1])*60+Number(m[2]);}
let perfPeriod=90;
const shortDate=d=>d.slice(5).replace('-','/');
function addDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function pmcChart(points){
 if(points.length<2)return '<p class="muted">至少需要兩天紀錄才能畫出走勢。</p>';
 const W=1000,H=300,L=40,R=12,T=14,B=30,pw=W-L-R,ph=H-T-B;
 const rawHi=Math.max(10,...points.flatMap(p=>[p.ctl,p.atl,p.tsb])),rawLo=Math.min(0,...points.map(p=>p.tsb)),mag=10**Math.floor(Math.log10((rawHi-rawLo)/4)),step=[1,2,5,10].map(m=>m*mag).find(v=>v>=(rawHi-rawLo)/4),lo=Math.floor(rawLo/step)*step,hi=Math.ceil(rawHi/step)*step,span=hi-lo;
 const x=i=>L+i*pw/(points.length-1),y=v=>T+(hi-v)/span*ph,maxLoad=Math.max(1,...points.map(p=>p.load)),bw=Math.max(1,pw/points.length*.7);
 const ticks=Array.from({length:Math.round(span/step)+1},(_,i)=>lo+i*step),labelEvery=Math.ceil(points.length/7);
 const line=k=>points.map((p,i)=>`${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
 const area=`${x(0).toFixed(1)},${y(0).toFixed(1)} ${line('tsb')} ${x(points.length-1).toFixed(1)},${y(0).toFixed(1)}`;
 return `<svg class="pmc" viewBox="0 0 ${W} ${H}" role="img" aria-label="體能、疲勞、狀態與每日負荷走勢">${ticks.map(v=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}<line class="zero" x1="${L}" x2="${W-R}" y1="${y(0)}" y2="${y(0)}"/>${points.map((p,i)=>p.load?`<rect class="load" x="${(x(i)-bw/2).toFixed(1)}" y="${(T+ph-p.load/maxLoad*ph*.45).toFixed(1)}" width="${bw.toFixed(1)}" height="${(p.load/maxLoad*ph*.45).toFixed(1)}"/>`:'').join('')}<polygon class="tsb-area" points="${area}"/><polyline class="tsb" points="${line('tsb')}"/><polyline class="atl" points="${line('atl')}"/><polyline class="ctl" points="${line('ctl')}"/>${points.map((p,i)=>i%labelEvery===0||i===points.length-1?`<text class="axis" x="${x(i)}" y="${H-8}" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}">${shortDate(p.date)}</text>`:'').join('')}${points.map((p,i)=>`<rect class="hit" x="${(x(i)-pw/points.length/2).toFixed(1)}" y="${T}" width="${(pw/points.length).toFixed(1)}" height="${ph}"><title>${p.date}　體能 ${p.ctl.toFixed(1)}　疲勞 ${p.atl.toFixed(1)}　狀態 ${p.tsb.toFixed(1)}　負荷 ${p.load}</title></rect>`).join('')}</svg><div class="chart-legend"><span><i class="lg-ctl"></i>體能 CTL</span><span><i class="lg-atl"></i>疲勞 ATL</span><span><i class="lg-tsb"></i>狀態 TSB</span><span><i class="lg-load"></i>每日負荷</span></div>`;
}
function weeklyVolumeChart(acts){
 const weeks=[...new Set(acts.map(a=>a.week))].sort();if(!weeks.length)return '<p class="muted">這段期間沒有活動。</p>';
 const order=['Zone2','Recovery','Tempo','Interval','Long Run','Indoor','Kettlebell','Unknown'];
 const byWeek=weeks.map(w=>{const t={};for(const a of acts.filter(a=>a.week===w))t[a.type]=(t[a.type]||0)+a.minutes;return {w,t,total:Object.values(t).reduce((n,v)=>n+v,0)};});
 const W=560,H=220,L=36,R=6,T=10,B=28,pw=W-L-R,ph=H-T-B,top=Math.max(60,Math.ceil(Math.max(...byWeek.map(w=>w.total))/60)*60),slot=pw/weeks.length,bw=Math.min(36,slot*.65),y=v=>T+ph-v/top*ph,every=Math.ceil(weeks.length/8);
 const bars=byWeek.map((w,i)=>{let acc=0;const x=L+i*slot+(slot-bw)/2;return order.filter(k=>w.t[k]).map(k=>{const h=w.t[k]/top*ph;acc+=w.t[k];return `<rect class="bar" data-type="${esc(k)}" x="${x.toFixed(1)}" y="${y(acc).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"><title>${w.w} 週 · ${esc(typeNames[k]||'未分類')} ${Math.round(w.t[k])} 分鐘</title></rect>`;}).join('')+(i%every===0||i===weeks.length-1?`<text class="axis" x="${(x+bw/2).toFixed(1)}" y="${H-8}" text-anchor="middle">${shortDate(w.w)}</text>`:'');}).join('');
 const used=order.filter(k=>byWeek.some(w=>w.t[k]));
 return `<svg class="week-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="每週訓練分鐘">${[0,top/2,top].map(v=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}${bars}</svg><div class="chart-legend">${used.map(k=>`<span><i data-type="${esc(k)}"></i>${esc(typeNames[k]||'未分類')}</span>`).join('')}</div>`;
}
function intensityPanel(P,acts){
 if(!P.threshold){$('#zone-basis').textContent='需要心率閾值';return `<p class="muted">設定最大心率或 LTHR 後，才能依心率區間分類。</p><button class="text-button" type="button" data-tab="profile">設定訓練閾值</button>`;}
 $('#zone-basis').textContent=`閾值 ${P.threshold.bpm} bpm${P.threshold.estimated?'（以最大心率 90% 估）':''}`;
 const withZone=acts.filter(a=>a.zone),total=withZone.reduce((n,a)=>n+a.minutes,0),missing=acts.length-withZone.length;
 if(!withZone.length)return '<p class="muted">這段期間的活動都沒有心率資料。</p>';
 return `<div class="zones">${P.zones.map((z,i)=>{const m=withZone.filter(a=>a.zone===z.key).reduce((n,a)=>n+a.minutes,0),pct=total?m/total*100:0,range=i===0?`< ${z.maxBpm}`:i===P.zones.length-1?`≥ ${P.zones[i-1].maxBpm}`:`${P.zones[i-1].maxBpm}–${z.maxBpm-1}`;return `<div class="zone-row" data-zone="${z.key}"><span class="zone-name">${esc(z.label)}<small>${range} bpm</small></span><span class="zone-bar"><svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" width="${pct.toFixed(1)}" height="10" rx="2"/></svg></span><span class="zone-val">${Math.round(m)} 分<small>${pct.toFixed(0)}%</small></span></div>`;}).join('')}</div><p class="small">依每筆活動的平均心率歸類，整筆時間計入同一區間，不是逐秒區間時間。${missing?`另有 ${missing} 筆沒有心率，未計入。`:''}</p>`;
}
function bestsPanel(bests){
 if(!bests.length)return '<p class="muted">還沒有跑步紀錄。匯入含分圈的 FIT 檔後，會顯示最快 1 公里等紀錄。</p>';
 const fmt=b=>b.kind==='pace'?`${formatPace(b.value)}<small>/km</small>`:b.kind==='distance'?`${(b.value/1000).toFixed(2)}<small>km</small>`:`${Math.floor(b.value/3600)}:${String(Math.floor(b.value%3600/60)).padStart(2,'0')}<small>時:分</small>`;
 return bests.map(b=>`<div class="best"><span>${esc(b.label)}</span><strong>${fmt(b)}</strong><em>${esc(b.date)} · ${esc(b.name)}${b.note?' · '+esc(b.note):''}</em></div>`).join('');
}
function renderPerformance(){
 const P=state.performance;if(!P)return;
 const from=perfPeriod==='all'?'0000-00-00':addDays(P.today,-(perfPeriod-1));
 const pts=P.pmc.filter(p=>p.date>=from),acts=P.activities.filter(a=>a.date>=from);
 document.querySelectorAll('[data-period]').forEach(b=>b.classList.toggle('active',String(perfPeriod)===b.dataset.period));
 const minutes=acts.reduce((n,a)=>n+a.minutes,0),km=acts.reduce((n,a)=>n+(a.distanceMeters||0),0)/1000,load=acts.reduce((n,a)=>n+a.load,0),est=acts.filter(a=>a.confidence==='low').length;
 const first=pts[0],last=pts.at(-1),weeks=pts.length/7,ramp=first&&last&&weeks>=1?(last.ctl-first.ctl)/weeks:null;
 const icon=d=>`<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
 $('#perf-kpis').innerHTML=`<div class="kpi lead" data-ic="pulse"><span>${icon('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>')}訓練時間</span><strong>${(minutes/60).toFixed(1)}<small>小時</small></strong><em>${acts.length} 筆活動</em></div><div class="kpi" data-ic="plan"><span>${icon('<path d="M4 18c3-8 13-8 16 0"/><circle cx="12" cy="10" r="2"/>')}距離</span><strong>${km.toFixed(1)}<small>km</small></strong><em>有距離的活動合計</em></div><div class="kpi" data-ic="bolt"><span>${icon('<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>')}總負荷</span><strong>${Math.round(load)}</strong><em>${est?`${est} 筆為估算`:'沒有估算值'}</em></div><div class="kpi" data-ic="target"><span>${icon('<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>')}體能變化</span><strong>${ramp===null?'—':(ramp>=0?'+':'')+ramp.toFixed(1)}<small>/ 週</small></strong><em>${first&&last?`CTL ${first.ctl.toFixed(1)} → ${last.ctl.toFixed(1)}`:'資料不足'}</em></div>`;
 $('#pmc-range').textContent=pts.length?`${pts[0].date} — ${pts.at(-1).date}`:'';
 $('#pmc-chart').innerHTML=P.pmc.length?`<div class="chart-scroll">${pmcChart(pts)}</div>`:'<p class="muted">匯入或登錄活動後，這裡會顯示長期走勢。</p>';
 $('#weekly-volume').innerHTML=weeklyVolumeChart(acts);
 $('#intensity').innerHTML=intensityPanel(P,acts);
 $('#bests').innerHTML=bestsPanel(P.bests);
}
document.querySelector('#performance .period-switch').addEventListener('click',e=>{const b=e.target.closest('[data-period]');if(!b||!state)return;perfPeriod=b.dataset.period==='all'?'all':Number(b.dataset.period);renderPerformance();});
let calMonth=null,calSelected=null,calWorkout=null;
const fmtMin=m=>m>=60?`${Math.floor(m/60)}h${String(Math.round(m%60)).padStart(2,'0')}`:`${Math.round(m)}′`;
function planDayMap(){return new Map([...Object.values(state.planHistory??{}).flat(),...state.plan].map(d=>[d.id,effectiveDay(d)]));}
function monthStart(ym){return ym+'-01';}
function shiftMonth(ym,n){const [y,m]=ym.split('-').map(Number),d=new Date(Date.UTC(y,m-1+n,1));return d.toISOString().slice(0,7);}
function renderCalendar(){
 if(!state)return;calMonth??=state.context.date.slice(0,7);
 const plans=planDayMap(),perf=new Map((state.performance?.activities??[]).map(a=>[a.id,a]));
 const first=monthStart(calMonth),firstDow=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7;let cursor=addDays(first,-firstDow);
 const [y,m]=calMonth.split('-');$('#cal-title').textContent=`${y} 年 ${Number(m)} 月`;
 let html=['一','二','三','四','五','六','日','週合計'].map(d=>`<div class="cal-head" role="columnheader">${d}</div>`).join('');
 let monthMin=0,monthPlan=0,monthCount=0;
 for(let w=0;w<6;w++){
  if(w>0&&cursor.slice(0,7)!==calMonth)break;
  let weekMin=0,weekPlan=0,weekLoad=0;
  for(let d=0;d<7;d++,cursor=addDays(cursor,1)){
   const date=cursor,inMonth=date.slice(0,7)===calMonth,plan=plans.get(date),acts=dayActivities(date);
   const mins=acts.reduce((n,a)=>n+a.durationSeconds/60,0),load=acts.reduce((n,a)=>n+(state.load?.perActivity?.[a.id]?.score??0),0);
   weekMin+=mins;weekLoad+=load;weekPlan+=plan?.minutes??0;if(inMonth){monthMin+=mins;monthPlan+=plan?.minutes??0;monthCount+=acts.length;}
   const planChip=plan&&plan.type!=='Rest'&&plan.minutes?`<span class="cal-plan" data-type="${esc(plan.type)}">${esc(typeNames[plan.type]||plan.type)} ${fmtMin(plan.minutes)}</span>`:plan?.type==='Rest'?'<span class="cal-rest">休息</span>':'';
   const chips=acts.slice(0,2).map(a=>{const t=perf.get(a.id)?.type??'Unknown';return `<span class="cal-act" data-type="${esc(t)}">${fmtMin(a.durationSeconds/60)}${a.distanceMeters?` · ${(a.distanceMeters/1000).toFixed(1)}k`:''}</span>`;}).join('')+(acts.length>2?`<span class="cal-more">+${acts.length-2}</span>`:'');
   html+=`<button type="button" class="cal-cell${inMonth?'':' out'}${date===state.context.date?' today':''}${date===calSelected?' selected':''}" data-cal-date="${date}" aria-label="${date}${acts.length?`，${acts.length} 筆活動`:''}"><span class="cal-num">${Number(date.slice(8))}</span>${planChip}${chips}${load?`<span class="cal-load">${Math.round(load)}</span>`:''}</button>`;
  }
  html+=`<div class="cal-week"><strong>${fmtMin(weekMin)}</strong><span>計畫 ${fmtMin(weekPlan)}</span><span>負荷 ${Math.round(weekLoad)}</span></div>`;
 }
 $('#cal-grid').innerHTML=html;
 $('#cal-summary').textContent=`本月 ${monthCount} 筆活動 · 實際 ${fmtMin(monthMin)} · 計畫 ${fmtMin(monthPlan)}`;
 renderCalDay();renderWorkoutDetail();
}
function renderCalDay(){
 const panel=$('#cal-day');if(!calSelected){panel.hidden=true;return;}
 const plan=planDayMap().get(calSelected),acts=dayActivities(calSelected);
 const circuit=findCircuit(state,calSelected),session=findCircuitResult(state,calSelected);
 const planned=plan?'<p class="cal-plan-line" data-type="'+esc(plan.type)+'"><strong>'+esc(typeNames[plan.type]||plan.type)+'</strong> '+fmtMin(plan.minutes)+'</p>':'<p class="muted">這天不在任何已建立的週課表內。</p>';
 const rows=acts.map(activity=>{
  if(activity.kettlebell)return circuitButton(calSelected,'查看壺鈴結果 · '+fmtMin(activity.durationSeconds/60));
  const load=state.load?.perActivity?.[activity.id];
  const details=[fmtMin(activity.durationSeconds/60),activity.distanceMeters?(activity.distanceMeters/1000).toFixed(2)+' km':'',activity.avgHeartRate?activity.avgHeartRate+' bpm':''].filter(Boolean).join(' · ');
  return '<button type="button" class="cal-act-row" data-workout="'+esc(activity.id)+'"><span><strong>'+esc(activity.name)+'</strong><small>'+details+'</small></span><em>'+(load?'負荷 '+load.score:'')+'</em></button>';
 }).join('');
 panel.hidden=false;
 panel.innerHTML='<div class="card-title"><h2>'+calSelected+'</h2><button type="button" class="secondary" data-cal-close>關閉</button></div><div class="cal-day-grid"><div><h3>計畫</h3>'+planned+(circuit&&!session?circuitButton(calSelected,'查看壺鈴課'):'')+'</div><div><h3>實際活動</h3>'+(rows||'<p class="muted">沒有活動紀錄。</p>')+'</div></div>';
}
function renderWorkoutDetail(){
 const panel=$('#workout-detail'),a=calWorkout&&state.activities.find(x=>x.id===calWorkout);
 if(!a){panel.hidden=true;return;}
 const sum=state.summaries[a.id],l=state.load?.perActivity?.[a.id],p=state.performance?.activities.find(x=>x.id===a.id),zone=p?.zone&&state.performance.zones.find(z=>z.key===p.zone),plan=a.planId&&planDayMap().get(a.planId);
 const metric=(label,value,sub='')=>`<div class="wd-metric"><span>${label}</span><strong>${value}</strong>${sub?`<em>${sub}</em>`:''}</div>`;
 const ratio=plan&&plan.minutes?Math.round(a.durationSeconds/60/plan.minutes*100):null;
 panel.hidden=false;
 panel.innerHTML=`<div class="card-title"><h2>${esc(a.name)}<small class="wd-sub">${esc(a.date)} · ${esc(a.sources.map(x=>x.source).join(' / '))}</small></h2><button type="button" class="secondary" data-workout-close>關閉</button></div>
<div class="wd-metrics">${metric('時間',fmtMin(a.durationSeconds/60))}${metric('距離',a.distanceMeters?`${(a.distanceMeters/1000).toFixed(2)}<small>km</small>`:'—')}${metric('平均配速',sum.pace?`${formatPace(sum.pace)}<small>/km</small>`:'—')}${metric('平均心率',a.avgHeartRate?`${a.avgHeartRate}<small>bpm</small>`:'—',zone?esc(zone.label):'')}${metric('訓練負荷',l?l.score:'—',l?`${esc(loadSourceNames[l.source]||l.source)} · ${esc(confidenceNames[l.confidence])}`:'')}</div>
${l?`<p class="small">${esc(l.method)}</p>`:''}
<div class="wd-compare"><h3>計畫與實際</h3>${plan?`<div class="wd-compare-row"><span class="cal-plan" data-type="${esc(plan.type)}">${esc(typeNames[plan.type]||plan.type)} ${plan.minutes}′</span><span>→</span><span class="cal-act" data-type="${esc(p?.type??'Unknown')}">${esc(typeNames[p?.type]||'目的待確認')} ${fmtMin(a.durationSeconds/60)}</span>${ratio===null?'':`<strong>${ratio}%</strong>`}</div><p class="small">${a.trainingType==='Unknown'?'訓練目的尚未確認，請在「資料」分頁標記。':(a.trainingType===plan.type?'訓練目的與計畫相符（使用者標記）。':'訓練目的與計畫不同（使用者標記）。')}時間相同不代表訓練刺激等效。</p>`:'<p class="muted">尚未對應課表。可在「資料」分頁選擇對應日期。</p>'}</div>
${sum.laps?.length?renderLapFacts(sum.laps):'<p class="small">沒有分圈資料。匯入含分圈的 FIT 檔後會顯示每圈配速與心率。</p>'}
<p class="small">${esc(sum.uncertainties.join(' · '))}</p>
<button type="button" class="text-button" data-open-activity="${esc(a.id)}">在資料分頁查看地圖、曲線與對應設定 →</button>`;
}
document.querySelector('#calendar').addEventListener('click',e=>{
 const m=e.target.closest('[data-cal-month]');if(m){calMonth=m.dataset.calMonth==='0'?state.context.date.slice(0,7):shiftMonth(calMonth,Number(m.dataset.calMonth));renderCalendar();return;}
 const c=e.target.closest('[data-cal-date]');if(c){calSelected=c.dataset.calDate===calSelected?null:c.dataset.calDate;calWorkout=null;renderCalendar();if(calSelected)$('#cal-day').scrollIntoView?.({block:'nearest'});return;}
 const w=e.target.closest('[data-workout]');if(w){calWorkout=w.dataset.workout;renderWorkoutDetail();return;}
 if(e.target.closest('[data-cal-close]')){calSelected=null;calWorkout=null;renderCalendar();return;}
 if(e.target.closest('[data-workout-close]')){calWorkout=null;renderWorkoutDetail();return;}
});
function settings(){
 const context={...state.context,...formValue('#context-form')};
 if(context.date!==state.context.date)delete context.trainingIntent;
 return {profile:{...state.profile,...formValue('#profile-form')},context};
}

function renderCheckIn(){
 const date=planWeekDate('today');
 const context=state.context;
 const sameDay=context.date===date;
 const plans=[...state.plan,...Object.values(state.planHistory??{}).flat()];
 const today=plans.find(day=>day.id===date);
 fill('#context-form',sameDay?context:{
  ...context,date,minutes:today?.minutes??45,location:'',sleep:'',feeling:'',weather:'',motivation:'',
 });
 $('#daily-check-in-status').textContent=sameDay&&context.trainingIntent
  ? context.trainingIntent==='follow'?'今天已確認照原計畫。':'今天已記錄想調整課表。'
  : '';
}
function planChanges(before,after){
 const changes=after.flatMap((day,index)=>{
  const previous=before[index];
  if(day.type===previous.type&&day.minutes===previous.minutes)return [];
  return [`<li><time datetime="${esc(day.id)}">${esc(day.id)}</time>
   <span>${esc(previous.type)} · ${previous.minutes} 分</span>
   <strong>${esc(day.type)} · ${day.minutes} 分</strong></li>`];
 });
 return changes.length?`<ul class="plan-changes"><li class="plan-changes-heading"><span>日期</span><span>原課表</span><span>調整後</span></li>${changes.join('')}</ul>`
  :'<p class="small">課程類型與分鐘數相同。</p>';
}

function planDiff(recommendation){
 if(!recommendation.proposedPlan)return '';
 const {status,planBefore,proposedPlan,id}=recommendation;
 const label=status==='accepted'?'已套用':status==='rejected'?'已保留原課表':'待確認';
 const minutes=plan=>plan.reduce((sum,day)=>sum+day.minutes,0);
 const quality=plan=>plan.filter(day=>['Interval','Tempo'].includes(day.type)).length;
 return `<section class="proposal">
  <div class="proposal-heading"><h3>課表調整</h3><span class="status-pill ${status==='accepted'?'is-linked':''}">${label}</span></div>
  ${planChanges(planBefore,proposedPlan)}
  <p class="small">整週 ${minutes(planBefore)} → ${minutes(proposedPlan)} 分鐘 · 品質課 ${quality(planBefore)} → ${quality(proposedPlan)} 次</p>
  ${status==='pending'?`<div class="actions"><button type="button" class="primary" data-decision="accepted" data-id="${esc(id)}">套用新課表</button><button type="button" class="secondary" data-decision="rejected" data-id="${esc(id)}">保留原課表</button></div>`:''}
 </section>`;
}

function recommendationDetails(recommendation){
 const context=recommendation.context;
 return `<details class="coach-details"><summary>理由、備案與限制</summary>
  <p><strong>理由</strong><br>${esc(recommendation.why)}</p>
  <p><strong>備案</strong><br>${esc(recommendation.planB)}</p>
  ${recommendation.uncertainties.length?`<ul>${recommendation.uncertainties.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:''}
  ${context?`<p class="small">${esc(context.date)} · 可用 ${esc(context.minutes)} 分鐘${context.equipment?` · ${esc(context.equipment)}`:''}</p>`:''}
 </details>`;
}

function renderJournal(){
 const filter=$('#journal-filter').value;
 const labels={morning:'訓練調整',chat:'教練對話',workout:'活動分析'};
 const format=new Intl.DateTimeFormat('zh-TW',{timeZone:state.context.timezone,dateStyle:'medium',timeStyle:'short'});
 const recommendations=filter==='revisions'?[]:state.recommendations.map(r=>({
  at:r.at,html:`<article class="card journal-entry"><div class="journal-meta"><strong>${labels[r.kind]??'教練建議'}</strong>
   <time datetime="${esc(r.at)}">${esc(format.format(new Date(r.at)))}</time></div>
   <p>${esc(r.text)}</p>${planDiff(r)}${recommendationDetails(r)}</article>`,
 }));
 const revisions=filter==='recommendations'?[]:state.revisions.map(r=>({
  at:r.at,html:`<article class="card journal-entry"><div class="journal-meta"><strong>課表變更</strong>
   <time datetime="${esc(r.at)}">${esc(format.format(new Date(r.at)))}</time></div>
   <p>${esc(r.reason)}</p>${Array.isArray(r.before)&&Array.isArray(r.after)?`<details><summary>查看變更前後</summary>${planChanges(r.before,r.after)}</details>`:''}</article>`,
 }));
 $('#journal-items').innerHTML=[...recommendations,...revisions].sort((a,b)=>b.at.localeCompare(a.at)).map(entry=>entry.html).join('')
  ||'<article class="card empty-state"><p>這個分類還沒有紀錄。</p></article>';
}

function focusRecommendation(){
 showPage('today');
 const card=$('#recommendation');
 card.scrollIntoView({block:'start'});
 card.focus({preventScroll:true});
}

$('#journal-filter').addEventListener('change',()=>{if(state)renderJournal();});
function renderAthlete(){
 const athlete=state.athlete;
 fill('#athlete-form',{maxHeartRate:athlete.maxHeartRate??'',restingHeartRate:athlete.restingHeartRate??'',lthr:athlete.lthr??'',thresholdPace:athlete.thresholdPaceSecPerKm?formatPace(athlete.thresholdPaceSecPerKm):'',ftp:athlete.ftp??'',weightKg:athlete.weightKg??''});
}

function render(){
 $('#mode').textContent=state.mode==='live'?'外部模型':'Mock 模式';fill('#profile-form',state.profile);renderCheckIn();
 const b=state.budget;renderKpis(b);renderLoad();renderPerformance();renderCalendar();
 renderAthlete();
 $('#budget').innerHTML=weekChart()+`<div class="track"><progress value="${b.completed}" max="${Math.max(b.target,1)}" aria-label="每週實際訓練時間進度"></progress></div><div class="stats"><span>規劃 ${Number(b.planned.toFixed(1))} 分鐘</span><span>預計跑步品質課 ${b.quality} 次</span></div><p class="small">剩餘時間目標 ${Math.max(0,b.target-b.completed).toFixed(1)} 分鐘；不代表應全部補足。<br>跑步與壺鈴可計入活動時間，課程完成度分開比較。</p>`;
 const r=state.recommendations.at(-1);
 $('#recommendation').innerHTML=r?`<h2>教練建議</h2><p class="small">${r.mode==='mock'?'Mock 示範':esc(r.model)} · ${esc(r.at.slice(0,10))}</p>
  ${planDiff(r)}<p>${esc(r.text)}</p>${recommendationDetails(r)}`
  :'<h2>教練建議</h2><p class="muted">需要改課時，從上方選擇「請教練幫我調整」。</p>';
 $('#messages').innerHTML=state.messages.length?state.messages.map(m=>`<div class="message ${m.role==='user'?'user':''}"><span class="who">${m.role==='user'?'YOU':'AIAC COACH'}</span>${esc(m.text)}</div>`).join(''):'<div class="message"><span class="who">AIAC COACH</span>你好，我們先從今天開始。你有多少時間？想練什麼，又有哪些顧慮？</div>';$('#messages').scrollTop=$('#messages').scrollHeight;
 renderDailyOverview();
 $('#budget-week-title').textContent=`${state.plan[0].id.slice(5)} 至 ${state.plan[6].id.slice(5)}`;
 renderWeeklyPlan();
 kettlebell.render();
 $('#kb-activity-link').innerHTML=circuitButton(state.kettlebell?.active?.plan.date??planWeekDate('today'),'壺鈴訓練與紀錄 →','secondary');
 renderConnections();
 $('#memories').innerHTML=state.memories.map(m=>`<div class="memory-item"><label>已確認 · 使用者提供<textarea data-memory="${esc(m.id)}" rows="2">${esc(m.text)}</textarea></label><button data-memory-save="${esc(m.id)}">儲存更正</button><button data-memory-delete="${esc(m.id)}">刪除</button></div>`).join('')||'<p class="small">還沒有長期記憶。由你決定哪些資訊值得留下。</p>';
 renderJournal();
}
document.addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(tab)showPage(tab.dataset.tab);const prompt=e.target.closest('[data-prompt]');if(prompt){$('#chat-input').value=prompt.dataset.prompt;$('#chat-input').focus();}const decision=e.target.closest('[data-decision]');if(decision)action(async()=>{state=await api('decision',{id:decision.dataset.id,decision:decision.dataset.decision});render();notice(decision.dataset.decision==='accepted'?'已套用課表並保存修改紀錄。':'已保留原課表，拒絕紀錄已保存。');});const save=e.target.closest('[data-memory-save]'),del=e.target.closest('[data-memory-delete]');if(save||del)action(async()=>{const id=save?.dataset.memorySave||del.dataset.memoryDelete;state=await api('memory',save?{id,text:document.querySelector(`[data-memory="${id}"]`).value}:{id,action:'delete'});render();notice('記憶已更新。');});});
$('#athlete-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{const f=formValue('#athlete-form');state=await api('athlete',{athlete:{maxHeartRate:f.maxHeartRate,restingHeartRate:f.restingHeartRate,lthr:f.lthr,thresholdPaceSecPerKm:parsePace(f.thresholdPace),ftp:f.ftp,weightKg:f.weightKg}});render();notice('訓練閾值已保存，負荷與狀態已重新計算。');});});
$('#profile-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{state=await api('settings',settings());render();notice('個人設定與目前情境已保存。');});});
$('#context-form').addEventListener('invalid',event=>{
 const details=event.target.closest('details');
 if(details)details.open=true;
},true);
$('#context-form').addEventListener('submit',event=>{
 event.preventDefault();
 const intent=event.submitter?.value==='adjust'?'adjust':'follow';
 action(async()=>{
  const payload=settings();
  payload.context.trainingIntent=intent;
  state=await api('settings',payload);
  if(intent==='follow'){
   render();
   notice('已保存器材與照原計畫的選擇。');
   return;
  }
  try{
   if(!state.plan.some(day=>day.id===payload.context.date)){
    state=await api('plan-week',{date:payload.context.date});
   }
   notice(state.mode==='mock'?'正在產生 Mock 調整建議…':'正在向設定的 LLM 取得調整建議…');
   state=await api('coach',{kind:'morning',message:'請依我提供的器材、可用時間、訓練意願與本週實績，提出今天可行的調整。若缺少調整方向，請先問我。'});
   notice('調整建議已保存。');
  }finally{
   render();
  }
  focusRecommendation();
 });
});
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();const message=$('#chat-input').value;action(async()=>{state=await api('settings',settings());notice('教練正在回應…');state=await api('coach',{kind:'chat',message});$('#chat-input').value='';render();focusRecommendation();notice('對話已保存。');});});
$('#plan-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{const plan=[...document.querySelectorAll('.plan-row')].map((row,i)=>({...state.plan[i],type:row.querySelector('select').value,minutes:Number(row.querySelector('[name=minutes]').value)}));state=await api('plan',{plan});render();notice('課表已儲存。');});});
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
  const kbCount=Array.isArray(data.kettlebell?.sessions)?data.kettlebell.sessions.length:0;
  $('#backup-summary').textContent=`${file.name} 包含 ${1+Object.keys(data.planHistory).length} 週課表、${data.activities.length} 筆活動及 ${kbCount} 筆壺鈴訓練紀錄。確認後會取代目前的訓練資料與教練紀錄。`;
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
  const matchesQuery=!query||[activity.name,activity.date,activity.sport,activity.trainingType,activity.kettlebellSessionId?'壺鈴':'']
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

function renderGarminStatus(){
 const garmin=state.connections.garmin;
 const target=$('#garmin-status');
 if(globalThis.AIAC_DEMO){
  target.textContent='請使用本機版同步 Garmin。';
  return;
 }
 if(!garmin?.configured){
  target.textContent='請在本機 .env 設定 GARMIN_PERSONAL_API_KEY，再重啟 AIAC。';
  return;
 }
 const format=value=>new Date(value).toLocaleString('zh-TW',{timeZone:state.context.timezone,hour12:false});
 target.textContent=[
  garmin.lastSync?`上次成功同步 ${format(garmin.lastSync)}`:'尚無成功同步紀錄',
  garmin.nextSync?`下次檢查 ${format(garmin.nextSync)}`:'',
  garmin.lastError,
 ].filter(Boolean).join(' · ');
}

function loadBadge(id){
 const load=state.load?.perActivity?.[id];
 return load?`<p class="activity-load" data-confidence="${esc(load.confidence)}" title="${esc(load.method)}"><strong>${load.score}</strong> 訓練負荷 · ${esc(loadSourceNames[load.source]||load.source)} · ${esc(confidenceNames[load.confidence])}</p>`:'';
}

function renderActivityCard(activity,days){
 const id=esc(activity.id);
 const summary=state.summaries[activity.id];
 const circuit=activity.kettlebellSessionId&&state.kettlebell?.sessions.find(session=>session.id===activity.kettlebellSessionId);
 const hasSource=source=>activity.sources.some(entry=>entry.source===source);
 const source=hasSource('garmin-connect')?'Garmin Connect':hasSource('strava')?'Strava':hasSource('fit')?'FIT':activity.source;
 const route=activity.route?.length>=2?`<details class="activity-route" data-route-activity="${id}" ${collapsedRouteIds.has(activity.id)?'':'open'}>
  <summary>GPS 軌跡地圖</summary><div data-activity-map></div></details>`:'';
 const fit=hasSource('fit')?(globalThis.AIAC_DEMO?renderLapFacts(summary.laps):`<details class="activity-route">
  <summary>FIT 訓練曲線與分圈</summary><button class="secondary" data-fit-charts>載入 FIT 曲線與分圈</button><div data-fit-chart-output aria-live="polite"></div></details>`):'';
 const strava=hasSource('strava')&&!hasSource('garmin-connect')?renderStravaFacts(activity):'';
 return `<article class="card activity-entry" data-activity-id="${id}">
  <header class="activity-header"><div><span class="activity-meta">${esc(activity.date)} · ${esc(source)}</span><h2>${esc(activity.name)}</h2></div>
   <span class="status-pill ${activity.planId||circuit?'is-linked':''}">${circuit?'已對應壺鈴':activity.planId?'已對應':'待對應課表'}</span></header>
  <dl class="activity-metrics">
   <div><dt>訓練時間</dt><dd>${(activity.durationSeconds/60).toFixed(1)} <small>分</small></dd></div>
   <div><dt>距離</dt><dd>${activity.distanceMeters===null?'—':`${(activity.distanceMeters/1000).toFixed(2)} <small>km</small>`}</dd></div>
   <div><dt>平均心率</dt><dd>${activity.avgHeartRate===null?'—':`${Math.round(activity.avgHeartRate)} <small>bpm</small>`}</dd></div>
   <div><dt>平均配速</dt><dd>${summary.pace===null?'—':`${formatPace(summary.pace)} <small>/ km</small>`}</dd></div>
  </dl>
  ${loadBadge(activity.id)}${route}${fit}${strava}
  ${circuit?`<details class="activity-assignment"><summary>對應課表 · ${esc(circuit.plan.date)} 全身壺鈴間歇</summary><p class="small">這筆裝置活動保留供查閱。這堂課的時間以 AIAC 計時為準。</p>${circuitButton(circuit.plan.date,'查看壺鈴結果')}</details>`:`<details class="activity-assignment">
   <summary>${activity.planId?`課表對應 · ${esc(activity.planId)}`:'對應課表與訓練目的'}</summary>
   <div class="fields">
    <label>對應課表<select data-link-date="${id}"><option value="">尚未對應</option>
     ${days.map(day=>`<option value="${esc(day.id)}" ${activity.planId===day.id?'selected':''}>${esc(day.id)} · ${esc(day.type)} ${day.minutes} 分</option>`).join('')}
    </select></label>
    <label>實際訓練目的<select data-link-type="${id}">
     ${['Unknown',...types].map(type=>`<option value="${type}" ${activity.trainingType===type?'selected':''}>${type==='Unknown'?'待確認':type}</option>`).join('')}
    </select></label>
   </div>
   <button type="button" class="primary" data-link-save="${id}">儲存對應</button>
  </details>`}
  <div class="actions activity-actions">
   <button type="button" class="secondary" data-analyze="${id}">請教練分析</button>
   <button type="button" class="text-button activity-remove" data-delete-activity="${id}">移除活動</button>
  </div>
 </article>`;
}

function renderConnections(){
 renderGarminStatus();
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
 const linkableDays=[...state.plan,...Object.values(state.planHistory??{}).flat()].sort((a,b)=>a.id.localeCompare(b.id));
 const ordered=[...state.activities].sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
 $('#activities').innerHTML=ordered.length?ordered.map(activity=>renderActivityCard(activity,linkableDays)).join('')
  :'<div class="card empty-state"><h2>還沒有訓練活動</h2><p>匯入 FIT、同步裝置，或到週課表手動登錄。</p><button type="button" class="secondary" data-tab="connections">前往裝置同步</button></div>';
 refreshActivityFilters();
 for(const details of $('#activities').querySelectorAll('[data-route-activity][open]'))routeVisibility.observe(details);
 $('#actual-form').elements.planId.innerHTML=state.plan.map(p=>`<option value="${p.id}" ${p.id===state.context.date?'selected':''}>${p.id} · ${p.type}</option>`).join('');
 globalThis.AIAC_DEMO?.decorate();
}
const manualCard=document.createElement('details');manualCard.id='manual-activity';manualCard.className='card manual-activity';manualCard.innerHTML=`<summary>手動登錄實際訓練</summary><form id="actual-form"><div class="fields"><label>對應課表<select name="planId"></select></label><label>實際訓練目的<select name="trainingType"><option>Unknown</option>${types.map(t=>`<option>${t}</option>`).join('')}</select></label><label>開始時間（依今日情境時區）<input name="time" type="time" value="07:00" required></label><label>實際分鐘<input name="minutes" type="number" min="0" max="1440" step="0.1" required></label><label>距離 km（選填）<input name="distanceKm" type="number" min="0" max="1000" step="0.01"></label><label>平均心率 bpm（選填）<input name="avgHeartRate" type="number" min="1" max="250"></label></div><label>實際感受／備註<textarea name="notes" rows="2"></textarea></label><button class="primary">保存實際結果</button> <button type="button" class="secondary" data-tab="activity-log">匯入 FIT 或管理活動 →</button></form>`;$('#plan').append(manualCard);
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
$('#activity-import-button').addEventListener('click',()=>{
 $('#activity-import').open=true;
 $('#fit-file').click();
});
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
 try{state=await api('garmin-sync',{});}
 catch(error){
  const refreshed=await api('state').catch(()=>null);
  if(refreshed){state=refreshed;render();}
  throw error;
 }
 render();
 const {files,added,duplicates,withoutFit,more}=state.imported;
 notice(`已讀取 ${files} 個 FIT，新增 ${added} 筆，合併或去重 ${duplicates} 筆。${withoutFit?` ${withoutFit} 筆沒有可用 FIT。`:''}${more?' 可再次同步以讀取下一批。':''}`);
}));
$('#strava-disconnect').addEventListener('click',()=>action(async()=>{state=await api('strava-disconnect',{});render();notice('Strava 已撤銷連接；已匯入的活動仍保留。');}));
$('#import-json').addEventListener('click',()=>action(async()=>{state=await api('activities',{source:$('#json-source').value,activities:JSON.parse($('#activity-json').value)});render();notice(`已新增 ${state.imported.added} 筆活動。`);}));
document.addEventListener('click',e=>{const save=e.target.closest('[data-link-save]'),del=e.target.closest('[data-delete-activity]'),analyze=e.target.closest('[data-analyze]');if(save)action(async()=>{const id=save.dataset.linkSave;state=await api('activity-link',{id,planId:document.querySelector(`[data-link-date="${id}"]`).value,trainingType:document.querySelector(`[data-link-type="${id}"]`).value});render();notice('課表對應已保存，時間與目的完成度已重新計算。');});if(del&&window.confirm('確定移除此活動紀錄？原始 FIT 檔會保留到重設全部資料。'))action(async()=>{state=await api('activity-delete',{id:del.dataset.deleteActivity});render();notice('活動紀錄已移除。');});if(analyze)action(async()=>{notice('正在依目前的模型設定分析…');state=await api('coach',{kind:'workout',message:'請分析這份實際訓練結果，對照預計課表並區分事實與假設。',activityId:analyze.dataset.analyze});render();focusRecommendation();notice('活動分析已保存。');});if(e.target.id==='import-mcp-output')action(async()=>{let data=mcpOutput.structuredContent;if(!data){const t=mcpOutput.content?.find(c=>c.type==='text');data=JSON.parse(t?.text||'null');}const activities=Array.isArray(data)?data:data?.activities;state=await api('activities',{source:new URL(state.connections.mcp.url).hostname==='mcp.strava.com'?'strava-mcp':'mcp',activities});render();notice(`已新增 ${state.imported.added} 筆、重複 ${state.imported.duplicates} 筆。`);});});
$('#activity-search').addEventListener('input',()=>{if(state)filterActivities();});
$('#activity-source-filter').addEventListener('change',()=>{if(state)filterActivities();});
document.addEventListener('click',event=>{
 const open=event.target.closest('[data-open-activity]');
 if(open){
  showPage('activity-log');
  $('#activity-search').value='';
  $('#activity-source-filter').value='';
  filterActivities();
  const card=[...$('#activities').children].find(item=>item.dataset.activityId===open.dataset.openActivity);
  if(card)card.querySelector('.activity-assignment').open=true;
  card?.scrollIntoView({block:'start'});
  card?.querySelector('[data-link-date]')?.focus({preventScroll:true});
  return;
 }
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
