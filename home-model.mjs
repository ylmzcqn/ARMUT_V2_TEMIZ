export const modes={home:'Evde',away:'Dışarıda',sleep:'Uyku',guest:'Misafir'};
export const collections=['rooms','entities','cameras','automations','scenes'];
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=160;
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9][\w.-]{0,95}$/.test(x);
const fail=message=>{throw new Error(message);};
export function validEndpoint(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.hash;}catch{return false;}}
export function emptyHome(){return {version:1,rooms:[],entities:[],cameras:[],automations:[],scenes:[],mode:'home',settings:{statusUrl:'',commandUrl:'',timeZone:'Europe/Istanbul',manualHoldMinutes:30},events:[]};}
export function validateHome(h){
 if(!obj(h)||h.version!==1||!Object.hasOwn(modes,h.mode)||!obj(h.settings)||!Array.isArray(h.events)||h.events.length>200)fail('Ev dosyasının biçimi geçersiz.');
 for(const key of collections){if(!Array.isArray(h[key])||h[key].length>200)fail('Kayıt sınırı veya biçimi geçersiz.');const ids=new Set();for(const r of h[key]){if(!obj(r)||!id(r.id)||ids.has(r.id)||!text(r.name))fail('Kayıt adı veya kimliği geçersiz.');ids.add(r.id);}}
 for(const room of h.rooms)if(!Array.isArray(room.deviceIds)||room.deviceIds.some(v=>!id(v))||new Set(room.deviceIds).size!==room.deviceIds.length)fail('Oda cihazları geçersiz.');
 const roomExists=v=>v===''||h.rooms.some(r=>r.id===v);
 for(const e of h.entities)if(!id(e.deviceId)||!roomExists(e.roomId)||!['switch','sensor','presence'].includes(e.kind))fail('İşlevin cihazı, odası veya türü geçersiz.');
 const action=a=>obj(a)&&typeof a.value==='boolean'&&h.entities.some(e=>e.id===a.entityId&&e.kind==='switch');
 if(new Set(h.cameras.map(c=>c.deviceId)).size!==h.cameras.length)fail('Aynı cihaz için birden fazla kamera bağlantısı olamaz.');
 for(const c of h.cameras)if(!id(c.deviceId)||!roomExists(c.roomId)||!validEndpoint(c.url)||!['jpeg','mjpeg'].includes(c.transport)||(c.profileUrl&&!validEndpoint(c.profileUrl)))fail('Kamera adresi veya ayarı geçersiz.');
 for(const a of h.automations){if(typeof a.enabled!=='boolean'||!['time','state','mode'].includes(a.trigger)||!(a.mode===''||Object.hasOwn(modes,a.mode))||!action(a.action))fail('Otomasyonun hedefi veya koşulu geçersiz.');if(a.trigger==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time))fail('Saat HH:MM biçiminde olmalı.');if(a.trigger==='state'&&(!h.entities.some(e=>e.id===a.sourceId)||typeof a.expected!=='boolean'))fail('Tetikleyici geçersiz.');if(a.trigger==='mode'&&!Object.hasOwn(modes,a.expectedMode))fail('Ev modu geçersiz.');if(typeof a.observeOnly!=='boolean')fail('İzleme seçimi gerekli.');if(a.lastRun&&(!obj(a.lastRun)||!Number.isFinite(Date.parse(a.lastRun.at))||!text(a.lastRun.result)||typeof a.lastRun.message!=='string'))fail('Son çalışma kaydı geçersiz.');}
 for(const s of h.scenes)if(!Array.isArray(s.actions)||!s.actions.length||s.actions.length>32||s.actions.some(a=>!action(a)))fail('Sahne eylemleri geçersiz.');
 for(const key of ['statusUrl','commandUrl'])if(typeof h.settings[key]!=='string'||(h.settings[key]&&!validEndpoint(h.settings[key])))fail('Bağlantı adresi geçersiz.');
 if(!text(h.settings.timeZone))fail('Saat dilimi gerekli.');
 try{new Intl.DateTimeFormat('tr',{timeZone:h.settings.timeZone}).format();}catch{fail('Saat dilimi geçersiz.');}
 if(!Number.isInteger(h.settings.manualHoldMinutes)||h.settings.manualHoldMinutes<0||h.settings.manualHoldMinutes>1440)fail('Manuel öncelik süresi geçersiz.');
 for(const event of h.events)if(!obj(event)||!text(event.id)||!text(event.at)||!Number.isFinite(Date.parse(event.at))||!text(event.kind)||typeof event.message!=='string'||event.message.length>1000||!['ok','error','pending','observed','unknown','skipped'].includes(event.result))fail('Geçmiş kaydı geçersiz.');
 return h;
}
export function saveRecord(home,collection,record){if(!collections.includes(collection))fail('Bilinmeyen kayıt türü.');const h=structuredClone(home);const index=h[collection].findIndex(r=>r.id===record.id);if(index<0)h[collection].push(structuredClone(record));else h[collection][index]=structuredClone(record);return validateHome(h);}
export function deleteRecord(home,collection,key){const h=structuredClone(home);if(!collections.includes(collection))fail('Kayıt türü geçersiz.');h[collection]=h[collection].filter(r=>r.id!==key);if(collection==='rooms'){for(const e of [...h.entities,...h.cameras])if(e.roomId===key)e.roomId='';}if(collection==='entities'){h.automations=h.automations.filter(a=>a.sourceId!==key&&a.action.entityId!==key);h.scenes=h.scenes.map(s=>({...s,actions:s.actions.filter(a=>a.entityId!==key)})).filter(s=>s.actions.length);}return validateHome(h);}
export function ruleMatches(rule,event,mode){if(!rule.enabled||(rule.mode&&rule.mode!==mode))return false;if(rule.trigger==='state')return event.fresh===true&&event.entityId===rule.sourceId&&event.value===rule.expected;if(rule.trigger==='mode')return event.mode===rule.expectedMode;return false;}
export function serializeBackup(home){return JSON.stringify(validateHome(home),null,2);}
export function parseBackup(text){if(typeof text!=='string'||text.length>1000000)fail('Yedek dosyası çok büyük.');return validateHome(JSON.parse(text));}
