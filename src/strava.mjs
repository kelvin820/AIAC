import {randomBytes} from 'node:crypto';
import {normalizeActivity} from './activities.mjs';
function responseError(response, message, status = response.status) {
 const retryAfter=response.headers.get('retry-after');
 const seconds=Number(retryAfter);
 const delay=Number.isFinite(seconds)?seconds*1000:Date.parse(retryAfter)-Date.now();
 let retryAfterMs=Number.isFinite(delay)?Math.min(86400000,Math.max(0,delay)):0;
 if(status===429){
  const exhausted=['x-readratelimit','x-ratelimit'].some(name=>{
   const limit=Number(response.headers.get(`${name}-limit`)?.split(',')[1]);
   const used=Number(response.headers.get(`${name}-usage`)?.split(',')[1]);
   return limit>0&&used>=limit;
  });
  if(exhausted){const reset=new Date();reset.setUTCHours(24,0,0,0);retryAfterMs=Math.max(retryAfterMs,+reset-Date.now());}
 }
 return Object.assign(Error(message),{status,retryAfterMs});
}
function decodeSummaryRoute(polyline) {
 if (typeof polyline !== 'string' || !polyline) return undefined;
 const points = [];
 let offset = 0;
 let latitude = 0;
 let longitude = 0;

 function readDelta() {
  let value = 0;
  for (let shift = 0; offset < polyline.length && shift <= 30; shift += 5) {
   const chunk = polyline.charCodeAt(offset++) - 63;
   if (chunk < 0 || chunk > 63) break;
   value += (chunk & 31) * 2 ** shift;
   if (chunk < 32) return value % 2 ? -(value + 1) / 2 : value / 2;
  }
  return NaN;
 }

 while (offset < polyline.length) {
  latitude += readDelta();
  longitude += readDelta();
  if (!(Math.abs(latitude) <= 9000000 && Math.abs(longitude) <= 18000000)) return undefined;
  points.push([latitude / 100000, longitude / 100000]);
 }
 if (points.length < 2) return undefined;
 const maxPoints = 1200;
 if (points.length <= maxPoints) return points;
 return Array.from({length:maxPoints}, (_, i) => points[Math.round(i * (points.length - 1) / (maxPoints - 1))]);
}

function normalizeStravaActivity(row, timezone) {
 const sport = row.sport_type || row.type;
 const activity = normalizeActivity({
  sourceId: row.id,
  startedAt: row.start_date,
  durationSeconds: row.moving_time ?? row.elapsed_time,
  distanceMeters: row.distance,
  avgHeartRate: row.average_heartrate,
  sport: /run/i.test(sport) ? 'running' : sport,
  name: row.name,
 }, 'strava', timezone);
 const route = decodeSummaryRoute(row.map?.summary_polyline);
 if (route) activity.route = route;
 const metrics = {
  elevationGain: row.total_elevation_gain,
  maxHeartRate: row.max_heartrate,
  averageCadence: row.average_cadence,
  averageWatts: row.average_watts,
  maxWatts: row.max_watts,
  weightedWatts: row.weighted_average_watts,
  kilojoules: row.kilojoules,
  averageSpeed: row.average_speed,
  maxSpeed: row.max_speed,
  elapsedSeconds: row.elapsed_time,
 };
 activity.stravaMetrics = Object.fromEntries(Object.entries(metrics).filter(([, value])=>Number.isFinite(value)));
 return activity;
}

export function createStrava(vault,callbackUrl,env=process.env){let pending=null;
 const validClientId=()=>/^[1-9]\d*$/.test(env.STRAVA_CLIENT_ID??'');
 const configured=()=>validClientId()&&Boolean(env.STRAVA_CLIENT_SECRET?.trim());
 async function token(params){const r=await fetch('https://www.strava.com/oauth/token',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:env.STRAVA_CLIENT_ID,client_secret:env.STRAVA_CLIENT_SECRET,...params})});if(!r.ok)throw responseError(r,`Strava 授權失敗 (${r.status})`,params.grant_type==='refresh_token'&&r.status===400?401:r.status);const value=await r.json();await vault.save({...vault.get(),stravaTokens:value});return value;}
 async function accessToken(){
  let tokens=vault.get().stravaTokens;
  if(!tokens)throw Error('尚未連接 Strava');
  if(tokens.expires_at<=Date.now()/1000+60)tokens=await token({refresh_token:tokens.refresh_token,grant_type:'refresh_token'});
  return tokens.access_token;
 }
 return {configured,connected:()=>Boolean(vault.get().stravaTokens),
  async activityData(id){
   if(!/^[1-9]\d*$/.test(id))throw Error('Strava 活動識別碼不正確');
   const headers={Authorization:'Bearer '+await accessToken()};
   const url='https://www.strava.com/api/v3/activities/'+id;
   const query=new URLSearchParams({keys:'time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth',key_by_type:'true'});
   const detail=await fetch(url+'?include_all_efforts=true',{headers,signal:AbortSignal.timeout(20000)});
   if(!detail.ok)throw responseError(detail,`Strava 活動詳情讀取失敗 (${detail.status})`);
   const streams=await fetch(url+'/streams?'+query,{headers,signal:AbortSignal.timeout(20000)});
   if(!streams.ok&&streams.status!==404)throw responseError(streams,`Strava 逐點資料讀取失敗 (${streams.status})`);
   return {activity:await detail.json(),streams:streams.ok?await streams.json():null};
  },
  authorize(){
   if(!validClientId())throw Error('請在 .env 的 STRAVA_CLIENT_ID 填入 Strava API 應用程式頁面的數字 Client ID，儲存後重啟 AIAC。');
   if(!configured())throw Error('請在 .env 的 STRAVA_CLIENT_SECRET 填入同一個 Strava API 應用程式的 Client Secret，儲存後重啟 AIAC。');
   pending={state:randomBytes(24).toString('hex'),at:Date.now()};
   return 'https://www.strava.com/oauth/authorize?'+new URLSearchParams({client_id:env.STRAVA_CLIENT_ID,redirect_uri:callbackUrl,response_type:'code',approval_prompt:'force',scope:'read,activity:read_all',state:pending.state});
  },
  async finish(code,state,scope){if(!pending||Date.now()-pending.at>600000||state!==pending.state)throw Error('Strava OAuth state 無效或過期');pending=null;if(!scope.split(',').includes('activity:read_all'))throw Error('未授權完整活動讀取範圍');const result=await token({code,grant_type:'authorization_code'});return result.athlete?.id??null;},
  async sync(timezone,after,before){let tokens=vault.get().stravaTokens;if(!tokens)throw Error('尚未連接 Strava');if(tokens.expires_at<=Date.now()/1000+60)tokens=await token({refresh_token:tokens.refresh_token,grant_type:'refresh_token'});const activities=[];let complete=false;for(let page=1;page<=10;page++){const url='https://www.strava.com/api/v3/athlete/activities?'+new URLSearchParams({after:String(after),before:String(before),per_page:'100',page:String(page)});const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${tokens.access_token}`}});if(!r.ok)throw responseError(r,`Strava 讀取失敗 (${r.status})`);const rows=await r.json();if(!Array.isArray(rows))throw Error('Strava 資料格式不正確');activities.push(...rows.map(row=>normalizeStravaActivity(row,timezone)));if(rows.length<100){complete=true;break;}}return {activities,complete};},
  async disconnect(){const s=vault.get();if(s.stravaTokens?.access_token){const r=await fetch('https://www.strava.com/oauth/deauthorize',{method:'POST',headers:{Authorization:`Bearer ${s.stravaTokens.access_token}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Strava 撤銷失敗，請至 Strava My Apps 撤銷授權後再重試');}delete s.stravaTokens;await vault.save(s);}
 };
}
