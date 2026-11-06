// Görünüm iki yönlüdür; veri ve düzenleme sahipliği tek kayıtta kalır.
export function visibleConnections(device,partIndex) {
 const parts=device.presentation.components;
 const own=(parts[partIndex].connections||[]).map((wire,wireIndex)=>({...wire,ownerIndex:partIndex,wireIndex}));
 const incoming=[];
 parts.forEach((part,ownerIndex)=>{
  if(ownerIndex===partIndex)return;
  (part.connections||[]).forEach((wire,wireIndex)=>{
   if(wire.targetComponent!==partIndex)return;
   incoming.push({...wire,terminal:wire.target,target:wire.terminal,targetComponent:ownerIndex,ownerIndex,wireIndex});
  });
 });
 return [...own,...incoming];
}
