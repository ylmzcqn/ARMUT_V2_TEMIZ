import {normalizePin} from './hardware-map.mjs?v=cloud20261111-18';
import {validateInventory} from './inventory-core.mjs?v=cloud20261111-18';

function connectionValues(device,partIndex,values,inventory) {
  const terminal=String(values.terminal||'').trim(),target=String(values.target||'').trim(),owner=Number(values.targetComponent);
  if(!terminal||!target||terminal.length>48||target.length>48)throw new Error('İki uç için de 1–48 karakterlik bir ad girin.');
  if(!Number.isInteger(owner)||owner < -1||owner>=device.presentation.components.length||owner===partIndex||
     (owner>=0&&!Array.isArray(device.presentation.components[owner].connections)))throw new Error('Geçerli bir hedef modül seçin.');
  if(!['signal','clock','power','ground','unknown','conflict'].includes(values.kind))throw new Error('Geçerli bir hat türü seçin.');
  const profile=inventory.pinProfiles?.[device.hardware?.profileId];
  if(owner===-1&&profile&&/^GPIO\s*\d+$/i.test(target)&&!normalizePin(target,profile))throw new Error(`${target} bu cihazın pin profilinde yok.`);
  return {terminal,target,targetComponent:owner,kind:values.kind};
}

export function editConnection(inventory, deviceId, partIndex, wireIndex, values, time = new Date().toISOString()) {
  const next = structuredClone(inventory);
  const device = next.devices.find(d => d.id === deviceId);
  const part = device?.presentation?.components[partIndex];
  const wire = part?.connections?.[wireIndex];
  if (!wire) throw new Error('Bağlantı bulunamadı.');
  const normalized=connectionValues(device,partIndex,values,inventory);
  const previous = {terminal:wire.terminal,target:wire.target,targetComponent:wire.targetComponent ?? -1,kind:wire.kind};
  Object.assign(wire,normalized);
  if (JSON.stringify(previous) === JSON.stringify(normalized)) return inventory;
  wire.history = [...(wire.history || []),{...previous,changedAt:time}];
  delete wire.bus;
  wire.evidence = wire.evidence === 'user_added' ? 'user_added' : 'user_edit';
  validateInventory(next);
  return next;
}

export function addConnection(inventory,deviceId,partIndex,values,time=new Date().toISOString()) {
  const next=structuredClone(inventory),device=next.devices.find(d=>d.id===deviceId),part=device?.presentation?.components[partIndex];
  if(!part||!Array.isArray(part.connections))throw new Error('Bağlantı eklenebilecek bir modül seçin.');
  const normalized=connectionValues(device,partIndex,values,inventory);
  if(part.connections.some(c=>c.terminal===normalized.terminal&&c.target===normalized.target&&(c.targetComponent??-1)===normalized.targetComponent))throw new Error('Bu bağlantı zaten var.');
  part.connections.push({...normalized,evidence:'user_added',createdAt:time});
  validateInventory(next);return next;
}

export function removeComponent(inventory,deviceId,partIndex) {
  const next=structuredClone(inventory),device=next.devices.find(d=>d.id===deviceId),removed=device?.presentation?.components[partIndex];
  if(!removed||removed.icon==='board')throw new Error('Kart kaydı bu düğmeyle silinemez.');
  const claimMap=new Map(),deleted=new Set(removed.claimIndexes);
  device.claims=device.claims.filter((_,i)=>{if(deleted.has(i))return false;claimMap.set(i,claimMap.size);return true;});
  device.presentation.components.splice(partIndex,1);
  for(const part of device.presentation.components){
    part.claimIndexes=part.claimIndexes.map(i=>claimMap.get(i));
    if(!part.connections)continue;
    part.connections=part.connections.filter(c=>c.targetComponent!==partIndex);
    for(const c of part.connections){
      if(Number.isInteger(c.claimIndex))c.claimIndex=claimMap.get(c.claimIndex);
      if(c.targetComponent>partIndex)c.targetComponent--;
      for(const old of c.history||[]){
        if(old.targetComponent===partIndex){old.targetName=removed.name;old.targetRemoved=true;old.targetComponent=-1;}
        else if(old.targetComponent>partIndex)old.targetComponent--;
      }
    }
  }
  const remaining=device.presentation.components.filter(p=>p.icon!=='board');
  const card=device.presentation.facts[0];
  device.summary=`${card.value} · ${remaining.map(p=>p.name).join(', ')||'Ek modül kaydı yok'}`;
  device.presentation.facts=[card,{label:'Modül kaydı',value:String(remaining.length)},{label:'Canlı durum',value:'Bu işlemde ölçülmedi'}];
  device.presentation.notice='Envanter kullanıcı tarafından düzenlendi. Kalan modüllerin kaynak, bilinmeyen ve farklı kayıtları ayrıntılarındaki kanıtlar altında korunur.';
  const used=new Set(next.devices.flatMap(d=>[...d.claims.flatMap(c=>c.sources),...(d.hardware?.reservations||[]).flatMap(r=>r.sourceIds),...(d.hardware?.notes||[]).flatMap(n=>n.sourceIds),...(d.hardware?.availability||[]).flatMap(a=>a.sourceIds),...(d.hardware?.boardVerification.sourceIds||[])]));
  for(const item of next.exclusions||[])for(const id of item.sources)used.add(id);
  for(const id of Object.keys(next.sources))if(!used.has(id))delete next.sources[id];
  validateInventory(next);return next;
}

export function serializeInventory(data) {
  validateInventory(data);
  return JSON.stringify(data,null,2)+'\n';
}

export function parseInventory(text) {
  let data;
  try { data=JSON.parse(text); } catch { throw new Error('Dosya geçerli JSON değil.'); }
  return validateInventory(data);
}
