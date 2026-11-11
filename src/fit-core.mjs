import {Decoder,Stream} from '@garmin/fitsdk';
import {normalizeActivity} from './activity-core.mjs';

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

export function decodeFitBytes(bytes,timezone,fingerprint){
 const decoder=new Decoder(Stream.fromByteArray(bytes));if(!decoder.isFIT()||!decoder.checkIntegrity())throw Error('FIT 檔案格式或 CRC 完整性檢查失敗');
 const {messages,errors}=decoder.read();if(errors.length)throw Error('FIT 解碼失敗，未匯入不完整資料');
 const sessions=messages.sessionMesgs||[];if(!sessions.length)throw Error('FIT 沒有可匯入的 session（請提供活動檔，而非課表檔）');
 return sessions.map((s,i)=>({...normalizeActivity({sourceId:`${fingerprint}:${i}`,startedAt:s.startTime,durationSeconds:s.totalTimerTime??s.totalElapsedTime,distanceMeters:s.totalDistance,avgHeartRate:s.avgHeartRate,sport:s.sport,name:`FIT · ${s.sport||'活動'}`},'fit',timezone),fingerprint:`${fingerprint}:${i}`,route:routeForSession(messages.recordMesgs??[],s,sessions.length===1),laps:(messages.lapMesgs||[]).filter(l=>l.startTime>=s.startTime&&l.startTime<=s.timestamp).map(l=>({durationSeconds:l.totalTimerTime??null,distanceMeters:l.totalDistance??null,avgHeartRate:l.avgHeartRate??null})),quality:['訓練目的待使用者確認','未計算心率漂移',...(!s.avgHeartRate?['缺少心率']:[])]}));
}
