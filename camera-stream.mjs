export const cameraProfiles={smooth:{name:'Akıcı',targetFps:25,width:640,height:480,jpegQuality:18,exposure:'auto',note:'25 FPS hedefi · cihazda ölçülmeli'},lowlight:{name:'Az ışık',targetFps:12,width:640,height:480,jpegQuality:16,exposure:'lowlight',note:'Daha uzun pozlama · FPS düşebilir'},detail:{name:'Ayrıntılı',targetFps:8,width:1280,height:960,jpegQuality:10,exposure:'auto',note:'Çözünürlük öncelikli'}};
export function createJpegParser(limit=4194304){let buffer=new Uint8Array();return {push(chunk){const next=new Uint8Array(buffer.length+chunk.length);next.set(buffer);next.set(chunk,buffer.length);buffer=next;if(buffer.length>limit)throw new Error('Kamera karesi boyut sınırını aştı.');const frames=[];let start=-1,end=0;for(let i=0;i<buffer.length-1;i++){if(start<0&&buffer[i]===255&&buffer[i+1]===216)start=i;if(start>=0&&buffer[i]===255&&buffer[i+1]===217){frames.push(buffer.slice(start,i+2));end=i+2;start=-1;i++;}}buffer=start>=0?buffer.slice(start):end?buffer.slice(end):buffer.slice(-1);return frames;}};}
export function createCameraPlayer({image,onStatus=()=>{},fetcher=fetch}){
 let generation=0,controller,timer,watchdog,url,lastFrame,frames=0,started=0,blob=null,retries=0,config,profile='smooth',running=false;
 const abort=()=>{clearTimeout(timer);clearTimeout(watchdog);controller?.abort();};
 function release(){if(url)URL.revokeObjectURL(url);url=null;image.removeAttribute('src');blob=null;}
 function stop(){generation++;running=false;abort();release();onStatus({state:'stopped',fps:null,message:'Yayın durduruldu'});}
 function watchdogReset(){clearTimeout(watchdog);watchdog=setTimeout(()=>controller?.abort(),8000);}
 async function paint(bytes,token){if(token!==generation)return;const next=new Blob([bytes],{type:'image/jpeg'});const nextUrl=URL.createObjectURL(next);const old=url;image.src=nextUrl;try{await image.decode();}catch{URL.revokeObjectURL(nextUrl);throw new Error('JPEG görüntüsü çözümlenemedi.');}if(token!==generation){URL.revokeObjectURL(nextUrl);return;}url=nextUrl;blob=next;if(old)URL.revokeObjectURL(old);frames++;lastFrame=performance.now();watchdogReset();const elapsed=(lastFrame-started)/1000;onStatus({state:'playing',fps:elapsed>0?frames/elapsed:0,message:'Canlı görüntü'});}
 async function open(token,applyProfile){
  if(token!==generation||!running)return;controller=new AbortController();onStatus({state:'connecting',fps:null,message:retries?'Yeniden bağlanıyor…':'Kameraya bağlanıyor…'});watchdogReset();started=performance.now();frames=0;
  let profileApplied=!applyProfile||!config.profileUrl;
  try{
   if(applyProfile&&config.profileUrl){const r=await fetcher(config.profileUrl,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,profile,...cameraProfiles[profile]}),signal:controller.signal});if(!r.ok)throw new Error(`Profil uygulanamadı: HTTP ${r.status}`);profileApplied=true;}
   if(config.transport==='mjpeg'){
    const r=await fetcher(config.url,{cache:'no-store',credentials:'omit',signal:controller.signal});if(!r.ok||!r.body)throw new Error(`Yayın açılamadı: HTTP ${r.status}`);const reader=r.body.getReader(),parser=createJpegParser();
    try{while(token===generation&&running){const {value,done}=await reader.read();if(done)throw new Error('Kamera yayını sonlandı.');const batch=parser.push(value);for(const frame of batch)await paint(frame,token);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   }else{
    while(token===generation&&running){const begin=performance.now();const u=new URL(config.url);u.searchParams.set('_armut',Date.now());const r=await fetcher(u,{cache:'no-store',credentials:'omit',signal:controller.signal});if(!r.ok)throw new Error(`Görüntü alınamadı: HTTP ${r.status}`);const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>4194304)throw new Error('JPEG çok büyük.');await paint(bytes,token);await new Promise(resolve=>{timer=setTimeout(resolve,Math.max(0,1000/cameraProfiles[profile].targetFps-(performance.now()-begin)));});}
   }
  }catch(error){if(token!==generation||!running)return;abort();release();onStatus({state:'error',fps:null,message:`Yayın kesildi. ${error.name==='AbortError'?'8 saniyedir yeni kare yok.':error.message}`});if(profileApplied&&retries<3){retries++;timer=setTimeout(()=>open(token,false),1000*2**retries);}else running=false;}
 }
 function start(next,selected='smooth'){stop();config=next;profile=Object.hasOwn(cameraProfiles,selected)?selected:'smooth';retries=0;running=true;const token=++generation;void open(token,true);}
 return {start,stop,snapshot(){return blob;},get running(){return running;}};
}
