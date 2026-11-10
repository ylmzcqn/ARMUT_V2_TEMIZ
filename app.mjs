import {newId} from './browser-crypto.mjs?v=cloud20261110-12';
import {createPanelRuntime} from './remote-home.mjs?v=cloud20261110-12';
import {createHomePanel,extendNavigation} from './home-panel.mjs?v=cloud20261110-12';
import {hardwareMapView} from './hardware-map-view.mjs?v=cloud20261110-12';
import {assignmentWarnings} from './hardware-map.mjs?v=cloud20261110-12';
import {devicePresence} from './live-evidence.mjs?v=cloud20261110-12';
import {moduleActivity} from './module-history.mjs?v=cloud20261110-12';
import {initializeMotionEffects} from './motion-effects.mjs?v=cloud20261110-12';
import {visibleConnections} from './connection-view.mjs?v=cloud20261110-12';
import {loadInventory, inventoryRoute,verifySourceSnapshots} from './inventory-core.mjs?v=cloud20261110-12';
import {artwork,wiringWorkspace,moduleToolbar,connectionScene,devicesOverview} from './wiring-view.mjs?v=cloud20261110-12';
import {editConnection,addConnection,removeComponent,serializeInventory,parseInventory} from './wiring-model.mjs?v=cloud20261110-12';
import {createChoiceDialog} from './choice-dialog.mjs?v=cloud20261110-12';
import {deviceFilters,filterDevices,filterChoices} from './device-filters.mjs?v=cloud20261110-12';

const $ = id => document.getElementById(id);
const labels = {source:'Kaynak kodda tanımlı', reported:'Kullanıcı bildirimi / belge', physical:'Tarihsel fiziksel gözlem kaydı', unknown:'Bilinmiyor', conflict:'Çelişki / tarihsel fark'};
let data;
let homePanel;
let catalogSubscription;
extendNavigation();
let sourceSnapshot, fileHandle;
let dirty = false;
let saveMessage = '';
const undoStack = [];
let deviceFilter='all';
let deviceQuery='';
$('device-search').addEventListener('input',event=>{
 deviceQuery=event.target.value;renderDeviceCards();updateListStatus(true);
 $('device-search-clear').disabled=!deviceQuery;
});
$('device-search-clear').addEventListener('click',()=>{
 deviceQuery='';$('device-search').value='';$('device-search-clear').disabled=true;
 renderDeviceCards();updateListStatus(true);$('device-search').focus();
});
const filterDialog=createChoiceDialog({title:'Cihazları filtrele',onSelect:value=>{deviceFilter=value;renderDeviceCards();renderDeviceFilter();},returnFocus:()=>$('device-filter').querySelector('button'),renderIcon:choice=>artwork(choice.icon)});
document.body.append(filterDialog.element);
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function references(ids) {
  const details = element('details');
  details.append(element('summary', `Kaynak referansları (${ids.length})`));
  for (const id of ids) {
    const source = data.sources[id];
    const box = element('div', undefined, 'reference');
    box.append(element('p', `${source.project?source.project+"/":""}${source.path}:${source.start}–${source.end}`, 'path'), element('p', `SHA-256: ${source.sha256}`, 'hash'));
    if(source.snapshot){const excerpt=element('details');excerpt.append(element('summary','İncelenen kaynak satırları'),element('pre',source.snapshot.text,'source-excerpt'));box.append(excerpt);}
    details.append(box);
  }
  return details;
}
function factList(rows, className) {
  const list = element('dl', undefined, className);
  for (const row of rows) {
    const item = element('div');
    item.append(element('dt', row.label), element('dd', row.value));
    if(className==='device-facts')item.prepend(statusIcon(row.label));
    list.append(item);
  }
  return list;
}
function actionIcon(pathData) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',pathData);svg.append(path);return svg;
}
function scrollToSection(id) {
  const target=$(id);if(!target)return;if(target.tagName==='DETAILS')target.open=true;target.focus({preventScroll:true});target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
function statusIcon(label) {
  const paths = label==='Kart' ? 'M5 5h14v14H5z M9 9h6v6H9z M9 2v3m6-3v3M9 19v3m6-3v3' : label==='Bağlılık' ? 'M9 8H7a4 4 0 0 0 0 8h3m4-8h3a4 4 0 0 1 0 8h-3M8 12h8' : 'M3 12h4l3-7 4 14 3-7h4';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths);svg.append(path);return svg;
}
function renderBreadcrumb(home,listing,device) {
  const host=$('breadcrumbs'),title=$('page-title');host.replaceChildren();
  const items=home?[]:listing?[['Genel bakış','#home']]:[['Genel bakış','#home'],['Cihazlar','#devices']];
  for(const [name,href] of items){const link=element('a',name);link.href=href;host.append(link);const separator=element('span','›','breadcrumb-separator');separator.setAttribute('aria-hidden','true');host.append(separator);}
  host.append(title);
}
function deviceHistory() {
  const section=element('details',undefined,'device-history');section.append(element('summary','Güncelleme geçmişi'));
  section.append(factList([{label:'OTA güncellemeleri',value:'Geçmiş kaydı yok'}],'connection-list'),element('p','Bu envanter canlı cihaza bağlı değil. Bu bilgiler güncel cihaz sağlığı veya hiç güncellenmediği anlamına gelmez.','module-note'));
  return section;
}
function componentDetails(part, device, trigger, pinsOpen=false) {
  const partIndex=device.presentation.components.indexOf(part);
  const returnToPart=()=>openComponent(device.id,partIndex,trigger,true);
  const claims = part.claimIndexes.map(index => device.claims[index]);
  const evidenceId=`module-evidence-${newId()}`;
  const card = element('section', undefined, 'module-card');
  const summary=element('div',undefined,'module-summary');
  const copy=element('div',undefined,'module-summary-copy');
  if(part.description)copy.append(element('p',part.description,'module-description'));
  if(claims.some(claim=>claim.kind==='conflict')){
    const notice=element('button','Kayıt farkını incele','module-conflict-link');notice.type='button';notice.setAttribute('aria-controls',evidenceId);
    notice.prepend(actionIcon('M12 3 2 21h20L12 3M12 9v5m0 3h0'));
    notice.addEventListener('click',()=>{evidence.open=true;evidence.querySelector('summary').focus({preventScroll:true});evidence.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});});
    copy.append(notice);
  }
  summary.append(artwork(part.icon,'module-summary-artwork'),copy);
  summary.append(moduleToolbar({name:part.name,onRemove:part.icon==='board'?undefined:()=>deleteModule(device,partIndex,trigger),tools:editorTools()}));
  card.append(summary);
  const activity=moduleActivity(device,partIndex);
  const formatDate=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Kaydedilmedi';
  const record=element('section',undefined,'module-record');record.setAttribute('aria-label','Modül kayıt bilgileri');
  record.append(factList([{label:'Eklenme tarihi',value:formatDate(activity.createdAt)},{label:'Son kayıt değişikliği',value:formatDate(activity.lastChanged)}],'module-record-facts'));
  const recordIcons=['M5 5h14v15H5zM8 3v4m8-4v4M5 10h14','M4 12a8 8 0 1 0 2-5M4 3v5h5M12 8v5l3 2'];
  record.querySelectorAll('dt').forEach((label,index)=>label.prepend(actionIcon(recordIcons[index])));
  const history=element('details',undefined,'module-change-history');
  const historyControl=element('summary');historyControl.append(actionIcon('M4 6h16M4 12h10M4 18h7'),element('span','Değişiklik geçmişi'),element('span',String(activity.events.length),'history-count'));history.append(historyControl);
  if(!activity.events.length)history.append(element('p','Bu modül için tarihli değişiklik kaydı yok.','module-note'));
  for(const event of activity.events){const row=element('div',undefined,'module-history-entry');row.append(element('p',formatDate(event.time),'module-history-time'),element('p',event.text));history.append(row);}
  record.append(history);card.append(record);
  const wires=visibleConnections(device,partIndex);
  const rows=part.rows;
  if (part.connections?.some(c=>c.evidence==='user_edit'||c.evidence==='user_added')) card.append(element('p','Kullanıcı düzenlemesi var. İlk kaynak kaydı kanıtlar altında korunur.','module-note'));
  const pins=element('details',undefined,'module-change-history module-pin-editor');pins.open=pinsOpen;
  const pinControl=element('summary');pinControl.append(actionIcon('M5 5h14v14H5zM9 9h6v6H9zM9 2v3m6-3v3M9 19v3m6-3v3'),element('span',Array.isArray(part.connections)?'Pin bağlantıları':'Kart bilgileri'),element('span',Array.isArray(part.connections)?String(activity.connections):'','history-count'));pins.append(pinControl);
  if(Array.isArray(part.connections)){
    pins.append(connectionScene(device,partIndex,(ownerIndex,wireIndex)=>editWire(device,ownerIndex,wireIndex,trigger,returnToPart),()=>editWire(device,partIndex,null,trigger,returnToPart)));
    if(!wires.length)pins.append(element('p','Henüz pin bağlantısı kaydı yok.','module-note'));
  }else if(rows?.length)pins.append(factList(rows,'connection-list'));
  record.append(pins);
  if (part.note) card.append(element('p', part.note, 'module-note'));
  const evidence = element('details', undefined, 'module-evidence');evidence.id=evidenceId;
  evidence.append(element('summary', `Kanıtlar ve geçmiş (${claims.length})`));
  for (const claim of claims) {
    const block = element('div', undefined, 'claim');
    block.append(element('span', data.evidenceLabels?.[claim.kind] || labels[claim.kind], `badge ${claim.kind}`), element('p', claim.text), references(claim.sources));
    evidence.append(block);
  }
  card.append(evidence);
  return card;
}
const dialog = element('dialog', undefined, 'detail-dialog');
dialog.setAttribute('aria-labelledby', 'dialog-title');
document.body.append(dialog);
let dialogTrigger;
let dialogDismiss;
function dismissDialog(){const back=dialogDismiss;dialogDismiss=undefined;dialog.close();back?.();}
function openDialog(title, content, trigger, wide = false, headerActions, onDismiss) {
  if (dialog.open) dialog.close();
  dialogTrigger = trigger;dialogDismiss=onDismiss;
  dialog.replaceChildren(); dialog.classList.toggle('diagram-dialog', wide);
  const header = element('div', undefined, 'dialog-header');
  const heading = element('h2', title); heading.id = 'dialog-title';
  const close = element('button', 'Kapat', 'dialog-close'); close.type = 'button'; close.autofocus = true;
  close.addEventListener('click', dismissDialog);
  header.append(heading);if(headerActions)header.append(headerActions);header.append(close);
  const body = element('div', undefined, 'dialog-body'); body.append(content);
  dialog.append(header,body); dialog.showModal();
}
dialog.addEventListener('cancel',event=>{event.preventDefault();dismissDialog();});
dialog.addEventListener('close', () => { if (dialogTrigger?.isConnected) dialogTrigger.focus({preventScroll:true}); });
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dismissDialog();
});
function componentCard(part, device) {
  const card = element('button', undefined, 'module-card module-launcher'); card.type = 'button';
  card.setAttribute('aria-haspopup', 'dialog');
  const heading = element('span', undefined, 'module-identity');
  heading.append(artwork(part.icon), element('span', part.name, 'module-name'));
  card.append(heading);
  if (part.description) card.append(element('span', part.description, 'module-description'));
  card.addEventListener('click', () => openComponent(device.id,device.presentation.components.indexOf(part),card));
  return card;
}
function openComponent(deviceId,partIndex,trigger,pinsOpen=false) {
  const device=data.devices.find(item=>item.id===deviceId),part=device?.presentation.components[partIndex];
  if(!part)return;
  openDialog(part.name,componentDetails(part,device,trigger,pinsOpen),trigger);
}
function schematicPreview(device) {
  return wiringWorkspace({device,devices:data.devices,onDeviceSelect:id=>{location.hash=encodeURIComponent(id);},onModuleOpen:(index,trigger)=>openComponent(device.id,index,trigger),tools:editorTools()});
}

function editorTools() {
  const tools = element('div',undefined,'editor-tools compact-tools');
  const state=element('span',dirty?'Kaydedilmedi':saveMessage?'Dosya bildirimi':'','save-indicator');state.hidden=!state.textContent;state.title=saveMessage;state.setAttribute('role','status');tools.append(state);
  const menu=element('details',undefined,'file-menu'),summary=element('summary','İşlemler'),panel=element('div',undefined,'action-menu-panel');
  menu.append(summary,panel);tools.append(menu);
  const message = element('p',saveMessage || (dirty ? 'Değişiklikler bellekte; kalıcılık için kaydedin.' : 'Envanter dosyası işlemleri'),'editor-save-status');panel.append(message);
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;summary.focus();}});
  function action(text,callback){const button=element('button',text);button.type='button';button.addEventListener('click',callback);panel.append(button);return button;}
  const undo=action('Geri al',()=>{const previous=undoStack.pop();if(previous){data=previous;dirty=serializeInventory(data)!==sourceSnapshot;saveMessage='';populateInventory();renderSelection();}});undo.disabled=!undoStack.length;
  action('Kaydet',saveInventory);
  action('JSON indir',downloadInventory);
  const input=element('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
  input.addEventListener('change',async()=>{
    if(!input.files[0])return;
    try {
      if(dirty && !confirm('Kaydedilmemiş değişiklikler var. Seçtiğiniz JSON dosyasına geçilsin mi?'))return;
      const imported=parseInventory(await input.files[0].text());await verifySourceSnapshots(imported);
      data=imported;sourceSnapshot=serializeInventory(data);fileHandle=undefined;dirty=false;undoStack.length=0;saveMessage='JSON dosyası açıldı.';
      populateInventory();renderSelection();
    }catch(error){saveMessage=error.message;renderSelection();}
  });
  action('JSON aç',()=>input.click());tools.append(input);return tools;
}
function downloadInventory() {
  const url=URL.createObjectURL(new Blob([serializeInventory(data)],{type:'application/json;charset=utf-8'}));
  const link=element('a');link.href=url;link.download='inventory.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  saveMessage='JSON indirildi. Kalıcılık için proje inventory.json dosyasını bu dosyayla değiştirin.';renderSelection();
}
async function saveInventory() {
  if(!window.showSaveFilePicker){saveMessage='Bu tarayıcı doğrudan dosyaya yazamıyor. JSON indir düğmesini kullanın.';renderSelection();return;}
  try {
    const handle=fileHandle || await window.showSaveFilePicker({suggestedName:'inventory.json',types:[{description:'ARMUT envanteri',accept:{'application/json':['.json']}}]});
    const previous=await (await handle.getFile()).text();
    if(previous.trim() && serializeInventory(parseInventory(previous))!==sourceSnapshot)throw new Error('Seçilen dosya yüklenen sürümden farklı. Üzerine yazılmadı; JSON indir ile ayrı kaydedin.');
    const snapshot=serializeInventory(data);
    const writer=await handle.createWritable();await writer.write(snapshot);await writer.close();
    fileHandle=handle;sourceSnapshot=snapshot;dirty=false;saveMessage='JSON dosyasına kaydedildi.';renderSelection();
  }catch(error){saveMessage=error.name==='AbortError'?'Dosya kaydı iptal edildi. Değişiklikler bellekte duruyor.':error.message;renderSelection();}
}
function editWire(device,partIndex,wireIndex,trigger,onReturn) {
  const adding=wireIndex===null;
  const part=device.presentation.components[partIndex],wire=adding?{terminal:'',target:'',targetComponent:-1,kind:'signal'}:part.connections[wireIndex];
  const form=element('form',undefined,'wire-form');
  form.append(element('p',`${part.name} bağlantısı. Bu değişiklik yalnız envanteri düzenler; donanıma komut göndermez.`,'module-note'));
  function field(text,input){input.setAttribute('aria-label',text);const label=element('label');label.append(element('span',text),input);form.append(label);return input;}
  const terminal=element('input');terminal.name='terminal';terminal.value=wire.terminal;terminal.required=true;terminal.maxLength=48;field('Uç 1 adı',terminal);
  const owner=element('select');owner.name='targetComponent';
  const board=element('option',device.name+' · kart / besleme');board.value='-1';owner.append(board);
  device.presentation.components.forEach((p,i)=>{if(i===partIndex||!Array.isArray(p.connections))return;const option=element('option',p.name);option.value=String(i);owner.append(option);});
  owner.value=String(wire.targetComponent??-1);field('Diğer uç hangi modülde?',owner);
  const target=element('input');target.name='target';target.value=wire.target;target.required=true;target.maxLength=48;field('Uç 2 adı / GPIO',target);
  const kind=element('select');kind.name='kind';
  for(const [value,text] of [['signal','Sinyal'],['clock','Saat'],['power','Besleme'],['ground','GND'],['conflict','Farklı kayıt'],['unknown','Bilinmeyen']]){const option=element('option',text);option.value=value;kind.append(option);}
  kind.value=wire.kind;field('Hat türü',kind);
  const error=element('p',undefined,'form-error');error.setAttribute('role','alert');form.append(error);
  const acknowledgement=element('label',undefined,'wire-acknowledgement');const accept=element('input');accept.type='checkbox';acknowledgement.append(accept,element('span','Uyarıları inceledim; yalnız envanter kaydını değiştirmek istiyorum.'));acknowledgement.hidden=true;form.append(acknowledgement);
  form.addEventListener('input',event=>{if(event.target===accept)return;accept.checked=false;acknowledgement.hidden=true;error.textContent='';});
  const actions=element('div',undefined,'form-actions');const cancel=element('button','Vazgeç');cancel.type='button';cancel.addEventListener('click',dismissDialog);
  const apply=element('button',adding?'Bağlantıyı ekle':'Değişikliği uygula');apply.type='submit';actions.append(cancel,apply);form.append(actions);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    try{
      const values={terminal:terminal.value,target:target.value,targetComponent:Number(owner.value),kind:kind.value};
      const next=adding?addConnection(data,device.id,partIndex,values):editConnection(data,device.id,partIndex,wireIndex,values);
      if(next===data){dialog.close();onReturn?.();return;}
      const warnings=assignmentWarnings(next,device.id,partIndex,adding?next.devices.find(d=>d.id===device.id).presentation.components[partIndex].connections.length-1:wireIndex);
      if(warnings.length&&!accept.checked){error.textContent=warnings.join(' ');acknowledgement.hidden=false;return;}
      if(next!==data){undoStack.push(data);data=next;dirty=true;saveMessage='Değişiklik bellekte; kalıcı olması için JSON kaydedin.';}
      dialog.close();renderSelection();onReturn?.();
    }catch(e){error.textContent=e.message;}
  });
  openDialog(`${part.name} · ${adding?'pin bağlantısı ekle':'kabloyu düzenle'}`,form,trigger,false,undefined,onReturn);
}
function deleteModule(device,partIndex,trigger) {
  const part=device.presentation.components[partIndex];
  const content=element('div',undefined,'delete-module');
  content.append(element('p',`${part.name} modülünün kayıtları, kaynak iddiaları ve bu modüle gelen/giden bağlantılar envanterden silinecek.`),element('p','Geri al ile dönebilirsiniz. Değişiklik JSON kaydedilene kadar yalnız bellekte uygulanır.','module-note'));
  const actions=element('div',undefined,'form-actions');const cancel=element('button','Vazgeç');cancel.type='button';cancel.addEventListener('click',()=>dialog.close());
  const remove=element('button','Kayıttan sil','danger-button');remove.type='button';
  remove.addEventListener('click',()=>{
    const next=removeComponent(data,device.id,partIndex);undoStack.push(data);data=next;dirty=true;
    saveMessage=`${part.name} silindi. Geri al ile dönebilirsiniz; kalıcılık için JSON kaydedin.`;
    dialog.close();populateInventory();renderSelection();
  });actions.append(cancel,remove);content.append(actions);openDialog(`${part.name} silinsin mi?`,content,trigger);
}
function renderSelection(focus = false) {
  if(filterDialog.element.open)filterDialog.element.close();
  if (dialog.open) dialog.close();
  if(homePanel?.show(location.hash)){
    for(const id of ['overview','inventory','retry','device-filter','device-search-tools','device-empty'])$(id).hidden=true;
    document.querySelector('.page-heading').hidden=true;
    $('nav-back').disabled=(!location.hash||location.hash==='#home')&&navigationPosition===0;
    if(focus){$('content').focus({preventScroll:true});window.scrollTo(0,0);}
    return;
  }
  $('inventory').hidden=!listedDevices().length;
  const {device,home,listing}=inventoryRoute(data,location.hash);
  const empty=!listedDevices().length;if(listing&&!home)renderDeviceCards();
  $('retry').hidden=!empty;$('retry').textContent=empty?'Envanteri yeniden yükle':'Yeniden dene';
  $('overview').hidden = !home || !data.devices.length;
  $('devices').hidden = !listing||home;
  $('home-topology').replaceChildren();
  if(home&&data.devices.length)$('home-topology').append(devicesOverview(data.devices,id=>{location.hash=encodeURIComponent(id);}));
  $('detail').hidden = listing;
  $('device-filter').hidden=!listing||home||empty;
  $('device-search-tools').hidden=!listing||home||empty;
  $('device-empty').hidden=home||!listing || !data.devices.length || filterDevices(listedDevices(),deviceFilter,deviceQuery).length>0;
  renderDeviceFilter(listing&&!home);
  $('nav-back').disabled=home && navigationPosition===0;
  $('page-title').textContent = home ? 'Genel bakış' : listing ? 'Cihazlar' : device?.name || 'Cihaz bulunamadı';
  $('page-description').textContent = home ? 'Evinizin donanımı, tek bir yerde.' : listing ? '' : device?.summary || 'Cihaz listesinden bir kayıt seçin.';
  $('page-description').parentElement.hidden=!home;
  document.title = `${home ? 'Genel bakış' : device?.name || 'Cihazlar'} · ARMUT`;
  for (const link of document.querySelectorAll('.main-nav a')) {
    if (link.dataset.view === (home ? 'home' : 'devices')) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  renderBreadcrumb(home,listing,device);
  document.querySelector('.page-heading').hidden=!listing||(home&&!empty);
  $('status').hidden=!listing||(home&&!empty);
  const detail = $('detail'); detail.replaceChildren();
  if (listing) {
    if (focus) { $('content').focus({preventScroll:true}); window.scrollTo(0,0); }
    return;
  }
  if (!device) {
    const title = element('h2', 'Cihaz bulunamadı'); title.id = 'device-title'; detail.append(title);
    detail.append(element('p', 'Ayrıntıları okumak için cihaz listesinden bir kayıt seçin.'));
  } else {
    const presentation = device.presentation;
    if (presentation) {
      const overview=element('section',undefined,'device-overview');overview.setAttribute('aria-label','Cihaz özeti');
      const visual=element('div',undefined,'device-overview-visual');visual.append(artwork(device.icon,'device-overview-artwork'));
      const info=element('div',undefined,'device-overview-info');
      const components=presentation.components;
      const connections=components.reduce((total,part)=>total+(part.connections?.length||0),0);
      const board=presentation.facts.find(row=>row.label==='Kart');
      info.append(element('p',board?.value||device.name,'device-model'));
      const status=element('div',undefined,'device-compact-status presence-unknown');
      const label=element('p',undefined,'presence-label');
      const icon=actionIcon('M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0M12 20h0');
      const liveLabel=element('span','Durum bilinmiyor');liveLabel.dataset.runtimeDevice=device.id;label.append(icon,liveLabel);status.append(label,element('p','Süre bilinmiyor · canlı bağlantı yok','presence-duration'));info.append(status);
      const counts=element('div',undefined,'device-record-counts');
      const jump=element('button',`${components.filter(part=>part.icon!=='board').length} sensör kayıtlı`,'sensor-jump');jump.type='button';
      jump.prepend(actionIcon('M5 5h14v14H5z M9 9h6v6H9z M9 2v3m6-3v3M9 19v3m6-3v3'));
      jump.addEventListener('click',()=>scrollToSection('device-modules'));
      const wires=element('button',`${connections} bağlantı kaydı`,'connection-jump');wires.type='button';wires.prepend(actionIcon('M8 4v5m8 6v5M5 4h6M13 20h6M8 9a4 4 0 0 0 4 4h0a4 4 0 0 1 4 4'));
      wires.addEventListener('click',()=>scrollToSection('hardware-map'));wires.setAttribute('aria-label','GPIO ve pin haritasını aç');
      counts.append(jump,wires);info.append(counts);
      const extras=element('details',undefined,'device-more');const more=element('summary','Ayrıntılar');more.prepend(actionIcon('M4 6h16M4 12h10M4 18h7'));if(presentation.notice){more.append(element('span','Bağlantı notu var','summary-note'));}extras.append(more);
      extras.append(factList([{label:'Cihaz kimliği',value:device.id}],'connection-list'));
      if(presentation.notice){const note=element('div',undefined,'device-record-note');note.append(element('p',presentation.notice));extras.append(note);}
      extras.append(deviceHistory());info.append(extras);
      overview.append(visual,info);detail.append(overview);
    }
    detail.append(hardwareMapView({inventory:data,device,onOpenPart:(index,trigger)=>openComponent(device.id,index,trigger,true),renderReferences:references}));
    if (presentation?.components.length){const wiring=schematicPreview(device);wiring.id='device-wiring';wiring.tabIndex=-1;detail.append(wiring);}
    const parts = presentation?.components || device.claims.map((claim, index) => ({name:claim.subject, claimIndexes:[index]}));
    const modules = element('div', undefined, 'module-grid');modules.id='device-modules';modules.tabIndex=-1;modules.setAttribute('role','region');modules.setAttribute('aria-label','Kayıtlı sensörler ve modüller');
    for (const part of parts.filter(part=>part.icon!=='board')) modules.append(componentCard(part, device));
    detail.append(modules);
  }
  if (focus) { $('content').focus({preventScroll:true}); window.scrollTo(0,0); }
}
function listedDevices(){const saved=homePanel?.runtime.home();return [...data.devices,...(saved?.devices||[]).filter(d=>!data.devices.some(original=>original.id===d.id)).map(d=>({...d,icon:d.role==='camera'?'camera':'board',summary:d.role==='camera'?'Yerel kameraya kayıtlı':'Yerel denetleyiciye kayıtlı ESP32',connectedRecord:true,presentation:{components:(saved.entities||[]).filter(e=>e.deviceId===d.id).map(e=>({icon:e.kind==='switch'?'board':'sensor'}))}}))];}
function renderDeviceFilter(listing=true) {
  const host=$('device-filter');host.replaceChildren();
  if(!listing){updateListStatus(false);return;}
  const current=deviceFilters.find(item=>item.value===deviceFilter)||deviceFilters[0];
  const button=element('button',undefined,'device-filter-trigger');button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-label',`Cihazları filtrele: ${current.name}`);button.append(element('span',current.name));
  button.addEventListener('click',()=>{filterDialog.setChoices(filterChoices(listedDevices(),deviceFilter),deviceFilter);filterDialog.open();});host.append(button);updateListStatus(true);
}
function updateListStatus(listing) {
  if(!listedDevices().length){$('status').textContent='Envanter boş. inventory.json içinde henüz cihaz kaydı yok.';return;}
  const visible=filterDevices(listedDevices(),deviceFilter,deviceQuery).length;
  const count=listing&&(deviceFilter!=='all'||deviceQuery.trim())?`${visible} / ${listedDevices().length}`:String(listedDevices().length);
  $('status').textContent=`${count} cihaz kaydı`;
}
function renderDeviceCards() {
  $('devices').replaceChildren();
  const filtered=filterDevices(listedDevices(),deviceFilter,deviceQuery);
  for(const device of filtered){
    const link=element('a',undefined,'device-card');link.href=device.connectedRecord?`#device/${encodeURIComponent(device.id)}`:`#${encodeURIComponent(device.id)}`;
    const copy=element('div',undefined,'device-card-copy');
    if(device.id==='uno-history')copy.append(element('span','Tarihsel kayıt','card-tag'));
    copy.append(element('h3',device.name),element('p',device.summary));
    const presence=devicePresence(device),status=element('span',undefined,`device-card-status is-${presence.state}`);
    const liveText=element('span',presence.label);if(device.id!=='uno-history')liveText.dataset.runtimeDevice=device.id;
    status.append(actionIcon(presence.state==='online'?'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0M12 20h0':presence.state==='historical'?'M4 12a8 8 0 1 0 2-5M4 3v5h5M12 8v5l3 2':'M3 3l18 18M2 8a16 16 0 0 1 4-2m4-2a16 16 0 0 1 12 4M5 12a11 11 0 0 1 4-2m6 0a11 11 0 0 1 4 2M8 16a6 6 0 0 1 8 0M12 20h0'),liveText);
    const meta=element('div',undefined,'device-card-meta');
    const parts=device.presentation?.components||[];
    const total=parts.reduce((sum,part)=>sum+(part.connections?.length||0),0);
    if(device.connectedRecord)meta.append(element('span',`${parts.length} işlev`));else meta.append(element('span',`${parts.filter(part=>part.icon!=='board').length} sensör kayıtlı`),element('span',`${total} bağlantı`));
    copy.append(status,meta);
    const arrow=element('span','→','device-card-arrow');arrow.setAttribute('aria-hidden','true');
    link.append(artwork(device.icon,'device-artwork'),copy,arrow);$('devices').append(link);
  }
  $('device-empty').hidden=filtered.length>0 || !listedDevices().length;
}
function populateInventory() {
  renderDeviceCards();updateListStatus(true);
  $('inventory').hidden=!listedDevices().length;
}
async function start() {
  $('device-search-tools').hidden=true;
  $('retry').hidden = true; $('inventory').hidden = true; $('overview').hidden = true; $('device-filter').hidden=true;
  $('status').textContent = 'Envanter okunuyor…';
  try {
    data = await loadInventory();
    sourceSnapshot=serializeInventory(data);
    const runtime=await createPanelRuntime({inventory:data});
    catalogSubscription?.();homePanel?.dispose();homePanel=createHomePanel({inventory:data,runtime});let catalogKey='';catalogSubscription=runtime.subscribe(()=>{const current=JSON.stringify({devices:runtime.home().devices,entities:runtime.home().entities});if(current!==catalogKey){catalogKey=current;if(location.hash==='#devices'){renderDeviceCards();renderDeviceFilter(true);}}});
    populateInventory();
    renderSelection();
  } catch (error) {
    data = undefined; $('status').textContent = error.message; $('retry').hidden = false;
  }
}
$('retry').addEventListener('click', start);
document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  $('content').focus();
});
const navigationSession=newId();
let navigationPosition=0;
function navigationState(){history.replaceState({...history.state,armutNavigation:{session:navigationSession,position:navigationPosition}},'');}
navigationState();
window.addEventListener('hashchange',()=>{
  const previous=history.state?.armutNavigation;
  if(previous?.session===navigationSession)navigationPosition=previous.position;
  else{navigationPosition++;navigationState();}
  if(data)renderSelection(true);
});
$('nav-back').addEventListener('click',()=>{
  if(navigationPosition>0){history.back();return;}
  const fallback=location.hash==='#devices'?'#home':'#devices';
  history.replaceState(history.state,'',fallback);if(data)renderSelection(true);
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
initializeMotionEffects();
start();
