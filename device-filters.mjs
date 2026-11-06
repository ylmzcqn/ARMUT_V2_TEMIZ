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
export function filterDevices(devices,filter='all'){
 return filter==='all'?devices:devices.filter(device=>deviceGroup(device)===filter);
}
export function filterChoices(devices,current='all'){
 return deviceFilters.map(choice=>({...choice,count:filterDevices(devices,choice.value).length}))
  .filter(choice=>choice.value==='all'||choice.value===current||choice.count>0)
  .map(choice=>({...choice,description:`${choice.count} cihaz kaydı`}));
}
