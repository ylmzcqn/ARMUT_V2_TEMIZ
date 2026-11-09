import {newId} from './browser-crypto.mjs?v=cloud20261110-8';
import {createDeviceRuntime} from './device-runtime.mjs?v=cloud20261110-8';
import {emptyHome,validateHome,ruleMatches,ruleAppliesOnDay,modes} from './home-model.mjs?v=cloud20261110-8';
export const HOME_STORAGE_KEY='armut.home.v1';
const uid=()=>newId();
export function createHomeRuntime(inventory,{initial,storage,fetcher=globalThis.fetch,now=()=>Date.now(),mono=()=>performance.now(),provider,manageAutomations=true}={}){
 let home=initial?validateHome(structuredClone(initial)):emptyHome(),storageError='',demo=false,connected=false,sourceError='',disposed=false,demoPaused=false,persistenceError='';
 if(!initial&&storage){try{const raw=storage.getItem(HOME_STORAGE_KEY);if(raw)home=validateHome(JSON.parse(raw));}catch{storageError='Yerel ev kaydı okunamadı. Mevcut kayıt korundu; Ayarlar’dan geçerli bir yedek yükleyin.';}}
 const listeners=new Set(),values=new Map(),holds=new Map(),busy=new Set(),fired=new Map(),cooldowns=new Map(),ruleBusy=new Set(),sceneRuns=new Map();
 let timer,request,session='',sequence=0,lastMinute='',generation=0,devices,savedHome,savedHolds,savedFired,savedCooldowns;
 function deviceRegistry(){const byId=new Map(inventory.devices.filter(d=>d.id!=='uno-history').map(d=>[d.id,{id:d.id,role:d.id==='hub'?'hub':d.icon==='camera'||d.id.startsWith('camera')?'camera':'node'}]));for(const d of home.devices||[])byId.set(d.id,d);return [...byId.values()].map(d=>({deviceId:d.id,role:d.role,capabilities:['camera','switch','sensor','presence','display'],components:[]}));}
 let registry=deviceRegistry();
 function reset(){devices=createDeviceRuntime(registry,{now:mono});session=uid();devices.beginSession(session);sequence=0;values.clear();}
 reset();
 const announce=()=>{for(const fn of listeners)fn();};
 function update(fn,{recover=false,volatileOnError=false}={}){
  if(storageError&&!recover)throw new Error(storageError);
  const next=validateHome(structuredClone(fn(structuredClone(home))));
  try{if(storage&&!demo)storage.setItem(HOME_STORAGE_KEY,JSON.stringify(next));persistenceError='';}catch(error){persistenceError=`Kayıt yazılamadı: ${error.message}`;if(!volatileOnError)throw new Error(persistenceError);}
  for(const previous of home.entities){const current=next.entities.find(e=>e.id===previous.id);if(recover||!current||current.deviceId!==previous.deviceId||current.kind!==previous.kind||current.channelId!==previous.channelId){values.delete(previous.id);holds.delete(previous.id);}}
  const catalogChanged=JSON.stringify(home.devices)!==JSON.stringify(next.devices);home=next;
  if(catalogChanged){registry=deviceRegistry();reset();}
  if(recover){storageError='';holds.clear();fired.clear();cooldowns.clear();}
  announce();
 }
 function log(kind,message,result='ok'){update(h=>{h.events.unshift({id:uid(),at:new Date(now()).toISOString(),kind,message:String(message).slice(0,1000),result});h.events=h.events.slice(0,200);return h;},{volatileOnError:true});}
 function entities(){return structuredClone(home.entities);}
 function entityState(entityId){const item=values.get(entityId),entity=entities().find(e=>e.id===entityId);const status=entity?devices.status(entity.deviceId):{state:'unregistered'};const age=item?item.age+mono()-item.at:Infinity;return {value:item?.value??null,fresh:item?.value!==null&&status.state==='online'&&(item?.maxAgeMs===undefined?age<=30000:age<item.maxAgeMs),ageMs:age,maxAgeMs:item?.maxAgeMs,pending:busy.has(entityId)||item?.pending===true,heldUntil:holds.get(entityId)||item?.heldUntil||0};}
 function deviceStatus(id){return devices.status(id);}
 async function command(entityId,value,{origin='manual',observeOnly=false,ruleName=''}={}){
  const entity=entities().find(e=>e.id===entityId),label=entity?.name||entityId;
  const finish=(result,message)=>{log(origin,`${ruleName?ruleName+' · ':''}${label}: ${message}`,result);return {result,message};};
  if(!entity||entity.kind!=='switch'||typeof value!=='boolean')return finish('error','Kontrol edilebilir bir aç/kapat işlevi seçin.');
  if(observeOnly)return finish('observed',`${value?'açılacaktı':'kapatılacaktı'} · yalnız izleme, komut gönderilmedi`);
  if(origin==='automation'&&(holds.get(entityId)||0)>now())return finish('skipped','Manuel kontrol önceliği sürüyor.');
  if(busy.has(entityId))return finish('skipped','Önceki komutun sonucu bekleniyor.');
  if(!entityState(entityId).fresh)return finish('error','Güncel cihaz verisi yok; komut gönderilmedi.');
  if(!demo&&!provider&&!home.settings.commandUrl)return finish('error','Komut bağlantısı ayarlanmamış.');
  if(origin!=='automation')holds.set(entityId,now()+home.settings.manualHoldMinutes*60000);
  busy.add(entityId);announce();const activeGeneration=generation,targetBoot=devices.status(entity.deviceId).bootId;
  try{
   if(demo){if(!entity.test)return finish('error','Test modunda gerçek işlevler kontrol edilmez.');values.set(entityId,{value,age:0,at:mono()});return finish('ok',`${value?'açıldı':'kapatıldı'} · TEST`);}
   const commandId=uid(),payload={version:1,commandId,entityId,value,bootId:targetBoot},signal=AbortSignal.timeout(8000);
   let result;
   if(provider)result=await provider.send(payload,{signal});
   else{const response=await fetcher(home.settings.commandUrl,{method:'POST',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);result=await boundedJson(response);}
   if(activeGeneration!==generation||disposed||devices.status(entity.deviceId).bootId!==targetBoot||home.entities.find(e=>e.id===entityId)?.deviceId!==entity.deviceId||home.entities.find(e=>e.id===entityId)?.kind!==entity.kind||home.entities.find(e=>e.id===entityId)?.channelId!==entity.channelId)return finish('unknown','Bağlantı oturumu değişti; sonuç bilinmiyor.');
   if(result.commandId!==commandId||result.applied!==true||result.value!==value||result.bootId!==targetBoot)return finish('unknown','Cihazın uygulama onayı doğrulanamadı.');
   values.set(entityId,{value,age:0,at:mono()});return finish('ok',`${value?'açıldı':'kapatıldı'} · cihaz onayladı`);
  }catch(error){return finish('unknown',`Sonuç bilinmiyor (${error.name==='TimeoutError'?'zaman aşımı':error.message}). Otomatik tekrar yapılmadı.`);}
  finally{busy.delete(entityId);announce();}
 }
 function sceneState(id){const current=sceneRuns.get(id);if(current&&current.token===generation){const {token,...state}=current;return structuredClone(state);}return {pending:false,...structuredClone(home.scenes.find(s=>s.id===id)?.lastRun||{})};}
 async function runScene(id,{observeOnly=false}={}){
  const scene=home.scenes.find(s=>s.id===id);if(!scene)throw new Error('Sahne bulunamadı.');
  if(sceneRuns.get(id)?.pending)return {result:'skipped',message:'Bu sahnenin önceki çalışması henüz sonuçlanmadı.'};
  const token=generation,signature=JSON.stringify(scene.actions),expected=observeOnly?'observed':'ok';
  const progress={token,pending:true,result:'pending',completed:0,total:scene.actions.length,message:observeOnly?'Sahne deneniyor…':'Sahne uygulanıyor…'};
  sceneRuns.set(id,progress);announce();
  let result=expected,reason='';
  try{
   for(const action of scene.actions){
    if(token!==generation){result='unknown';reason='Bağlantı değişti; kalan işlemler gönderilmedi.';break;}
    if(JSON.stringify(home.scenes.find(s=>s.id===id)?.actions)!==signature){result='skipped';reason='Sahne değişti veya silindi; kalan işlemler gönderilmedi.';break;}
    const response=await command(action.entityId,action.value,{origin:'scene',observeOnly,ruleName:scene.name});
    if(response.result!==expected){result=response.result;reason=response.message;break;}
    progress.completed++;progress.message=`${progress.completed} / ${progress.total} işlem ${observeOnly?'denendi':'tamamlandı'}`;announce();
   }
   if(token!==generation){result='unknown';reason='Bağlantı değişti; sonuçların tamamı doğrulanamadı.';}
   const message=`${progress.completed} / ${progress.total} işlem ${observeOnly?'denendi':'tamamlandı'}${reason?` · ${reason}`:''}`;
   const summary={at:new Date(now()).toISOString(),result,completed:progress.completed,total:progress.total,message};
   Object.assign(progress,summary);
   if(token===generation){
    update(h=>{const current=h.scenes.find(s=>s.id===id);if(current)current[observeOnly?'lastPreview':'lastRun']=summary;return h;},{volatileOnError:true});
    log('scene',`${scene.name}: ${message}`,result);
   }
   return structuredClone(summary);
  }finally{progress.pending=false;announce();}
 }
 async function runRule(rule){
  rule=home.automations.find(r=>r.id===rule.id);
  if(!rule||!rule.enabled)return {result:'skipped',message:'Kural etkin değil.'};
  const token=generation,key=`${token}:${rule.id}`;
  const skip=message=>{log('automation',`${rule.name}: ${message}`,'skipped');return {result:'skipped',message};};
  if(!ruleAppliesOnDay(rule,now(),home.settings.timeZone))return skip('Bugün seçili çalışma günlerinden biri değil.');
  if(rule.mode&&rule.mode!==home.mode)return skip('Ev modu koşulu karşılanmadı.');
  if(ruleBusy.has(key))return skip('Önceki çalışma sonuçlanmadı.');
  const seconds=rule.cooldownSeconds||0,signature=`${rule.lastRun?.at||''}:${seconds}`;
  let cooldown=cooldowns.get(rule.id);
  if(seconds&&(!cooldown||cooldown.signature!==signature)){
   const elapsed=rule.lastRun?Math.max(0,now()-Date.parse(rule.lastRun.at)):Infinity;
   cooldown={signature,until:mono()+Math.max(0,seconds*1000-elapsed)};cooldowns.set(rule.id,cooldown);
  }
  if(seconds&&cooldown.until>mono())return skip(`Yeniden çalışma için ${Math.ceil((cooldown.until-mono())/1000)} sn bekleniyor.`);
  ruleBusy.add(key);
  try{
   const result=await command(rule.action.entityId,rule.action.value,{origin:'automation',observeOnly:rule.observeOnly,ruleName:rule.name});
   if(token!==generation||result.result==='skipped')return result;
   const at=new Date(now()).toISOString();
   cooldowns.set(rule.id,{signature:`${at}:${seconds}`,until:mono()+seconds*1000});
   update(h=>{const current=h.automations.find(r=>r.id===rule.id);if(current)current.lastRun={at,result:result.result,message:result.message};return h;},{volatileOnError:true});
   return result;
  }finally{ruleBusy.delete(key);}
 }
 async function event(event){if(!manageAutomations&&!demo)return;const token=generation;for(const rule of home.automations){if(token!==generation)return;if(ruleMatches(rule,event,home.mode))await runRule(rule);}}
 async function setMode(mode){if(!Object.hasOwn(modes,mode))throw new Error('Ev modu geçersiz.');if(home.mode===mode)return;update(h=>({...h,mode}));log('mode',`Ev modu: ${modes[mode]}`);await event({mode});}
 function minuteKey(){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:home.settings.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now()));return Object.fromEntries(parts.map(p=>[p.type,p.value]));}
 async function tick(){if(disposed)return;const token=generation;const p=minuteKey(),key=`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;if((manageAutomations||demo)&&lastMinute&&key!==lastMinute){for(const rule of home.automations){if(token!==generation)return;if(rule.enabled&&rule.trigger==='time'&&rule.time===`${p.hour}:${p.minute}`&&ruleAppliesOnDay(rule,now(),home.settings.timeZone)&&(!rule.mode||rule.mode===home.mode)&&fired.get(rule.id)!==key){fired.set(rule.id,key);await runRule(rule);}}}if(token!==generation)return;lastMinute=key;announce();}
 function validateEntityBatch(list){
  if(!Array.isArray(list)||list.length>200)throw new Error('İşlev verisi geçersiz.');
  const seen=new Set();
  for(const item of list){if(!item||typeof item.entityId!=='string'||seen.has(item.entityId)||!(item.value===null||typeof item.value==='boolean'||(typeof item.value==='number'&&Number.isFinite(item.value)))||!(item.ageMs===null||(Number.isFinite(item.ageMs)&&item.ageMs>=0)))throw new Error('İşlev gözlemi geçersiz.');seen.add(item.entityId);if(item.maxAgeMs!==undefined&&(!Number.isFinite(item.maxAgeMs)||item.maxAgeMs<=0||item.maxAgeMs>30000))throw new Error('İşlev tazelik sınırı geçersiz.');const entity=home.entities.find(e=>e.id===item.entityId);if(entity&&item.value!==null&&((entity.kind==='sensor')!==(typeof item.value==='number')))throw new Error('İşlev değerinin türü tanımıyla eşleşmiyor.');}
 }
 function ingestEntities(list,previous=new Map(home.entities.map(e=>[e.id,entityState(e.id)]))){
  validateEntityBatch(list);const changes=[];
  for(const item of list){if(!home.entities.some(e=>e.id===item.entityId))continue;values.set(item.entityId,{value:item.value,age:item.ageMs===null?Infinity:item.ageMs,maxAgeMs:item.maxAgeMs,at:mono(),heldUntil:Number.isFinite(item.heldUntil)?item.heldUntil:0,pending:item.pending===true});const before=previous.get(item.entityId),current=entityState(item.entityId);if(item.observeOnly!==true&&before?.fresh&&current.fresh&&before.value!==current.value)changes.push({entityId:item.entityId,previousValue:before.value,value:item.value,fresh:true});}
  for(const change of changes)void event(change).catch(backgroundError);
 }
 function backgroundError(error){sourceError=`İşlem tamamlanamadı: ${error.message}`;announce();}
 function receiveState(batch){
  if(demo)return;
  if(!batch||!Array.isArray(batch.devices)||batch.devices.length>64)throw new Error('Durum sözleşmesi geçersiz.');
  validateEntityBatch(batch.entities||[]);
  const validator=createDeviceRuntime(registry,{now:mono});validator.beginSession('validation');const ids=new Set();let seq=0;
  for(const item of batch.devices){if(ids.has(item.deviceId))throw new Error('Yinelenen cihaz gözlemi.');ids.add(item.deviceId);validator.ingest({...item,schemaVersion:1,sessionId:'validation',sequence:++seq});}
  if(!connected){reset();connected=true;}
  const previous=new Map(home.entities.map(e=>[e.id,entityState(e.id)]));
  for(const item of batch.devices){const before=devices.status(item.deviceId);devices.ingest({...item,schemaVersion:1,sessionId:session,sequence:++sequence});if(before.bootId&&before.bootId!==item.bootId)for(const e of home.entities)if(e.deviceId===item.deviceId){values.delete(e.id);previous.delete(e.id);}}
  ingestEntities(batch.entities||[],previous);sourceError='';announce();
 }
 async function poll(token){if(disposed||token!==generation||demo||!connected)return;
  request=new AbortController();const activeRequest=request;const timeout=setTimeout(()=>activeRequest.abort(),7000);
  try{
   let batch;
   if(provider)batch=await provider.read({signal:activeRequest.signal});
   else{const response=await fetcher(home.settings.statusUrl,{cache:'no-store',credentials:'omit',signal:activeRequest.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);batch=await boundedJson(response);}
   if(disposed||token!==generation)return;receiveState(batch);
  }catch(error){if(disposed||token!==generation)return;sourceError=`Bağlantı okunamadı: ${error.message}`;devices.disconnect();}
  finally{clearTimeout(timeout);if(token===generation&&!disposed&&connected){if(sourceError)reset();timer=setTimeout(()=>poll(token),sourceError?8000:Math.max(250,Math.min(5000,provider?.pollIntervalMs||5000)));announce();}}
 }
 function disconnect(){generation++;connected=false;demoPaused=true;clearTimeout(timer);request?.abort();devices.disconnect();announce();}
 function connect(){if(demo)setDemo(false);disconnect();if(!provider&&!home.settings.statusUrl)throw new Error('Önce durum adresini kaydedin.');demo=false;reset();connected=true;sourceError='';void poll(generation);announce();}
 function demoPulse(){for(const d of registry)devices.ingest({schemaVersion:1,sessionId:session,sequence:++sequence,deviceId:d.deviceId,role:d.role,bootId:'test-boot',online:true,observationAgeMs:0,capabilities:[],components:[]});for(const item of values.values())item.at=mono();}
 function setDemo(value){
  const enable=Boolean(value),wasDemo=demo;
  if(busy.size)throw new Error('Önce bekleyen komutun sonuçlanmasını bekleyin.');
  let candidate;
  if(enable&&!demo){
   const deviceId=registry.find(d=>d.deviceId==='hub')?.deviceId||registry[0]?.deviceId;
   if(!deviceId)throw new Error('Test için önce bir cihaz kaydı gerekli.');
   candidate=structuredClone(home);
   candidate.rooms=candidate.rooms.filter(r=>r.id!=='test-room');
   candidate.rooms.push({id:'test-room',name:'Test odası',deviceIds:[deviceId]});
   candidate.entities=candidate.entities.filter(e=>!['test-light','test-presence'].includes(e.id));
   candidate.entities.push({id:'test-light',name:'Test ışığı',deviceId,roomId:'test-room',kind:'switch',test:true},{id:'test-presence',name:'Test varlık sensörü',deviceId,roomId:'test-room',kind:'presence',test:true});
   validateHome(candidate);
  }
  disconnect();
  if(candidate){savedHome=home;savedHolds=new Map(holds);savedFired=new Map(fired);savedCooldowns=new Map(cooldowns);home=candidate;}
  else if(!enable&&demo){home=savedHome;savedHome=undefined;}
  demo=enable;demoPaused=false;reset();
  if(enable){holds.clear();fired.clear();cooldowns.clear();}
  else if(wasDemo){holds.clear();fired.clear();cooldowns.clear();for(const [key,value]of savedCooldowns||[])cooldowns.set(key,value);savedCooldowns=undefined;for(const [key,value]of savedHolds||[])holds.set(key,value);for(const [key,value]of savedFired||[])fired.set(key,value);savedHolds=savedFired=undefined;}
  lastMinute='';sourceError='';
  if(demo){demoPulse();values.set('test-light',{value:false,age:0,at:mono()});values.set('test-presence',{value:false,age:0,at:mono()});}
  announce();
 }
 async function previewRule(id){
  const rule=home.automations.find(r=>r.id===id);if(!rule)throw new Error('Otomasyon bulunamadı.');
  const token=generation;
  let result;
  if(!ruleAppliesOnDay(rule,now(),home.settings.timeZone)){result={result:'skipped',message:'Bugün seçili çalışma günlerinden biri değil.'};log('preview',`${rule.name}: ${result.message}`,'skipped');}
  else if(rule.mode&&rule.mode!==home.mode){result={result:'skipped',message:`Ev modu koşulu karşılanmadı: ${modes[rule.mode]}`};log('preview',`${rule.name}: ${result.message}`,'skipped');}
  else result=await command(rule.action.entityId,rule.action.value,{origin:'preview',observeOnly:true,ruleName:rule.name});
  if(token===generation)update(h=>{const current=h.automations.find(r=>r.id===id);if(current)current.lastPreview={at:new Date(now()).toISOString(),...result};return h;});
  return result;
 }
 function simulatePresence(){if(!demo)return;const previous=values.get('test-presence')?.value||false;ingestEntities([{entityId:'test-presence',value:!previous,ageMs:0}]);announce();}
 const interval=setInterval(()=>{if(demo&&!demoPaused)demoPulse();void tick().catch(backgroundError);},1000);void tick().catch(backgroundError);
 return {home:()=>structuredClone(home),backup:()=>structuredClone(demo?savedHome:home),receiveState,entities,entityState,deviceStatus,update,log,command,runScene,sceneState,setMode,runRule,previewRule,setDemo,simulatePresence,pauseDemo(){if(demo){demoPaused=true;devices.disconnect();sourceError='Test bağlantısı kesildi';announce();}},connect,disconnect,tick,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},get demo(){return demo;},get connected(){return connected;},get persistenceError(){return persistenceError;},get storageError(){return storageError;},get sourceError(){return sourceError;},dispose(){disposed=true;disconnect();clearInterval(interval);listeners.clear();}};
}
export async function boundedJson(response){
 if(!response.body)throw new Error('Yanıt gövdesi boş.');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw new Error('Yanıt sınırı aşıldı.');parts.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
