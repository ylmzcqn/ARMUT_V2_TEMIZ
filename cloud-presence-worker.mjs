// Prepared Sites Worker. Requires an explicitly provisioned private service binding.
// Development-VM VPN and arbitrary public fetch are deliberately not used.
import {createLegacyCameraProvider} from './legacy-camera-provider.mjs';
const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
 async fetch(request,env={}){
  const url=new URL(request.url);
  if(url.pathname==='/api/presence'){
   // Sites dispatch authenticates/sets this header; this worker must stay owner-private.
   if(!request.headers.get('oai-authenticated-user-id'))return reply(401,{error:'Sign-in required'});
   if(request.method!=='GET')return reply(405,{error:'Read-only'});
   const unknown={deviceId:'camera-02',componentId:'presence-radar',bootId:null,value:null,ageMs:null,maxAgeMs:2000,sourceReady:false};
   if(!env.CAMERA02_PRIVATE_SERVICE?.fetch)return reply(200,unknown);
   try{
    const provider=createLegacyCameraProvider({origin:env.CAMERA02_ORIGIN,token:env.CAMERA02_TOKEN,expectedHostname:env.CAMERA02_HOSTNAME,expectedRole:env.CAMERA02_ROLE,entityId:'presence-radar',fetcher:(target,options)=>env.CAMERA02_PRIVATE_SERVICE.fetch(target,options)});
    const batch=await provider.read({signal:request.signal}),e=batch.entities[0],d=batch.devices[0];
    return reply(200,{...unknown,sourceReady:true,bootId:d?.bootId||null,value:e.value,ageMs:e.ageMs});
   }catch{return reply(200,unknown);}
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
