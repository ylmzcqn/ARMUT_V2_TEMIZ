// Pure receive-side state for the existing Camera 2 GET /api/system contract.
// No fetch, credentials, persistence, inventory writes, control or OTA.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.length>0&&x.length<=160;
const reasons=new Set(['network','timeout','aborted','request-error']);
export function createCameraPresenceState({expectedHostname,expectedRole,now=()=>performance.now()}={}){
 if(!text(expectedHostname)||!text(expectedRole)||typeof now!=='function')throw new Error('Beklenen yerel cihaz kimliği ve rolü gerekli.');
 let observation=null,metadata=null,reason='not-observed',lastClock=-Infinity,bootChanged=false;
 function clock(){const time=now();if(!Number.isFinite(time)||time<lastClock){observation=null;reason='clock-error';return null;}lastClock=time;return time;}
 function clear(next,{keepMetadata=false}={}){observation=null;reason=next;if(!keepMetadata){metadata=null;bootChanged=false;}}
 function snapshot(){
  const time=clock();
  const ageMs=observation&&time!==null?observation.ageMs+time-observation.at:null;
  const fresh=ageMs!==null&&ageMs<2000;
  return {deviceId:'camera-02',componentId:'presence-radar',...(metadata||{}),bootChanged,
   value:fresh?observation.value:null,fresh,ageMs,reason:fresh?'fresh':observation?'stale':reason};
 }
 function accept({status,body,requestDurationMs=0}={}){
  const at=clock();if(at===null)return snapshot();
  if(status!==200){clear(status===401||status===403?'unauthorized':'http-error');return snapshot();}
  if(!Number.isFinite(requestDurationMs)||requestDurationMs<0){clear('invalid-duration');return snapshot();}
  if(!object(body)||body.hostname!==expectedHostname||body.role!==expectedRole){clear('identity-mismatch');return snapshot();}
  const boot=body.boot_health;
  if(!object(boot)||typeof boot.boot_id!=='string'||!/^[a-fA-F0-9]{1,64}$/.test(boot.boot_id)||
     typeof boot.elf_sha256!=='string'||!/^[a-fA-F0-9]{64}$/.test(boot.elf_sha256)||
     typeof boot.healthy!=='boolean'||typeof boot.pending_verification!=='boolean'||
     !text(body.firmware)||!text(body.build)) {clear('invalid-metadata');return snapshot();}
  bootChanged=metadata!==null&&metadata.bootId!==boot.boot_id;
  observation=null; // Every response replaces the previous observation, including a new boot.
  metadata={bootId:boot.boot_id,firmware:body.firmware,build:body.build,elfSha256:boot.elf_sha256.toLowerCase(),healthy:boot.healthy,pendingVerification:boot.pending_verification};
  const radar=body.radar,parts=body.components;
  if(!object(radar)||radar.installed_on!=='camera-02'||!Array.isArray(parts)||parts.length>64){clear('invalid-radar',{keepMetadata:true});return snapshot();}
  const matches=parts.filter(c=>object(c)&&c.id==='presence-radar');
  if(matches.length!==1||matches[0].owner_device_id!=='camera-02'){clear('component-mismatch',{keepMetadata:true});return snapshot();}
  const part=matches[0];
  if(typeof radar.online!=='boolean'||typeof part.online!=='boolean'||part.online!==radar.online||
     ['value','presence'].some(key=>typeof part[key]==='boolean'&&typeof radar.presence==='boolean'&&part[key]!==radar.presence)){
   clear('conflicting-radar',{keepMetadata:true});return snapshot();
  }
  if(radar.enabled!==true||radar.driver_ready!==true||radar.online!==true||typeof radar.presence!=='boolean'){
   clear('sensor-unavailable',{keepMetadata:true});return snapshot();
  }
  if(!Number.isFinite(radar.sample_age_ms)||radar.sample_age_ms<0){clear('invalid-age',{keepMetadata:true});return snapshot();}
  const ageMs=radar.sample_age_ms+requestDurationMs;
  if(!Number.isFinite(ageMs)||ageMs>=2000){clear('stale',{keepMetadata:true});return snapshot();}
  observation={value:radar.presence,ageMs,at};reason='fresh';return snapshot();
 }
 return Object.freeze({accept,snapshot,invalidate(next='request-error'){clear(reasons.has(next)?next:'request-error');return snapshot();}});
}
