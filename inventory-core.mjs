import {sha256Hex} from './browser-crypto.mjs?v=cloud20261110-14';
import {validateHardwareInventory} from './hardware-schema.mjs?v=cloud20261110-14';
const kinds = new Set(['source', 'reported', 'physical', 'unknown', 'conflict']);
const str = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateInventory(data) {
  const fail = () => { throw new Error('Veri biçimi geçersiz. inventory.json içindeki cihaz ve kaynak kayıtlarını kontrol edin.'); };
  if (!object(data) || data.version !== 1 || !object(data.sources) || !Array.isArray(data.devices)) fail();
  for (const source of Object.values(data.sources)) {
    if (!object(source) || !str(source.path) || !Number.isInteger(source.start) || source.start < 1 ||
        !Number.isInteger(source.end) || source.end < source.start || !/^[a-f0-9]{64}$/.test(source.sha256)) fail();
  }
  for(const source of Object.values(data.sources)){
    if(source.snapshot!==undefined){const snap=source.snapshot;
      if(!object(snap)||typeof snap.text!=='string'||!snap.text.endsWith('\n')||!str(source.project)||snap.encoding!=='utf8-lf'||!/^\d{4}-\d{2}-\d{2}$/.test(snap.reviewedAt)||!/^[a-f0-9]{64}$/.test(snap.sha256))fail();
    }
  }
  const refs = list => Array.isArray(list) && list.length > 0 && list.every(id => Object.hasOwn(data.sources, id));
  const ids = new Set();
  for (const device of data.devices) {
    if (!object(device) || !str(device.id) || ids.has(device.id) || !str(device.name) ||
        !str(device.summary) || !Array.isArray(device.claims) || !device.claims.length) fail();
    ids.add(device.id);
    for (const claim of device.claims) {
      if (!object(claim) || !str(claim.subject) || !kinds.has(claim.kind) || !str(claim.text) || !refs(claim.sources)) fail();
    }
    if (device.presentation !== undefined) {
      const p = device.presentation;
      const rows = value => Array.isArray(value) && value.length > 0 && value.every(row => object(row) && str(row.label) && str(row.value));
      if (!object(p) || !rows(p.facts) || !str(p.notice) || !Array.isArray(p.components) || !p.components.length) fail();
      const covered = new Set();
      for (const part of p.components) {
        if (!object(part) || !str(part.name) || !str(part.description) || !rows(part.rows) ||
            !str(part.note) || !Array.isArray(part.claimIndexes) || !part.claimIndexes.length) fail();
        for (const index of part.claimIndexes) {
          if (!Number.isInteger(index) || index < 0 || index >= device.claims.length || covered.has(index)) fail();
          covered.add(index);
        }
        if (part.connections !== undefined && (!Array.isArray(part.connections) ||
            !part.connections.every(c => object(c) && str(c.terminal) && str(c.target) &&
              ['signal','clock','power','ground','conflict','unknown'].includes(c.kind) &&
              ((c.evidence==='user_added' && c.claimIndex===undefined && str(c.createdAt)) ||
               (Number.isInteger(c.claimIndex) && part.claimIndexes.includes(c.claimIndex)))))) fail();
        for(const c of part.connections || []) {
          if(c.targetComponent !== undefined && (!Number.isInteger(c.targetComponent) || c.targetComponent < -1 ||
             c.targetComponent >= p.components.length || p.components[c.targetComponent] === part ||
             (c.targetComponent >= 0 && !Array.isArray(p.components[c.targetComponent].connections)))) fail();
          if(c.evidence !== undefined && !['user_edit','user_added'].includes(c.evidence)) fail();
          if(c.history !== undefined && (!Array.isArray(c.history) || !c.history.every(h => object(h) && str(h.terminal) && str(h.target) && str(h.changedAt) && Number.isInteger(h.targetComponent)))) fail();
        }
      }
      if (covered.size !== device.claims.length) fail();
    }
  }
  if (data.exclusions !== undefined && (!Array.isArray(data.exclusions) ||
      !data.exclusions.every(item => object(item) && str(item.text) && refs(item.sources)))) fail();
  if (data.scope !== undefined && !str(data.scope)) fail();
  if (data.reviewedAt !== undefined && !str(data.reviewedAt)) fail();
  if (data.evidenceLabels !== undefined && (!object(data.evidenceLabels) ||
      ![...kinds].every(kind => str(data.evidenceLabels[kind])))) fail();
  validateHardwareInventory(data,fail);
  return data;
}

export async function loadInventory(fetcher = fetch) {
  let response;
  try { response = await fetcher('./inventory.json', {cache: 'no-store'}); }
  catch { throw new Error('Envanter dosyası okunamadı. Sayfayı yerel HTTP üzerinden açın ve inventory.json dosyasının aynı klasörde olduğunu kontrol edin.'); }
  if (!response.ok) throw new Error(`Envanter dosyası okunamadı (HTTP ${response.status}). inventory.json dosyasının aynı klasörde olduğunu kontrol edin.`);
  let data;
  try { data = await response.json(); }
  catch { throw new Error('inventory.json geçerli JSON değil. Dosyadaki yazım hatasını düzeltip yeniden deneyin.'); }
  const validated=validateInventory(data);await verifySourceSnapshots(validated);return validated;
}

export function selectedDevice(data, hash) {
  let id;
  try { id = decodeURIComponent(hash.replace(/^#/, '')); } catch { return null; }
  return data.devices.find(device => device.id === id) || null;
}

export function inventoryRoute(data,hash){
 const home=!hash||hash==='#home',empty=data.devices.length===0;
 return {device:selectedDevice(data,hash||''),home,empty,listing:home||hash==='#devices'||empty};
}

export async function verifySourceSnapshots(data){
 for(const source of Object.values(data.sources)){
  if(!source.snapshot)continue;
  const hash=await sha256Hex(source.snapshot.text);
  if(hash!==source.snapshot.sha256)throw new Error('Kaynak özeti bütünlük kontrolünü geçemedi: '+source.path);
 }
}
