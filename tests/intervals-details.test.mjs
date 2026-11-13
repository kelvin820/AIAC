import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapIntervalsDetails,readIntervalsDetails} from '../src/intervals-details.mjs';

test('provider parallel GPS arrays, chart alignment, and activity intervals map without filling missing values',()=>{
  const time=Array.from({length:2500},(_,i)=>i);
  const data=mapIntervalsDetails([
    {type:'time',data:time},
    {type:'latlng',data:time.map(i=>25+i/10000),data2:time.map(i=>121+i/10000)},
    {type:'heartrate',data:time.map(i=>i===0?null:130)}
  ],{icu_intervals:[{moving_time:300,distance:1000,average_heartrate:141},{elapsed_time:30}]});
  assert.equal(data.route.length,1200);
  assert.deepEqual(data.route[0],[25,121]);
  assert.deepEqual(data.route.at(-1),[25.2499,121.2499]);
  assert.equal(data.streams.time.data.length,2000);
  assert.equal(data.streams.time.data.at(-1),2499);
  assert.equal(data.streams.heartrate.data[0],null);
  assert.deepEqual(data.intervals.map(lap=>lap.paceSecondsPerKm),[300,null]);
});

test('a missing detail endpoint leaves the other detail available',async()=>{
  const detail=await readIntervalsDetails({
    streams:async()=>{throw Object.assign(Error('missing'),{status:404});},
    intervals:async()=>({icu_intervals:[{moving_time:60}]})
  },'i-test');
  assert.deepEqual(detail.route,[]);
  assert.equal(detail.intervals[0].durationSeconds,60);
});
