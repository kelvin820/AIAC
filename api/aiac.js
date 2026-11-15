import pg from 'pg';
import {createCloudHandler} from '../src/cloud-handler.mjs';
import {privateFitStore} from '../src/private-fit-store.mjs';

const env=process.env;
const url=env.DATABASE_URL;
const pool=url?new pg.Pool({connectionString:url,max:2,connectionTimeoutMillis:5000,allowExitOnIdle:true}):null;
const handler=createCloudHandler({pool,env,fitStore:privateFitStore(env.BLOB_READ_WRITE_TOKEN)});

export default {
  fetch(request) {
    const url=new URL(request.url);
    const operation=url.searchParams.get('operation');
    const route=operation&&/^[a-z0-9-]+$/.test(operation)?'/api/'+operation:url.pathname;
    return handler(request,route);
  }
};
