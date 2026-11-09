import {createHomeRuntime} from './home-runtime.mjs?v=cloud20261110-8';
import {validateHome} from './home-model.mjs?v=cloud20261110-8';
const clone=value=>structuredClone(value);
async function readJson(response){if(!response.ok){let message=`HTTP ${response.status}`;try{const body=await response.json();if(typeof body.error==='string')message=body.error;}catch{}throw Object.assign(new Error(response.status===401?'Yerel sunucuya giriş gerekli. /login adresini açın.':message),{status:response.status});}const text=await response.text();if(text.length>2097152)throw new Error('Sunucu yanıtı çok büyük.');return JSON.parse(text);}
export async function createPanelRuntime({inventory,fetcher=globalThis.fetch,baseUrl='',storage}={}){
 let response;
 try{response=await fetcher(baseUrl+'/api/health',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(3000)});}catch(error){
  // Statik sunum API sağlamaz; tanınmış denetleyicideki hatalar aşağıda asla yerel boş kayda çevrilmez.
  if(error?.code!=='ENOENT'&&error?.cause?.code!=='ENOENT')throw new Error('Panelin veri kaynağına ulaşılamadı. Bağlantıyı kontrol edip yeniden deneyin.');
 }
 if(response?.ok){let health;try{health=await response.json();}catch{}if(health?.service==='armut-controller'){if(!health.authenticated)throw new Error('Yerel sunucuya giriş gerekli. /login adresini açın.');return createRemoteHomeRuntime({inventory,fetcher,baseUrl});}}
 else if(response&&![404,405].includes(response.status))throw new Error(`Sunucu durumu okunamadı (HTTP ${response.status}).`);
 if(storage===undefined){try{storage=globalThis.window?.localStorage;}catch{}}
 return createHomeRuntime(inventory,{storage});
}
export async function createRemoteHomeRuntime({inventory,fetcher=globalThis.fetch,baseUrl='',pollMs=2000}={}){
 const base=baseUrl.replace(/\/$/,'');let disposed=false,timer,inFlight,csrf='',latest,revision=0,lastSequence=-1,boot='',error='',paused=false,requestNumber=0,appliedNumber=0,connectionVersion=0,readAbort,writesPending=0;
 const retired=new Set(),listeners=new Set(),pending=new Set(),scenes=new Set();
 const initial=await request('/api/state');validateHome(initial.home);
 const local=createHomeRuntime(inventory,{initial:initial.home,manageAutomations:false});
 let writing=Promise.resolve();
 function announce(){for(const fn of listeners)fn();}
 function apply(state,number=++requestNumber){
  if(!state?.home||!state.controller||!Number.isSafeInteger(state.revision)||state.revision<0)throw new Error('Yerel sunucu yanıtı geçersiz.');validateHome(state.home);
  const nextBoot=state.controller.bootId||'unversioned';
  if(retired.has(nextBoot))return;
  if(boot&&nextBoot!==boot){retired.add(boot);local.disconnect();lastSequence=-1;appliedNumber=0;}
  const seq=state.controller.stateSequence;
  if(nextBoot===boot&&Number.isSafeInteger(seq)&&seq<=lastSequence)return;
  if(!Number.isSafeInteger(seq)&&number<appliedNumber)return;
  boot=nextBoot;lastSequence=Number.isSafeInteger(seq)?seq:lastSequence;appliedNumber=number;
  latest=clone(state);revision=state.revision;csrf=state.controller.csrfToken||csrf;
  if(!local.demo){
   local.update(()=>state.home);
   const devices=(state.devices||[]).filter(d=>d.bootId&&typeof d.online==='boolean').map(d=>({deviceId:d.deviceId,role:d.role,bootId:d.bootId,online:d.online,observationAgeMs:Number.isFinite(d.ageMs)?d.ageMs:null,capabilities:d.capabilities||[],components:d.components||[]}));
   const entities=(state.entities||[]).filter(e=>e.value===null||typeof e.value==='boolean'||(typeof e.value==='number'&&Number.isFinite(e.value))).map(e=>({...e,ageMs:Number.isFinite(e.ageMs)?e.ageMs:null}));
   if(!paused)local.receiveState({devices,entities});
  }
  error='';announce();
 }
 async function request(path,{method='GET',body,timeout=12000,signal}={}){
  const started=performance.now();
  const response=await fetcher(base+path,{method,cache:'no-store',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:body===undefined?undefined:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout)});
  const result=await readJson(response),elapsed=Math.max(0,performance.now()-started);
  for(const state of [result,result.state])if(Array.isArray(state?.entities))for(const entity of state.entities)if(Number.isFinite(entity.maxAgeMs)&&Number.isFinite(entity.ageMs))entity.ageMs+=elapsed;
  return result;
 }
 function schedule(){clearTimeout(timer);if(!disposed&&!paused)timer=setTimeout(()=>{void refresh().catch(()=>{});},error?5000:Math.min(pollMs,latest?.entities?.some(e=>e.maxAgeMs===2000)?1000:pollMs));}
 async function refresh(){
  if(disposed||paused||local.demo){schedule();return;}
  if(inFlight)return inFlight;
  const number=++requestNumber,version=connectionVersion;readAbort=new AbortController();
  inFlight=(async()=>{try{const state=await request('/api/state',{signal:readAbort.signal});if(!disposed&&!paused&&!local.demo&&version===connectionVersion)apply(state,number);}catch(e){if(disposed||paused||local.demo||version!==connectionVersion)return;error=e.message;local.disconnect();announce();throw e;}finally{inFlight=undefined;schedule();}})();return inFlight;
 }
 async function update(fn,options={}){
  if(local.demo)return local.update(fn,options);
  if(disposed)throw new Error('Panel kapatıldı.');const writeVersion=connectionVersion;writesPending++;
  const operation=writing.catch(()=>{}).then(async()=>{
   if(local.demo||writeVersion!==connectionVersion)throw new Error('Bağlantı modu değişti. Kaydı kontrol edip yeniden deneyin.');
   const next=validateHome(clone(fn(local.home()))),number=++requestNumber;
   try{const state=await request('/api/home',{method:'PUT',body:{revision,home:next}});if(!disposed)apply(state,number);}
   catch(e){if(e.status===409){await refresh().catch(()=>{});throw new Error('Ev başka bir pencerede değişti. Güncel kayıtlar alındı; düzenlemenizi kontrol edip yeniden kaydedin.');}throw e;}
  }).finally(()=>{writesPending--;announce();});writing=operation;return operation;
 }
 async function action(body){if(disposed)throw new Error('Panel kapatıldı.');const number=++requestNumber;const result=await request('/api/action',{method:'POST',body,timeout:body.type==='scene'?300000:15000});if(!disposed&&result.state)apply(result.state,number);return result.result;}
 async function command(id,value,options){if(local.demo)return local.command(id,value,options);if(paused||error||!local.entityState(id).fresh)return {result:'error',message:'Güncel veri bağlantısı yok; komut gönderilmedi.'};if(pending.has(id))return {result:'skipped',message:'Önceki komut bekleniyor.'};pending.add(id);announce();try{return await action({type:'command',entityId:id,value});}catch(e){return {result:'unknown',message:`Komut sonucu bilinmiyor: ${e.message}. Otomatik tekrar yapılmadı.`};}finally{pending.delete(id);announce();}}
 async function runScene(id,options={}){if(local.demo)return local.runScene(id,options);if(paused||error)return {result:'error',message:'Veri bağlantısı kapalı; sahne gönderilmedi.'};if(scenes.has(id))return {result:'skipped',message:'Sahne zaten çalışıyor.'};scenes.add(id);announce();try{return await action({type:'scene',id,observeOnly:options.observeOnly===true});}finally{scenes.delete(id);announce();}}
 async function provisionDevice(definition){if(local.demo)throw new Error('Test modunda gerçek cihaz kaydı oluşturulmaz.');const result=await request('/api/devices',{method:'POST',body:definition});if(result.state)apply(result.state);return result;}
 async function removeDevice(id){if(local.demo)throw new Error('Test modunda gerçek cihaz kaydı silinmez.');const result=await request('/api/devices/'+encodeURIComponent(id),{method:'DELETE',body:{}});if(result.state)apply(result.state);return result;}
 apply(initial);const unsubscribe=local.subscribe(announce);schedule();
 return {
  remote:true,home:()=>local.home(),backup:()=>clone(latest.home),entities:()=>local.entities(),deviceStatus:id=>local.deviceStatus(id),entityState(id){const value=local.entityState(id);return {...value,pending:value.pending||pending.has(id)};},
  update,command,runScene,sceneState(id){return {...local.sceneState(id),pending:scenes.has(id)||Boolean(latest?.sceneStates?.[id]?.pending),message:latest?.sceneStates?.[id]?.message||'Sahne uygulanıyor…'};},
  setMode:mode=>local.demo?local.setMode(mode):action({type:'mode',mode}),previewRule:id=>local.demo?local.previewRule(id):action({type:'previewRule',id}),
  setDemo(value){if(pending.size||scenes.size||writesPending)throw new Error('Önce bekleyen işlemin sonuçlanmasını bekleyin.');connectionVersion++;readAbort?.abort();local.setDemo(value);if(!value){apply({...latest,controller:{...latest.controller,stateSequence:undefined}},++requestNumber);void refresh().catch(()=>{});}announce();},simulatePresence:()=>local.simulatePresence(),pauseDemo:()=>local.pauseDemo(),
  async connect(){paused=false;if(inFlight)await inFlight.catch(()=>{});return refresh();},disconnect(){paused=true;connectionVersion++;readAbort?.abort();clearTimeout(timer);local.disconnect();announce();},
  listDevices:()=>request('/api/devices'),provisionDevice,removeDevice,
  cameraConfig(config){return {...config,url:base+'/api/cameras/'+encodeURIComponent(config.id)+'/stream',profileUrl:config.profileUrl?base+'/api/cameras/'+encodeURIComponent(config.id)+'/profile':''};},
  cameraFetcher:(url,options={})=>fetcher(url,{...options,credentials:'same-origin',headers:{...options.headers,...(options.method&&options.method!=='GET'?{'X-CSRF-Token':csrf}:{})}}),
  subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},get demo(){return local.demo;},get connected(){return !paused&&!error;},get sourceError(){return error||latest?.controller?.sourceError||'';},get storageError(){return latest?.controller?.storageError||local.storageError;},get persistenceError(){return latest?.controller?.storageError||local.persistenceError;},get controllerInfo(){return clone(latest.controller);},
  dispose(){disposed=true;connectionVersion++;readAbort?.abort();clearTimeout(timer);unsubscribe();local.dispose();listeners.clear();}
 };
}
