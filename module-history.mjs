import {visibleConnections} from './connection-view.mjs?v=cloud20261110-9';
export function moduleActivity(device,index) {
 const part=device.presentation.components[index],events=[];
 for(const c of visibleConnections(device,index)){
  const original=device.presentation.components[c.ownerIndex].connections[c.wireIndex];
  if(original.createdAt)events.push({time:original.createdAt,text:`Bağlantı eklendi: ${original.terminal} → ${original.target}`});
  (original.history||[]).forEach((old,i,history)=>{
   const next=history[i+1]||original;
   events.push({time:old.changedAt,text:`${old.terminal} → ${old.target} değiştirildi: ${next.terminal} → ${next.target} (${next.kind})`});
  });
 }
 const valid=time=>typeof time==='string'&&Number.isFinite(Date.parse(time));
 events.sort((a,b)=>(Date.parse(b.time)||0)-(Date.parse(a.time)||0));
 return {createdAt:valid(part.createdAt)?part.createdAt:null,lastChanged:events.find(e=>valid(e.time))?.time||null,events,connections:visibleConnections(device,index).length};
}
