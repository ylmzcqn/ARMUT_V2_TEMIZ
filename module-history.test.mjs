import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {moduleActivity} from './module-history.mjs';
import {editConnection,addConnection} from './wiring-model.mjs';
const inventory=JSON.parse(readFileSync(new URL('./inventory.json',import.meta.url),'utf8'));
test('bağlantı ekleme tarihi modülün eklenme tarihi sayılmaz; geçmiş özgün kaydı değiştirmez',()=>{
 const time='2026-11-06T10:00:00Z';
 const next=addConnection(inventory,'hub',0,{terminal:'Yeni',target:'GPIO38',targetComponent:-1,kind:'signal'},time);
 const device=next.devices.find(d=>d.id==='hub'),before=JSON.stringify(next),activity=moduleActivity(device,0);
 assert.equal(activity.createdAt,null);assert.equal(activity.lastChanged,time);assert.ok(activity.events.some(e=>e.text.includes('Yeni → GPIO38')));assert.equal(JSON.stringify(next),before);
});
test('yükseltici hoparlördeki asıl bağlantının değişiklik geçmişini gösterir',()=>{
 const device=inventory.devices.find(d=>d.id==='hub'),parts=device.presentation.components;
 const speaker=parts.findIndex(p=>p.icon==='speaker'),amp=parts.findIndex(p=>p.icon==='amplifier');
 const next=editConnection(inventory,'hub',speaker,0,{terminal:'SPK yeni',target:'Amfi yeni',targetComponent:amp,kind:'signal'},'2026-11-06T11:00:00Z');
 const activity=moduleActivity(next.devices.find(d=>d.id==='hub'),amp);
 assert.ok(activity.events.some(e=>e.text.includes('SPK yeni → Amfi yeni')));assert.equal(activity.createdAt,null);
});
