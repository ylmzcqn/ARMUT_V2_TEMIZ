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
 return {async load(){const row=await db.prepare('SELECT revision,state_json FROM presence_state WHERE device_id=?').bind('camera-02').first();return row?{revision:row.revision,state:JSON.parse(row.state_json)}:null;},async save(previous,state){
  const revision=(previous?.revision||0)+1;if(!Number.isSafeInteger(revision))reject('revision-exhausted',503);
  const statement=previous?db.prepare('UPDATE presence_state SET revision=?,state_json=? WHERE device_id=? AND revision=?').bind(revision,JSON.stringify(state),'camera-02',previous.revision):db.prepare('INSERT INTO presence_state(device_id,revision,state_json) VALUES(?,?,?) ON CONFLICT(device_id) DO NOTHING').bind('camera-02',revision,JSON.stringify(state));
  const result=await statement.run();if(result.meta?.changes!==1)reject('lease-conflict',409);
 }};
}
export function createPresenceIngest({store,now=()=>Date.now()}={}){
 function clock(){const t=now();if(!Number.isSafeInteger(t)||t<0)reject('clock-unavailable',503);return t;}
 function identity(body){if(!body||typeof body!=='object'||body.version!==1||body.deviceId!=='camera-02'||body.componentId!=='presence-radar'||typeof body.bootId!=='string'||!hex.test(body.bootId))reject('identity');}
 async function freshLease(previous,state){const token=nonce();await store.save(previous,{...state,nonceHash:await hash(token)});return {version:1,nonce:token,leaseMs:5000,reportIntervalMs:1000};}
 return Object.freeze({
  async hello(body){identity(body);const previous=await store.load();return freshLease(previous,{bootId:body.bootId,issuedAt:clock(),sequence:0,value:null,observedAt:null});},
  async report(body){
   identity(body);if(typeof body.nonce!=='string'||!/^[a-f0-9]{64}$/i.test(body.nonce))reject('lease');
   if(!Number.isSafeInteger(body.sequence)||body.sequence<=0||!Number.isSafeInteger(body.sinceLeaseMs)||body.sinceLeaseMs<0||!(body.value===null||typeof body.value==='boolean')||(body.value===null?body.sampleAgeMs!==null:!Number.isFinite(body.sampleAgeMs)||body.sampleAgeMs<0||body.sampleAgeMs>=2000))reject('sample');
   const previous=await store.load(),s=previous?.state;if(!s)reject('lease-missing',409);
   if(s.bootId!==body.bootId)reject('boot-mismatch',409);
   if(body.sequence!==s.sequence+1)reject('sequence',409);
   if(await hash(body.nonce)!==s.nonceHash)reject('lease-replayed',409);
   const time=clock(),elapsed=time-s.issuedAt;
   if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=5000||body.sinceLeaseMs>elapsed)reject('lease-expired',409);
   const age=body.value===null?null:elapsed-body.sinceLeaseMs+body.sampleAgeMs+10;
   if(age!==null&&age>=2000)reject('sample-stale',409);
   return freshLease(previous,{bootId:s.bootId,issuedAt:time,sequence:body.sequence,value:body.value,observedAt:age===null?null:time-age});
  },
  async snapshot(){const record=await store.load(),s=record?.state,time=clock(),age=!Number.isFinite(s?.observedAt)?null:time-s.observedAt;const fresh=Number.isFinite(age)&&age>=0&&age<2000&&typeof s.value==='boolean';return {deviceId:'camera-02',componentId:'presence-radar',bootId:typeof s?.bootId==='string'&&hex.test(s.bootId)?s.bootId:null,value:fresh?s.value:null,ageMs:fresh?age:null,maxAgeMs:2000,sourceReady:true};}
 });
}
