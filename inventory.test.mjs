import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateInventory, loadInventory, selectedDevice} from './inventory-core.mjs';

test('gerçek envanter geçerli ve tekil kimlikli', async()=>{
  const data=validateInventory(JSON.parse(await readFile(new URL('./inventory.json',import.meta.url),'utf8')));
  assert.ok(data.devices.length>=3);
  assert.equal(new Set(data.devices.map(d=>d.id)).size,data.devices.length);
  for(const d of data.devices) for(const claim of d.claims){
    assert.ok(claim.sources.length);
    for(const id of claim.sources) assert.ok(data.sources[id],id);
  }
});
test('boş envanter geçerli',()=>assert.equal(validateInventory({version:1,sources:{},devices:[]}).devices.length,0));
test('tekil pinler kanıta bağlıdır; yanlış kanıt veya boş uç reddedilir',async()=>{
  const data=JSON.parse(await readFile(new URL('./inventory.json',import.meta.url),'utf8'));
  const screen=data.devices[0].presentation.components[0];
  assert.equal(screen.connections.length,8);
  assert.equal(screen.connections.find(c=>c.terminal==='CS').target,'GPIO10');
  const bad=structuredClone(data);bad.devices[0].presentation.components[0].connections[0].claimIndex=999;
  assert.throws(()=>validateInventory(bad),/Veri biçimi/);
  const empty=structuredClone(data);empty.devices[0].presentation.components[0].connections[0].terminal='';
  assert.throws(()=>validateInventory(empty),/Veri biçimi/);
});
test('özet kartları bütün kanıtları kapsar; geçersiz kanıt bağlantısı reddedilir',async()=>{
  const data=JSON.parse(await readFile(new URL('./inventory.json',import.meta.url),'utf8'));
  for(const device of data.devices){
    const indexes=device.presentation.components.flatMap(c=>c.claimIndexes);
    assert.deepEqual([...indexes].sort((a,b)=>a-b),device.claims.map((_,i)=>i));
  }
  data.devices[0].presentation.components[0].claimIndexes=[999];
  assert.throws(()=>validateInventory(data),/Veri biçimi/);
});
test('bozuk sözleşme reddedilir',()=>{
  for(const data of [null,{}, {version:1,sources:{},devices:[{}]}]) assert.throws(()=>validateInventory(data),/Veri biçimi/);
});
test('okuma, JSON ve HTTP hataları anlaşılır',async()=>{
  await assert.rejects(loadInventory(async()=>{throw Error('network')}),/okunamadı/);
  await assert.rejects(loadInventory(async()=>({ok:false,status:404})),/404/);
  await assert.rejects(loadInventory(async()=>({ok:true,json:async()=>{throw SyntaxError()}})),/JSON/);
});
test('bilinmeyen kaynak, yinelenen kimlik ve bozuk iddia reddedilir',async()=>{
  const data=JSON.parse(await readFile(new URL('./inventory.json',import.meta.url),'utf8'));
  const duplicate=structuredClone(data); duplicate.devices.push(duplicate.devices[0]);
  assert.throws(()=>validateInventory(duplicate),/Veri biçimi/);
  const missing=structuredClone(data); missing.devices[0].claims[0].sources=['missing'];
  assert.throws(()=>validateInventory(missing),/Veri biçimi/);
  const invalid=structuredClone(data); invalid.devices[0].claims[0].kind='verified';
  assert.throws(()=>validateInventory(invalid),/Veri biçimi/);
  assert.equal(selectedDevice(data,'#camera-02').id,'camera-02');
  assert.equal(selectedDevice(data,'#missing'),null);
  assert.equal(selectedDevice(data,'#%invalid'),null);
});
test('taşınabilir kaynak özetleri kendi içerik hashleriyle eşleşir',async()=>{
 const {createHash}=await import('node:crypto');
 const data=JSON.parse(await readFile(new URL('./inventory.json',import.meta.url),'utf8'));
 for(const source of Object.values(data.sources)){
  assert.ok(source.project);assert.ok(!/^(?:[A-Za-z]:|\/)/.test(source.path));
  assert.ok(source.snapshot?.text);assert.equal(source.snapshot.encoding,'utf8-lf');
  assert.equal(createHash('sha256').update(source.snapshot.text,'utf8').digest('hex'),source.snapshot.sha256,source.path);
  assert.equal(source.snapshot.text.split('\n').length-1,source.end-source.start+1);
 }
});
test('bozulmuş kaynak özeti yüklemede ve doğrulamada reddedilir',async()=>{
 const {verifySourceSnapshots}=await import('./inventory-core.mjs');
 const data=JSON.parse(await readFile(new URL('./inventory.json',import.meta.url),'utf8'));
 data.sources.hp.snapshot.text+='tamper';
 await assert.rejects(verifySourceSnapshots(data),/bütünlük/);
});

test('boş envanter her rotada görünür boş durumuna gider',async()=>{const {inventoryRoute}=await import('./inventory-core.mjs');for(const hash of ['#home','#devices','#hub']){const state=inventoryRoute({devices:[]},hash);assert.equal(state.empty,true);assert.equal(state.listing,true);}});
