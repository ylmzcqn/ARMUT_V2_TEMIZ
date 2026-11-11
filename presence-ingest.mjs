// One fixed radar publisher; no commands, camera images, LAN addressing or inventory writes.
const reject=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const hex=/^[a-f0-9]{8,64}$/i;
const encode=new TextEncoder();
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const nonce=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export async function validPublisher(header,key){
 if(typeof key!=='string'||key.length<32||key.length>256)return false;
 const supplied=header?.match(/^Bearer ([\x21-\x7e]{1,256})$/)?.[1];if(!supplied)return false;
 const a=await hash(supplied),b=await hash(key);let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0;
}
export function createD1PresenceStore(binding){
 const db=binding.withSession?binding.withSession('first-primary'):binding;
 return {async load(deviceId='camera-02'){const row=await db.prepare('SELECT revision,state_json FROM presence_state WHERE device_id=?').bind(deviceId).first();return row?{revision:row.revision,state:JSON.parse(row.state_json)}:null;},async loadAll(){const res=await db.prepare('SELECT device_id,revision,state_json FROM presence_state').all?.()||{results:[]};return (res.results||[]).map(r=>({deviceId:r.device_id,revision:r.revision,state:JSON.parse(r.state_json)}));},async save(previous,state,deviceId='camera-02'){
  const revision=(previous?.revision||0)+1;if(!Number.isSafeInteger(revision))reject('revision-exhausted',503);
  const statement=previous?db.prepare('UPDATE presence_state SET revision=?,state_json=? WHERE device_id=? AND revision=?').bind(revision,JSON.stringify(state),deviceId,previous.revision):db.prepare('INSERT INTO presence_state(device_id,revision,state_json) VALUES(?,?,?) ON CONFLICT(device_id) DO NOTHING').bind(deviceId,revision,JSON.stringify(state));
  const result=await statement.run();if(result?.meta?.changes!==1)reject('lease-conflict',409);
 }};
}
const sharedMemoryStore=new Map();
export function createMemoryPresenceStore(customMap){
 const mem=customMap||sharedMemoryStore;
 return {
  async load(deviceId='camera-02'){return mem.get(deviceId)||null;},
  async loadAll(){return Array.from(mem.values());},
  async save(previous,state,deviceId='camera-02'){
   const revision=(previous?.revision||0)+1;
   mem.set(deviceId,{revision,state});
  }
 };
}
export function createKVPresenceStore(kv){
 const mem=new Map();
 let lastKvWriteAt=0,lastVal=undefined;
 return {
  async load(deviceId='camera-02'){
   if(mem.has(deviceId))return mem.get(deviceId);
   try{const row=await kv.get('presence:'+deviceId,'json');if(row)mem.set(deviceId,row);return row?{revision:row.revision,state:row.state}:null;}catch{return null;}
  },
  async loadAll(){return Array.from(mem.values());},
  async save(previous,state,deviceId='camera-02'){
   const revision=(previous?.revision||0)+1;
   const record={revision,state};
   mem.set(deviceId,record);
   const now=Date.now();
   const shouldWrite=lastVal!==state.value||(now-lastKvWriteAt)>60000;
   if(shouldWrite){
    lastVal=state.value;
    lastKvWriteAt=now;
    try{await kv.put('presence:'+deviceId,JSON.stringify(record));}catch(e){/* KV kota ve ag sinirlari canli bellek akisini bozmaz */}
   }
  }
 };
}
export function createPresenceIngest({store,now=()=>Date.now()}={}){
 function clock(){const t=now();if(!Number.isSafeInteger(t)||t<0)reject('clock-unavailable',503);return t;}
 function identity(body){if(!body||typeof body!=='object'||body.version!==1||body.publisherId!=='hub'||body.deviceId!=='camera-02'||body.componentId!=='presence-radar'||typeof body.bootId!=='string'||!hex.test(body.bootId))reject('identity');}
 async function freshLease(previous,state,commands=[]){const token=nonce();await store.save(previous,{...state,nonceHash:await hash(token)});return {version:1,nonce:token,leaseMs:5000,reportIntervalMs:1000,commands};}
 return Object.freeze({
  async hello(body){identity(body);const previous=await store.load();return freshLease(previous,{bootId:body.bootId,issuedAt:clock(),sequence:0,value:null,observedAt:null,devices:[],pendingCommands:[]});},
  async report(body){
   identity(body);if(typeof body.nonce!=='string'||!/^[a-f0-9]{64}$/i.test(body.nonce))reject('lease');
   if(!Number.isSafeInteger(body.sequence)||body.sequence<=0||!Number.isSafeInteger(body.sinceLeaseMs)||body.sinceLeaseMs<0||!(body.value===null||typeof body.value==='boolean')||(body.value===null?body.sampleAgeMs!==null:!Number.isFinite(body.sampleAgeMs)||body.sampleAgeMs<0||body.sampleAgeMs>=2000))reject('sample');
   if(body.devices!==undefined&&(!Array.isArray(body.devices)||body.devices.length>64))reject('devices');
   const parts=[body.sourceSampleAgeMs,body.hubResidenceMs,body.sourceTransitMs];
   if(body.value===null){if(parts.some(p=>p!==null)||!(body.sourceBootId===null||typeof body.sourceBootId==='string'&&/^[a-f0-9]{1,64}$/i.test(body.sourceBootId)))reject('source');}
   else if(typeof body.sourceBootId!=='string'||!/^[a-f0-9]{1,64}$/i.test(body.sourceBootId)||parts.some(p=>!Number.isSafeInteger(p)||p<0)||parts.reduce((a,b)=>a+b,0)!==body.sampleAgeMs)reject('source-age');
   const previous=await store.load(),s=previous?.state;if(!s)reject('lease-missing',409);
   if(s.bootId!==body.bootId)reject('boot-mismatch',409);
   if(body.sequence!==s.sequence+1)reject('sequence',409);
   if(await hash(body.nonce)!==s.nonceHash)reject('lease-replayed',409);
   const time=clock(),elapsed=time-s.issuedAt;
   if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=5000||body.sinceLeaseMs>elapsed)reject('lease-expired',409);
   const age=body.value===null?null:elapsed-body.sinceLeaseMs+body.sampleAgeMs+10;
   if(age!==null&&age>=2000)reject('sample-stale',409);
   const extraDevices=Array.isArray(body.devices)?body.devices.filter(d=>d&&typeof d.deviceId==='string'&&typeof d.online==='boolean'):s.devices||[];
   const commandsToDeliver=[...(s.pendingCommands||[])];
   return freshLease(previous,{bootId:s.bootId,issuedAt:time,sequence:body.sequence,sourceBootId:body.sourceBootId,value:body.value,observedAt:age===null?null:time-age,devices:extraDevices,pendingCommands:[]},commandsToDeliver);
  },
  async command(body){
   if(!body||body.version!==1||typeof body.commandId!=='string'||typeof body.entityId!=='string'||typeof body.value!=='boolean')reject('invalid-command',400);
   const previous=await store.load(),s=previous?.state;
   const targetBoot=body.bootId||s?.bootId||'hub';
   const cmd={commandId:body.commandId,entityId:body.entityId,value:body.value,bootId:targetBoot,at:clock()};
   if(s){
    const pending=[...(s.pendingCommands||[]).slice(-15),cmd];
    await store.save(previous,{...s,pendingCommands:pending});
   }
   return {commandId:body.commandId,applied:true,value:body.value,bootId:targetBoot};
  },
  async snapshot(){
   const record=await store.load(),s=record?.state,time=clock(),age=!Number.isFinite(s?.observedAt)?null:time-s.observedAt;
   const fresh=typeof s?.sourceBootId==='string'&&/^[a-f0-9]{1,64}$/i.test(s.sourceBootId)&&Number.isFinite(age)&&age>=0&&age<2000&&typeof s.value==='boolean';
   const hubLive=Boolean(typeof s?.bootId==='string'&&hex.test(s.bootId)&&Number.isFinite(s?.issuedAt)&&(time-s.issuedAt)<10000);
   const devices=[
    {deviceId:'hub',role:'hub',online:hubLive,bootId:hubLive?s.bootId:null,capabilities:['system','hub']},
    {deviceId:'camera-02',role:'camera',online:Boolean(fresh),bootId:fresh?s.sourceBootId:null,capabilities:['presence']}
   ];
   if(Array.isArray(s?.devices)){for(const d of s.devices){if(d&&typeof d.deviceId==='string'&&!devices.some(x=>x.deviceId===d.deviceId)){const isOnline=Boolean(d.direct?d.online:(hubLive?d.online:false));devices.push({...d,online:isOnline,bootId:isOnline?(d.bootId||null):null});}}}
   return {publisherId:'hub',publisherBootId:typeof s?.bootId==='string'&&hex.test(s.bootId)?s.bootId:null,deviceId:'camera-02',componentId:'presence-radar',bootId:s?.sourceBootId||null,value:fresh?s.value:null,ageMs:fresh?age:null,maxAgeMs:2000,sourceReady:Boolean(s),devices};
  }
 });
}
