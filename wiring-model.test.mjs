import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {editConnection,addConnection,removeComponent,serializeInventory,parseInventory} from './wiring-model.mjs';
const inventory=JSON.parse(await readFile(new URL('./inventory.json',import.meta.url),'utf8'));
test('uç adları ve hedef modül değişir; kanıt ve önceki değerler korunur',()=>{
 const next=editConnection(inventory,'hub',3,3,{terminal:'VDD yeni',target:'VIN',targetComponent:4,kind:'power'},'2026-11-05T17:00:00Z');
 const c=next.devices[0].presentation.components[3].connections[3];
 assert.equal(c.terminal,'VDD yeni');assert.equal(c.target,'VIN');assert.equal(c.targetComponent,4);
 assert.equal(c.history[0].terminal,'VDD');assert.equal(c.evidence,'user_edit');
 assert.deepEqual(next.devices[0].claims,inventory.devices[0].claims);
 assert.equal(inventory.devices[0].presentation.components[3].connections[3].terminal,'VDD');
 assert.deepEqual(parseInventory(serializeInventory(next)),next);
});
test('boş uç, kendi modülüne ve olmayan modüle bağlantı reddedilir',()=>{
 for(const values of [{terminal:'',target:'X',targetComponent:-1,kind:'signal'},{terminal:'X',target:'Y',targetComponent:3,kind:'signal'},{terminal:'X',target:'Y',targetComponent:999,kind:'signal'}]) assert.throws(()=>editConnection(inventory,'hub',3,0,values));
});
test('hoparlörün iki ucu merkez kart yerine yükselticiye bağlıdır',()=>{
 const parts=inventory.devices[0].presentation.components;
 for(const c of parts[5].connections){assert.equal(parts[c.targetComponent].icon,'amplifier');assert.ok(['SPK+','SPK−'].includes(c.target));}
});
test('yeni pin kullanıcı kaydıdır; kaynak iddiasına dönüştürülmez',()=>{
 const next=addConnection(inventory,'hub',0,{terminal:'Yeni uç',target:'GPIO38',targetComponent:-1,kind:'signal'},'2026-11-05T18:00:00Z');
 const wire=next.devices[0].presentation.components[0].connections.at(-1);
 assert.equal(wire.evidence,'user_added');assert.equal(wire.claimIndex,undefined);
 assert.equal(wire.terminal,'Yeni uç');assert.equal(wire.createdAt,'2026-11-05T18:00:00Z');
 assert.deepEqual(parseInventory(serializeInventory(next)),next);
 assert.throws(()=>addConnection(next,'hub',0,{terminal:'Yeni uç',target:'GPIO38',targetComponent:-1,kind:'signal'}),/zaten/);
 assert.deepEqual(next.devices[0].claims,inventory.devices[0].claims);
});
test('sensör silinince kanıt ve bağlantı indeksleri yeniden eşleşir',()=>{
 const next=removeComponent(inventory,'hub',0),device=next.devices[0];
 assert.ok(!device.presentation.components.some(p=>p.icon==='display'));
 assert.equal(device.presentation.components[4].connections[0].targetComponent,3);
 assert.equal(device.claims.length,inventory.devices[0].claims.length-3);
 assert.deepEqual(parseInventory(serializeInventory(next)),next);
 assert.equal(inventory.devices[0].presentation.components[0].icon,'display');
});
test('yükseltici silinince hoparlörden ona gelen bağlantı kalmaz; yeniden pin eklenebilir',()=>{
 const next=removeComponent(inventory,'hub',4),device=next.devices[0];
 assert.equal(device.presentation.components[4].icon,'speaker');
 assert.equal(device.presentation.components[4].connections.length,0);
 assert.deepEqual(parseInventory(serializeInventory(next)),next);
 const added=addConnection(next,'hub',4,{terminal:'SPK+',target:'Yeni çıkış',targetComponent:-1,kind:'signal'});
 assert.equal(added.devices[0].presentation.components[4].connections.length,1);
 assert.throws(()=>removeComponent(inventory,'hub',6),/kart/i);
});
