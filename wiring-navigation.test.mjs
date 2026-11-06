import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wiringWorkspace,devicesOverview} from './wiring-view.mjs';
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.classList={contains:()=>false};}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(key,value){this.attrs[key]=String(value);}
 replaceChildren(...nodes){this.children=nodes;}
 addEventListener(key,callback){this.events[key]=callback;}
 querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll('*')]);return selector==='details[open]'?[]:all;}
 querySelector(selector){return this.querySelectorAll('*').find(n=>n.tag===selector);}
 close(){} showModal(){} focus(){}
}
test('seçici cihazları açar; sensörler satır içi düzenleyici yerine modal geri çağrısını kullanır',()=>{
 const inventory=JSON.parse(readFileSync(new URL('./inventory.json',import.meta.url),'utf8'));
 globalThis.document={createElement:tag=>new Node(tag),createElementNS:(_ns,tag)=>new Node(tag),documentElement:new Node('html')};
 try{
  const device=inventory.devices[0],opened=[],selected=[];
  const workspace=wiringWorkspace({device,devices:inventory.devices,onDeviceSelect:id=>selected.push(id),onModuleOpen:(index)=>opened.push(index),tools:new Node('div')});
  const nodes=()=>workspace.querySelectorAll('*');
  assert.ok(nodes().some(n=>n.attrs['aria-label']===`Cihaz seç: ${device.name}`));
  nodes().find(n=>n.attrs['aria-label']===`${device.presentation.components[0].name} pinlerini göster`).events.click();
  assert.deepEqual(opened,[0]);
  assert.ok(!nodes().some(n=>n.attrs['aria-label']==='Modül kayıt bilgileri'));
  const allChoice=nodes().find(n=>n.tag==='button'&&n.children.some(c=>c.children.some(t=>t.textContent==='Tüm cihazlar')));
  allChoice.events.click();
  assert.deepEqual(selected,['home']);
  const board=device.presentation.components.findIndex(part=>part.icon==='board');
  nodes().find(n=>n.attrs['aria-label']===`${device.name} kart ve besleme bilgilerini aç`).events.click();assert.equal(opened.at(-1),board);
  const home=devicesOverview(inventory.devices,id=>selected.push(id));
  const allNodes=home.querySelectorAll('*');assert.ok(allNodes.some(n=>n.attrs['aria-label']==='Tüm cihazlar'));
  allNodes.find(n=>n.attrs['aria-label']===`${inventory.devices[1].name} cihazını göster`).events.click();
  assert.equal(selected.at(-1),inventory.devices[1].id);
 }finally{delete globalThis.document;}
});
