import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleConnections} from './connection-view.mjs';
import {editConnection,removeComponent} from './wiring-model.mjs';
const inventory=JSON.parse(readFileSync(new URL('./inventory.json',import.meta.url),'utf8'));
test('yükseltici hoparlörden gelen iki ucu tek kayıt üzerinden gösterir ve düzenler',()=>{
 const device=inventory.devices.find(d=>d.id==='hub'),parts=device.presentation.components;
 const amp=parts.findIndex(p=>p.icon==='amplifier'),speaker=parts.findIndex(p=>p.icon==='speaker');
 const before=JSON.stringify(inventory),wires=visibleConnections(device,amp);
 const incoming=wires.filter(c=>c.ownerIndex===speaker);
 assert.equal(incoming.length,2);
 for(const c of incoming){const original=parts[speaker].connections[c.wireIndex];assert.equal(c.terminal,original.target);assert.equal(c.target,original.terminal);assert.equal(c.targetComponent,speaker);}
 const c=incoming[0];
 const next=editConnection(inventory,'hub',c.ownerIndex,c.wireIndex,{terminal:'Hoparlör artı',target:'Amfi artı',targetComponent:amp,kind:c.kind});
 assert.equal(visibleConnections(next.devices.find(d=>d.id==='hub'),amp).find(w=>w.ownerIndex===speaker&&w.wireIndex===c.wireIndex).terminal,'Amfi artı');
 assert.equal(JSON.stringify(inventory),before);
 assert.equal(parts[amp].connections.length,wires.length-2);
});
test('hoparlör kaldırıldığında gelen uçlar görünümden de kalkar',()=>{
 const device=inventory.devices.find(d=>d.id==='hub'),speaker=device.presentation.components.findIndex(p=>p.icon==='speaker');
 const next=removeComponent(inventory,'hub',speaker).devices.find(d=>d.id==='hub');
 const amp=next.presentation.components.findIndex(p=>p.icon==='amplifier');
 assert.ok(visibleConnections(next,amp).every(c=>c.ownerIndex===amp));
});
