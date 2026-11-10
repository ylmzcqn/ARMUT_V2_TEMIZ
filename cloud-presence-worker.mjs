// Prepared owner-private Sites Worker: device-initiated HTTPS, durable radar state.
// No VPN, LAN fetch, commands or camera frames.
import {createPresenceIngest,createD1PresenceStore,createKVPresenceStore,createMemoryPresenceStore,validPublisher} from './presence-ingest.mjs';
const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Requested-With'};
const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...corsHeaders}});
let cachedMemStore=null, mediaStore=new Map();
function getStore(env){if(env?.DB)return createD1PresenceStore(env.DB);if(env?.KV)return createKVPresenceStore(env.KV);if(!cachedMemStore)cachedMemStore=createMemoryPresenceStore();return cachedMemStore;}
export default {
 async fetch(request,env={}){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
  const url=new URL(request.url),store=getStore(env);
  if(url.pathname==='/api/presence/hello'||url.pathname==='/api/presence/report'){
   if(request.method!=='POST')return reply(405,{error:'POST required'});
   if(!store||!env.PRESENCE_PUBLISH_TOKEN)return reply(503,{error:'Publisher not configured'});
   if(!await validPublisher(request.headers.get('Authorization'),env.PRESENCE_PUBLISH_TOKEN))return reply(401,{error:'Publisher authorization required'});
   if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415,{error:'JSON required'});
   try{const body=await smallJson(request),ingest=createPresenceIngest({store});return reply(200,await (url.pathname.endsWith('/hello')?ingest.hello(body):ingest.report(body)));}
   catch(e){return reply([400,409,413].includes(e.status)?e.status:503,{error:[400,409,413].includes(e.status)?e.message:'Publication unavailable'});}
  }
  if(url.pathname==='/api/presence'||url.pathname==='/api/devices/status'){
   if(env.PUBLIC_ACCESS!=='true'&&!request.headers.get('oai-authenticated-user-id'))return reply(401,{error:'Sign-in required'});
   if(request.method!=='GET')return reply(405,{error:'Read-only'});
   const unknown={publisherId:'hub',deviceId:'camera-02',componentId:'presence-radar',bootId:null,value:null,ageMs:null,maxAgeMs:2000,sourceReady:false,devices:[{deviceId:'hub',role:'hub',online:false},{deviceId:'camera-02',role:'camera',online:false}]};
   if(store){try{return reply(200,await createPresenceIngest({store}).snapshot());}catch{return reply(503,unknown);}}
   return reply(200,unknown);
  }
  if(url.pathname==='/api/presence/command'||url.pathname==='/api/command'){
   if(request.method!=='POST')return reply(405,{error:'POST required'});
   if(!store)return reply(503,{error:'Store unavailable'});
   try{const body=await smallJson(request);return reply(200,await createPresenceIngest({store}).command(body));}
   catch(e){return reply([400,409,413].includes(e.status)?e.status:500,{error:e.message});}
  }
  if(url.pathname==='/api/camera/snapshot'){
   if(request.method==='POST'){
    if(!env.PRESENCE_PUBLISH_TOKEN)return reply(503,{error:'Publisher not configured'});
    if(!await validPublisher(request.headers.get('Authorization'),env.PRESENCE_PUBLISH_TOKEN))return reply(401,{error:'Publisher authorization required'});
    try{
     const bytes=await readBinary(request,262144);
     const devId=url.searchParams.get('deviceId')||'camera-02';
     mediaStore.set('snapshot:'+devId,{bytes,contentType:request.headers.get('content-type')||'image/jpeg',updatedAt:Date.now()});
     return reply(200,{ok:true,deviceId:devId,size:bytes.byteLength});
    }catch(e){return reply([400,413].includes(e.status)?e.status:500,{error:e.message});}
   }
   if(request.method==='GET'){
    const devId=url.searchParams.get('deviceId')||'camera-02';
    const item=mediaStore.get('snapshot:'+devId);
    if(!item)return new Response(null,{status:204,headers:corsHeaders});
    return new Response(item.bytes,{headers:{'Content-Type':item.contentType,'Cache-Control':'no-cache, max-age=1','X-Updated-At':String(item.updatedAt),...corsHeaders}});
   }
   return reply(405,{error:'Method not allowed'});
  }
  if(url.pathname==='/api/hub/display/preview'){
   if(request.method==='POST'){
    if(!env.PRESENCE_PUBLISH_TOKEN)return reply(503,{error:'Publisher not configured'});
    if(!await validPublisher(request.headers.get('Authorization'),env.PRESENCE_PUBLISH_TOKEN))return reply(401,{error:'Publisher authorization required'});
    try{
     const bytes=await readBinary(request,262144);
     mediaStore.set('preview:hub',{bytes,contentType:request.headers.get('content-type')||'image/bmp',updatedAt:Date.now()});
     return reply(200,{ok:true,size:bytes.byteLength});
    }catch(e){return reply([400,413].includes(e.status)?e.status:500,{error:e.message});}
   }
   if(request.method==='GET'){
    const item=mediaStore.get('preview:hub');
    if(!item)return new Response(null,{status:204,headers:corsHeaders});
    return new Response(item.bytes,{headers:{'Content-Type':item.contentType,'Cache-Control':'no-cache, max-age=1','X-Updated-At':String(item.updatedAt),...corsHeaders}});
   }
   return reply(405,{error:'Method not allowed'});
  }
  if(url.pathname.startsWith('/api/'))return reply(404,{error:'Not found'});
  if(!['GET','HEAD'].includes(request.method))return reply(405,{error:'Read-only'});
  // The offline build embeds only the current browser asset graph; no filesystem API.
  const assets=typeof ARMUT_STATIC_ASSETS==='undefined'?{}:ARMUT_STATIC_ASSETS;
  const asset=assets[url.pathname==='/'?'/index.html':url.pathname];
  if(!asset)return new Response('Not found',{status:404});
  const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
  return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
 }
};

async function smallJson(request){
 if(!request.body)throw Object.assign(new Error('empty'),{status:400});
 const reader=request.body.getReader(),parts=[];let size=0,expired=false;
 const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>{});},2000);
 try{for(;;){const {done,value}=await reader.read();if(expired)throw new Error('timeout');if(done)break;size+=value.byteLength;if(size>1024)throw Object.assign(new Error('body-size'),{status:413});parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Object.assign(new Error('JSON invalid'),{status:400});}}
 finally{clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();}
}

async function readBinary(request,maxBytes=262144){
 if(!request.body)throw Object.assign(new Error('empty'),{status:400});
 const reader=request.body.getReader(),parts=[];let size=0,expired=false;
 const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>{});},4000);
 try{for(;;){const {done,value}=await reader.read();if(expired)throw new Error('timeout');if(done)break;size+=value.byteLength;if(size>maxBytes)throw Object.assign(new Error('body-size'),{status:413});parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}return bytes;}
 finally{clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();}
}

