import {activityLapFacts} from './activity-core.mjs';

const streamTypes = new Set(['time','heartrate','velocity_smooth','altitude','cadence','watts']);
const available = value => Number.isFinite(value) && value > 0 ? value : null;

function sampleIndexes(length, max) {
  if (length <= max) return Array.from({length},(_,i)=>i);
  return Array.from({length:max},(_,i)=>Math.round(i*(length-1)/(max-1)));
}

export function mapIntervalsDetails(streamRows, detail) {
  const rows=Array.isArray(streamRows)?streamRows:[];
  const gps=rows.find(row=>row?.type==='latlng');
  const points=[];
  for(const [i,entry] of (Array.isArray(gps?.data)?gps.data:[]).entries()){
    const [lat,lng]=Array.isArray(entry)?entry:[entry,gps.data2?.[i]];
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||(lat===0&&lng===0))continue;
    const point=[Number(lat.toFixed(5)),Number(lng.toFixed(5))];
    const previous=points.at(-1);
    if(!previous||point[0]!==previous[0]||point[1]!==previous[1])points.push(point);
  }
  const charts=rows.filter(row=>streamTypes.has(row?.type)&&Array.isArray(row.data));
  const length=charts.find(row=>row.type==='time')?.data.length??Math.max(0,...charts.map(row=>row.data.length));
  const indexes=sampleIndexes(length,2000);
  const streams=Object.fromEntries(charts.map(row=>[row.type,{data:indexes.map(i=>Number.isFinite(row.data[i])?row.data[i]:null)}]));
  const intervals=(Array.isArray(detail?.icu_intervals)?detail.icu_intervals:[]).slice(0,2000).map(row=>({
    durationSeconds:available(row.moving_time)??available(row.elapsed_time),
    distanceMeters:available(row.distance),
    avgHeartRate:available(row.average_heartrate)
  }));
  return {streams,route:points.length>=2?sampleIndexes(points.length,1200).map(i=>points[i]):[],intervals:activityLapFacts({laps:intervals})};
}

export async function readIntervalsDetails(client,sourceId) {
  const results=await Promise.allSettled([client.streams(sourceId),client.intervals(sourceId)]);
  for(const result of results){
    if(result.status==='rejected'&&result.reason?.status!==404)throw result.reason;
  }
  return mapIntervalsDetails(results[0].value,results[1].value);
}
