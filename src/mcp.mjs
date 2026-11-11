import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {randomBytes} from 'node:crypto';
import {validateEndpoint} from './providers.mjs';
export function createMcp(vault,callbackUrl){
 let pending=null;
 function provider(){return {
  redirectUrl:callbackUrl,
  clientMetadata:{client_name:'AIAC Local',redirect_uris:[callbackUrl],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'},
  state(){pending={state:randomBytes(24).toString('hex'),at:Date.now()};return pending.state;},
  clientInformation:()=>vault.get().mcpClient,
  async saveClientInformation(info){await vault.save({...vault.get(),mcpClient:info});},
  tokens:()=>vault.get().mcpTokens,
  async saveTokens(tokens){await vault.save({...vault.get(),mcpTokens:tokens});},
  redirectToAuthorization(url){if(!pending)throw Error('OAuth state 未建立');pending.url=url.toString();},
  async saveCodeVerifier(verifier){await vault.save({...vault.get(),mcpVerifier:verifier});},
  codeVerifier:()=>vault.get().mcpVerifier,
  async invalidateCredentials(scope){const s=vault.get();if(scope==='all'||scope==='tokens')delete s.mcpTokens;if(scope==='all'||scope==='client')delete s.mcpClient;if(scope==='all'||scope==='verifier')delete s.mcpVerifier;await vault.save(s);}
 };}
 function transport(url){const token=vault.get().mcpBearer;return new StreamableHTTPClientTransport(new URL(validateEndpoint(url,{local:true})),{...(token?{requestInit:{headers:{Authorization:`Bearer ${token}`}}}:{authProvider:provider()}),reconnectionOptions:{maxRetries:0},fetch:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(25000)})});}
 async function withClient(url,fn){const client=new Client({name:'aiac-local',version:'0.2.0'});try{await client.connect(transport(url));return await fn(client);}catch(e){if(pending?.url){return {authorizationUrl:pending.url,status:'authorization_required'};}throw Error('MCP 連線或工具執行失敗，請確認網址、授權及伺服器相容性');}finally{await client.close().catch(()=>{});}}
 return {
  async list(url){return withClient(url,async c=>{const tools=[];let cursor;do{const r=await c.listTools(cursor?{cursor}:{});tools.push(...r.tools);cursor=r.nextCursor;}while(cursor&&tools.length<200);return {status:'connected',tools:tools.slice(0,200).map(t=>({name:t.name,description:t.description||'',inputSchema:t.inputSchema,readOnly:t.annotations?.readOnlyHint===true}))};});},
  async call(url,name,args){return withClient(url,async c=>{let cursor,tool;do{const r=await c.listTools(cursor?{cursor}:{});tool=r.tools.find(t=>t.name===name);cursor=r.nextCursor;}while(!tool&&cursor);if(!tool||tool.annotations?.readOnlyHint!==true)throw Error('本版只允許明確標記唯讀的工具');const result=await c.callTool({name,arguments:args},undefined,{timeout:30000});if(result.isError)throw Error('MCP 工具回傳錯誤');return {status:'success',result};});},
  async finish(url,code,state){if(!pending||Date.now()-pending.at>600000||state!==pending.state)throw Error('MCP OAuth state 無效或已過期');pending=null;const t=transport(url);try{await t.finishAuth(code);}finally{await t.close();}},
  clear(){pending=null;}
 };
}
