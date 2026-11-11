import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../src/initial-state.mjs';
import {createStrava} from '../src/strava.mjs';
import {syncStrava,syncStravaIfDue} from '../src/strava-sync.mjs';

function memoryStore(initial) {
  let value = structuredClone(initial);
  return {get:() => structuredClone(value), async save(next) {value=structuredClone(next);return this.get();}};
}

test('background Strava sync refreshes tokens, uses an incremental window and deduplicates after restart', async t => {
  const vault = memoryStore({stravaTokens:{access_token:'expired',refresh_token:'old-refresh',expires_at:0}});
  const store = memoryStore(initialState());
  const now = Date.now();
  const windows = [];
  const activity = {id:123,name:'Demo run',sport_type:'Run',start_date:new Date(now-60000).toISOString(),moving_time:1800,distance:5000};
  t.mock.method(globalThis,'fetch',async (url, options) => {
    if (url.endsWith('/oauth/token')) {
      assert.equal(JSON.parse(options.body).refresh_token,'old-refresh');
      return Response.json({access_token:'fresh',refresh_token:'new-refresh',expires_at:Math.floor(now/1000)+3600});
    }
    assert.equal(options.headers.Authorization,'Bearer fresh');
    windows.push(new URL(url).searchParams);
    return Response.json([activity]);
  });
  const strava=createStrava(vault,'http://localhost/callback',{STRAVA_CLIENT_ID:'123',STRAVA_CLIENT_SECRET:'test'});
  const initial=await syncStravaIfDue(store,strava,now);
  assert.equal(initial.imported.added,1);
  assert.equal(Number(windows[0].get('after')),Math.floor(now/1000)-7*86400);
  assert.equal(vault.get().stravaTokens.refresh_token,'new-refresh');
  const reopened=memoryStore(store.get());
  assert.equal(await syncStravaIfDue(reopened,strava,now+60000),undefined);
  activity.map={summary_polyline:'_p~iF~ps|U_ulLnnqC_mqNvxq`@'};
  const later=await syncStravaIfDue(reopened,strava,now+16*60000);
  assert.equal(Number(windows[1].get('after')),initial.state.connections.strava.cursor-86400);
  assert.equal(later.imported.duplicates,1);
  assert.equal(later.state.activities.length,1);
  assert.deepEqual(later.state.activities[0].route,[[38.5,-120.2],[40.7,-120.95],[43.252,-126.453]]);
});

test('failed Strava reads retain progress and pause until retry or reauthorization', async () => {
  const store=memoryStore(initialState());
  const state=store.get();
  state.connections.strava={cursor:Math.floor(Date.now()/1000)-3600,lastSync:'2026-11-10T00:00:00Z'};
  await store.save(state);
  const strava={configured:()=>true,connected:()=>true,async sync(){throw Object.assign(Error('rate limit'),{status:429,retryAfterMs:3600000});}};
  await assert.rejects(syncStrava(store,strava),/請求上限/);
  assert.equal(store.get().connections.strava.cursor,state.connections.strava.cursor);
  assert.equal(store.get().connections.strava.lastSync,state.connections.strava.lastSync);
  assert.equal(await syncStravaIfDue(store,strava),undefined);
  const retryAt=Date.parse(store.get().connections.strava.nextSync);
  strava.sync=async()=>{throw Object.assign(Error('revoked'),{status:401});};
  await assert.rejects(syncStravaIfDue(store,strava,retryAt),/重新登入/);
  assert.equal(store.get().connections.strava.status,'reauthorize');
  assert.equal(await syncStravaIfDue(store,strava,retryAt+86400000),undefined);
});
