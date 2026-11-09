import {normalizePin} from './hardware-map.mjs?v=cloud20261110-10';
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const date=x=>text(x)&&Number.isFinite(Date.parse(x));
export function validateHardwareInventory(data,fail){
 const references=data.hardwareReferences||{},profiles=data.pinProfiles||{};
 const sourceIds=x=>Array.isArray(x)&&x.length>0&&x.every(id=>Object.hasOwn(data.sources,id));
 const referenceIds=x=>Array.isArray(x)&&x.length>0&&x.every(id=>Object.hasOwn(references,id));
 if(!obj(references)||!obj(profiles))fail();
 for(const r of Object.values(references))if(!obj(r)||!text(r.title)||!/^https:\/\//.test(r.url)||!date(r.reviewedAt)||!text(r.scope))fail();
 for(const p of Object.values(profiles)){
  if(!obj(p)||!text(p.name)||!Array.isArray(p.pins)||!p.pins.length||p.pins.some(pin=>!text(pin))||new Set(p.pins).size!==p.pins.length||!obj(p.aliases)||!referenceIds(p.referenceIds)||!Array.isArray(p.rules))fail();
  if(p.capabilities!==undefined){if(!obj(p.capabilities))fail();for(const [pin,items] of Object.entries(p.capabilities))if(!p.pins.includes(pin)||!Array.isArray(items)||!items.length||items.some(value=>!text(value)))fail();}
  for(const [alias,pin] of Object.entries(p.aliases))if(!text(alias)||p.pins.includes(alias)||!p.pins.includes(pin))fail();
  for(const r of p.rules)if(!obj(r)||!Array.isArray(r.pins)||!r.pins.length||r.pins.some(pin=>!p.pins.includes(pin))||!['reserved','caution'].includes(r.level)||!text(r.reason)||!referenceIds(r.referenceIds))fail();
 }
 for(const d of data.devices){
  const h=d.hardware;
  if(h!==undefined){
   const p=profiles[h?.profileId];if(!obj(h)||!p||!obj(h.boardVerification)||!['unverified','verified'].includes(h.boardVerification.status)||!Array.isArray(h.reservations)||!Array.isArray(h.notes))fail();
   if(h.boardVerification.status==='verified'&&(!sourceIds(h.boardVerification.sourceIds)||!date(h.boardVerification.checkedAt)))fail();
   for(const r of h.reservations)if(!obj(r)||!p.pins.includes(r.pin)||!text(r.reason)||!sourceIds(r.sourceIds))fail();
   for(const n of h.notes)if(!obj(n)||!text(n.text)||!sourceIds(n.sourceIds))fail();
   if(h.availability!==undefined){if(!Array.isArray(h.availability)||new Set(h.availability.map(a=>a.pin)).size!==h.availability.length)fail();for(const a of h.availability)if(!p.pins.includes(a.pin)||a.state!=='available'||!sourceIds(a.sourceIds)||!date(a.checkedAt)||!text(a.reason))fail();}
  }
  for(const p of d.presentation?.components||[]){
   if(p.hardwareState!==undefined&&!['historical','configured','documented','unknown'].includes(p.hardwareState))fail();
   for(const c of p.connections||[]){
    if(d.hardware&&(c.targetComponent??-1)<0&&/^GPIO\s*\d+$/i.test(c.target)&&!normalizePin(c.target,profiles[d.hardware.profileId]))fail();
    if(c.bus!==undefined&&!text(c.bus))fail();if(c.controllerEndpoint!==undefined&&!['terminal','target'].includes(c.controllerEndpoint))fail();}
  }
 }
}
