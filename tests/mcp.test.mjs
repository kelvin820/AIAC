import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {openVault} from '../src/vault.mjs';
import {createMcp} from '../src/mcp.mjs';
test('MCP SDK performs initialize, lists real schemas and calls only read-only tools',async()=>{
 const dir=await mkdtemp(join(process.cwd(),'data-test-mcp-'));const requests=[];
 const server=createServer(async(req,res)=>{if(req.method!=='POST'){res.writeHead(405);res.end();return;}let body='';for await(const c of req)body+=c;const b=JSON.parse(body);requests.push(b.method);if(!b.id&&b.id!==0){res.writeHead(202);res.end();return;}let result;
 if(b.method==='initialize')result={protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
 else if(b.method==='tools/list')result={tools:[{name:'activities',inputSchema:{type:'object',properties:{}},annotations:{readOnlyHint:true}},{name:'delete_activity',inputSchema:{type:'object',properties:{}}}]};
 else if(b.method==='tools/call')result={structuredContent:{activities:[{startedAt:'2026-11-11T07:00:00+08:00',durationSeconds:1800}]},content:[{type:'text',text:'Fixture data'}]};
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:b.id,result}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');const mcp=createMcp(await openVault(dir),'http://127.0.0.1:3140/auth/mcp/callback');const url=`http://127.0.0.1:${server.address().port}/mcp`;
 try{const listed=await mcp.list(url);assert.equal(listed.status,'connected');assert.equal(listed.tools[0].readOnly,true);const result=await mcp.call(url,'activities',{});assert.equal(result.result.structuredContent.activities.length,1);const count=requests.filter(m=>m==='tools/call').length;await assert.rejects(mcp.call(url,'delete_activity',{}));assert.equal(requests.filter(m=>m==='tools/call').length,count);await assert.rejects(mcp.finish(url,'fake-code','fake-state'),/state/);}finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
