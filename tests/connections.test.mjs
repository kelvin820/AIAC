import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {once} from 'node:events';
import {openVault} from '../src/vault.mjs';
import {llmEnvironment,validateEndpoint} from '../src/providers.mjs';
test('vault encrypts secrets and reopens',async()=>{const dir=await mkdtemp(join(process.cwd(),'data-test-vault-'));try{const v=await openVault(dir);await v.save({llmKey:'sensitive-test-secret'});assert.equal((await openVault(dir)).get().llmKey,'sensitive-test-secret');assert.ok(!(await readFile(join(dir,'vault.enc'),'utf8')).includes('sensitive-test-secret'));}finally{await rm(dir,{recursive:true,force:true});}});
test('mock cannot use environment key and managed is explicitly unavailable',()=>{assert.deepEqual(llmEnvironment({mode:'mock'},{llmKey:'test'}),{LLM_MODE:'mock'});assert.throws(()=>llmEnvironment({mode:'managed'},{}),/尚未開通/);assert.throws(()=>validateEndpoint('https://user:password@example.com'),/帳密/);assert.throws(()=>validateEndpoint('http://example.com'),/HTTPS/);});
test('BYOK is explicit, keys are redacted, and daily limit blocks further requests',async()=>{
 const dir=await mkdtemp(join(process.cwd(),'data-test-usage-'));let calls=0,received;
 const provider=createServer(async(req,res)=>{calls++;let b='';for await(const c of req)b+=c;received=JSON.parse(b);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({text:'測試建議',why:'測試',uncertainties:[],planB:'替代',proposedPlan:null})}}],usage:{total_tokens:42}}));});provider.listen(0,'127.0.0.1');await once(provider,'listening');
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,DATA_DIR:dir,PORT:'33149',LLM_MODE:'live',LLM_API_KEY:'developer-key-never-use'},stdio:['ignore','pipe','pipe']});
 async function call(path,body){const res=await fetch('http://127.0.0.1:33149/api/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});return {status:res.status,data:await res.json()};}
 try{await once(child.stdout,'data');let s=(await call('state')).data;assert.equal(s.mode,'mock');await call('coach',{kind:'morning',message:'hello'});assert.equal(calls,0);
  const config={mode:'byok',baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,model:'test',apiKey:'user-secret',dailyLimit:1,maxOutputTokens:256,consent:true};s=(await call('connections',config)).data;assert.equal(s.connections.llm.hasKey,true);assert.ok(!JSON.stringify(s).includes('user-secret'));assert.ok(!(await readFile(join(dir,'state.json'),'utf8')).includes('user-secret'));assert.equal(calls,0);
  assert.equal((await call('coach',{kind:'chat',message:'今天如何練'})).status,200);assert.equal(calls,1);assert.equal(received.max_tokens,256);assert.equal((await call('coach',{kind:'chat',message:'再問一次'})).status,400);assert.equal(calls,1);
 }finally{const ended=once(child,'exit');child.kill();await ended;await new Promise(r=>provider.close(r));await rm(dir,{recursive:true,force:true});}
});
