// Animasyon için güncel doğrulama gerekir; belge/geçmiş kaydı yeterli değildir.
export function connectionIsActive(device,partIndex,targetIndex=-1,now=Date.now()) {
 const fresh=record=>record&&Number.isFinite(Date.parse(record.verifiedAt))&&now-Date.parse(record.verifiedAt)>=0&&now-Date.parse(record.verifiedAt)<=90000;
 const live=device.liveStatus;
 if(!fresh(live)||live.online!==true)return false;
 const working=index=>{const status=device.presentation.components[index]?.liveStatus;return fresh(status)&&status.working===true;};
 return Boolean(working(partIndex)&&(targetIndex<0||working(targetIndex)));
}

export function connectionVerifiedUntil(device,index,target=-1){
 const records=[device.liveStatus,device.presentation.components[index]?.liveStatus];
 if(target>=0)records.push(device.presentation.components[target]?.liveStatus);
 return Math.min(...records.map(record=>Date.parse(record?.verifiedAt)+90000));
}

export function devicePresence(device,now=Date.now()) {
 if(device.id==='uno-history')return {state:'historical',label:'Tarihsel kayıt'};
 const live=device.liveStatus,age=now-Date.parse(live?.verifiedAt);
 if(!live||!Number.isFinite(age)||age<0||age>90000||typeof live.online!=='boolean')return {state:'unknown',label:'Durum bilinmiyor'};
 return live.online?{state:'online',label:'Çevrimiçi'}:{state:'offline',label:'Çevrimdışı'};
}
