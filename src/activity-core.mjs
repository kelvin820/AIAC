export function dateAt(value,timezone='Asia/Taipei'){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone}).format(new Date(value));}
const number=(v)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export function normalizeActivity(input,source='manual',timezone='Asia/Taipei'){
 if(!(input.startedAt instanceof Date)&&(typeof input.startedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/i.test(input.startedAt)))throw Error('活動開始時間需包含時區 offset 或 Z');
 const startedAt=new Date(input.startedAt);if(!Number.isFinite(+startedAt))throw Error('活動開始時間不正確');
 const durationSeconds=number(input.durationSeconds);if(durationSeconds===null||durationSeconds>604800)throw Error('活動時間需為 0–604800 秒');
 const distanceMeters=number(input.distanceMeters),avgHeartRate=number(input.avgHeartRate);
 const sourceId=String(input.sourceId||globalThis.crypto.randomUUID()),sport=/^(run|running)$/i.test(input.sport)?'running':String(input.sport||'unknown').slice(0,60);
 return {id:globalThis.crypto.randomUUID(),source,sourceId,startedAt:startedAt.toISOString(),timezone,date:dateAt(startedAt,timezone),durationSeconds,distanceMeters,avgHeartRate,sport,trainingType:['Zone2','Interval','Tempo','Recovery','Rest','Long Run','Indoor'].includes(input.trainingType)?input.trainingType:'Unknown',name:String(input.name||'訓練活動').slice(0,200),planId:input.planId||null,notes:String(input.notes||'').slice(0,2000),quality:[...(distanceMeters===null?['缺少距離']:[]),...(avgHeartRate===null?['缺少心率']:[])],importedAt:new Date().toISOString(),sources:[{source,sourceId}],units:{duration:'s',distance:'m',heartRate:'bpm'}};
}
export function importActivities(state,items,activityIds){
 let added=0,duplicates=0;
 for(const a of items){
  const existing=state.activities.find(x=>x.source===a.source&&x.sourceId===a.sourceId||x.fingerprint&&x.fingerprint===a.fingerprint||x.source!=='manual'&&a.source!=='manual'&&x.sport.toLowerCase()===a.sport.toLowerCase()&&Math.abs(Date.parse(x.startedAt)-Date.parse(a.startedAt))<=30000&&Math.abs(x.durationSeconds-a.durationSeconds)<=60&&x.distanceMeters!==null&&a.distanceMeters!==null&&Math.abs(x.distanceMeters-a.distanceMeters)<=100);
  if(existing){
   duplicates++;
   if(a.route&&(!existing.route||(a.source==='fit'&&!existing.sources.some(source=>source.source==='fit'))))existing.route=a.route;
   if(a.laps?.length&&!existing.laps?.length)existing.laps=a.laps;
   if(a.fingerprint&&!existing.fingerprint)existing.fingerprint=a.fingerprint;
   if(a.avgHeartRate!==null&&existing.avgHeartRate===null){
    existing.avgHeartRate=a.avgHeartRate;
    existing.quality=existing.quality.filter(issue=>issue!=='缺少心率');
   }
   if(a.stravaMetrics)existing.stravaMetrics={...existing.stravaMetrics,...a.stravaMetrics};
   for(const key of ['normalizedPower','intervalsLoad'])if(a[key]&&!existing[key])existing[key]=a[key];
   for(const s of a.sources)if(!existing.sources.some(x=>x.source===s.source&&x.sourceId===s.sourceId))existing.sources.push(s);
  }
  else {state.activities.push(a);added++;}
  activityIds?.push((existing??a).id);
 }return {added,duplicates};
}
export function comparison(state){return state.plan.map(p=>{
 const activities=state.activities.filter(a=>a.planId===p.id&&!a.kettlebellSessionId);
 const actualMinutes=activities.reduce((n,a)=>n+a.durationSeconds/60,0);
 const distanceKnown=activities.filter(a=>a.distanceMeters!==null);
 const distanceMeters=distanceKnown.length?distanceKnown.reduce((n,a)=>n+a.distanceMeters,0):null;
 const ratio=p.minutes>0?actualMinutes/p.minutes:null;
 const types=[...new Set(activities.map(a=>a.trainingType))];
 const stimulus=activities.length===0?'尚無結果':types.includes('Unknown')?'目的待確認':types.every(t=>t===p.type)?'目的相符（使用者標記）':'訓練目的有差異';
 return {planId:p.id,plannedMinutes:p.minutes,plannedType:p.type,actualMinutes,distanceMeters,ratio,stimulus,activityIds:activities.map(a=>a.id),actualTypes:types,status:activities.length?(p.minutes===0?'休息日有活動':ratio>=1?'時間達標':'部分完成'):(p.completed?'舊版已勾選，缺實際數據':'尚無結果')};
});}
// Separate measured lap facts from coaching interpretation, as in Coach Watts' workout analysis.
export function activityLapFacts(activity) {
 return (activity.laps ?? []).map((lap, index) => {
  const durationSeconds = number(lap.durationSeconds);
  const distanceMeters = number(lap.distanceMeters);
  const avgHeartRate = number(lap.avgHeartRate);
  return {
   lap: index + 1,
   durationSeconds,
   distanceMeters,
   avgHeartRate: avgHeartRate > 0 ? avgHeartRate : null,
   paceSecondsPerKm: durationSeconds > 0 && distanceMeters > 0
    ? Math.round(durationSeconds * 1000 / distanceMeters)
    : null
  };
 });
}

export function activitySummary(a){return {facts:`${a.name}：${(a.durationSeconds/60).toFixed(1)} 分鐘${a.distanceMeters===null?'':`、${(a.distanceMeters/1000).toFixed(2)} 公里`}${a.avgHeartRate===null?'':`、平均心率 ${a.avgHeartRate} bpm`}。`,pace:a.distanceMeters>0?a.durationSeconds/(a.distanceMeters/1000):null,laps:activityLapFacts(a),uncertainties:[...a.quality,...(a.trainingType==='Unknown'?['尚未確認訓練目的，不能由配速推定 Zone2 或 Interval']:[])],note:'本地數值摘要，不呼叫 LLM。平均值不足以判定恢復、心率漂移或訓練效果。'};}
