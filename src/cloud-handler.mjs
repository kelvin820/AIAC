import {createHash, timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';
import {createApplication} from './application.mjs';
import {withPostgresState} from './postgres-store.mjs';

const disabled = new Set(['/api/mcp-settings','/api/mcp-connect','/api/mcp-call','/api/mcp-disconnect',
  '/api/strava-authorize','/api/strava-disconnect','/api/connections','/api/garmin-sync','/api/strava-sync','/api/reset']);

function equal(a,b) {
  const hash = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(a),hash(b));
}

function json(data,status,headers={}) {
  return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
}

export function createCloudHandler({pool,fitStore,env}) {
  const password=env.AIAC_PREVIEW_PASSWORD;
  const envKey=env.AIAC_LLM_API_KEY?.trim();
  const vault={get:()=>envKey?{llmKey:envKey}:{},save:async()=>{throw Error('請在雲端環境變數管理憑證。');}};
  const providers={INTERVALS_API_KEY:env.INTERVALS_API_KEY,INTERVALS_ATHLETE_ID:env.INTERVALS_ATHLETE_ID};
  return async function handle(request, route = new URL(request.url).pathname) {
    const auth = request.headers.get('authorization') ?? '';
    const cron = route==='/api/cron';
    if (cron) {
      if (request.method!=='GET'||!env.CRON_SECRET||!equal(auth,'Bearer '+env.CRON_SECRET))return json({error:'未授權'},401);
    } else {
      if (!password || password.length<16) return json({error:'雲端試用尚未設定。'},503);
      if (!equal(auth,'Basic '+Buffer.from('aiac:'+password).toString('base64'))){
        return json({error:'請登入 AIAC 雲端試用。'},401,{'WWW-Authenticate':'Basic realm="AIAC Preview", charset="UTF-8"'});
      }
    }
    if (disabled.has(route)||!route.startsWith('/api/'))return json({error:'雲端試用版未開放此操作。'},404);
    if(route==='/api/state'&&request.method==='GET'&&request.headers.get('sec-fetch-mode')==='navigate'){
      return new Response(null,{status:303,headers:{Location:'/', 'Cache-Control':'no-store'}});
    }
    if (!pool) return json({error:'雲端資料庫尚未設定。'},503);
    const origin = new URL(request.url).origin;
    try {
      const outcome = await withPostgresState(pool, async store => {
        const configuredStore = {
          get:async()=>{
            const state=await store.get();
            const model=env.AIAC_LLM_MODEL?.trim();
            const baseUrl=env.AIAC_LLM_BASE_URL?.trim();
            if(envKey&&model&&baseUrl?.startsWith('https://')){
              Object.assign(state.connections.llm,{mode:'byok',model,baseUrl});
            }else{
              state.connections.llm.mode='mock';
            }
            return state;
          },
          save:store.save
        };
        const app = createApplication({origin,store:configuredStore,vault,fitStore,env:providers,fitLimit:4*1024*1024,backupMax:4*1024*1024});
        if (cron) {
          if(!providers.INTERVALS_API_KEY||!providers.INTERVALS_ATHLETE_ID)return json({error:'尚未設定 intervals.icu。'},503);
          await app.backgroundSync();
          const state=await store.get();
          const status=state.connections.intervals;
          if(status?.lastError)return json({error:status.lastError},502);
          return json({ok:Boolean(status?.lastSync)},status?.lastSync?200:503);
        }
        const req = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
        req.method=request.method;
        req.url=route;
        req.headers={...Object.fromEntries(request.headers),host:new URL(origin).host};
        let response;
        let status=200, headers={};
        await app.handleRequest(req,{
          writeHead(code, values){status=code;headers=values;},
          end(data){response=new Response(data,{status,headers});}
        });
        return response;
      });
      return outcome.busy?json({error:'另一個更新正在儲存，請稍後重試。'},409):outcome.value;
    } catch {
      return json({error:'雲端暫時無法保存資料，請稍後重試。'},500);
    }
  };
}
