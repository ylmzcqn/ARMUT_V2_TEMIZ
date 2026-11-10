import {connectionIsActive,connectionVerifiedUntil} from './live-evidence.mjs?v=cloud20261110-15';
import {flowEnabled,toggleFlow} from './motion-effects.mjs?v=cloud20261110-15';
import {visibleConnections} from './connection-view.mjs?v=cloud20261110-15';
import {svgNode} from './visuals.mjs?v=cloud20261110-15';
import {createChoiceDialog} from './choice-dialog.mjs?v=cloud20261110-15';
const assets = new Set(['board','display','imu','proximity','microphone','amplifier','speaker','servo','radar','camera']);
export function artwork(kind, className='module-artwork') {
 const image=document.createElement('img');image.src=`./assets/modules/${assets.has(kind)?kind:'board'}.svg`;image.alt='';image.className=className;return image;
}
export function moduleDeleteButton(name,onRemove) {
 const remove=node('button',null,'danger-text module-delete');remove.type='button';remove.title='Modülü sil';remove.setAttribute('aria-label',`${name} modülünü sil`);remove.setAttribute('aria-haspopup','dialog');
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7');icon.append(path);remove.append(icon);
 remove.addEventListener('click',()=>onRemove(remove));return remove;
}
function node(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
function label(parent,x,y,value,cls='scene-label',anchor='middle'){
 const n=svgNode('text',{x,y,class:cls,'text-anchor':anchor});n.textContent=value;parent.append(n);return n;
}
function picture(parent,kind,x,y,width=90,height=75){parent.append(svgNode('image',{href:`./assets/modules/${assets.has(kind)?kind:'board'}.svg`,x,y,width,height}));}
function action(group,name,callback){
 group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',name);
 group.addEventListener('click',()=>callback(group));group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();callback(group);}});
}
function overview(device,select,mobile=false){
 const parts=device.presentation.components.map((p,i)=>({...p,index:i})).filter(p=>Array.isArray(p.connections));
 const w=mobile?480:900,h=mobile?190+Math.ceil(parts.length/2)*120:410;
 const svg=svgNode('svg',{viewBox:`0 0 ${w} ${h}`,class:`wiring-overview ${mobile?'scene-mobile':'scene-desktop'}`,'aria-label':'Modüllerin bağlantı görünümü'});
 const center={x:mobile?175:365,y:mobile?12:150,w:mobile?130:170,h:112};
 const positions=new Map(parts.map((p,i)=>[p.index,{x:mobile?(i%2?265:25):(i%2?690:40),y:mobile?170+Math.floor(i/2)*120:15+Math.floor(i/2)*130,w:mobile?190:170,h:106}]));
 // Modülden modüle bağlantı, merkez denetleyiciye uğramaz.
 for(const p of parts){
  const a=positions.get(p.index),owners=new Set(p.connections.map(c=>c.targetComponent??-1));
  for(const owner of owners){
   const b=owner===-1?center:positions.get(owner);if(!b)continue;
   const x1=a.x+a.w/2,y1=a.y+a.h/2,x2=b.x+b.w/2,y2=b.y+b.h/2;
   const g=svgNode('g',{class:owner===-1?'overview-link':'overview-link audio-link','data-from':p.index,'data-to':owner});
   const route=`M${x1} ${y1} C${x1} ${(y1+y2)/2} ${x2} ${(y1+y2)/2} ${x2} ${y2}`;
   g.append(svgNode('path',{d:route}),svgNode('path',{d:route,pathLength:100,'data-active-until':connectionVerifiedUntil(device,p.index,owner),class:connectionIsActive(device,p.index,owner)?'signal-packet':'signal-packet signal-unverified','aria-hidden':'true'}));
   if(owner!==-1){const wires=p.connections.filter(c=>c.targetComponent===owner);label(g,(x1+x2)/2,(y1+y2)/2-8,p.icon==='speaker'?wires.map(c=>c.terminal).join(' / '):`${wires.length} bağlantı`,'overview-wire-label');}
   action(g,`${p.name} bağlantılarını göster`,trigger=>select(p.index,trigger));svg.append(g);
  }
 }
 const base=svgNode('g');base.append(svgNode('rect',{x:center.x,y:center.y,width:center.w,height:center.h,rx:14,class:'scene-board-panel'}));picture(base,'board',center.x+center.w/2-40,center.y+2,80,75);label(base,center.x+center.w/2,center.y+96,device.id==='hub'?'ESP32-S3 N16R8':device.name);const boardIndex=device.presentation.components.findIndex(part=>part.icon==='board');if(boardIndex>=0)action(base,`${device.name} kart ve besleme bilgilerini aç`,trigger=>select(boardIndex,trigger));svg.append(base);
 for(const p of parts){const a=positions.get(p.index),g=svgNode('g',{class:'scene-module'});g.append(svgNode('rect',{x:a.x,y:a.y,width:a.w,height:a.h,rx:12}));picture(g,p.icon,a.x+a.w/2-42,a.y+3,84,72);label(g,a.x+a.w/2,a.y+92,p.name);action(g,`${p.name} pinlerini göster`,trigger=>select(p.index,trigger));svg.append(g);}
 return svg;
}
function pinScene(device,partIndex,onEdit,mobile=false){
 const part=device.presentation.components[partIndex],connections=visibleConnections(device,partIndex),w=mobile?440:800,h=35+connections.length*39;
 const svg=svgNode('svg',{viewBox:`0 0 ${w} ${h}`,class:`wire-focus ${mobile?'scene-mobile':'scene-desktop'}`,'aria-label':`${part.name} düzenlenebilir bağlantıları`});
 const start=mobile?165:300,end=mobile?275:500;
 connections.forEach((c,i)=>{
  const y=24+i*39,g=svgNode('g',{class:`editable-wire net-${c.kind}`,'data-part':c.ownerIndex,'data-wire':c.wireIndex});
  const target=c.targetComponent===-1||c.targetComponent===undefined?device.name:device.presentation.components[c.targetComponent]?.name;
  const title=svgNode('title');title.textContent=`${part.name} ${c.terminal} ↔ ${target} ${c.target} — düzenle`;g.append(title);
  g.append(svgNode('path',{d:`M${start} ${y}H${end}`,class:'wire-hit'}),svgNode('path',{d:`M${start} ${y}H${end}`,class:'wire-visible'}),svgNode('path',{d:`M${start} ${y}H${end}`,pathLength:100,'data-active-until':connectionVerifiedUntil(device,partIndex,c.targetComponent),'class':connectionIsActive(device,partIndex,c.targetComponent)?'signal-packet':'signal-packet signal-unverified','aria-hidden':'true'}));
  for(const x of [start,end])g.append(svgNode('circle',{cx:x,cy:y,r:4}));
  const short=s=>s.length>23?s.slice(0,21)+'…':s;
  label(g,start-12,y+4,short(c.terminal),'wire-end-label','end');label(g,end+12,y,short(c.target),'wire-end-label','start');label(g,end+12,y+14,short(target||'Bilinmiyor'),'wire-owner-label','start');
  action(g,`${c.terminal} bağlantısını düzenle`,trigger=>onEdit(c.ownerIndex,c.wireIndex,trigger));svg.append(g);
 });return svg;
}
export function connectionScene(device,partIndex,onEdit,onAdd) {
 const scene=node('div',null,'shared-pin-scene');
 const part=device.presentation.components[partIndex],wires=visibleConnections(device,partIndex);
 const toolbar=node('div',null,'pin-section-toolbar');toolbar.append(node('span','Bağlantılar'));
 if(onAdd){const add=node('button','+ Pin ekle','pin-add-button');add.type='button';add.addEventListener('click',onAdd);toolbar.append(add);}scene.append(toolbar);
 const ends=node('div',null,'pin-endpoints');
 const source=node('div',null,'pin-endpoint');source.append(artwork(part.icon),node('span',part.name));
 const owners=[...new Set(wires.map(w=>w.targetComponent??-1))];
 const other=owners.length===1?device.presentation.components[owners[0]]:null;
 const target=node('div',null,'pin-endpoint');target.append(artwork(other?.icon||'board'),node('span',other?.name||(owners.length>1?'Diğer uçlar':device.name)));ends.append(source,target);scene.append(ends);
 scene.append(pinScene(device,partIndex,onEdit),pinScene(device,partIndex,onEdit,true));
 return scene;
}
export function moduleToolbar({name,onAdd,onRemove,tools}) {
 const toolbar=node('div',null,'module-actions shared-module-toolbar');
 if(onAdd){const add=node('button','+ Pin ekle');add.type='button';add.addEventListener('click',()=>onAdd(add));toolbar.append(add);}
 if(onRemove)toolbar.append(moduleDeleteButton(name,onRemove));toolbar.append(tools);return toolbar;
}
export function animationControl(){
 const button=node('button',flowEnabled()?'Animasyon kapat':'Animasyon aç','flow-toggle');button.type='button';button.title='Temsili sistem animasyonu';button.setAttribute('aria-pressed',String(flowEnabled()));button.addEventListener('click',toggleFlow);return button;
}
function devicesScene(devices,onOpen,mobile=false){
 const width=mobile?480:900,others=devices.filter(d=>d.id!=='hub'),rows=Math.max(2,Math.ceil(others.length/2));
 const height=mobile?Math.max(500,rows*190+100):Math.max(420,rows*160+40);
 const hub=devices.find(d=>d.id==='hub'),tileWidth=mobile?160:210,tileHeight=130;
 const center={x:(width-tileWidth)/2,y:(height-tileHeight)/2};
 const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,class:`devices-overview ${mobile?'scene-mobile':'scene-desktop'}`,'aria-label':'Tüm cihazlar'});
 const positions=others.map((device,index)=>({device,x:index%2?width-tileWidth-12:12,y:20+Math.floor(index/2)*(height-170)/Math.max(1,rows-1)}));
 for(const pos of positions){
  if(!hub)continue;
  const x1=center.x+tileWidth/2,y1=center.y+tileHeight/2,x2=pos.x+tileWidth/2,y2=pos.y+tileHeight/2;
  const route=`M${x1} ${y1}C${x1} ${(y1+y2)/2} ${x2} ${(y1+y2)/2} ${x2} ${y2}`;
  const link=svgNode('g',{class:'overview-link','aria-hidden':'true'});link.append(svgNode('path',{d:route}),svgNode('path',{d:route,pathLength:100,class:'signal-packet'}));svg.append(link);
 }
 function tile(device,x,y,central=false){
  const group=svgNode('g',{class:'scene-module'});group.append(svgNode('rect',{x,y,width:tileWidth,height:tileHeight,rx:12,class:central?'scene-board-panel':''}));
  picture(group,device.icon,x+tileWidth/2-40,y+3,80,80);label(group,x+tileWidth/2,y+102,device.name);
  label(group,x+tileWidth/2,y+120,device.id==='uno-history'?'Tarihsel kayıt':`${device.presentation?.components.filter(part=>part.icon!=='board').length||0} sensör kayıtlı`,'wire-owner-label');
  action(group,`${device.name} cihazını göster`,()=>onOpen(device.id));svg.append(group);
 }
 for(const pos of positions)tile(pos.device,pos.x,pos.y);
 if(hub)tile(hub,center.x,center.y,true);
 return svg;
}
export function devicesOverview(devices,onOpen){
 const panel=node('section',null,'wiring-workspace home-topology');panel.setAttribute('aria-label','Tüm cihazların görünümü');
 const scene=node('div',null,'wiring-scene');scene.append(devicesScene(devices,onOpen),devicesScene(devices,onOpen,true));panel.append(animationControl(),scene);return panel;
}
export function wiringWorkspace({device,devices,onDeviceSelect,onModuleOpen,tools}){
 const section=node('section',null,'wiring-workspace');section.setAttribute('aria-label','Cihaz bağlantı görünümü');
 const header=node('div',null,'wiring-heading');section.append(header);
 const nav=node('div',null,'module-picker');nav.setAttribute('aria-label','Gösterilecek cihaz');
 const scene=node('div',null,'wiring-scene');
 const effects=animationControl();
 const chooser=createChoiceDialog({title:'Cihaz seç',onSelect:value=>{if(value===device.id)render(value);else onDeviceSelect(value==='all'?'home':value);},returnFocus:()=>nav.querySelector('button'),renderIcon:choice=>artwork(choice.icon||'board')});
 const choices=[{value:'all',name:'Tüm cihazlar',icon:'board'},...devices.map(item=>({value:item.id,name:item.name,icon:item.icon}))];
 function openDevice(id){if(id===device.id)render(id);else onDeviceSelect(id);}
 function render(value){
  nav.replaceChildren();scene.replaceChildren();
  const current=choices.find(choice=>choice.value===value)||choices[1];
  const picker=node('button',null,'module-picker-trigger');picker.type='button';picker.setAttribute('aria-haspopup','dialog');picker.setAttribute('aria-label',`Cihaz seç: ${current.name}`);
  picker.append(artwork(current.icon||'board','picker-artwork'),node('span',current.name));
  picker.addEventListener('click',()=>{for(const menu of header.querySelectorAll('details[open]'))menu.open=false;chooser.open();});nav.append(picker);
  chooser.setChoices(choices,value);
  scene.append(overview(device,onModuleOpen),overview(device,onModuleOpen,true));
 }
 header.append(nav,tools);section.append(effects,scene,chooser.element);render(device.id);return section;
}
