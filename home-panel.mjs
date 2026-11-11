import {createLocalPresenceBridge} from './local-presence.mjs?v=cloud20261111-17';
import {newId} from './browser-crypto.mjs?v=cloud20261111-17';
import {createHomeRuntime} from './home-runtime.mjs?v=cloud20261111-17';
import {saveRecord,deleteRecord,serializeBackup,parseBackup,modes,weekDays,filterHistory,deletionImpact,displayPages,displayRotations,displayTimeouts,displayThemes,defaultHubDisplay,getSolarTimes,panelApiUrl,cloudPanelOrigin} from './home-model.mjs?v=cloud20261111-17';
import {createCameraPlayer,cameraProfiles} from './camera-stream.mjs?v=cloud20261111-17';
const titles={home:'Genel bakış',rooms:'Odalar',cameras:'Kameralar',automations:'Otomasyonlar',scenes:'Sahneler',history:'Geçmiş',settings:'Ayarlar'};
const paths={home:'m3 10 9-7 9 7v10H3Z M9 20v-7h6v7',rooms:'M3 21V3h18v18M3 11h8V3m0 8v10m0-6h10',cameras:'M3 6h18v14H3z M7 6l2-3h6l2 3 M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',automations:'m13 2-9 12h7l-1 8 10-13h-7z',scenes:'m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L2.5 9.2l5.9-.9Z',history:'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2',settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',device:'M5 4h14v16H5z M9 8h6v8H9z',plus:'M12 5v14M5 12h14',radar:'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm0-14a6 6 0 1 0 6 6 6 6 0 0 0-6-6zm0 10a4 4 0 1 1 4-4 4 4 0 0 1-4 4zm0-6a2 2 0 1 0 2 2 2 2 0 0 0-2-2z'};
const labels={unknown:'Durum bilinmiyor',online:'Çevrimiçi',offline:'Çevrimdışı',delayed:'Veri gecikti',stale:'Veri güncel değil',disconnected:'Bağlantı kesildi',unregistered:'Kayıt dışı'};
const $=id=>document.getElementById(id);
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function icon(key){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');const p=document.createElementNS(s.namespaceURI,'path');p.setAttribute('d',paths[key]||paths.device);s.append(p);return s;}
function feedback(message,result='error'){
 const host=document.getElementById('home-feedback');if(!host)return;
 host.hidden=false;host.className=`hp-feedback ${['error','unknown'].includes(result)?'is-error':''}`;
 host.setAttribute('role',['error','unknown'].includes(result)?'alert':'status');host.replaceChildren(el('p',message));
 const close=el('button','Kapat','hp-text-button');close.type='button';close.addEventListener('click',()=>{host.hidden=true;});host.append(close);
}
function button(text,fn,cls='hp-button'){
 const b=el('button',text,cls);b.type='button';
 b.addEventListener('click',async()=>{if(b.disabled)return;b.disabled=true;try{const result=await fn();if(result?.message&&result?.result)feedback(result.message,result.result);}catch(error){feedback(error.message);}finally{b.disabled=false;}});
 return b;
}
function link(text,hash,cls='hp-link'){const a=el('a',text,cls);a.href=hash;return a;}
function download(text,name,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=link('',url);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function date(value,timeZone){return new Intl.DateTimeFormat('tr-TR',{dateStyle:'short',timeStyle:'short',timeZone}).format(new Date(value));}
export function createHomePanel({inventory,runtime:injectedRuntime}){
 const host=el('section',undefined,'home-panel');host.id='home-panel';host.hidden=true;$('content').append(host);
 let storage;try{storage=window.localStorage;}catch{}
 const notice=el('aside',undefined,'hp-feedback');notice.id='home-feedback';notice.hidden=true;$('content').insertBefore(notice,host);
 const runtime=injectedRuntime||createHomeRuntime(inventory,{storage});let page='',detail='',cameraPlayer,selectedCamera='',cameraProfile='smooth',lastHome='',lastDemo=false,historyQuery='',historyResult='all',historyKind='all';
 const presenceBridge=createLocalPresenceBridge({runtime});
 if(!runtime.remote&&window.location.protocol==='https:'&&!['localhost','127.0.0.1','[::1]'].includes(window.location.hostname))void presenceBridge.connectCloud().catch(()=>{});
 const modal=el('dialog',undefined,'detail-dialog hp-dialog');document.body.append(modal);let focusBack;
 modal.addEventListener('close',()=>{focusBack?.isConnected&&focusBack.focus();});modal.addEventListener('click',event=>{if(event.target===modal)modal.close();});
 function formDialog(title,build,submit){focusBack=document.activeElement;modal.replaceChildren();const header=el('div',undefined,'dialog-header');header.append(el('h2',title),button('Kapat',()=>modal.close(),'dialog-close'));const form=el('form',undefined,'dialog-body hp-form'),error=el('p','','hp-form-error');error.setAttribute('role','alert');const fields=build(form);const actions=el('div',undefined,'hp-actions');const save=el('button','Kaydet','hp-button');save.type='submit';actions.append(button('Vazgeç',()=>modal.close(),'hp-button secondary'),save);form.append(error,actions);form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{await submit(fields);modal.close();render();feedback('Kaydedildi.','ok');}catch(e){error.textContent=e.message;}finally{save.disabled=false;}});modal.append(header,form);modal.showModal();}
 function input(form,label,value='',type='text',required=true){const wrap=el('label',undefined,'hp-field');wrap.append(el('span',label));const field=el('input');field.type=type;field.value=value;field.required=required;if(type==='text')field.maxLength=label==='Ölçü birimi (isteğe bağlı)'?24:160;wrap.append(field);form.append(wrap);return field;}
 function select(form,label,options,value){const wrap=el('label',undefined,'hp-field');wrap.append(el('span',label));const field=el('select');for(const [v,name]of options){const o=el('option',name);o.value=v;field.append(o);}if(value!==undefined)field.value=value;wrap.append(field);form.append(wrap);return field;}
 function check(form,label,value=false){const wrap=el('label',undefined,'hp-check');const field=el('input');field.type='checkbox';field.checked=value;wrap.append(field,el('span',label));form.append(wrap);return field;}
 const get=()=>runtime.home();
 const formatDate=value=>date(value,get().settings.timeZone);
 const commit=(collection,record)=>runtime.update(h=>{
  const next={...record};
  if(['automations','scenes'].includes(collection)){
   const current=h[collection].find(r=>r.id===record.id);
   for(const key of ['lastRun','lastPreview']){if(current?.[key])next[key]=current[key];else delete next[key];}
  }
  return saveRecord(h,collection,next);
 });
 function confirmDialog(title,lines,perform,label='Onayla'){
  if(modal.open)modal.close();focusBack=document.activeElement;modal.replaceChildren();
  const header=el('div',undefined,'dialog-header');header.append(el('h2',title),button('Kapat',()=>modal.close(),'dialog-close'));
  const body=el('div',undefined,'dialog-body');for(const line of lines)body.append(el('p',line,'hp-muted'));
  const error=el('p','','hp-form-error');error.setAttribute('role','alert');
  const confirm=button(label,async()=>{try{await perform();modal.close();render();feedback('İşlem tamamlandı.','ok');}catch(e){error.textContent=e.message;}});
  body.append(error,actions(button('Vazgeç',()=>modal.close(),'hp-button secondary'),confirm));modal.append(header,body);modal.showModal();
 }
 function remove(collection,id){
  const impact=deletionImpact(get(),collection,id),lines=[`${impact.name} kaydı silinecek.`];
  for(const [key,label]of [['removedRules','Silinecek otomasyonlar'],['removedScenes','Silinecek sahneler'],['changedScenes','İşlemi kaldırılacak sahneler'],['unassignedEntities','Oda ataması kaldırılacak işlevler'],['unassignedCameras','Oda ataması kaldırılacak kameralar']])if(impact[key].length)lines.push(`${label}: ${impact[key].join(', ')}`);
  confirmDialog('Kaydı sil',lines,()=>{if(JSON.stringify(deletionImpact(get(),collection,id))!==JSON.stringify(impact))throw new Error('Bağlı kayıtlar değişti. Pencereyi kapatıp silme işlemini yeniden açın.');return runtime.update(h=>deleteRecord(h,collection,id));},'Sil');
 }
 function card(title,description,key='rooms'){const c=el('article',undefined,'hp-card');const top=el('div',undefined,'hp-card-head'),mark=el('span',undefined,'hp-icon');mark.append(icon(key));top.append(mark);c.append(top,el('h2',title));if(description)c.append(el('p',description,'hp-muted'));return c;}
 function actions(...buttons){const a=el('div',undefined,'hp-actions');a.append(...buttons);return a;}
 function grid(){const g=el('div',undefined,'hp-grid');host.append(g);return g;}
 function empty(title,text,action){const box=el('div',undefined,'hp-empty');box.append(el('h2',title),el('p',text));if(action)box.append(action);host.append(box);}
 function heading(text,action){const row=el('div',undefined,'section-heading hp-section-heading');row.append(el('h2',text));if(action)row.append(action);host.append(row);}
 function roomName(id){return get().rooms.find(r=>r.id===id)?.name||'Oda atanmamış';}
 function catalog(){const entries=new Map(inventory.devices.map(d=>[d.id,d]));for(const d of get().devices||[])entries.set(d.id,{...entries.get(d.id),...d,icon:d.role==='camera'?'camera':entries.get(d.id)?.icon});return [...entries.values()].filter(d=>d.id!=='uno-history');}
 function deviceName(id){return catalog().find(d=>d.id===id)?.name||id;}
 function cameraSnapshotUrl(deviceId){return panelApiUrl(`/api/camera/snapshot?deviceId=${encodeURIComponent(deviceId)}&_armut=${Date.now()}`);}
 function hubDisplayPreviewUrl(){return panelApiUrl(`/api/hub/display/preview?_armut=${Date.now()}`);}
 async function dispatchHubDisplayCommand(entityId,value){
  if(runtime.demo)return {ok:true,mode:'demo'};
  const hubBoot=runtime.deviceStatus('hub')?.bootId||'hub';
  const payload={version:1,commandId:newId(),entityId,value:String(value),bootId:hubBoot};
  if(runtime.remote&&typeof runtime.presenceCommand==='function'){
   try{
    const res=await runtime.presenceCommand(payload);
    return {ok:Boolean(res?.applied),mode:res?.applied?'lan':(res?.mode||'offline')};
   }catch{return {ok:false,mode:'offline'};}
  }
  const cmdUrl=get().settings?.commandUrl||panelApiUrl('/api/presence/command');
  if(typeof fetch==='function'&&cmdUrl){
   try{
    const res=await fetch(cmdUrl,{method:'POST',cache:'no-store',credentials:cloudPanelOrigin()?'omit':'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(4000)});
    if(res.ok){
     const body=await res.json().catch(()=>({}));
     if(body?.applied===false)return {ok:false,mode:body.mode||'offline'};
     return {ok:true,mode:runtime.deviceStatus('hub')?.state==='online'?'cloud-live':'cloud-queued'};
    }
   }catch{}
  }
  return {ok:false,mode:'offline'};
 }
 async function syncHubDisplayHardware(nextDisplay,prevDisplay){
  const pageMap={status:'home',presence:'assistant',sensors:'assistant',system:'network',home:'home',assistant:'assistant',network:'network'};
  const targetLayout=pageMap[nextDisplay?.defaultPage]||'home';
  const r1=await dispatchHubDisplayCommand('hub-display-layout',targetLayout);
  if(prevDisplay===undefined||String(nextDisplay?.rotation)!==String(prevDisplay?.rotation)){
   const targetRot=String(nextDisplay?.rotation??0);
   await dispatchHubDisplayCommand('hub-display-orientation',targetRot);
  }
  return r1;
 }
 function entityForm(record){if(runtime.remote&&!runtime.demo&&!record){feedback('Gerçek işlevler cihazın ilk raporuyla eklenir. Önce cihaz kaydedip firmware bağlantısını kurun.');return;}formDialog(record?'İşlevi düzenle':'İşlev ekle',form=>({name:input(form,'İşlev adı',record?.name||''),device:select(form,'Cihaz',catalog().map(d=>[d.id,d.name]),record?.deviceId),room:select(form,'Oda',[['','Oda atama'],...get().rooms.map(r=>[r.id,r.name])],record?.roomId),kind:select(form,'İşlev',[['switch','Aç / kapat'],['presence','Varlık sensörü'],['sensor','Sayısal sensör']],record?.kind),unit:input(form,'Ölçü birimi (isteğe bağlı)',record?.unit||'','text',false)}),f=>commit('entities',{...record,id:record?.id||newId(),name:f.name.value.trim(),deviceId:f.device.value,roomId:f.room.value,kind:f.kind.value,...(f.unit.value.trim()?{unit:f.unit.value.trim()}:{unit:undefined}),...(record?.test?{test:true}:{})}));}
 function ruleForm(record){const switches=get().entities.filter(e=>e.kind==='switch');if(!switches.length){feedback('Önce Ayarlar → İşlevler bölümünden bir aç/kapat işlevi ekleyin.');return;}
 formDialog(record?'Otomasyonu düzenle':'Otomasyon ekle',form=>{const name=input(form,'Otomasyon adı',record?.name||'');const trigger=select(form,'Ne zaman?',[['time','Belirli bir saatte'],['sun','Güneş döngüsünde (gün doğumu / batımı)'],['state','Sensör / anahtar durumu değişince'],['mode','Ev modu değişince'],['numeric','Sayısal eşik geçilince']],record?.trigger);const time=input(form,'Saat',record?.time||'23:00','time');const sunEvent=select(form,'Güneş döngüsü',[['sunrise','Gün doğumu (sabah)'],['sunset','Gün batımı (akşam)']],record?.sunEvent||'sunset');const delay=input(form,'Gecikme süresi (saniye)',record?(record.delaySeconds??0):0,'number');delay.min=0;delay.max=86400;delay.step=1;delay.parentElement.append(el('small','0: gecikme yok. Tetiklendikten sonra komut gönderilmeden önce beklenecek süre.','hp-muted'));const sources=get().entities.filter(e=>['switch','presence','sensor'].includes(e.kind));const source=select(form,'Tetikleyen işlev',sources.map(e=>[e.id,e.name]),record?.sourceId);const expected=select(form,'Yeni durum',[['true','Açık / varlık algılandı'],['false','Kapalı / varlık yok bildirildi']],String(record?.expected??true));const expectedMode=select(form,'Yeni ev modu',Object.entries(modes),record?.expectedMode);const operator=select(form,'Eşik yönü',[['above','Eşik yukarı geçilince'],['below','Eşik aşağı geçilince']],record?.operator);const threshold=input(form,'Eşik değeri',record?.threshold??0,'number');threshold.step='any';const sync=()=>{const chosen=source.value;source.replaceChildren();for(const e of sources.filter(e=>trigger.value==='numeric'?e.kind==='sensor':e.kind!=='sensor')){const o=el('option',e.name+(e.unit?` (${e.unit})`:''));o.value=e.id;source.append(o);}if([...source.options].some(o=>o.value===chosen))source.value=chosen;operator.parentElement.hidden=threshold.parentElement.hidden=trigger.value!=='numeric';time.parentElement.hidden=trigger.value!=='time';sunEvent.parentElement.hidden=trigger.value!=='sun';source.parentElement.hidden=!['state','numeric'].includes(trigger.value);expected.parentElement.hidden=trigger.value!=='state';expectedMode.parentElement.hidden=trigger.value!=='mode';};trigger.addEventListener('change',sync);sync();const mode=select(form,'Yalnız bu ev modunda',[['','Her modda'],...Object.entries(modes)],record?.mode);const daysBox=el('fieldset',undefined,'hp-check-list hp-weekdays');daysBox.append(el('legend','Çalışma günleri'));const days=weekDays.map(([day,name])=>({day,field:check(daysBox,name,record?.days?record.days.includes(day):true)}));form.append(daysBox);const cooldown=input(form,'Tekrar çalışmadan önce bekle (saniye)',record?(record.cooldownSeconds??0):60,'number');cooldown.min=0;cooldown.max=86400;cooldown.step=1;cooldown.parentElement.append(el('small','0: bekleme yok. Süre dolmadan yeni bir komut gönderilmez.','hp-muted'));const target=select(form,'Hangi işlev?',switches.map(e=>[e.id,e.name]),record?.action.entityId);const value=select(form,'Ne yap?',[['true','Aç'],['false','Kapat']],String(record?.action.value??false));const observe=check(form,'Önce yalnız izle · komut göndermeden kaydet',record?.observeOnly??true);const enabled=check(form,'Otomasyon etkin',record?.enabled??true);form.append(el('p',runtime.remote&&!runtime.demo?'Kurallar yerel denetleyici çalıştığı sürece panel kapalıyken de yürür.':'Zaman ve kurallar bu panel açıkken çalışır. Kapalı sekmede sürekli çalışan bir ev sunucusu değildir.','hp-muted'));return {name,trigger,time,sunEvent,delay,source,expected,expectedMode,mode,days,cooldown,operator,threshold,target,value,observe,enabled};},f=>commit('automations',{...record,id:record?.id||newId(),name:f.name.value.trim(),trigger:f.trigger.value,time:f.time.value,sunEvent:f.sunEvent.value,delaySeconds:Number(f.delay.value)||0,sourceId:f.source.value,...(f.trigger.value==='numeric'?{operator:f.operator.value,threshold:Number(f.threshold.value)}:{}),expected:f.expected.value==='true',expectedMode:f.expectedMode.value,mode:f.mode.value,days:f.days.filter(d=>d.field.checked).map(d=>d.day),cooldownSeconds:Number(f.cooldown.value),action:{entityId:f.target.value,value:f.value.value==='true'},observeOnly:f.observe.checked,enabled:f.enabled.checked}));}
 function sceneForm(record){const switches=get().entities.filter(e=>e.kind==='switch');if(!switches.length){feedback('Önce Ayarlar’dan bir aç/kapat işlevi ekleyin.');return;}
 formDialog(record?'Sahneyi düzenle':'Sahne ekle',form=>{const name=input(form,'Sahne adı',record?.name||'');const choices=switches.map(e=>{const selected=record?.actions.find(a=>a.entityId===e.id);const enabled=check(form,e.name,Boolean(selected));const value=select(form,'Uygulanacak durum',[['true','Aç'],['false','Kapat']],String(selected?.value??false));return {id:e.id,enabled,value};});return {name,choices};},f=>commit('scenes',{...record,id:record?.id||newId(),name:f.name.value.trim(),actions:f.choices.filter(c=>c.enabled.checked).map(c=>({entityId:c.id,value:c.value.value==='true'}))}));}
 function entityCard(entity){const c=card(entity.name,roomName(entity.roomId),'device');const status=el('p','','hp-value');status.dataset.entityLive=entity.id;c.append(status);if(entity.test)c.append(el('span','TEST · fiziksel cihaz değil','hp-pill'));
 if(entity.kind==='switch')c.append(actions(button('Aç',()=>runtime.command(entity.id,true)),button('Kapat',()=>runtime.command(entity.id,false),'hp-button secondary')));else if(entity.test)c.append(button('Varlığı değiştir',()=>runtime.simulatePresence()));return c;}
 function liveLine(id){const p=el('p','','hp-live');p.dataset.deviceLive=id;return p;}
 function renderHome(){
  const h=get();
  const hero=el('div',undefined,'welcome hp-welcome');
  const copy=el('div');
  copy.append(el('h2','Evinizin Donanımı & Canlı Durum'),el('p','ESP32 düğümleri, doğrudan kamera görüntüleri ve LD2410C radar takibi.'));
  const solar=getSolarTimes(new Date(),h.settings.timeZone);
  copy.append(el('p',`${solar.isDay?'☀️ Gündüz':'🌙 Gece'} · Gün doğumu ${solar.sunrise} · Gün batımı ${solar.sunset}`,'hp-solar-line'));
  const mode=select(copy,'Ev modu',Object.entries(modes),h.mode);
  mode.addEventListener('change',()=>runtime.setMode(mode.value).catch(e=>feedback(e.message)));
  hero.append(copy,icon('home'));
  host.append(hero);

  heading('Fiziksel Cihazlar ve Canlı Akışlar',link('Donanım Haritası →','#devices'));
  const devices=grid();

  const hubCard=el('article',undefined,'hp-card');
  const hubTop=el('div',undefined,'hp-card-head');
  const hubIcon=el('span',undefined,'hp-icon');hubIcon.append(icon('device'));
  hubTop.append(hubIcon,liveLine('hub'));
  hubCard.append(hubTop,el('h2','Merkez ESP32-S3 Kartı · Salon'),el('p','ESP32-S3 N16R8 · ST7789V3 1.69" TFT · 30A Röle','hp-muted'));

  const display=h.settings.hubDisplay||defaultHubDisplay();
  const pageName=displayPages.find(([k])=>k===display.defaultPage)?.[1]||'Durum ve Saat';
  const hubFrame=el('div',undefined,'hw-camera-preview-frame hw-display-frame');
  const hubImg=el('img');
  hubImg.src=hubDisplayPreviewUrl();
  hubImg.alt='Hub ST7789V3 Ekran Önizlemesi';
  hubImg.onerror=()=>{hubFrame.style.display='none';};
  const hubBadge=el('span',`ST7789 · ${pageName}`,'hw-stream-badge');
  hubFrame.append(hubImg,hubBadge);
  hubCard.append(hubFrame);

  const hubRelay=h.entities.find(e=>e.id==='hub-relay');
  if(hubRelay){
   hubCard.append(el('strong',hubRelay.name,'hp-identifier'));
   const relayVal=el('p','','hp-value');relayVal.dataset.entityLive='hub-relay';
   hubCard.append(relayVal,actions(
    button('Aç',()=>runtime.command('hub-relay',true)),
    button('Kapat',()=>runtime.command('hub-relay',false),'hp-button secondary')
   ));
  }
  hubCard.append(actions(
   link('Ekran Modu ve Kontroller →','#device/hub'),
   link('Donanım Pin Şeması →','#hub','hp-button secondary')
  ));
  devices.append(hubCard);

  const cam2Card=el('article',undefined,'hp-card');
  const cam2Top=el('div',undefined,'hp-card-head');
  const cam2Icon=el('span',undefined,'hp-icon');cam2Icon.append(icon('cameras'));
  cam2Top.append(cam2Icon,liveLine('camera-02'));
  cam2Card.append(cam2Top,el('h2','Kamera 2 · Giriş / Koridor'),el('p','ESP32-CAM · Hi-Link LD2410C 24GHz mmWave Radar','hp-muted'));

  const cam2Frame=el('div',undefined,'hw-camera-preview-frame');
  const cam2Img=el('img');
  cam2Img.src=cameraSnapshotUrl('camera-02');
  cam2Img.alt='Kamera 2 Canlı Görüntü';
  cam2Img.onerror=()=>{cam2Frame.style.display='none';};
  const cam2Badge=el('span','25 FPS · MJPEG','hw-stream-badge');
  cam2Frame.append(cam2Img,cam2Badge);
  cam2Card.append(cam2Frame);

  const radarBox=el('div',undefined,'hw-radar-status');
  radarBox.append(icon('radar'));
  const radarCopy=el('div');
  radarCopy.append(el('strong','LD2410C 24GHz mmWave Radar'));
  const radarVal=el('p','','hp-value');radarVal.dataset.entityLive='presence-radar';
  radarCopy.append(radarVal);
  radarBox.append(radarCopy);
  cam2Card.append(radarBox);

  const cam02Led=h.entities.find(e=>e.id==='cam02-led');
  if(cam02Led){
   cam2Card.append(el('strong',cam02Led.name,'hp-identifier'));
   const ledVal=el('p','','hp-value');ledVal.dataset.entityLive='cam02-led';
   cam2Card.append(ledVal,actions(
    button('Spot Aç',()=>runtime.command('cam02-led',true)),
    button('Spot Kapat',()=>runtime.command('cam02-led',false),'hp-button secondary')
   ));
  }
  cam2Card.append(actions(
   link('Canlı Akışı Aç →','#cameras/camera-02'),
   link('Donanım Pin Şeması →','#camera-02','hp-button secondary')
  ));
  devices.append(cam2Card);

  const cam1Card=el('article',undefined,'hp-card');
  const cam1Top=el('div',undefined,'hp-card-head');
  const cam1Icon=el('span',undefined,'hp-icon');cam1Icon.append(icon('cameras'));
  cam1Top.append(cam1Icon,liveLine('camera-01'));
  cam1Card.append(cam1Top,el('h2','Kamera 1 · Salon'),el('p','ESP32-CAM · OV2640 · Salon','hp-muted'));

  const cam1Frame=el('div',undefined,'hw-camera-preview-frame');
  const cam1Img=el('img');
  cam1Img.src=cameraSnapshotUrl('camera-01');
  cam1Img.alt='Kamera 1 Canlı Görüntü';
  cam1Img.onerror=()=>{cam1Frame.style.display='none';};
  const cam1Badge=el('span','25 FPS · MJPEG','hw-stream-badge');
  cam1Frame.append(cam1Img,cam1Badge);
  cam1Card.append(cam1Frame);

  const cam01Led=h.entities.find(e=>e.id==='cam01-led');
  if(cam01Led){
   cam1Card.append(el('strong',cam01Led.name,'hp-identifier'));
   const ledVal=el('p','','hp-value');ledVal.dataset.entityLive='cam01-led';
   cam1Card.append(ledVal,actions(
    button('Spot Aç',()=>runtime.command('cam01-led',true)),
    button('Spot Kapat',()=>runtime.command('cam01-led',false),'hp-button secondary')
   ));
  }
  cam1Card.append(actions(
   link('Canlı Akışı Aç →','#cameras/camera-01'),
   link('Donanım Pin Şeması →','#camera-01','hp-button secondary')
  ));
  devices.append(cam1Card);

  if(h.scenes.length){
   heading('Hızlı Sahneler',link('Tüm Sahneler →','#scenes'));
   const scGrid=grid();
   for(const s of h.scenes.slice(0,3)){
    const c=card(s.name,`${s.actions.length} donanım eylemi`,'scenes');
    sceneResult(s,c);
    c.append(actions(sceneButton(s.id,'Uygula'),sceneButton(s.id,'Dene',true)));
    scGrid.append(c);
   }
  }
 }
 function renderConnectedDevice(){const device=catalog().find(d=>d.id===detail);if(!device){empty('Cihaz bulunamadı','Kayıt kaldırılmış olabilir.',link('Cihazlara dön','#devices'));return;}const c=card(device.name,device.role==='camera'?'Kamera':device.role==='hub'?'Ev merkezi':'ESP32 düğümü','device');c.append(liveLine(device.id),el('code',device.id,'hp-identifier'));host.append(c);if(device.id==='hub'||device.role==='hub'){const display=get().settings.hubDisplay||defaultHubDisplay();const pageName=displayPages.find(([k])=>k===display.defaultPage)?.[1]||'Durum ve Saat';const rotName=displayRotations.find(([k])=>k===display.rotation)?.[1]||'0° Dikey';heading('ST7789V3 Ekran');const dCard=card('1.69 inç 240×280 TFT',`Parlaklık: %${display.brightness ?? 80} · Yön: ${rotName} · Sayfa: ${pageName}`,'device');const hubOnline=runtime.deviceStatus('hub')?.state==='online';const previewImg=el('img',undefined,'hp-display-preview');if(hubOnline)previewImg.src=hubDisplayPreviewUrl();previewImg.alt='Hub ST7789V3 Ekran Önizlemesi';previewImg.style=`max-width:240px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);margin:10px 0;display:${hubOnline?'block':'none'};`;previewImg.onerror=()=>{previewImg.style.display='none';};dCard.append(previewImg);const exprActions=el('div',undefined,'hp-actions');const sendExpr=async(expression)=>{try{const res=await dispatchHubDisplayCommand('hub-display-expression',expression,{expression,ttl_ms:3000});if(res.mode==='lan'||res.mode==='cloud-live'||res.mode==='demo'){feedback(`${expression} ifadesi Hub ST7789 ekranına iletildi.`,'ok');setTimeout(()=>{previewImg.style.display='block';previewImg.src=hubDisplayPreviewUrl();},600);}else if(res.mode==='cloud-queued'){feedback(`${expression} komutu bulut kuyruğuna alındı (Hub çevrimiçi olduğunda uygulanacak).`,'ok');}else{feedback('Hub ekranına ulaşılamadı; bağlantı kapalı.','error');}}catch(e){feedback(e.message);}};exprActions.append(button('❤️ Kalp',()=>sendExpr('heart'),'hp-button secondary'),button('⭐ Yıldız',()=>sendExpr('star'),'hp-button secondary'),button('🙂 Gülümse',()=>sendExpr('smile'),'hp-button secondary'),button('🌸 Çiçek',()=>sendExpr('flower'),'hp-button secondary'),button('📸 Ekranı Yenile',()=>{previewImg.style.display='block';previewImg.src=hubDisplayPreviewUrl();},'hp-button secondary'));dCard.append(exprActions,actions(link('Ekran ayarlarını düzenle →','#settings'),link('Donanım pin şeması →',`#${encodeURIComponent(device.id)}`,'hp-button secondary')));host.append(dCard);}heading('Kontroller');const items=get().entities.filter(e=>e.deviceId===device.id);if(!items.length)host.append(el('p','İlk cihaz raporu geldiğinde desteklenen işlevler burada görünür.','hp-muted'));const g=grid();for(const e of items)g.append(entityCard(e));if(device.role==='camera')host.append(link('Kamera görüntüsü →',`#cameras/${device.id}`));host.append(link('Bağlantı ve oda ayarları →','#settings'));}
 function renderRooms(){
  const h=get();
  heading(detail?`Bölge: ${roomName(detail)}`:'Fiziksel Donanım Bölgeleri');
  host.append(el('p','Sabit fiziksel ESP32 donanım düğümlerinin konuşlandırıldığı yaşam ve kontrol alanları.','hp-footnote'));
  const rooms=detail?h.rooms.filter(r=>r.id===detail):h.rooms;
  if(!rooms.length){
   empty('Fiziksel bölge kaydı yok','Cihaz donanımları yüklendiğinde bölgeler burada listelenir.');
   return;
  }
  for(const r of rooms){
   heading(r.name);
   const g=grid();
   for(const devId of r.deviceIds){
    const d=catalog().find(item=>item.id===devId);
    if(!d)continue;
    const c=el('article',undefined,'hp-card');
    const top=el('div',undefined,'hp-card-head');
    const mark=el('span',undefined,'hp-icon');
    mark.append(icon(d.icon==='camera'||d.role==='camera'?'cameras':'device'));
    top.append(mark,liveLine(d.id));
    c.append(top,el('h2',d.name),el('p',d.summary||'ESP32 Akıllı Ev Düğümü','hp-muted'));

    if(d.id==='hub'||d.role==='hub'){
     if(runtime.deviceStatus(d.id)?.state==='online'){
      const hubFrame=el('div',undefined,'hw-camera-preview-frame hw-display-frame');
      const hubImg=el('img');hubImg.src=hubDisplayPreviewUrl();hubImg.alt='ST7789 Ekranı';
      hubImg.onerror=()=>{hubFrame.style.display='none';};
      hubFrame.append(hubImg);c.append(hubFrame);
     }
     const relay=h.entities.find(e=>e.deviceId===d.id&&e.kind==='switch');
     if(relay){
      c.append(el('strong',relay.name,'hp-identifier'));
      const rVal=el('p','','hp-value');rVal.dataset.entityLive=relay.id;
      c.append(rVal,actions(
       button('Aç',()=>runtime.command(relay.id,true)),
       button('Kapat',()=>runtime.command(relay.id,false),'hp-button secondary')
      ));
     }
     c.append(actions(link('Ekran Modu ve Kontroller →',`#device/${d.id}`),link('Donanım Şeması →',`#${encodeURIComponent(d.id)}`,'hp-button secondary')));
    }else if(d.icon==='camera'||d.role==='camera'){
     const camFrame=el('div',undefined,'hw-camera-preview-frame');
     const camImg=el('img');camImg.src=cameraSnapshotUrl(d.id);camImg.alt=d.name;
     camImg.onerror=()=>{camFrame.style.display='none';};
     camFrame.append(camImg);c.append(camFrame);

     if(d.id==='camera-02'){
      const radarBox=el('div',undefined,'hw-radar-status');
      radarBox.append(icon('radar'));
      const radarText=el('div');
      radarText.append(el('strong','LD2410C 24GHz mmWave Radar'));
      const radarVal=el('p','','hp-value');radarVal.dataset.entityLive='presence-radar';
      radarText.append(radarVal);
      radarBox.append(radarText);
      c.append(radarBox);
     }

     const led=h.entities.find(e=>e.deviceId===d.id&&e.kind==='switch');
     if(led){
      c.append(el('strong',led.name,'hp-identifier'));
      const lVal=el('p','','hp-value');lVal.dataset.entityLive=led.id;
      c.append(lVal,actions(
       button('Spot Aç',()=>runtime.command(led.id,true)),
       button('Spot Kapat',()=>runtime.command(led.id,false),'hp-button secondary')
      ));
     }
     c.append(actions(link('Canlı Akışı Aç →',`#cameras/${d.id}`),link('Donanım Şeması →',`#${encodeURIComponent(d.id)}`,'hp-button secondary')));
    }else{
     const devEntities=h.entities.filter(e=>e.deviceId===d.id);
     for(const ent of devEntities){
      c.append(el('strong',ent.name,'hp-identifier'));
      const val=el('p','','hp-value');val.dataset.entityLive=ent.id;
      c.append(val);
      if(ent.kind==='switch')c.append(actions(button('Aç',()=>runtime.command(ent.id,true)),button('Kapat',()=>runtime.command(ent.id,false),'hp-button secondary')));
     }
     c.append(actions(link('Donanım Şeması →',`#${encodeURIComponent(d.id)}`,'hp-button secondary')));
    }
    g.append(c);
   }
  }
 }
 function renderCameras(){
  heading('Kamera Donanımları & Canlı Akış',el('span','ESP-IDF 5.5 · MJPEG / JPEG','hp-pill'));
  const list=catalog().filter(d=>d.icon==='camera'||d.role==='camera');
  if(!list.length){
   empty('Kamera donanımı bulunamadı','Cihaz envanterine ESP32-CAM eklendiğinde burada görünür.');
   return;
  }
  const g=grid();
  for(const d of list){
   const c=el('article',undefined,'hp-card hw-camera-card');
   const top=el('div',undefined,'hp-card-head');
   const mark=el('span',undefined,'hp-icon');mark.append(icon('cameras'));
   top.append(mark,liveLine(d.id));
   c.append(top,el('h2',d.name),el('p',d.summary||'ESP32-CAM Video Düğümü','hp-muted'));

   const frame=el('div',undefined,'hw-camera-preview-frame');
   const img=el('img');
   img.src=cameraSnapshotUrl(d.id);
   img.alt=`${d.name} Anlık Görüntü`;
   img.onerror=()=>{frame.style.display='none';};
   const badge=el('span','25 FPS · MJPEG','hw-stream-badge');
   frame.append(img,badge);
   c.append(frame);

   if(d.id==='camera-02'){
    const radarBox=el('div',undefined,'hw-radar-status');
    radarBox.append(icon('radar'));
    const radarCopy=el('div');
    radarCopy.append(el('strong','Hi-Link LD2410C 24GHz mmWave Radar'));
    const radarVal=el('p','','hp-value');radarVal.dataset.entityLive='presence-radar';
    radarCopy.append(radarVal);
    radarBox.append(radarCopy);
    c.append(radarBox);
   }

   const ledId=d.id==='camera-02'?'cam02-led':'cam01-led';
   const ledEntity=get().entities.find(e=>e.id===ledId);
   if(ledEntity){
    c.append(el('strong',ledEntity.name,'hp-identifier'));
    const ledVal=el('p','','hp-value');ledVal.dataset.entityLive=ledId;
    c.append(ledVal,actions(
     button('Spot Aç',()=>runtime.command(ledId,true)),
     button('Spot Kapat',()=>runtime.command(ledId,false),'hp-button secondary')
    ));
   }

   c.append(actions(
    button('Canlı Akışı Aç',()=>{selectedCamera=d.id;location.hash=`#cameras/${d.id}`;render();}),
    link('Donanım Pin Şeması →',`#${encodeURIComponent(d.id)}`,'hp-button secondary')
   ));
   g.append(c);
  }

  const target=detail||selectedCamera;
  if(target){
   const config=get().cameras.find(c=>c.deviceId===target)||{
    id:`cam-${target}`,deviceId:target,name:deviceName(target),
    url:target==='camera-01'?'http://192.168.1.119/stream':'http://192.168.1.116:81/stream',
    transport:'mjpeg'
   };
   cameraView(config);
  }
 }
 function cameraView(config){
  const isHttps=typeof location!=='undefined'&&location.protocol==='https:';
  let playback=runtime.cameraConfig?.(config)||structuredClone(config);
  if(isHttps&&playback.url?.startsWith('http://')){
   playback.url=panelApiUrl(`/api/camera/snapshot?deviceId=${encodeURIComponent(config.deviceId||'camera-02')}`);
   playback.transport='jpeg';
  }
  heading(config.name);const viewer=el('div',undefined,'hp-viewer');const image=el('img');image.alt=`${config.name} canlı kamera görüntüsü`;image.hidden=true;const message=el('p','Yayın hazır. Başlat düğmesine basın.','hp-camera-message');const stage=el('div',undefined,'hp-camera-stage');stage.append(image,message);const toolbar=el('div',undefined,'hp-camera-toolbar');const profile=select(toolbar,'Görüntü profili',Object.entries(cameraProfiles).map(([key,p])=>[key,p.name]),cameraProfile);const fps=el('span','FPS ölçülmedi','hp-pill');fps.setAttribute('aria-live','off');const status=el('span','Durduruldu','hp-muted');status.setAttribute('role','status');
 cameraPlayer=createCameraPlayer({image,...(runtime.remote&&runtime.cameraFetcher?{fetcher:runtime.cameraFetcher}:{}),onStatus:value=>{message.textContent=value.message;status.textContent=value.message;image.hidden=value.state!=='playing';message.hidden=value.state==='playing';fps.textContent=value.fps===null?'FPS ölçülmedi':`${value.fps.toFixed(1)} FPS · alınan kare`;}});
 profile.addEventListener('change',()=>{cameraProfile=profile.value;note.textContent=cameraProfiles[cameraProfile].note+(config.profileUrl?'':' · cihaz profil adresi olmadan yalnız görüntü alma hedefi değişir');if(cameraPlayer.running)cameraPlayer.start(playback,cameraProfile);});const note=el('p',cameraProfiles[cameraProfile].note+(config.profileUrl?'':' · cihaz profil adresi ayarlanmamış'),'hp-footnote');const start=button('Yayını başlat',()=>{if(runtime.demo)throw new Error('Test modunda gerçek kamera bağlantısı açılmaz.');cameraPlayer.start(playback,profile.value);});if(runtime.demo){start.disabled=true;message.textContent='Test modunda gerçek kameraya istek gönderilmez.';}const stop=button('Durdur',()=>cameraPlayer.stop(),'hp-button secondary');let mirror=false,rotate=0;const orient=()=>image.style.transform=`rotate(${rotate}deg) scaleX(${mirror?-1:1})`;
 toolbar.append(start,stop,fps,button('Tam ekran',()=>stage.requestFullscreen?.(),'hp-button secondary'),button('Fotoğraf kaydet',()=>{const blob=cameraPlayer.snapshot();if(!blob)throw new Error('Kaydedilecek güncel kare yok.');const u=URL.createObjectURL(blob);const a=link('',u);a.download=`${config.deviceId}-${Date.now()}.jpg`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);},'hp-button secondary'));
 const extra=el('details',undefined,'hp-details');extra.append(el('summary','Görüntü yönü'));extra.append(actions(button('Aynala',()=>{mirror=!mirror;orient();},'hp-button secondary'),button('180° döndür',()=>{rotate=(rotate+180)%360;orient();},'hp-button secondary')));
 if(isHttps)viewer.append(el('p','🌐 Bulut HTTPS modu: Anlık JPEG fotoğraflar aktarılır (Kesintisiz 25 FPS MJPEG akışı yerel ağ / Tailscale http:// üzerinden izlenir).','hp-footnote'));
 viewer.append(stage,toolbar,status,note,extra);host.append(viewer);
 }
 function renderAutomations(){
  heading('Donanım Mantık Motoru & Kurallar',button('Otomasyon ekle',()=>ruleForm()));
  host.append(el('p',(runtime.remote&&!runtime.demo?'Kurallar yerel ESP32 denetleyicisinde kesintisiz çalışır. ':'Kurallar panel açıkken yürür. ')+'Giriş sinyalinden çıkış pinine kural mantığı; "Kuralı dene" komut göndermeden simüle eder.','hp-footnote'));
  const h=get();
  if(!h.automations.length){
   empty('Kural motoru boş','Donanım tetikleyicisi ve çıkış eylemi belirleyen bir kural ekleyin.',button('Otomasyon ekle',()=>ruleForm()));
   return;
  }
  const g=grid();
  for(const r of h.automations){
   const c=el('article',undefined,'hp-card hw-automation-card');
   const top=el('div',undefined,'hp-card-head');
   const mark=el('span',undefined,'hp-icon');mark.append(icon('automations'));
   top.append(mark,el('span',r.enabled?'Etkin':'Devre Dışı',`hp-pill ${r.enabled?'is-active':''}`));
   c.append(top,el('h2',r.name),el('span',`Kural ID: ${r.id} · Yerel Motor`,'hp-identifier'));

   const flow=el('div',undefined,'hw-logic-flow');
   const sNode=el('div',undefined,'hw-logic-node');
   sNode.append(el('span','GİRİŞ SİNYALİ','hw-pin-tag'));
   let trig='Sinyal';
   if(r.trigger==='time')trig=`Saat: ${r.time}`;
   else if(r.trigger==='sun')trig=r.sunEvent==='sunrise'?'Gün Doğumu (Sabah)':'Gün Batımı (Akşam)';
   else if(r.trigger==='mode')trig=`Ev Modu = ${modes[r.expectedMode]||r.expectedMode}`;
   else if(r.trigger==='numeric')trig=`${h.entities.find(e=>e.id===r.sourceId)?.name||'Sensör'} ${r.operator==='below'?'<':'>'} ${r.threshold}`;
   else trig=`${h.entities.find(e=>e.id===r.sourceId)?.name||'Giriş'} = ${r.expected?'AÇIK (HIGH)':'KAPALI (LOW)'}`;
   sNode.append(el('span',trig,'hw-pin-event'));

   const trace=el('span','──►','hw-logic-trace');

   const tNode=el('div',undefined,'hw-logic-node');
   tNode.append(el('span','HEDEF ÇIKIŞ','hw-pin-tag'));
   const targetEntity=h.entities.find(e=>e.id===r.action.entityId);
   const targetText=`${targetEntity?.name||r.action.entityId} = ${r.action.value?'AÇ (HIGH)':'KAPAT (LOW)'}`;
   tNode.append(el('span',targetText,'hw-pin-action'));

   flow.append(sNode,trace,tNode);
   c.append(flow);

   const facts=el('div',undefined,'module-record-facts');
   const d1=el('div');d1.append(el('dt','Gecikme'),el('dd',r.delaySeconds?`${r.delaySeconds} sn`:'Anında'));
   const d2=el('div');d2.append(el('dt','Bekleme Aralığı'),el('dd',`${r.cooldownSeconds||0} sn`));
   const d3=el('div');d3.append(el('dt','Ev Modu'),el('dd',r.mode?modes[r.mode]:'Tüm Modlar'));
   facts.append(d1,d2,d3);
   c.append(facts);

   if(r.lastRun)c.append(el('p',`Son çalışma: ${formatDate(r.lastRun.at)} · ${r.lastRun.message}`,'hp-footnote'));
   if(r.lastPreview)c.append(el('p',`Son deneme: ${formatDate(r.lastPreview.at)} · ${r.lastPreview.message}`,'hp-footnote'));

   const toggle=button(r.enabled?'Devre Dışı Bırak':'Etkinleştir',()=>commit('automations',{...r,enabled:!r.enabled}),'hp-button secondary');
   toggle.setAttribute('aria-pressed',String(r.enabled));
   c.append(actions(
    toggle,
    button('Kuralı Dene',()=>runtime.previewRule(r.id),'hp-button secondary'),
    button('Düzenle',()=>ruleForm(r),'hp-button secondary'),
    button('Sil',()=>remove('automations',r.id),'hp-text-button')
   ));
   g.append(c);
  }
 }
 function sceneButton(id,text,observeOnly=false){const b=button(text,()=>runtime.runScene(id,{observeOnly}),observeOnly?'hp-button secondary':'hp-button');b.dataset.sceneRun=id;return b;}
 function sceneResult(scene,card){
  const progress=el('p','','hp-footnote');progress.dataset.sceneProgress=scene.id;progress.setAttribute('role','status');card.append(progress);
  for(const [key,label]of [['lastRun','Son çalışma'],['lastPreview','Son deneme']])if(scene[key])card.append(el('p',`${label}: ${formatDate(scene[key].at)} · ${scene[key].message}`,'hp-footnote'));
 }
 function renderScenes(){
  heading('Donanım Senaryoları & Çoklu Pin Tetikleme',button('Sahne ekle',()=>sceneForm()));
  host.append(el('p','Birden çok donanım çıkışını tek dokunuşla eşzamanlı süren toplu GPIO komutları.','hp-footnote'));
  const h=get();
  if(!h.scenes.length){
   empty('Sahne bulunamadı','Donanım çıkışlarını tek komutta toplayan bir senaryo ekleyin.',button('Sahne ekle',()=>sceneForm()));
   return;
  }
  const g=grid();
  for(const s of h.scenes){
   const c=el('article',undefined,'hp-card hw-scene-card');
   const top=el('div',undefined,'hp-card-head');
   const mark=el('span',undefined,'hp-icon');mark.append(icon('scenes'));
   top.append(mark);
   c.append(top,el('h2',s.name),el('span',`${s.actions.length} Donanım Çıkış Eylemi`,'hp-identifier'));

   const list=el('div',undefined,'hw-actuator-list');
   for(const a of s.actions){
    const ent=h.entities.find(e=>e.id===a.entityId);
    const row=el('div',undefined,'hw-actuator-row');
    row.append(
     el('span',`⚡ ${ent?.name||a.entityId} (${deviceName(ent?.deviceId)})`),
     el('strong',a.value?'AÇIK (HIGH)':'KAPALI (LOW)',a.value?'hw-val-on':'hw-val-off')
    );
    list.append(row);
   }
   c.append(list);
   sceneResult(s,c);
   c.append(actions(
    sceneButton(s.id,'⚡ Senaryoyu Uygula'),
    sceneButton(s.id,'🧪 Test Et',true),
    button('Düzenle',()=>sceneForm(s),'hp-button secondary'),
    button('Sil',()=>remove('scenes',s.id),'hp-text-button')
   ));
   g.append(c);
  }
 }
 function renderHistory(){
  heading('Neler oldu?',runtime.remote&&!runtime.demo?undefined:button('Geçmişi temizle',()=>{confirmDialog('Geçmişi temizle',[`${get().events.length} yerel işlem kaydı temizlenecek.`],()=>runtime.update(h=>({...h,events:[]})),'Temizle');},'hp-button secondary'));
  if(!get().events.length){empty('Henüz bir işlem yok','Mod değişiklikleri, komut sonuçları ve otomasyon kararları burada görünecek.');return;}
  const filters=el('div',undefined,'hp-history-filters');
  const query=input(filters,'Geçmişte ara',historyQuery,'search',false);query.placeholder='Kural, cihaz veya işlem';
  const result=select(filters,'Sonuç',[['all','Tüm sonuçlar'],['ok','Tamamlandı'],['observed','İzlendi'],['skipped','Atlandı'],['unknown','Sonuç bilinmiyor'],['error','Yapılamadı']],historyResult);
  const kind=select(filters,'Kaynak',[['all','Tüm işlemler'],['manual','Manuel kontrol'],['automation','Otomasyon'],['preview','Kural denemesi'],['scene','Sahne'],['mode','Ev modu']],historyKind);
  const count=el('p','','hp-footnote');count.setAttribute('role','status');
  const list=el('div',undefined,'hp-history');host.append(filters,count,list);
  const names={ok:'Tamamlandı',error:'Yapılamadı',unknown:'Sonuç bilinmiyor',observed:'İzlendi',skipped:'Atlandı',pending:'Bekliyor'};
  const renderRows=()=>{
   historyQuery=query.value;historyResult=result.value;historyKind=kind.value;
   const all=get().events,events=filterHistory(all,{query:historyQuery,result:historyResult,kind:historyKind});
   count.textContent=`${events.length} / ${all.length} kayıt`;list.replaceChildren();
   if(!events.length){list.append(el('p','Arama ve filtrelere uygun kayıt yok.','hp-history-empty'));return;}
   for(const event of events){const row=el('article',undefined,'hp-history-row');row.append(el('time',formatDate(event.at),'hp-muted'),el('p',event.message),el('span',names[event.result]||event.result,`hp-pill result-${event.result}`));list.append(row);}
  };
  query.addEventListener('input',renderRows);result.addEventListener('change',renderRows);kind.addEventListener('change',renderRows);renderRows();
 }
 function showDeviceKey(device,key){
  focusBack=document.activeElement;modal.replaceChildren();const header=el('div',undefined,'dialog-header');header.append(el('h2','Cihaz kaydedildi'),button('Kapat',()=>modal.close(),'dialog-close'));
  const body=el('div',undefined,'dialog-body hp-form');body.append(el('p',`${device.name} · Bu anahtar yalnız şimdi gösterilir. Firmware yapılandırmasına güvenli biçimde aktarın; kaybederseniz cihaz kaydını silip yeniden oluşturun.`,'hp-muted'));
  const field=input(body,'Cihaz anahtarı',key);field.readOnly=true;field.autocomplete='off';field.spellcheck=false;
  body.append(actions(button('Anahtarı kopyala',async()=>{if(!navigator.clipboard?.writeText){field.focus();field.select();return;}await navigator.clipboard.writeText(field.value);feedback('Anahtar panoya kopyalandı.','ok');}),button('Tamam',()=>modal.close(),'hp-button secondary')));
  modal.append(header,body);modal.addEventListener('close',()=>{field.value='';body.remove();},{once:true});modal.showModal();
 }
 function enrollment(){
  formDialog('Cihaz kaydet',form=>{form.append(el('p','Cihaz kimliği firmware ile aynı olmalıdır. İlk geçerli rapor geldiğinde cihazın gerçek işlevleri eklenir.','hp-muted'));const id=input(form,'Cihaz kimliği');id.pattern='[A-Za-z0-9_-]+';return {id,name:input(form,'Cihaz adı'),role:select(form,'Cihaz rolü',[['node','Sensör / kontrol düğümü'],['camera','Kamera'],['hub','Hub']])};},async fields=>{
   const result=await runtime.provisionDevice({id:fields.id.value.trim(),name:fields.name.value.trim(),role:fields.role.value});
   // The form closes before the secret-only dialog is opened; never put this value in home state.
   setTimeout(()=>showDeviceKey(result.device,result.deviceKey),0);
  });
 }
 function renderPresenceBridge(){
  const c=card('Buluttan canlı varlık','Kamera 2’nin varlık durumu aynı özel panelin backend’inden okunur. Bilgisayarınızda ARMUT sunucusu çalıştırmanız gerekmez.','settings');
  const status=el('p',presenceBridge.status,'hp-muted');status.dataset.presenceBridge='';
  c.append(status,actions(button('Bulut varlık bağlantısını aç',async()=>{await presenceBridge.connectCloud();refreshLive();}),button('Bağlantıyı kes',()=>{presenceBridge.disconnect();refreshLive();},'hp-button secondary')),el('p','Gerçek veri için bulut backend’i ve evde sürekli açık uygun bir özel ağ ucu yapılandırılmış olmalı. Bu bağlantı kamera görüntüsü veya cihaz kontrolü sağlamaz.','hp-footnote'));host.append(c);
 }
 function renderController(){
  const c=card(runtime.remote?'Yerel denetleyici':'Tarayıcı modu',runtime.remote?'Ev ayarları ve otomasyonlar yerel sunucuda. Sunucu açık kaldığı sürece paneli kapatabilirsiniz.':'Bu statik önizlemede bir ev sunucusu çalışmaz. Ayarlar bu tarayıcıdadır; kurallar sekme açıkken yürür.','settings');
  if(runtime.remote){const health=el('p','','hp-live');health.dataset.controllerHealth='';c.append(health);if(runtime.demo)c.append(el('p','Test alanında cihaz kaydı yapılamaz. Önce test modunu kapatın.','hp-muted'));else c.append(button('Cihaz kaydet',enrollment));
   const list=el('div',undefined,'hp-controller-devices');
   c.append(list,button('Kayıtları yenile',()=>load(),'hp-button secondary'));
   async function load(){const response=await runtime.listDevices();if(!c.isConnected)return;const devices=Array.isArray(response)?response:response.devices||[];list.replaceChildren();if(!devices.length)list.append(el('p','Henüz kayıtlı cihaz yok.','hp-muted'));for(const d of devices){const row=el('div',undefined,'hp-controller-device');row.append(el('strong',d.name||d.id),el('code',d.id,'hp-identifier'),liveLine(d.id),el('p',get().entities.some(e=>e.deviceId===d.id)?'İşlevler alındı; aşağıdan oda ve adlarını düzenleyin.':'İlk cihaz raporu bekleniyor. Firmware adresini, kimliğini ve anahtarını ayarlayın.','hp-muted'));const removeButton=button('Kaydı sil',()=>confirmDialog('Cihaz kaydını sil',[`${d.name||d.id} anahtarı iptal edilecek. Bağlı işlevler varsa önce onları kaldırın.`],()=>runtime.removeDevice(d.id),'Sil'),'hp-text-button');removeButton.disabled=runtime.demo;row.append(removeButton);if((get().ignoredEntities||[]).some(e=>e.deviceId===d.id)){const restore=button('Kaldırılan işlevleri geri getir',()=>runtime.update(h=>({...h,ignoredEntities:(h.ignoredEntities||[]).filter(e=>e.deviceId!==d.id)})),'hp-text-button');restore.disabled=runtime.demo;row.append(restore);}list.append(row);}refreshLive();}
   host.append(c);load().catch(e=>{if(c.isConnected)list.replaceChildren(el('p',e.message,'hp-form-error'));});return;
  }
  c.append(el('p','Kalıcı cloud backend’i ve eve özel veri yolu doğrulanana kadar canlı durum bilinmiyor kalır. Sites yayını ile geliştirme bilgisayarı ayrı ortamlardır.','hp-footnote'));host.append(c);
 }
  function renderSettings(){const h=get();heading('Evinizin ayarları');renderController();if(!runtime.remote)renderPresenceBridge();const panel=el('div',undefined,'hp-card');panel.append(el('h2','Kayıt ve yedekleme'),el('p',runtime.remote?'Ev ayarları yerel denetleyicide saklanır ve bu sunucuya bağlanan paneller arasında paylaşılır.':'Odalar, işlevler, kameralar ve kurallar bu tarayıcıda saklanır. Başka bir cihaza taşımak için yedek indirin.','hp-muted'));if(runtime.storageError)panel.append(el('p',runtime.storageError,'hp-form-error'));if(!runtime.remote&&!storage)panel.append(el('p','Tarayıcı depolaması kullanılamıyor. Kapatmadan önce yedek indirin.','hp-form-error'));const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;file.addEventListener('change',async()=>{try{if(!file.files?.[0])return;if(file.files[0].size>1000000)throw new Error('Dosya en fazla 1 MB olabilir.');const next=parseBackup(await file.files[0].text());confirmDialog('Yedeği yükle',[`Mevcut ev ayarları bu yedekle değiştirilecek: ${next.rooms.length} oda, ${next.entities.length} işlev, ${next.automations.length} otomasyon ve ${next.scenes.length} sahne.`],async()=>{await runtime.setDemo(false);await runtime.update(()=>next,{recover:true});},'Yedeği yükle');}catch(e){feedback(e.message);}finally{file.value='';}});panel.append(file,actions(button('Yedek indir',()=>download(serializeBackup(runtime.backup()),`armut-ev-${new Date().toISOString().slice(0,10)}.json`)),button('Yedek yükle',()=>file.click(),'hp-button secondary'),button('Örnek akıllı evi yükle',()=>confirmDialog('Örnek akıllı evi yükle',['Mevcut ev kaydı hazır odalar (Giriş, Salon), kameralar, varlık sensörü, aydınlatma otomasyonları ve sahnelerle yenilenecektir.'],async()=>{const {defaultHome}=await import('./home-model.mjs?v=cloud20261111-17');await runtime.setDemo(false);await runtime.update(()=>defaultHome(),{recover:true});}),'hp-button secondary')));host.append(panel);
 heading('İşlevler',button('İşlev ekle',()=>entityForm()));host.append(el('p','Cihazın evdeki görevini adlandırın: örneğin “Salon ışığı”. İşlev eklemek donanımda bağlantı oluşturmaz.','hp-footnote'));const g=grid();for(const e of h.entities){const c=card(e.name,`${deviceName(e.deviceId)} · ${roomName(e.roomId)}`,'device');c.append(el('code',e.id,'hp-identifier'),actions(button('Düzenle',()=>entityForm(e),'hp-button secondary'),button('Sil',()=>remove('entities',e.id),'hp-text-button')));g.append(c);}if(!h.entities.length)g.append(card('Henüz işlev yok','Kontrol edilecek ışığı veya okunacak sensörü burada tanımlayın.','device'));
 heading('Bağlantı ve çalışma');const form=el('form',undefined,'hp-card hp-form');const details=el('details',undefined,'hp-details');details.append(el('summary','Yerel veri adaptörü'));details.append(el('p','Durum adresi JSON gözlemlerini, komut adresi cihaz uygulama onayını döndürmelidir. HTTPS panel, HTTP yerel cihaz adresini engelleyebilir. Adreslere parola/anahtar yazmayın.','hp-muted'));const statusUrl=input(details,'Durum adresi',h.settings.statusUrl,'url',false),commandUrl=input(details,'Komut adresi',h.settings.commandUrl,'url',false);if(!runtime.remote)form.append(details);const zone=select(form,'Saat dilimi',[['Europe/Istanbul','Türkiye · İstanbul'],['Etc/UTC','UTC'],['Europe/Berlin','Avrupa · Berlin']],h.settings.timeZone);const hold=input(form,'Manuel kontrol sonrası otomasyonu beklet (dakika)',h.settings.manualHoldMinutes,'number');hold.min=0;hold.max=1440;const save=el('button','Ayarları kaydet','hp-button');save.type='submit';const error=el('p','','hp-form-error');error.setAttribute('role','alert');form.append(error,save);form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{if(!runtime.remote)await runtime.disconnect();await runtime.update(x=>({...x,settings:{...x.settings,statusUrl:statusUrl.value.trim(),commandUrl:commandUrl.value.trim(),timeZone:zone.value,manualHoldMinutes:Number(hold.value)}}));feedback('Ayarlar kaydedildi.','ok');}catch(e){error.textContent=e.message;}finally{save.disabled=false;}});host.append(form);if(!runtime.remote)host.append(actions(button('Veriye bağlan',()=>runtime.connect()),button('Bağlantıyı kes',()=>runtime.disconnect(),'hp-button secondary')));
 const source=el('p','','hp-muted');source.dataset.sourceStatus='';host.append(source);
 heading('Hub Ekranı (ST7789V3 1.69")');const display=h.settings.hubDisplay||defaultHubDisplay();const dForm=el('form',undefined,'hp-card hp-form');dForm.append(el('p','ESP32-S3 Hub üzerindeki 240×280 ST7789V3 ekranının parlaklık, yön ve sayfa ayarları.','hp-muted'));const dBright=input(dForm,'Parlaklık (%)',display.brightness,'number');dBright.min=0;dBright.max=100;const dRot=select(dForm,'Ekran yönü',displayRotations,display.rotation);const dTimeout=select(dForm,'Ekran zaman aşımı',displayTimeouts.map(([v,n])=>[String(v),n]),String(display.timeoutSeconds));const dPage=select(dForm,'Varsayılan sayfa',displayPages,display.defaultPage);const dTheme=select(dForm,'Görünüm teması',displayThemes,display.theme);const dSave=el('button','Ekran ayarlarını kaydet','hp-button');dSave.type='submit';const dError=el('p','','hp-form-error');dError.setAttribute('role','alert');dForm.append(dError,dSave);dForm.addEventListener('submit',async event=>{event.preventDefault();dSave.disabled=true;try{const nextDisplay={brightness:Number(dBright.value),rotation:Number(dRot.value),timeoutSeconds:Number(dTimeout.value),defaultPage:dPage.value,theme:dTheme.value};await runtime.update(x=>({...x,settings:{...x.settings,hubDisplay:nextDisplay}}));const hwRes=await syncHubDisplayHardware(nextDisplay,display);feedback(hwRes.mode==='cloud-queued'?'Hub ekran ayarları kaydedildi ve bulut kuyruğuna alındı.':'Hub ekran ayarları kaydedildi ve donanıma iletildi.','ok');}catch(e){dError.textContent=e.message;}finally{dSave.disabled=false;}});host.append(dForm);
 heading('Test alanı');const demoCard=card('Bağlantıyı cihaz olmadan deneyin','Geçici test odasında ışık, varlık sensörü ve otomasyonları deneyin. Çıkınca ev ayarlarınız aynen geri gelir.','settings');demoCard.append(actions(button(runtime.demo?'Test modunu kapat':'Test modunu aç',()=>runtime.setDemo(!runtime.demo)),...(runtime.demo?[button('Test bağlantısını kes',()=>runtime.pauseDemo(),'hp-button secondary'),button('Testi yeniden bağla',()=>runtime.setDemo(true),'hp-button secondary')]:[]),link('Kontrolleri gör →','#home')));host.append(demoCard);}
  function refreshLive(){for(const node of host.querySelectorAll('[data-presence-bridge]'))node.textContent=presenceBridge.status;for(const node of host.querySelectorAll('[data-persistence-error]')){node.hidden=!runtime.persistenceError;node.textContent=runtime.persistenceError?`Sunucu kaydı başarısız: ${runtime.persistenceError}. İşlem kalıcılığı doğrulanamadı.`:'';}for(const node of host.querySelectorAll('[data-scene-run]'))node.disabled=runtime.sceneState(node.dataset.sceneRun).pending;for(const node of host.querySelectorAll('[data-scene-progress]')){const state=runtime.sceneState(node.dataset.sceneProgress);node.textContent=state.pending?state.message:'';node.hidden=!state.pending;}for(const node of document.querySelectorAll('[data-runtime-device]')){const status=runtime.deviceStatus(node.dataset.runtimeDevice);node.textContent=`${runtime.demo?'TEST · ':''}${labels[status.state]||status.state}`;const card=node.closest('.device-card-status');if(card){card.className=`device-card-status is-${status.state}`;const path=card.querySelector('path');if(path)path.setAttribute('d',status.state==='online'?'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0M12 20h0':'M3 3l18 18M2 8a16 16 0 0 1 4-2m4-2a16 16 0 0 1 12 4M5 12a11 11 0 0 1 4-2m6 0a11 11 0 0 1 4 2M8 16a6 6 0 0 1 8 0M12 20h0');}const compact=node.closest('.device-compact-status');if(compact){compact.className=`device-compact-status presence-${status.state==='online'?'verified':status.state}`;const dur=compact.querySelector('.presence-duration');if(dur)dur.textContent=status.state==='online'?'Canlı bağlantı aktif':'Süre bilinmiyor · canlı bağlantı yok';}}for(const node of host.querySelectorAll('[data-device-live]')){const status=runtime.deviceStatus(node.dataset.deviceLive);node.textContent=`${runtime.demo?'TEST · ':''}${labels[status.state]||status.state}${status.ageMs!==undefined&&status.ageMs!==null?` · ${Math.floor(status.ageMs/1000)} sn önce`:''}`;node.classList.toggle('is-online',status.state==='online');}
 for(const node of host.querySelectorAll('[data-entity-live]')){const state=runtime.entityState(node.dataset.entityLive);const entity=get().entities.find(e=>e.id===node.dataset.entityLive);node.textContent=state.pending?'Sonuç bekleniyor…':!state.fresh?'Durum bilinmiyor':typeof state.value==='boolean'?(state.value?'Açık / algılandı':'Kapalı / yok bildirildi'):String(state.value)+(entity?.unit?` ${entity.unit}`:'');if(state.fresh&&typeof state.value==='boolean'&&entity?.kind==='presence'){node.textContent=state.value?'🟢 Varlık algılandı':'⚪ Varlık yok bildirildi';const card=node.closest('.hp-card');if(card)card.classList.toggle('presence-active',Boolean(state.value));}if(state.heldUntil>Date.now())node.textContent+=' · manuel öncelik';}
 for(const node of host.querySelectorAll('[data-controller-health]'))node.textContent=runtime.sourceError?`Sunucu bağlantısı: ${runtime.sourceError}`:runtime.connected?'Sunucu bağlantısı açık':'Sunucu bağlantısı bekleniyor';
 for(const node of host.querySelectorAll('[data-source-status]'))node.textContent=runtime.sourceError||(runtime.demo?'Test sağlayıcısı etkin':runtime.connected?'Veri bağlantısı açık':'Canlı veri kaynağı bağlı değil');}
 function render(){if(!page)return;cameraPlayer?.stop();cameraPlayer=null;host.replaceChildren();const sourceNote=el('p','','hp-footnote');sourceNote.dataset.sourceStatus='';host.append(sourceNote);if(presenceBridge.cloud){const bridgeNote=el('p',presenceBridge.status,'hp-footnote');bridgeNote.dataset.presenceBridge='';host.append(bridgeNote);}const modeNote=el('p',runtime.remote&&!runtime.demo?'Yerel denetleyici · panel kapalıyken de çalışır':'Tarayıcı modu · kurallar yalnız panel açıkken çalışır','hp-footnote');host.append(modeNote);if(runtime.demo){const banner=el('div',undefined,'hp-test-banner');banner.append(el('strong','TEST MODU'),el('span','Geçici test alanı · düzenlemeler ev ayarlarınıza kaydedilmez.'),button('Kapat',()=>runtime.setDemo(false),'hp-text-button'));host.append(banner);}const persistenceNote=el('p','','hp-form-error');persistenceNote.dataset.persistenceError='';persistenceNote.setAttribute('role','alert');host.append(persistenceNote);if(runtime.storageError&&page!=='settings')host.append(link('Yerel kayıt okunamadı. Ayarlar’dan yedek yükleyin.','#settings','hp-form-error'));
 ({device:renderConnectedDevice,home:renderHome,rooms:renderRooms,cameras:renderCameras,automations:renderAutomations,scenes:renderScenes,history:renderHistory,settings:renderSettings}[page])();lastHome=JSON.stringify(get());lastDemo=runtime.demo;refreshLive();}
 const unsubscribe=runtime.subscribe(()=>{const changed=JSON.stringify(get())!==lastHome||runtime.demo!==lastDemo;if(changed&&page&&page!=='cameras'&&!modal.open&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))render();else refreshLive();});
 function show(hash){const [route,id]=hash.replace(/^#/,'').split('/');const next=route||'home';if(next!==page){notice.hidden=true;if(modal.open)modal.close();}if(!Object.hasOwn(titles,next)&&!(next==='device'&&id)){leave();return false;}page=next;detail=id||'';host.hidden=false;const title=$('page-title');title.textContent=page==='device'?(catalog().find(d=>d.id===detail)?.name||'Cihaz'):titles[page];$('breadcrumbs').replaceChildren(title);document.title=`${title.textContent} · ARMUT`;for(const nav of document.querySelectorAll('.main-nav a')){if(nav.dataset.view===(page==='device'?'devices':page))nav.setAttribute('aria-current','page');else nav.removeAttribute('aria-current');}render();return true;}
 function leave(){page='';host.hidden=true;notice.hidden=true;cameraPlayer?.stop();cameraPlayer=null;if(modal.open)modal.close();}
 const visibility=()=>{if(document.hidden)cameraPlayer?.stop();};document.addEventListener('visibilitychange',visibility);
 return {show,leave,refreshLive,runtime,syncHubDisplayHardware,dispose(){leave();unsubscribe();presenceBridge.disconnect();runtime.dispose();host.remove();modal.remove();notice.remove();document.removeEventListener('visibilitychange',visibility);}};
}
export function extendNavigation(){const nav=document.querySelector('.main-nav');for(const [key,title]of Object.entries(titles)){if(key==='home')continue;const a=link(title,`#${key}`,'');a.dataset.view=key;a.prepend(icon(key));nav.append(a);}const devices=nav.querySelector('[data-view="devices"]');devices.textContent='Cihazlar';devices.prepend(icon('device'));nav.insertBefore(nav.querySelector('[data-view="rooms"]'),devices);}
