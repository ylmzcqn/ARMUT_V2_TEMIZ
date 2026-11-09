// Hub-side normalization contract. No network/device access; reuse the existing V1 parser.
import {createCameraPresenceState} from './legacy-camera-status.mjs';
export function normalizeHubPresence({system,systemAgeMs,sourceTransitMs}={},identity={}){
 const unknown=boot=>({publisherId:'hub',deviceId:'camera-02',componentId:'presence-radar',sourceBootId:boot||null,value:null,sampleAgeMs:null,sourceSampleAgeMs:null,hubResidenceMs:null,sourceTransitMs:null});
 if(![systemAgeMs,sourceTransitMs].every(v=>Number.isSafeInteger(v)&&v>=0))return unknown();
 const parser=createCameraPresenceState({...identity,now:()=>0}),sample=parser.accept({status:200,body:system});
 const total=sample.ageMs===null?null:sample.ageMs+systemAgeMs+sourceTransitMs;
 if(!sample.fresh||!Number.isSafeInteger(sample.ageMs)||!Number.isSafeInteger(total)||total>=2000)return unknown(sample.bootId);
 return {publisherId:'hub',deviceId:'camera-02',componentId:'presence-radar',sourceBootId:sample.bootId,value:sample.value,sampleAgeMs:total,sourceSampleAgeMs:sample.ageMs,hubResidenceMs:systemAgeMs,sourceTransitMs};
}
