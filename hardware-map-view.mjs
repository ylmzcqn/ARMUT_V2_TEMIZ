import {analyzeHardware,pinStatusLabels} from './hardware-map.mjs?v=cloud20261110-8';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const evidenceLabels={source:'Kaynak kod tanımı',reported:'Kullanıcı / belge kaydı',physical:'Tarihsel fiziksel gözlem',conflict:'Çelişkili kaynak',unknown:'Doğrulanmamış',user_edit:'Kullanıcı düzenlemesi',user_added:'Kullanıcı ekledi'};
export function hardwareMapView({inventory,device,onOpenPart,renderReferences}){
 const report=analyzeHardware(inventory,device.id);
 const panel=node('details',undefined,'hardware-map');panel.id='hardware-map';
 const summary=node('summary');summary.append(node('span','GPIO / pin haritası'),node('span',`${report.pins.length} pin`,'pin-total'));panel.append(summary);
 const body=node('div',undefined,'hardware-map-body');panel.append(body);
 body.append(node('p',report.profileName,'hardware-profile-name'),node('p',report.boardVerified?'Kart kimliği doğrulanmış; pin kullanım kayıtlarını ve kısıtlarını birlikte değerlendirin.':'Kart modeli / revizyonu ve fiziksel boşluk doğrulanmadı. Kayıtsız pin kullanılabilir demek değildir.','hardware-scope'));
 if(report.boardVerified){const proof=node('details',undefined,'hardware-board-proof');proof.append(node('summary',`Kart kimliği doğrulaması · ${report.boardVerification.checkedAt}`),renderReferences(report.boardVerification.sourceIds));body.append(proof);}
 const toolbar=node('div',undefined,'hardware-map-controls');
 const search=node('input');search.type='search';search.placeholder='GPIO, sensör veya işlev ara';search.setAttribute('aria-label','Pin haritasında ara');
 const filter=node('select');filter.setAttribute('aria-label','Pin durumunu filtrele');
 for(const [value,text] of [['all','Tüm pinler'],['usage','Kayıtlı kullanım'],['unknown','Bağlantı kaydı yok'],['limits','Ayrılmış / kısıtlı'],['historical','Tarihsel kullanım'],['conflict','İncelenmeli'],['available','Kullanılabilirliği doğrulanmış']]){const option=node('option',text);option.value=value;filter.append(option);}
 const download=node('button','Rapor indir');download.type='button';download.title='Aynı donanım haritasını kaynaklarıyla JSON olarak indir';download.addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'}));const link=node('a');link.href=url;link.download=`${device.id}-hardware-map.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });toolbar.append(search,filter,download);body.append(toolbar);
 const count=node('p',undefined,'hardware-result');count.setAttribute('role','status');body.append(count);
 const list=node('div',undefined,'hardware-pin-list');body.append(list);
 function render(){
  const query=search.value.trim().toLocaleLowerCase('tr-TR'),status=filter.value;
  const rows=report.pins.filter(row=>{
   const match=status==='all'||(status==='usage'?['used','shared'].includes(row.status):status==='limits'?row.constraints.length>0:row.status===status);
   const text=[row.pin,row.label,...row.capabilities,...row.assignments.map(a=>a.part+' '+a.terminal+' '+a.target),...row.constraints.map(c=>c.reason)].join(' ').toLocaleLowerCase('tr-TR');return match&&(!query||text.includes(query));
  });list.replaceChildren();count.textContent=`${rows.length} / ${report.pins.length} pin · ${report.pins.filter(p=>p.status==='available').length} kullanılabilirliği doğrulanmış`;
  if(!rows.length){list.append(node('p','Bu arama veya filtreye uygun pin yok.','hardware-empty'));return;}
  for(const row of rows){
   const details=node('details',undefined,`hardware-pin pin-${row.status}`),head=node('summary');
   const owner=row.assignments.map(a=>`${a.part} · ${a.terminal}`).join(' / ');
   head.append(node('strong',row.pin),node('span',row.label+(row.assignments.length&&row.constraints.length?' · Kısıt var':''),'pin-state'),node('span',owner||row.constraints[0]?.reason||'Fiziksel durum ve header erişimi doğrulanmadı.','pin-owner'));details.append(head);
   const content=node('div',undefined,'hardware-pin-content');
   if(row.capabilities.length)content.append(node('p',row.capabilities.join(' · '),'pin-capabilities'));
   content.append(node('p','Bunlar profil özellikleridir; kartta fiziksel erişim veya bu iş için uygunluk onayı değildir.','pin-evidence-label'));
   for(const a of row.assignments){
    const button=node('button',`${a.part} · ${a.terminal} → ${a.target}`,'pin-owner-link');button.type='button';button.addEventListener('click',()=>onOpenPart(a.partIndex,button));content.append(button,node('p',`${a.historical?'Tarihsel kayıt · ':''}${evidenceLabels[a.evidence]||'Doğrulanmamış'}${a.bus?' · Kayıtlı ortak hat: '+a.bus:''}`,'pin-evidence-label'));
    if(a.evidence==='user_edit'||a.evidence==='user_added')content.append(node('p','Bu değer kullanıcı kaydıdır; aşağıdaki ilk kaynaklar bu düzenlemenin fiziksel doğrulaması değildir.','pin-evidence-label'));
   }
   for(const c of row.constraints)content.append(node('p',c.reason,'pin-constraint'));
   if(!row.assignments.length)content.append(node('p',row.status==='available'?'Kayıtlı doğrulamayı ve kısıtları inceleyin.':'Bu pin için mevcut bağlantı kaydı yok. Fiziksel boşluk veya elektriksel uygunluk sonucu çıkarılmaz.','pin-evidence-label'));
   if(row.sourceIds.length)content.append(renderReferences(row.sourceIds));
   for(const refId of row.referenceIds){const ref=inventory.hardwareReferences[refId],link=node('a',ref.title,'hardware-reference-link');link.href=ref.url;link.target='_blank';link.rel='noopener noreferrer';content.append(link);}
   details.append(content);list.append(details);
  }
 }
 search.addEventListener('input',render);filter.addEventListener('change',render);render();
 const limits=node('details',undefined,'hardware-open-items');limits.append(node('summary',`Bağlantılar, besleme ve açık kayıtlar (${report.links.length+report.issues.length})`));
 for(const link of report.links){const target=link.targetComponent>=0?device.presentation.components[link.targetComponent].name+' · ':'';limits.append(node('p',`${link.part} · ${link.terminal} → ${target}${link.target}${link.historical?' · tarihsel':''}`));}
 for(const issue of report.issues)limits.append(node('p',`${issue.pin?issue.pin+': ':''}${issue.message}`,'pin-constraint'));
 for(const note of report.notes){limits.append(node('p',note.text));limits.append(renderReferences(note.sourceIds));}body.append(limits);
 return panel;
}
