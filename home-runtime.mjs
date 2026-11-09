import {createDeviceRuntime} from './device-runtime.mjs?v=cloud20261109-5';
import {emptyHome,validateHome,ruleMatches,ruleAppliesOnDay,modes} from './home-model.mjs?v=cloud20261109-5';
export const HOME_STORAGE_KEY='armut.home.v1';
const uid=()=>globalThis.crypto.randomUUID();
export function createHomeRuntime(inventory,{initial,storage,fetcher=globalThis.fetch,now=()=>Date.now(),mono=()=>performance.now()}={}){
 let home=initial?validateHome(structuredClone(initial)):emptyHome(),storageError='',demo=false,connected=false,sourceError='',disposed=false,demoPaused=false;
 if(!initial&&storage){try{const raw=storage.getItem(HOME_STORAGE_KEY);if(raw)home=validateHome(JSON.parse(raw));}catch{storageError='Yerel ev kaydı okunamadı. Mevcut kayıt korundu; Ayarlar’dan geçerli bir yedek yükleyin.';}}
 const listeners=new Set(),values=new Map(),holds=new Map(),busy=new Set(),fired=new Map(),cooldowns=new Map(),ruleBusy=new Set();
 let timer,request,session='',sequence=0,lastMinute='',generation=0,devices,savedHome,savedHolds,savedFired,savedCooldowns;
 const registry=inventory.devices.filter(d=>d.id!=='uno-history').map(d=>({deviceId:d.id,role:d.id==='hub'?'hub':'camera',capabilities:['camera','switch','sensor','presence','display'],components:[]}));
 function reset(){devices=createDeviceRuntime(registry,{now:mono});session=uid();devices.beginSession(session);sequence=0;values.clear();}
 reset();
 const announce=()=>{for(const fn of listeners)fn();};
 function update(fn,{recover=false}={}){if(storageError&&!recover)throw new Error(storageError);const next=validateHome(structuredClone(fn(structuredClone(home))));if(storage&&!demo)storage.setItem(HOME_STORAGE_KEY,JSON.stringify(next));for(const previous of home.entities){const current=next.entities.find(e=>e.id===previous.id);if(recover||!current||current.deviceId!==previous.deviceId||current.kind!==previous.kind){values.delete(previous.id);holds.delete(previous.id);}}home=next;if(recover)storageError='';announce();}
 function log(kind,message,result='ok'){update(h=>{h.events.unshift({id:uid(),at:new Date(now()).toISOString(),kind,message,result});h.events=h.events.slice(0,200);return h;});}
 function entities(){return structuredClone(home.entities);}
 function entityState(entityId){const item=values.get(entityId),entity=entities().find(e=>e.id===entityId);const status=entity?devices.status(entity.deviceId):{state:'unregistered'};const age=item?item.age+mono()-item.at:Infinity;return {value:item?.value??null,fresh:status.state==='online'&&age<=30000,ageMs:age,pending:busy.has(entityId),heldUntil:holds.get(entityId)||0};}
 function deviceStatus(id){return devices.status(id);}
 async function command(entityId,value,{origin='manual',observeOnly=false,ruleName=''}={}){
  const entity=entities().find(e=>e.id===entityId),label=entity?.name||entityId;
  const finish=(result,message)=>{log(origin,`${ruleName?ruleName+' · ':''}${label}: ${message}`,result);return {result,message};};
  if(!entity||entity.kind!=='switch'||typeof value!=='boolean')return finish('error','Kontrol edilebilir bir aç/kapat işlevi seçin.');
  if(observeOnly)return finish('observed',`${value?'açılacaktı':'kapatılacaktı'} · yalnız izleme, komut gönderilmedi`);
  if(origin==='automation'&&(holds.get(entityId)||0)>now())return finish('skipped','Manuel kontrol önceliği sürüyor.');
  if(busy.has(entityId))return finish('skipped','Önceki komutun sonucu bekleniyor.');
  if(!entityState(entityId).fresh)return finish('error','Güncel cihaz verisi yok; komut gönderilmedi.');
  if(!demo&&!home.settings.commandUrl)return finish('error','Komut bağlantısı ayarlanmamış.');
  if(origin!=='automation')holds.set(entityId,now()+home.settings.manualHoldMinutes*60000);
  busy.add(entityId);announce();const activeGeneration=generation,targetBoot=devices.status(entity.deviceId).bootId;
  try{
   if(demo){if(!entity.test)return finish('error','Test modunda gerçek işlevler kontrol edilmez.');values.set(entityId,{value,age:0,at:mono()});return finish('ok',`${value?'açıldı':'kapatıldı'} · TEST`);}
   const commandId=uid();const response=await fetcher(home.settings.commandUrl,{method:'POST',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,commandId,entityId,value,bootId:targetBoot}),signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw new Error(`HTTP ${response.status}`);const result=await boundedJson(response);
   if(activeGeneration!==generation||disposed||devices.status(entity.deviceId).bootId!==targetBoot||home.entities.find(e=>e.id===entityId)?.deviceId!==entity.deviceId||home.entities.find(e=>e.id===entityId)?.kind!==entity.kind)return finish('unknown','Bağlantı oturumu değişti; sonuç bilinmiyor.');
   if(result.commandId!==commandId||result.applied!==true||result.value!==value||result.bootId!==targetBoot)return finish('unknown','Cihazın uygulama onayı doğrulanamadı.');
   values.set(entityId,{value,age:0,at:mono()});return finish('ok',`${value?'açıldı':'kapatıldı'} · cihaz onayladı`);
  }catch(error){return finish('unknown',`Sonuç bilinmiyor (${error.name==='TimeoutError'?'zaman aşımı':error.message}). Otomatik tekrar yapılmadı.`);}
  finally{busy.delete(entityId);announce();}
 }
 async function runScene(id){const scene=home.scenes.find(s=>s.id===id);if(!scene)throw new Error('Sahne bulunamadı.');const results=[];for(const action of scene.actions){const result=await command(action.entityId,action.value,{origin:'scene'});results.push(result);if(result.result!=='ok')break;}return results;}
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
   update(h=>{const current=h.automations.find(r=>r.id===rule.id);if(current)current.lastRun={at,result:result.result,message:result.message};return h;});
   return result;
  }finally{ruleBusy.delete(key);}
 }
 async function event(event){const token=generation;for(const rule of home.automations){if(token!==generation)return;if(ruleMatches(rule,event,home.mode))await runRule(rule);}}
 async function setMode(mode){if(!Object.hasOwn(modes,mode))throw new Error('Ev modu geçersiz.');if(home.mode===mode)return;update(h=>({...h,mode}));log('mode',`Ev modu: ${modes[mode]}`);await event({mode});}
 function minuteKey(){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:home.settings.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now()));return Object.fromEntries(parts.map(p=>[p.type,p.value]));}
 async function tick(){if(disposed)return;const token=generation;const p=minuteKey(),key=`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;if(lastMinute&&key!==lastMinute){for(const rule of home.automations){if(token!==generation)return;if(rule.enabled&&rule.trigger==='time'&&rule.time===`${p.hour}:${p.minute}`&&ruleAppliesOnDay(rule,now(),home.settings.timeZone)&&(!rule.mode||rule.mode===home.mode)&&fired.get(rule.id)!==key){fired.set(rule.id,key);await runRule(rule);}}}if(token!==generation)return;lastMinute=key;announce();}
 function ingestEntities(list){if(!Array.isArray(list)||list.length>200)throw new Error('İşlev verisi geçersiz.');const accepted=[];for(const item of list){if(!item||typeof item.entityId!=='string'||!(typeof item.value==='boolean'||(typeof item.value==='number'&&Number.isFinite(item.value)))||!(item.ageMs===null||(Number.isFinite(item.ageMs)&&item.ageMs>=0)))throw new Error('İşlev gözlemi geçersiz.');const entity=entities().find(e=>e.id===item.entityId);if(entity)accepted.push({item,previous:entityState(item.entityId)});}
  for(const {item,previous} of accepted){values.set(item.entityId,{value:item.value,age:item.ageMs===null?Infinity:item.ageMs,at:mono()});const current=entityState(item.entityId);if(previous.fresh&&current.fresh&&previous.value!==current.value)void event({entityId:item.entityId,value:item.value,fresh:true});}}
 async function poll(token){if(disposed||token!==generation||demo||!connected)return;
  request=new AbortController();const activeRequest=request;const timeout=setTimeout(()=>activeRequest.abort(),7000);
  try{
   const response=await fetcher(home.settings.statusUrl,{cache:'no-store',credentials:'omit',signal:activeRequest.signal});
   if(!response.ok)throw new Error(`HTTP ${response.status}`);const batch=await boundedJson(response);
   if(disposed||token!==generation)return;
   if(!Array.isArray(batch.devices)||batch.devices.length>64)throw new Error('Durum sözleşmesi geçersiz.');
   for(const item of batch.devices){
    const before=devices.status(item.deviceId);
    devices.ingest({...item,schemaVersion:1,sessionId:session,sequence:++sequence});
    if(before.bootId&&before.bootId!==item.bootId)for(const entity of entities())if(entity.deviceId===item.deviceId)values.delete(entity.id);
   }
   ingestEntities(batch.entities||[]);sourceError='';
  }catch(error){if(disposed||token!==generation)return;sourceError=`Bağlantı okunamadı: ${error.message}`;devices.disconnect();}
  finally{clearTimeout(timeout);if(token===generation&&!disposed&&connected){if(sourceError)reset();timer=setTimeout(()=>poll(token),sourceError?8000:5000);announce();}}
 }
 function disconnect(){generation++;connected=false;demoPaused=true;clearTimeout(timer);request?.abort();devices.disconnect();announce();}
 function connect(){if(demo)setDemo(false);disconnect();if(!home.settings.statusUrl)throw new Error('Önce durum adresini kaydedin.');demo=false;reset();connected=true;sourceError='';void poll(generation);announce();}
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
 const interval=setInterval(()=>{if(demo&&!demoPaused)demoPulse();void tick();},1000);void tick();
 return {home:()=>structuredClone(home),backup:()=>structuredClone(demo?savedHome:home),entities,entityState,deviceStatus,update,log,command,runScene,setMode,runRule,previewRule,setDemo,simulatePresence,pauseDemo(){if(demo){demoPaused=true;devices.disconnect();sourceError='Test bağlantısı kesildi';announce();}},connect,disconnect,tick,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},get demo(){return demo;},get connected(){return connected;},get storageError(){return storageError;},get sourceError(){return sourceError;},dispose(){disposed=true;disconnect();clearInterval(interval);listeners.clear();}};
}
async function boundedJson(response){
 if(!response.body)throw new Error('Yanıt gövdesi boş.');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw new Error('Yanıt sınırı aşıldı.');parts.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
