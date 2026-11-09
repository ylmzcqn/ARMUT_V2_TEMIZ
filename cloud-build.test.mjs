import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
import {createHomeRuntime} from './home-runtime.mjs';import {createLocalPresenceBridge} from './local-presence.mjs';
test('hazırlanan Worker paketi mevcut paneli sunar; sır ve Node sunucu kodu taşımaz',async t=>{
 const output=await mkdtemp(join(tmpdir(),'armut-cloud-artifact-'));t.after(()=>rm(output,{recursive:true,force:true}));const before=await readFile(new URL('./.openai/hosting.json',import.meta.url),'utf8');
 execFileSync(process.execPath,['build-cloud.mjs',output],{cwd:new URL('.',import.meta.url),stdio:'pipe'});
 assert.equal(await readFile(new URL('./.openai/hosting.json',import.meta.url),'utf8'),before);assert.equal(JSON.parse(await readFile(join(output,'.openai/hosting.json'),'utf8')).static,undefined);
 const {default:worker}=await import(pathToFileURL(join(output,'dist/server/index.js')).href);
 const req=path=>new Request('https://fixture-panel.invalid'+path,{headers:{'oai-authenticated-user-id':'fixture-owner'}});
 const html=await(await worker.fetch(req('/'),{})).text();assert.ok(html.includes('Genel bakış'));
 const app=await worker.fetch(req('/app.mjs'),{});assert.equal(app.status,200);assert.match(app.headers.get('content-type'),/javascript/);assert.equal((await worker.fetch(req('/server.mjs'),{})).status,404);assert.equal((await worker.fetch(req('/build-cloud.mjs'),{})).status,404);
 assert.equal((await(await worker.fetch(req('/api/presence'),{})).json()).value,null);
});
test('dışarı HTTPS yayın → kalıcı SQL → aynı özel panel: tekrar, restart ve kesinti güvenli',async t=>{
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('./migrations/presence/0001_presence.sql',import.meta.url),'utf8'));t.after(()=>db.close());
 const binding={prepare(sql){return {bind(...args){return {
  first:async()=>db.prepare(sql).get(...args)||null,
  run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})
 };}};}};
 const dir=await mkdtemp(join(tmpdir(),'armut-push-e2e-'));t.after(()=>rm(dir,{recursive:true,force:true}));execFileSync(process.execPath,['build-cloud.mjs',dir],{cwd:new URL('.',import.meta.url),stdio:'pipe'});const moduleUrl=pathToFileURL(join(dir,'dist/server/index.js')).href;const {default:worker}=await import(moduleUrl);
 const env={DB:binding,PRESENCE_PUBLISH_TOKEN:'fixture-publisher-key-00000000000000'},id={version:1,deviceId:'camera-02',componentId:'presence-radar',bootId:'abcdef0123456789'};
 const send=(path,body,key=env.PRESENCE_PUBLISH_TOKEN)=>worker.fetch(new Request('https://fixture.invalid/api/presence/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body)}),env);
 assert.equal((await send('hello',id,'wrong')).status,401);const lease=await(await send('hello',id)).json();const report={...id,nonce:lease.nonce,sequence:1,value:true,sampleAgeMs:10,sinceLeaseMs:0};const ackResponse=await send('report',report);assert.equal(ackResponse.status,200);const ack=await ackResponse.json();assert.equal((await send('report',report)).status,409);
 const runtime=createHomeRuntime({devices:[{id:'camera-02',name:'Fixture',icon:'camera'}]}),bridge=createLocalPresenceBridge({runtime,fetcher:path=>worker.fetch(new Request('https://fixture.invalid'+path,{headers:{'oai-authenticated-user-id':'fixture-owner'}}),env)});t.after(()=>{bridge.disconnect();runtime.dispose();});await bridge.connectCloud();assert.equal(runtime.entityState('presence-radar').value,true);
 const {default:restarted}=await import(moduleUrl+'?restart');const read=()=>new Request('https://fixture.invalid/api/presence',{headers:{'oai-authenticated-user-id':'fixture-owner'}});assert.equal((await(await restarted.fetch(read(),env)).json()).value,true);
 await send('report',{...report,nonce:ack.nonce,sequence:2,value:false});await bridge.refresh();assert.equal(runtime.entityState('presence-radar').value,false);
 const row=db.prepare('SELECT state_json FROM presence_state').get(),state=JSON.parse(row.state_json);state.observedAt=Date.now()-2000;db.prepare('UPDATE presence_state SET state_json=?').run(JSON.stringify(state));await bridge.refresh();assert.equal(runtime.entityState('presence-radar').value,null);assert.equal(runtime.entityState('presence-radar').fresh,false);
 env.DB={prepare(){throw Error('unavailable');}};await bridge.refresh();assert.equal(bridge.connected,true);assert.equal(runtime.entityState('presence-radar').value,null);env.DB=binding;
 const newLease=await(await send('hello',{...id,bootId:'bbbbbbbbbbbbbbbb'})).json();await send('report',{...report,bootId:'bbbbbbbbbbbbbbbb',nonce:newLease.nonce,sequence:1,value:true});await bridge.refresh();assert.equal(runtime.entityState('presence-radar').value,true);assert.equal(runtime.entityState('presence-radar').maxAgeMs,2000);
});
