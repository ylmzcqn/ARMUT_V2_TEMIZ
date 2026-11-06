import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeMotionEffects,flowEnabled,toggleFlow} from './motion-effects.mjs';
test('azaltılmış harekette akış kapalı başlar, kullanıcı açıp durdurabilir; görünürlük çizimi durdurur',()=>{
 const classes=new Set(),handlers={},button={setAttribute(){}};
 const list={add:key=>classes.add(key),contains:key=>classes.has(key),toggle(key,value){const active=value??!classes.has(key);active?classes.add(key):classes.delete(key);return active;}};
 globalThis.document={documentElement:{classList:list},body:{},hidden:false,querySelectorAll:selector=>selector==='.flow-toggle'?[button]:[],addEventListener:(key,fn)=>handlers[key]=fn};
 globalThis.matchMedia=()=>({matches:true,addEventListener(){}});
 globalThis.window={IntersectionObserver:true};globalThis.IntersectionObserver=class{observe(){}unobserve(){}};globalThis.MutationObserver=class{observe(){}};
 try{initializeMotionEffects();assert.equal(flowEnabled(),false);toggleFlow();assert.equal(flowEnabled(),true);assert.equal(button.textContent,'Animasyon kapat');document.hidden=true;handlers.visibilitychange();assert.ok(classes.has('motion-hidden'));toggleFlow();assert.equal(button.textContent,'Animasyon aç');assert.equal(flowEnabled(),false);}
 finally{for(const key of ['document','window','matchMedia','IntersectionObserver','MutationObserver'])delete globalThis[key];}
});
