export function flowEnabled(){return document.documentElement.classList.contains('effects-enabled');}
function updateFlowControls(){for(const button of document.querySelectorAll('.flow-toggle')){button.textContent=flowEnabled()?'Animasyon kapat':'Animasyon aç';button.setAttribute('aria-pressed',String(flowEnabled()));}}
export function toggleFlow(){document.documentElement.classList.toggle('effects-enabled');updateFlowControls();}
// Yalnız görünen SVG'ler hareket eder. Sekme gizlenince tüm akış durur.
export function initializeMotionEffects() {
 document.documentElement.classList.add('effects-demo');
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 document.documentElement.classList.toggle('effects-enabled',!preference.matches);
 preference.addEventListener('change',()=>{document.documentElement.classList.toggle('effects-enabled',!preference.matches);updateFlowControls();});
 if(!('IntersectionObserver' in window))return;
 const observed=new Set();
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)entry.target.classList.toggle('flow-visible',entry.isIntersecting);},{threshold:.1});
 let expiryTimer;
 const expireEvidence=()=>{
  clearTimeout(expiryTimer);let next=Infinity;
  for(const packet of document.querySelectorAll('.signal-packet:not(.signal-unverified)[data-active-until]')){
   const until=Number(packet.getAttribute('data-active-until'));
   if(!Number.isFinite(until)||until<=Date.now())packet.classList.add('signal-unverified');
   else next=Math.min(next,until);
  }
  if(Number.isFinite(next))expiryTimer=setTimeout(expireEvidence,Math.max(1,next-Date.now()+1));
 };
 const refresh=()=>{
  expireEvidence();
  for(const svg of observed)if(!svg.isConnected){observer.unobserve(svg);observed.delete(svg);}
  for(const svg of document.querySelectorAll('.wiring-overview,.wire-focus,.devices-overview'))if(!observed.has(svg)){observed.add(svg);observer.observe(svg);}
 };
 new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('visibilitychange',()=>document.documentElement.classList.toggle('motion-hidden',document.hidden));
 document.documentElement.classList.toggle('motion-hidden',document.hidden);refresh();
}
