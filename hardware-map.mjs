export const pinStatusLabels={used:'Kayıtlı kullanım',shared:'Ortak hat',reserved:'Ayrılmış',restricted:'Kısıtlı',historical:'Tarihsel kullanım',conflict:'İncelenmeli',unknown:'Bağlantı kaydı yok',available:'Kullanılabilirliği doğrulanmış'};
export function normalizePin(value,profile){
 if(!profile||typeof value!=='string')return null;
 let key=value.trim().toUpperCase().replace(/^GPIO\s*0*(\d+)$/,'GPIO$1');
 key=profile.aliases?.[key]||key;
 return profile.pins.includes(key)?key:null;
}
export function analyzeHardware(inventory,deviceId){
 const device=inventory.devices.find(d=>d.id===deviceId);if(!device)throw Error('Cihaz bulunamadı.');
 const profile=inventory.pinProfiles?.[device.hardware?.profileId];
 const parts=device.presentation?.components||[],pins=(profile?.pins||[]).map(pin=>({pin,capabilities:profile.capabilities?.[pin]||[],status:'unknown',assignments:[],constraints:[],sourceIds:[],referenceIds:[...(profile.referenceIds||[])]}));
 const rows=new Map(pins.map(row=>[row.pin,row])),links=[],unresolved=[],issues=[];
 for(const rule of profile?.rules||[])for(const pin of rule.pins){const row=rows.get(pin);row.constraints.push({level:rule.level,reason:rule.reason});row.referenceIds.push(...rule.referenceIds);}
 for(const reserved of device.hardware?.reservations||[]){const row=rows.get(reserved.pin);if(row){row.constraints.push({level:'reserved',reason:reserved.reason});row.sourceIds.push(...reserved.sourceIds);}}
 parts.forEach((part,partIndex)=>{for(const [wireIndex,c] of (part.connections||[]).entries()){
  const claim=device.claims[c.claimIndex],sources=claim?.sources||[];
  const entry={partIndex,wireIndex,part:part.name,terminal:c.terminal,target:c.target,targetComponent:c.targetComponent??-1,kind:c.kind,evidence:c.evidence||claim?.kind||'unknown',historical:part.hardwareState==='historical'||device.id==='uno-history',sourceIds:sources,claimIndex:c.claimIndex,bus:c.evidence?null:c.bus||null};
  if((c.targetComponent??-1)>=0){links.push(entry);continue;}
  let endpoint=c.controllerEndpoint==='terminal'?c.terminal:c.target;
  if(device.hardware?.profileId==='uno-r3')endpoint=endpoint.replace(/^Uno\s+/i,'');
  const pin=normalizePin(endpoint,profile);
  if(pin){const row=rows.get(pin);row.assignments.push(entry);row.sourceIds.push(...sources);}
  else if(c.kind==='power'||c.kind==='ground')links.push({...entry,rail:true});
  else unresolved.push(entry);
 }});
 for(const row of pins){
  const active=row.assignments.filter(a=>!a.historical),historical=row.assignments.filter(a=>a.historical);
  const shared=active.length>1&&active.every(a=>a.bus&&a.bus===active[0].bus&&a.kind===active[0].kind);
  if(active.length>1&&!shared){row.status='conflict';issues.push({pin:row.pin,message:'Birden fazla atama; ortak hat olduğu doğrulanmamış.'});}
  else if(active.length)row.status=shared?'shared':'used';
  else if(row.constraints.some(c=>c.level==='reserved'))row.status='reserved';
  else if(historical.length)row.status='historical';
  else if(row.constraints.length)row.status='restricted';
  const assessment=device.hardware?.availability?.find(a=>a.pin===row.pin);
  if(row.status==='unknown'&&device.hardware?.boardVerification.status==='verified'&&assessment?.state==='available'){
   row.status='available';row.sourceIds.push(...assessment.sourceIds);row.constraints.push({level:'info',reason:`Doğrulama: ${assessment.checkedAt} · ${assessment.reason}`});
  }
  row.sourceIds=[...new Set(row.sourceIds)];row.referenceIds=[...new Set(row.referenceIds)];row.label=pinStatusLabels[row.status];
 }
 for(const c of unresolved)issues.push({partIndex:c.partIndex,wireIndex:c.wireIndex,message:`${c.part} · ${c.terminal}: uç eşlemesi belirsiz (${c.target}).`});
 const ids=new Set([...pins.flatMap(p=>p.sourceIds),...links.flatMap(l=>l.sourceIds),...unresolved.flatMap(l=>l.sourceIds),...device.claims.flatMap(c=>c.sources),...(device.hardware?.boardVerification.sourceIds||[]),...(device.hardware?.notes||[]).flatMap(n=>n.sourceIds)]);
 const sources=Object.fromEntries([...ids].map(id=>[id,inventory.sources[id]]));
 return {claims:device.claims,sources,references:Object.fromEntries([...new Set([...(profile?.referenceIds||[]),...(profile?.rules||[]).flatMap(rule=>rule.referenceIds)])].map(id=>[id,inventory.hardwareReferences[id]])),deviceId:device.id,name:device.name,profileId:device.hardware?.profileId||null,profileName:profile?.name||'Pin profili tanımlanmamış',boardVerification:structuredClone(device.hardware?.boardVerification||{status:'unverified'}),boardVerified:device.hardware?.boardVerification.status==='verified',pins,links,unresolved,issues,notes:device.hardware?.notes||[],scope:'Envanter ve kaynak kayıtları; fiziksel boşluk veya canlı durum ölçümü değildir.'};
}
export function assignmentWarnings(inventory,deviceId,partIndex,wireIndex){
 const report=analyzeHardware(inventory,deviceId),messages=[];
 for(const row of report.pins){if(!row.assignments.some(a=>a.partIndex===partIndex&&a.wireIndex===wireIndex))continue;
  if(row.status==='conflict')messages.push(`${row.pin}: başka atama var; ortak hat doğrulanmamış.`);
  for(const c of row.constraints)if(c.level!=='info')messages.push(`${row.pin}: ${c.reason}`);
  if(row.assignments.some(a=>a.historical)&&row.assignments.some(a=>!a.historical))messages.push(`${row.pin}: tarihsel bağlantının fiziksel durumu doğrulanmalı.`);
 }
 for(const issue of report.unresolved)if(issue.partIndex===partIndex&&issue.wireIndex===wireIndex)messages.push('GPIO olarak eşleştirilemeyen uç: '+issue.target);
 return [...new Set(messages)];
}
