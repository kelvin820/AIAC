import {Decoder,Stream} from '@garmin/fitsdk';
import {activityLapFacts,normalizeActivity} from './activity-core.mjs';

const degreesPerSemicircle = 180 / 2 ** 31;
const maxRoutePoints = 1200;

function routeForSession(records, session, singleSession) {
 const coordinates = [];
 for (const record of records) {
  if (!singleSession && (!(record.timestamp instanceof Date) || !(record.timestamp >= session.startTime && record.timestamp <= session.timestamp))) continue;
  if (!Number.isFinite(record.positionLat) || !Number.isFinite(record.positionLong)) continue;
  const latitude = record.positionLat * degreesPerSemicircle;
  const longitude = record.positionLong * degreesPerSemicircle;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
  const point = [Number(latitude.toFixed(5)), Number(longitude.toFixed(5))];
  const previous = coordinates.at(-1);
  if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) coordinates.push(point);
 }
 if (coordinates.length < 2) return undefined;
 if (coordinates.length <= maxRoutePoints) return coordinates;
 return Array.from({length:maxRoutePoints}, (_, i) => coordinates[Math.round(i * (coordinates.length - 1) / (maxRoutePoints - 1))]);
}

function readFitMessages(bytes){
 const decoder=new Decoder(Stream.fromByteArray(bytes));if(!decoder.isFIT()||!decoder.checkIntegrity())throw Error('FIT 檔案格式或 CRC 完整性檢查失敗');
 const {messages,errors}=decoder.read();if(errors.length)throw Error('FIT 解碼失敗，未匯入不完整資料');
 return messages;
}

function sessionLaps(messages,session,singleSession){
 return (messages.lapMesgs??[])
  .filter(lap=>singleSession||(lap.startTime>=session.startTime&&lap.startTime<=session.timestamp))
  .map(lap=>({durationSeconds:lap.totalTimerTime??null,distanceMeters:lap.totalDistance??null,avgHeartRate:lap.avgHeartRate??null}));
}

export function fitActivityData(bytes, sessionIndex){
 const messages=readFitMessages(bytes);
 const sessions=messages.sessionMesgs??[];
 const session=sessions[sessionIndex];
 if(!session)throw Error('找不到對應的 FIT 活動。');
 const records=(messages.recordMesgs??[]).filter(row=>row.timestamp instanceof Date
  &&(sessions.length===1||(row.timestamp>=session.startTime&&row.timestamp<=session.timestamp)));
 const fields={
  time:row=>(row.timestamp-session.startTime)/1000,
  heartrate:row=>row.heartRate,
  velocity_smooth:row=>row.enhancedSpeed??row.speed,
  altitude:row=>row.enhancedAltitude??row.altitude,
  cadence:row=>Number.isFinite(row.cadence)?row.cadence+(row.fractionalCadence??0):null,
  watts:row=>row.power,
  temp:row=>row.temperature,
  verticalOscillation:row=>row.verticalOscillation,
  stanceTime:row=>row.stanceTime,
  verticalRatio:row=>row.verticalRatio,
  stepLength:row=>row.stepLength,
 };
 const streams={};
 for(const [key,read] of Object.entries(fields)){
  const data=records.map(row=>{const value=read(row);return Number.isFinite(value)?value:null;});
  if(data.some(value=>value!==null))streams[key]={data};
 }
 return {streams,laps:activityLapFacts({laps:sessionLaps(messages,session,sessions.length===1)})};
}

export function decodeFitBytes(bytes,timezone,fingerprint){
 const messages=readFitMessages(bytes);
 const sessions=messages.sessionMesgs||[];if(!sessions.length)throw Error('FIT 沒有可匯入的 session（請提供活動檔，而非課表檔）');
 return sessions.map((s,i)=>({...normalizeActivity({sourceId:`${fingerprint}:${i}`,startedAt:s.startTime,durationSeconds:s.totalTimerTime??s.totalElapsedTime,distanceMeters:s.totalDistance,avgHeartRate:s.avgHeartRate,sport:s.sport,name:`FIT · ${s.sport||'活動'}`},'fit',timezone),fingerprint:`${fingerprint}:${i}`,route:routeForSession(messages.recordMesgs??[],s,sessions.length===1),laps:sessionLaps(messages,s,sessions.length===1),quality:['訓練目的待使用者確認','未計算心率漂移',...(!s.avgHeartRate?['缺少心率']:[])]}));
}
