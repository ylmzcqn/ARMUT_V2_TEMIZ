import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceRuntime} from './device-runtime.mjs';
const registry=[{deviceId:'hub',role:'hub',capabilities:['display'],components:[{componentId:'screen',capabilities:['display']}]},{deviceId:'camera-01',role:'camera',capabilities:['camera'],components:[]}];
function setup(){let clock=0;const runtime=createDeviceRuntime(registry,{now:()=>clock});runtime.beginSession('gateway-boot-1');return {runtime,tick:ms=>clock+=ms};}
const message=(overrides={})=>({schemaVersion:1,sessionId:'gateway-boot-1',sequence:1,deviceId:'hub',role:'hub',bootId:'hub-boot-1',online:true,observationAgeMs:0,capabilities:['display'],components:[{componentId:'screen',online:true}],...overrides});
test('cihaz veri gelmeden bilinmiyor; envanter ve girdiler değişmez',()=>{
 const source=structuredClone(registry);let time=0;const r=createDeviceRuntime(source,{now:()=>time});source[0].role='other';
 assert.equal(r.status('hub').state,'unknown');r.beginSession('s');const m=message({sessionId:'s'});r.ingest(m);m.components[0].online=false;
 const status=r.status('hub');assert.equal(status.state,'online');assert.equal(status.components[0].online,true);status.components[0].online=false;assert.equal(r.status('hub').components[0].online,true);
 assert.equal(r.status('new').state,'unregistered');
});
test('yanlış kimlik, rol, yetenek ve bileşen önceki geçerli durumu bozmaz',()=>{
 const {runtime:r}=setup();r.ingest(message());
 for(const patch of [{deviceId:'alien'},{role:'camera'},{capabilities:['switch']},{components:[{componentId:'alien',online:true}]},{components:[{componentId:'screen',online:'yes'}]},{online:'true'},{observationAgeMs:-1},{sequence:1.1},{schemaVersion:2}])assert.throws(()=>r.ingest(message({sequence:2,...patch})));
 assert.equal(r.status('hub').sequence,1);
});
test('sırasız veri, eski oturum ve bağlantı kesikken gelen cevap kabul edilmez',()=>{
 const {runtime:r}=setup();r.ingest(message({sequence:5}));assert.throws(()=>r.ingest(message({sequence:4})));assert.throws(()=>r.ingest(message({sequence:5})));
 r.disconnect();assert.equal(r.status('hub').state,'disconnected');assert.throws(()=>r.ingest(message({sequence:6})));
 r.beginSession('gateway-boot-2');assert.equal(r.status('hub').state,'unknown');assert.throws(()=>r.ingest(message({sequence:6})));
 r.ingest(message({sessionId:'gateway-boot-2'}));assert.equal(r.status('hub').state,'online');
});
test('kaynak yaşı korunur; sessizlik çevrimdışı diye yorumlanmaz',()=>{
 const {runtime:r,tick}=setup();r.ingest(message({observationAgeMs:14000}));assert.equal(r.status('hub').state,'online');tick(1001);assert.equal(r.status('hub').state,'delayed');tick(15000);assert.equal(r.status('hub').state,'stale');
 r.ingest(message({sequence:2,online:false}));assert.equal(r.status('hub').state,'offline');tick(30001);assert.equal(r.status('hub').state,'stale');
});
test('yaşı bilinmeyen ve yeniden başlayan cihaz eski bileşen sağlığını devralmaz',()=>{
 const {runtime:r}=setup();r.ingest(message({observationAgeMs:null}));assert.equal(r.status('hub').state,'unknown');
 r.ingest(message({sequence:2}));r.ingest(message({sequence:3,bootId:'hub-boot-2',components:[]}));assert.deepEqual(r.status('hub').components,[]);assert.equal(r.status('camera-01').state,'unknown');
});
test('kayıt çakışmaları ve oturum kimliği tekrar kullanımı reddedilir',()=>{
 assert.throws(()=>createDeviceRuntime([...registry,registry[0]]));const {runtime:r}=setup();r.beginSession('new');assert.throws(()=>r.beginSession('gateway-boot-1'));
 assert.throws(()=>createDeviceRuntime([{...registry[0],components:[{componentId:'x',capabilities:[]},{componentId:'x',capabilities:[]}]}]));
});
test('bozuk saat ve hatalı zaman politikası geçerli gözlemi değiştirmez',()=>{
 assert.throws(()=>createDeviceRuntime(registry,{delayedAfterMs:30000,staleAfterMs:10000}));
 let time=100;const r=createDeviceRuntime(registry,{now:()=>time});r.beginSession('s');r.ingest(message({sessionId:'s'}));time=99;assert.throws(()=>r.ingest(message({sessionId:'s',sequence:2})));time=101;assert.equal(r.status('hub').sequence,1);
});
test('Hub yeniden okununca kaynakta eski gözlem taze olmaz; yinelenen bileşen reddedilir',()=>{
 const {runtime:r,tick}=setup();r.ingest(message());tick(40000);r.ingest(message({sequence:2,observationAgeMs:40000}));assert.equal(r.status('hub').state,'stale');
 assert.throws(()=>r.ingest(message({sequence:3,components:[{componentId:'screen',online:true},{componentId:'screen',online:false}]})));assert.equal(r.status('hub').sequence,2);
});
test('ingest tek saat gözlemiyle atomik kabul edilir',()=>{
 let calls=0;const r=createDeviceRuntime(registry,{now:()=>{calls++;return calls;}});r.beginSession('s');
 const result=r.ingest(message({sessionId:'s'}));assert.equal(calls,1);assert.equal(result.sequence,1);assert.equal(result.ageMs,0);
});
