export const deviceFilters=[
 {value:'all',name:'Tüm cihazlar',icon:'board'},
 {value:'hub',name:'Merkez',icon:'board'},
 {value:'camera',name:'Kameralar',icon:'camera'},
 {value:'historical',name:'Tarihsel kayıtlar',icon:'board'},
 {value:'other',name:'Diğer cihazlar',icon:'board'},
];
export function deviceGroup(device){
 if(device.id==='uno-history')return 'historical';
 if(device.icon==='camera')return 'camera';
 if(device.id==='hub')return 'hub';
 return 'other';
}
function searchText(value){
 return String(value??'').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
}
export function filterDevices(devices,filter='all',query=''){
 const words=searchText(query).trim().split(/\s+/).filter(Boolean);
 return devices.filter(device=>{
  if(filter!=='all'&&deviceGroup(device)!==filter)return false;
  const text=searchText([device.id,device.name,device.summary,...(device.presentation?.components||[]).map(part=>part.name)].join(' '));
  return words.every(word=>text.includes(word));
 });
}
export function filterChoices(devices,current='all'){
 return deviceFilters.map(choice=>({...choice,count:filterDevices(devices,choice.value).length}))
  .filter(choice=>choice.value==='all'||choice.value===current||choice.count>0)
  .map(choice=>({...choice,description:`${choice.count} cihaz kaydı`}));
}
