import {bindCameraPresence} from './home-model.mjs?v=cloud20261110-15';
import {boundedJson} from './home-runtime.mjs?v=cloud20261110-15';
function localOrigin(value){
 let url;try{url=new URL(value);}catch{throw new Error('Yerel sunucu adresi geçersiz.');}
 const h=url.hostname,parts=h.split('.').map(Number),v4=parts.length===4&&parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255),privateIp=v4&&(parts[0]===10||parts[0]===127||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(privateIp||h==='localhost'||h==='[::1]'||/^\[f[cd][0-9a-f:]+\]$/i.test(h)))throw new Error('Yalnız ev ağındaki sunucunun IP adresini veya localhost kullanın.');
 return url.origin;
}
export function createLocalPresenceBridge({runtime,fetcher=globalThis.fetch,now=()=>performance.now()}={}){
 let origin='',key='',entityId='',generation=0,active=false,cloud=false,timer,request,inFlight,status='Bağlantı kurulmadı';
 function unknown(){if(entityId)runtime.receiveState({devices:[],entities:[{entityId,value:null,ageMs:null,maxAgeMs:2000,observeOnly:false}]});}
 function disconnect(){generation++;active=false;key='';clearTimeout(timer);request?.abort();inFlight=undefined;status='Bağlantı kesildi';unknown();}
 async function refresh(){
  if(!active)return;if(inFlight)return inFlight;
  const token=generation;request=new AbortController();const signal=AbortSignal.any([request.signal,AbortSignal.timeout(1500)]),started=now();
  inFlight=(async()=>{
   try{
    const cloudUrl=typeof location!=='undefined'&&location.hostname&&!location.hostname.includes('workers.dev')?'https://armut.armut-home.workers.dev/api/presence':'/api/presence';
    const response=await fetcher(cloud?cloudUrl:origin+'/api/presence',{method:'GET',cache:'no-store',credentials:cloud?'same-origin':'omit',redirect:'error',headers:cloud?{Accept:'application/json'}:{Authorization:`Bearer ${key}`,Accept:'application/json'},signal});
    if(token!==generation){await response.body?.cancel().catch(()=>{});return;}
    if(response.status===401){await response.body?.cancel().catch(()=>{});disconnect();status=cloud?'Özel panel oturumu gerekli; panelde yeniden giriş yapın.':'Yerel yönetici anahtarı geçersiz; yeniden bağlanın.';return;}
    if(!response.ok){if(cloud&&response.status===404){await response.body?.cancel().catch(()=>{});disconnect();status='Bulut varlık backend’i henüz etkin değil.';return;}throw new Error('response');}
    const s=await boundedJson(response);if(token!==generation)return;if(signal.aborted)throw new Error('aborted');
    if(s.deviceId!=='camera-02'||s.componentId!=='presence-radar'||s.maxAgeMs!==2000||!(s.value===null||typeof s.value==='boolean')||!(s.bootId===null||typeof s.bootId==='string'&&/^[a-f0-9]{1,64}$/i.test(s.bootId))||s.value!==null&&(!s.bootId||!Number.isFinite(s.ageMs)||s.ageMs<0))throw new Error('contract');
    const elapsed=now()-started;if(!Number.isFinite(elapsed)||elapsed<0)throw new Error('clock');
    const rawDevices=Array.isArray(s.devices)?s.devices:(s.bootId?[{deviceId:'camera-02',role:'camera',bootId:s.bootId,online:true}]:[]);
    const allowedCaps=new Set(['camera','switch','sensor','presence','display','system','hub']);
    const devices=rawDevices.filter(d=>d&&runtime.deviceStatus(d.deviceId)?.state!=='unregistered').map(d=>{const caps=(Array.isArray(d.capabilities)?d.capabilities:[]).filter(c=>allowedCaps.has(c));return {deviceId:d.deviceId,role:d.role||(d.deviceId==='hub'?'hub':'camera'),bootId:d.bootId||'offline',online:Boolean(d.online),observationAgeMs:Number.isFinite(d.observationAgeMs)?d.observationAgeMs:elapsed,capabilities:caps.length?caps:(d.deviceId==='hub'?['system']:['presence']),components:Array.isArray(d.components)?d.components:[]};});
    runtime.receiveState({devices,entities:[{entityId,value:s.value,ageMs:s.value===null?null:s.ageMs+elapsed,maxAgeMs:2000,observeOnly:false}]});const hubOnline=rawDevices.some(d=>d&&d.deviceId==='hub'&&d.online===true);status=cloud?(s.sourceReady===false?'Bulut backend’i hazır; eve özel bağlantı henüz yapılandırılmadı.':hubOnline?'Bulut bağlantısı aktif · Cihazlar ve senaryolar devrede':'Bulut çalışıyor ama Hub’dan veri gelmiyor: evdeki bulut köprüsü (cloud-hub-sync) kapalı. Hub açık olsa da panel onu çevrimdışı görür.'):'Yerel bağlantı açık · cihazlar devrede';
   }catch(err){if(token===generation){console.error('[local-presence error]:', err);unknown();status=cloud?'Bulut varlık verisi okunamadı; durum bilinmiyor.':'Bağlantı okunamadı. Yerel sunucuyu, origin ayarını ve tarayıcının yerel ağ iznini kontrol edin. HTTPS/HTTP erişimi tarayıcı tarafından engellenebilir.';}}
   finally{if(token===generation){inFlight=undefined;clearTimeout(timer);if(active)timer=setTimeout(()=>{void refresh();},1000);}}
  })();return inFlight;
 }
 return Object.freeze({get status(){return status;},get connected(){return active;},get cloud(){return cloud;},disconnect,refresh,async connectCloud(){if(runtime.remote||runtime.demo)throw new Error('Önce mevcut bağlantı/test modunu kapatın.');const binding=bindCameraPresence(runtime.home());const cloudCmdUrl='https://armut.armut-home.workers.dev/api/presence/command';if(!binding.home.settings.commandUrl)binding.home.settings.commandUrl=cloudCmdUrl;disconnect();await runtime.update(()=>binding.home);entityId=binding.entityId;cloud=true;origin='';active=true;status='Bulut backend’ine bağlanıyor…';await refresh();},async connect({origin:value,key:secret}){
  const next=localOrigin(value);if(typeof secret!=='string'||! /^[\x21-\x7e]{1,512}$/.test(secret))throw new Error('Yerel yönetici anahtarı gerekli.');
  if(runtime.remote)throw new Error('Bu panel zaten yerel denetleyiciye bağlı.');if(runtime.demo)throw new Error('Önce test modunu kapatın.');
  const binding=bindCameraPresence(runtime.home());disconnect();await runtime.update(()=>binding.home);entityId=binding.entityId;cloud=false;origin=next;key=secret;active=true;status='Yerel sunucuya bağlanıyor…';await refresh();
 }});
}
