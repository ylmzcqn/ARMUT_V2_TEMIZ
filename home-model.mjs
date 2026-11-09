export const modes={home:'Evde',away:'Dışarıda',sleep:'Uyku',guest:'Misafir'};
export const collections=['rooms','entities','cameras','automations','scenes'];
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=160;
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9][\w.-]{0,95}$/.test(x);
const fail=message=>{throw new Error(message);};
export function validEndpoint(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.hash;}catch{return false;}}
export function emptyHome(){return {version:1,devices:[],ignoredEntities:[],rooms:[],entities:[],cameras:[],automations:[],scenes:[],mode:'home',settings:{statusUrl:'',commandUrl:'',timeZone:'Europe/Istanbul',manualHoldMinutes:30},events:[]};}
export function validateHome(h){
 if(!obj(h)||h.version!==1||!Object.hasOwn(modes,h.mode)||!obj(h.settings)||!Array.isArray(h.events)||h.events.length>200)fail('Ev dosyasının biçimi geçersiz.');
 if(h.devices!==undefined){if(!Array.isArray(h.devices)||h.devices.length>64)fail('Cihaz kataloğu geçersiz.');const ids=new Set();for(const d of h.devices){if(!obj(d)||!id(d.id)||!text(d.name)||!['hub','camera','node'].includes(d.role)||ids.has(d.id))fail('Cihaz kimliği/rolü geçersiz.');ids.add(d.id);}}
 if(h.ignoredEntities!==undefined){if(!Array.isArray(h.ignoredEntities)||h.ignoredEntities.length>200)fail('Hariç tutulan işlevler geçersiz.');const ids=new Set();for(const e of h.ignoredEntities){if(!obj(e)||!id(e.id)||!id(e.deviceId)||ids.has(e.id)||h.entities?.some(r=>r.id===e.id))fail('Hariç tutulan işlev kimliği geçersiz.');ids.add(e.id);}}
 for(const key of collections){if(!Array.isArray(h[key])||h[key].length>200)fail('Kayıt sınırı veya biçimi geçersiz.');const ids=new Set();for(const r of h[key]){if(!obj(r)||!id(r.id)||ids.has(r.id)||!text(r.name))fail('Kayıt adı veya kimliği geçersiz.');ids.add(r.id);}}
 for(const room of h.rooms)if(!Array.isArray(room.deviceIds)||room.deviceIds.some(v=>!id(v))||new Set(room.deviceIds).size!==room.deviceIds.length)fail('Oda cihazları geçersiz.');
 const roomExists=v=>v===''||h.rooms.some(r=>r.id===v);
 for(const e of h.entities){if(e.channelId!==undefined&&!id(e.channelId))fail('Kanal kimliği geçersiz.');if(e.unit!==undefined&&(typeof e.unit!=='string'||e.unit.length>24))fail('Sensör birimi geçersiz.');if(!id(e.deviceId)||!roomExists(e.roomId)||!['switch','sensor','presence'].includes(e.kind))fail('İşlevin cihazı, odası veya türü geçersiz.');}
 const action=a=>obj(a)&&typeof a.value==='boolean'&&h.entities.some(e=>e.id===a.entityId&&e.kind==='switch');
 if(new Set(h.cameras.map(c=>c.deviceId)).size!==h.cameras.length)fail('Aynı cihaz için birden fazla kamera bağlantısı olamaz.');
 for(const c of h.cameras)if(!id(c.deviceId)||!roomExists(c.roomId)||!validEndpoint(c.url)||!['jpeg','mjpeg'].includes(c.transport)||(c.profileUrl&&!validEndpoint(c.profileUrl)))fail('Kamera adresi veya ayarı geçersiz.');
 for(const a of h.automations){if(a.days!==undefined&&(!Array.isArray(a.days)||!a.days.length||a.days.length>7||new Set(a.days).size!==a.days.length||a.days.some(d=>!Number.isInteger(d)||d<0||d>6)))fail('En az bir geçerli gün seçin.');if(a.cooldownSeconds!==undefined&&(!Number.isInteger(a.cooldownSeconds)||a.cooldownSeconds<0||a.cooldownSeconds>86400))fail('Bekleme süresi 0–86400 saniye olmalı.');if(typeof a.enabled!=='boolean'||!['time','state','mode','numeric'].includes(a.trigger)||!(a.mode===''||Object.hasOwn(modes,a.mode))||!action(a.action))fail('Otomasyonun hedefi veya koşulu geçersiz.');if(a.trigger==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time))fail('Saat HH:MM biçiminde olmalı.');if(a.trigger==='state'&&(!h.entities.some(e=>e.id===a.sourceId)||typeof a.expected!=='boolean'))fail('Tetikleyici geçersiz.');if(a.trigger==='numeric'&&(!h.entities.some(e=>e.id===a.sourceId&&e.kind==='sensor')||!['above','below'].includes(a.operator)||!Number.isFinite(a.threshold)))fail('Sayısal sensör eşiği geçersiz.');if(a.trigger==='mode'&&!Object.hasOwn(modes,a.expectedMode))fail('Ev modu geçersiz.');if(typeof a.observeOnly!=='boolean')fail('İzleme seçimi gerekli.');for(const key of ['lastRun','lastPreview'])if(a[key]&&(!obj(a[key])||!Number.isFinite(Date.parse(a[key].at))||!['ok','error','pending','observed','unknown','skipped'].includes(a[key].result)||typeof a[key].message!=='string'))fail('Son çalışma/deneme kaydı geçersiz.');}
 for(const s of h.scenes){if(!Array.isArray(s.actions)||!s.actions.length||s.actions.length>32||s.actions.some(a=>!action(a)))fail('Sahne eylemleri geçersiz.');for(const key of ['lastRun','lastPreview'])if(s[key]){const r=s[key];if(!obj(r)||!Number.isFinite(Date.parse(r.at))||!['ok','error','unknown','observed','skipped'].includes(r.result)||typeof r.message!=='string'||r.message.length>1000||!Number.isInteger(r.completed)||!Number.isInteger(r.total)||r.completed<0||r.total<1||r.total>32||r.completed>r.total)fail('Sahne sonucu geçersiz.');}}
 for(const key of ['statusUrl','commandUrl'])if(typeof h.settings[key]!=='string'||(h.settings[key]&&!validEndpoint(h.settings[key])))fail('Bağlantı adresi geçersiz.');
 if(!text(h.settings.timeZone))fail('Saat dilimi gerekli.');
 try{new Intl.DateTimeFormat('tr',{timeZone:h.settings.timeZone}).format();}catch{fail('Saat dilimi geçersiz.');}
 if(!Number.isInteger(h.settings.manualHoldMinutes)||h.settings.manualHoldMinutes<0||h.settings.manualHoldMinutes>1440)fail('Manuel öncelik süresi geçersiz.');
 for(const event of h.events)if(!obj(event)||!text(event.id)||!text(event.at)||!Number.isFinite(Date.parse(event.at))||!text(event.kind)||typeof event.message!=='string'||event.message.length>1000||!['ok','error','pending','observed','unknown','skipped'].includes(event.result))fail('Geçmiş kaydı geçersiz.');
 return h;
}
export function saveRecord(home,collection,record){if(!collections.includes(collection))fail('Bilinmeyen kayıt türü.');const h=structuredClone(home);const index=h[collection].findIndex(r=>r.id===record.id);if(index<0)h[collection].push(structuredClone(record));else h[collection][index]=structuredClone(record);return validateHome(h);}
export function deleteRecord(home,collection,key){const h=structuredClone(home);if(!collections.includes(collection))fail('Kayıt türü geçersiz.');const removed=h[collection].find(r=>r.id===key);h[collection]=h[collection].filter(r=>r.id!==key);if(collection==='entities'&&removed?.channelId)h.ignoredEntities=[...(h.ignoredEntities||[]).filter(e=>e.id!==key),{id:key,deviceId:removed.deviceId}];if(collection==='rooms'){for(const e of [...h.entities,...h.cameras])if(e.roomId===key)e.roomId='';}if(collection==='entities'){h.automations=h.automations.filter(a=>a.sourceId!==key&&a.action.entityId!==key);h.scenes=h.scenes.map(s=>({...s,actions:s.actions.filter(a=>a.entityId!==key)})).filter(s=>s.actions.length);}return validateHome(h);}
export function ruleMatches(rule,event,mode){if(!rule.enabled||(rule.mode&&rule.mode!==mode))return false;if(rule.trigger==='numeric')return event.fresh===true&&event.entityId===rule.sourceId&&Number.isFinite(event.value)&&Number.isFinite(event.previousValue)&&(rule.operator==='above'?event.previousValue<=rule.threshold&&event.value>rule.threshold:event.previousValue>=rule.threshold&&event.value<rule.threshold);if(rule.trigger==='state')return event.fresh===true&&event.entityId===rule.sourceId&&event.value===rule.expected;if(rule.trigger==='mode')return event.mode===rule.expectedMode;return false;}
export function serializeBackup(home){return JSON.stringify(validateHome(home),null,2);}
export function parseBackup(text){if(typeof text!=='string'||text.length>1000000)fail('Yedek dosyası çok büyük.');return validateHome(JSON.parse(text));}

export const weekDays=[[1,'Pazartesi'],[2,'Salı'],[3,'Çarşamba'],[4,'Perşembe'],[5,'Cuma'],[6,'Cumartesi'],[0,'Pazar']];
export function ruleAppliesOnDay(rule,timestamp,timeZone){if(rule.days===undefined)return true;const day=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short'}).format(new Date(timestamp));return rule.days.includes(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(day));}
function normalizedSearch(value){return String(value).toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').trim();}
export function filterHistory(events,{query='',result='all',kind='all'}={}){const words=normalizedSearch(query).split(/\s+/).filter(Boolean);return events.filter(event=>(result==='all'||event.result===result)&&(kind==='all'||event.kind===kind)&&words.every(word=>normalizedSearch(event.message).includes(word)));}

export function deletionImpact(home,collection,key){
 const record=home[collection]?.find(r=>r.id===key);if(!record)fail('Kayıt bulunamadı.');const next=deleteRecord(home,collection,key);
 const removed=(list,other)=>list.filter(r=>!other.some(n=>n.id===r.id)).map(r=>r.name);
 return {name:record.name,removedRules:removed(home.automations,next.automations),removedScenes:removed(home.scenes,next.scenes),changedScenes:home.scenes.filter(s=>next.scenes.some(n=>n.id===s.id&&JSON.stringify(n.actions)!==JSON.stringify(s.actions))).map(s=>s.name),unassignedEntities:home.entities.filter(e=>e.roomId&&next.entities.some(n=>n.id===e.id&&n.roomId==='')).map(e=>e.name),unassignedCameras:home.cameras.filter(e=>e.roomId&&next.cameras.some(n=>n.id===e.id&&n.roomId==='')).map(e=>e.name)};
}

// Logical view of the existing physical component; never enrolls another device.
export function bindCameraPresence(home){
 const next=structuredClone(home),matches=next.entities.filter(e=>e.deviceId==='camera-02'&&e.kind==='presence');
 if(matches.length>1)throw new Error('Kamera 2 varlık işlevi eşlemesi belirsiz.');
 if(matches.length){if(matches[0].channelId&&matches[0].channelId!=='presence-radar')throw new Error('Mevcut varlık işlevi başka kanala bağlı.');matches[0].channelId='presence-radar';return {home:validateHome(next),entityId:matches[0].id};}
 const ignored=(next.ignoredEntities||[]).find(e=>e.deviceId==='camera-02'&&e.id==='presence-radar');
 if(!ignored){if(next.entities.some(e=>e.id==='presence-radar'))throw new Error('Varlık bileşeni kimliği başka işlevde kullanılıyor.');next.entities.push({id:'presence-radar',deviceId:'camera-02',channelId:'presence-radar',name:'Varlık sensörü',kind:'presence',roomId:''});}
 return {home:validateHome(next),entityId:'presence-radar'};
}
