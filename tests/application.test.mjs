import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Encoder, Profile} from '@garmin/fitsdk';
import {createApplication} from '../src/application.mjs';
import {initialState} from '../src/initial-state.mjs';

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
