// Local-only adapter for the existing V1 HTTP API; no device enrollment or writes.
import {createCameraPresenceState} from './legacy-camera-status.mjs';
export {bindCameraPresence} from './home-model.mjs';
async function boundedJson(response,signal){
 if(!response.body)throw new Error('empty');const reader=response.body.getReader(),parts=[];let size=0;
 const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{if(signal.aborted)throw new Error('aborted');for(;;){const {done,value}=await reader.read();if(signal.aborted)throw new Error('aborted');if(done)break;size+=value.byteLength;if(size>262144)throw new Error('size');parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function createLegacyCameraProvider({origin,token,expectedHostname,expectedRole,entityId,fetcher=globalThis.fetch,now=()=>performance.now()}={}){
 let url;try{url=new URL(origin);}catch{throw new Error('Yerel Kamera 2 adresi gerekli.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/'||typeof token!=='string'||! /^[\x21-\x7e]{1,512}$/.test(token)||typeof entityId!=='string'||!entityId||typeof fetcher!=='function')throw new Error('Yerel Kamera 2 yapılandırması geçersiz.');
 const state=createCameraPresenceState({expectedHostname,expectedRole,now});let inFlight;
 function batch(snapshot){return {devices:snapshot.bootId?[{deviceId:'camera-02',role:'camera',bootId:snapshot.bootId,online:true,observationAgeMs:0,capabilities:['presence'],components:[]}]:[],entities:[{entityId,value:snapshot.value,ageMs:snapshot.fresh?snapshot.ageMs:null,maxAgeMs:2000,observeOnly:true}]};}
 async function readOnce(signal){
  const active=signal?AbortSignal.any([signal,AbortSignal.timeout(1000)]):AbortSignal.timeout(1000),started=now();
  try{
   const response=await fetcher(new URL('/api/system',url).href,{method:'GET',cache:'no-store',credentials:'omit',redirect:'error',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:active});
   const body=response.status===200?await boundedJson(response,active):undefined;
   if(response.status!==200)await response.body?.cancel().catch(()=>{});
   if(active.aborted)throw new Error('aborted');
   return batch(state.accept({status:response.status,body,requestDurationMs:now()-started}));
  }catch{return batch(state.invalidate(active.aborted?'aborted':'request-error'));}
 }
 return Object.freeze({pollIntervalMs:1000,read({signal}={}){if(!inFlight)inFlight=readOnce(signal).finally(()=>{inFlight=undefined;});return inFlight;}});
}
