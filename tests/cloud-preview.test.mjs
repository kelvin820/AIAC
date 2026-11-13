import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createCloudHandler} from '../src/cloud-handler.mjs';
import {withPostgresState} from '../src/postgres-store.mjs';

test('cloud API requires login and persists updates across handler instances in Postgres',async()=>{
  const db=new PGlite();
  try{
    const pool={async connect(){return {query:db.query.bind(db),release(){}};}};
    const env={AIAC_PREVIEW_PASSWORD:'test-only-password-1234',CRON_SECRET:'test-cron-only'};
    const makeHandler=()=>createCloudHandler({pool,fitStore:{},env});
    const authorization='Basic '+Buffer.from('aiac:'+env.AIAC_PREVIEW_PASSWORD).toString('base64');
    const request=(path,body,headers={authorization})=>new Request('https://aiac.example'+path,body?
      {method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}:{headers});
    const handle=makeHandler();
    assert.equal((await handle(request('/api/state',null,{}))).status,401);
    assert.equal((await handle(request('/api/cron',null,{}))).status,401);
    assert.equal((await handle(request('/api/reset',{confirm:'DELETE'}))).status,404);
    const state=await handle(request('/api/state')).then(r=>r.json());
    state.profile.name='雲端測試';
    const body={profile:state.profile,context:state.context};
    assert.equal((await handle(request('/api/settings',body,{authorization,origin:'https://other.example'}))).status,403);
    assert.equal((await handle(request('/api/settings',body))).status,200);
    const reopened=await makeHandler()(request('/api/state')).then(r=>r.json());
    assert.equal(reopened.profile.name,'雲端測試');
    assert.equal(reopened.connections.llm.hasKey,false);
    await assert.rejects(withPostgresState(pool,async store=>{
      const saved=await store.get();
      saved.profile.name='rollback';
      await store.save(saved);
      throw Error('abort');
    }),/abort/);
    assert.equal((await makeHandler()(request('/api/state')).then(r=>r.json())).profile.name,'雲端測試');
  }finally{await db.close();}
});

test('a competing cloud request skips work when another transaction holds the lock',async()=>{
  const commands=[];
  const pool={async connect(){return {
    async query(command){commands.push(command);return {rows:[{acquired:false}]};},
    release(){commands.push('release');}
  };}};
  const result=await withPostgresState(pool,()=>assert.fail('concurrent work ran'));
  assert.deepEqual(result,{busy:true});
  assert.deepEqual(commands,['BEGIN','SELECT pg_try_advisory_xact_lock(44011, 1) AS acquired','ROLLBACK','release']);
});
