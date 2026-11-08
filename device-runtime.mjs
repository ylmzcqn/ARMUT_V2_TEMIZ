// Ağ ve donanımdan bağımsızdır. Yalnız kimliği doğrulanmış adaptör veri verebilir.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value);
const fail=reason=>{throw new Error(`Cihaz durumu reddedildi: ${reason}`);};
function uniqueIds(values){return Array.isArray(values)&&values.length<=64&&values.every(id)&&new Set(values).size===values.length;}
function validateRegistry(registry){
 if(!Array.isArray(registry)||registry.length>64)fail('cihaz kaydı');
 const result=new Map();
 for(const record of registry){
  if(!object(record)||!id(record.deviceId)||!id(record.role)||result.has(record.deviceId)||!uniqueIds(record.capabilities)||!Array.isArray(record.components)||record.components.length>64)fail('cihaz kimliği veya yetenek kaydı');
  const components=new Map();
  for(const part of record.components){
   if(!object(part)||!id(part.componentId)||components.has(part.componentId)||!uniqueIds(part.capabilities))fail('bileşen kaydı');
   components.set(part.componentId,structuredClone(part));
  }
  result.set(record.deviceId,{...structuredClone(record),components});
 }
 return result;
}

export function createDeviceRuntime(registry,{now=()=>performance.now(),delayedAfterMs=15000,staleAfterMs=30000}={}){
 if(typeof now!=='function'||!Number.isFinite(delayedAfterMs)||!Number.isFinite(staleAfterMs)||delayedAfterMs<=0||staleAfterMs<=delayedAfterMs)fail('zaman politikası');
 const records=validateRegistry(registry),observations=new Map(),sessions=new Set();
 let sessionId=null,connected=false,lastClock=-Infinity;
 function clock(){const value=now();if(!Number.isFinite(value)||value<lastClock)fail('monotonik saat');lastClock=value;return value;}
 function beginSession(next){
  if(!id(next)||sessions.has(next))fail('yeni ve tekil adaptör oturumu gerekli');
  // Oturum kimliği kimlik doğrulama değildir; adaptör yetkilendirmeyi dışarıda yapar.
  sessions.add(next);sessionId=next;connected=true;observations.clear();
 }
 function ingest(message){
  if(!connected||!sessionId)fail('adaptör bağlı değil');
  if(!object(message)||message.schemaVersion!==1||message.sessionId!==sessionId)fail('sürüm veya oturum');
  const record=records.get(message.deviceId);
  if(!record||message.role!==record.role)fail('kayıtsız cihaz veya yanlış rol');
  if(!id(message.bootId)||!Number.isSafeInteger(message.sequence)||message.sequence<0||typeof message.online!=='boolean')fail('kimlik veya durum biçimi');
  if(message.observationAgeMs!==null&&(!Number.isFinite(message.observationAgeMs)||message.observationAgeMs<0))fail('gözlem yaşı');
  if(!uniqueIds(message.capabilities)||message.capabilities.some(value=>!record.capabilities.includes(value)))fail('kayıt dışı yetenek');
  if(!Array.isArray(message.components)||message.components.length>64)fail('bileşenler');
  const seen=new Set();
  for(const part of message.components){
   if(!object(part)||!record.components.has(part.componentId)||seen.has(part.componentId)||typeof part.online!=='boolean')fail('bileşen kimliği veya durumu');
   seen.add(part.componentId);
  }
  const previous=observations.get(message.deviceId);
  if(previous&&message.sequence<=previous.sequence)fail('tekrar veya sırasız mesaj');
  // Yalnız sözleşmedeki alanlar taşınır; dış JSON çalıştırılabilir komut değildir.
  const normalized={deviceId:message.deviceId,role:message.role,bootId:message.bootId,sequence:message.sequence,online:message.online,observationAgeMs:message.observationAgeMs,capabilities:[...message.capabilities],components:message.components.map(part=>({componentId:part.componentId,online:part.online})),receivedAt:clock()};
  const result=project(normalized,normalized.receivedAt);
  observations.set(message.deviceId,normalized);
  return result;
 }
 function status(deviceId){
  if(!records.has(deviceId))return {deviceId,state:'unregistered',components:[]};
  const observation=observations.get(deviceId);
  if(!observation)return {deviceId,state:'unknown',components:[]};
  return project(observation,clock());
 }
 function project(observation,time){
  const ageMs=observation.observationAgeMs===null?null:observation.observationAgeMs+time-observation.receivedAt;
  const state=!connected?'disconnected':ageMs===null?'unknown':ageMs>staleAfterMs?'stale':ageMs>delayedAfterMs?'delayed':observation.online?'online':'offline';
  return {...structuredClone(observation),ageMs,state};
 }
 return Object.freeze({beginSession,ingest,status,disconnect(){connected=false;},snapshot(){return [...records.keys()].map(status);}});
}
