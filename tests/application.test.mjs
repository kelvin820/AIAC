import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Encoder, Profile} from '@garmin/fitsdk';
import {createApplication} from '../src/application.mjs';
import {initialState} from '../src/initial-state.mjs';
import {normalizeActivity} from '../src/activity-core.mjs';

test('request handler runs with asynchronous state and independent FIT storage', async () => {
  let state = initialState();
  const files = new Map();
  const server = createServer();
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;
    const app = createApplication({
      origin,
      env:{},
      store:{
        async get(){return structuredClone(state);},
        async save(next){state=structuredClone(next);return structuredClone(state);}
      },
      vault:{get:()=>({}),async save(){}},
      fitStore:{
        async read(hash){return files.get(hash);},
        async save(hash,bytes){files.set(hash,bytes);},
        async clear(){files.clear();}
      }
    });
    server.on('request',(req,res)=>{
      app.handleRequest(req,res).catch(()=>{res.writeHead(500);res.end();});
    });

    const start = new Date('2026-11-10T08:00:00Z');
    const encoder = new Encoder();
    encoder.onMesg(Profile.MesgNum.FILE_ID,{type:'activity',manufacturer:'development',timeCreated:start});
    encoder.onMesg(Profile.MesgNum.SESSION,{startTime:start,timestamp:new Date(+start+1800000),sport:'running',totalTimerTime:1800,totalDistance:5000});
    const upload = await fetch(origin+'/api/import-fit',{
      method:'POST',headers:{'Content-Type':'application/octet-stream',Origin:origin},body:Buffer.from(encoder.close())
    });
    assert.equal(upload.status,200);
    assert.equal(files.size,1);
    const {activityIds:[id]} = await upload.json();
    const detail = await fetch(origin+'/api/fit-activity-data',{
      method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({id})
    });
    assert.equal(detail.status,200);
    const current = await fetch(origin+'/api/state').then(res=>res.json());
    assert.equal(current.activities[0].id,id);
    const reset = await fetch(origin+'/api/reset',{
      method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({confirm:'DELETE'})
    });
    assert.equal(reset.status,200);
    assert.equal(state.activities.length,0);
    assert.equal(files.size,0);
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('route library reads intervals.icu streams for runs and skips Strava-sourced ones', async () => {
  let state = initialState();
  state.athlete = {...state.athlete, thresholdPaceSecPerKm:300};
  const run = (sourceId, day, km) => normalizeActivity({sourceId, startedAt:`2026-11-0${day}T22:00:00Z`, durationSeconds:km * 360, distanceMeters:km * 1000, sport:'running', name:'跑步'}, 'intervals', 'Asia/Taipei');
  state.activities.push(run('i1', 1, 5), run('i2', 2, 6));
  const [r1, r2] = state.activities.map(a => a.id);
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    if (u.hostname !== 'intervals.icu') return realFetch(url, init);
    calls.push(u.pathname + u.search);
    const json = body => ({ok:true, status:200, json:async () => body});
    if (u.pathname === '/api/v1/activity/i2') return json({source:'STRAVA'});
    if (u.pathname === '/api/v1/activity/i1') return json({source:'GARMIN_CONNECT'});
    const distance = Array.from({length:501}, (_, i) => i * 10);
    return json([{type:'distance', data:distance}, {type:'fixed_altitude', data:distance.map(() => 12)}, {type:'latlng', data:distance.map(d => [25.09 + d / 111000, 121.52])}]);
  };
  const server = createServer();
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;
    const app = createApplication({origin, env:{INTERVALS_API_KEY:'k', INTERVALS_ATHLETE_ID:'0'},
      store:{async get(){return structuredClone(state);}, async save(next){state = structuredClone(next); return structuredClone(state);}},
      vault:{get:()=>({}), async save(){}}, fitStore:{async read(){}, async save(){}, async clear(){}}});
    server.on('request', (req, res) => { app.handleRequest(req, res).catch(() => { res.writeHead(500); res.end(); }); });
    const res = await fetch(origin + '/api/route-library', {method:'POST', headers:{'Content-Type':'application/json', Origin:origin}, body:'{}'});
    const body = await res.json();
    assert.equal(res.status, 200, body.error);
    assert.deepEqual(body.routeLibrary, {added:1, skipped:1, remaining:0});
    assert.deepEqual(state.routeLibrary.map(e => [e.activityId, e.distanceMeters, e.altitudeSource]), [[r1, 5000, 'fixed_altitude']]);
    assert.deepEqual(state.routeLibrarySkipped, [r2]);
    assert.ok(calls.some(c => c.includes('/activity/i1/streams.json') && c.includes('fixed_altitude')));
    assert.equal(body.prescription.routes.pending, 0);
  } finally {
    globalThis.fetch = realFetch;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
