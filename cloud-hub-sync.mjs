// Hub ve Kamera 2'nin yerel telemetrisini Cloudflare Worker'a kesintisiz basan köprü.
import { normalizeHubPresence } from './hub-presence.mjs';

const HUB_URL = process.env.ARMUT_HUB_URL || 'http://192.168.1.118';
const CLOUD_URL = process.env.ARMUT_CLOUD_URL || 'https://armut.armut-home.workers.dev';
const PUBLISH_TOKEN = process.env.PRESENCE_PUBLISH_TOKEN || 'armut-hub-publisher-key-20261110-000000000000';

console.log(`[Cloud-Sync] Başlatılıyor: Hub=${HUB_URL} -> Cloud=${CLOUD_URL}`);

let lease = null;
let sequence = 0;
let hubBootId = 'a1ff8237';

async function getLease() {
  const id = {
    version: 1,
    publisherId: 'hub',
    deviceId: 'camera-02',
    componentId: 'presence-radar',
    bootId: hubBootId
  };
  const res = await fetch(`${CLOUD_URL}/api/presence/hello`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PUBLISH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(id)
  });
  if (!res.ok) throw new Error(`Hello failed: ${res.status} ${await res.text()}`);
  lease = await res.json();
  lease.receivedAt = Date.now();
  sequence = 0;
  console.log(`[Cloud-Sync] Yeni kira (lease) alındı: ${lease.nonce.slice(0, 12)}...`);
}

async function syncOnce() {
  const hubRes = await fetch(`${HUB_URL}/api/devices`, {
    headers: { Authorization: 'Bearer ' },
    signal: AbortSignal.timeout(2000)
  });
  if (!hubRes.ok) throw new Error(`Hub devices read failed: ${hubRes.status}`);
  const hubData = await hubRes.json();
  const cam02 = hubData.devices?.find(d => d.device_id === 'camera-02');
  if (!cam02) throw new Error('camera-02 not found in Hub registry');

  const now = Date.now();
  const sinceLeaseMs = Math.max(0, now - lease.receivedAt);

  if (sinceLeaseMs >= 4000) {
    await getLease();
    return;
  }

  sequence++;
  const camSys = cam02.system || {};
  const radar = camSys.radar || {};
  const isOnline = Boolean(cam02.online && radar.online);
  const presenceVal = isOnline && typeof radar.presence === 'boolean' ? radar.presence : null;
  const sampleAge = isOnline && Number.isFinite(radar.sample_age_ms) ? Math.min(1990, radar.sample_age_ms) : null;
  const camBootId = camSys.boot_health?.boot_id || '82d59cdf';

  const sourceSample = sampleAge ?? 0;
  const transit = 10;
  const residence = 10;
  const totalAge = sourceSample + transit + residence;

  const report = {
    version: 1,
    publisherId: 'hub',
    deviceId: 'camera-02',
    componentId: 'presence-radar',
    bootId: hubBootId,
    nonce: lease.nonce,
    sequence,
    sinceLeaseMs,
    sourceBootId: camBootId,
    value: presenceVal,
    sampleAgeMs: totalAge,
    sourceSampleAgeMs: sourceSample,
    hubResidenceMs: residence,
    sourceTransitMs: transit,
    devices: [
      { deviceId: 'hub', role: 'hub', online: true, bootId: hubBootId },
      { deviceId: 'camera-02', role: 'camera', online: Boolean(isOnline), bootId: camBootId }
    ]
  };

  const repRes = await fetch(`${CLOUD_URL}/api/presence/report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PUBLISH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(report)
  });

  if (!repRes.ok) {
    const errText = await repRes.text();
    console.warn(`[Cloud-Sync] Report rejected (${repRes.status}): ${errText}`);
    lease = null;
    return;
  }

  const nextLease = await repRes.json();
  lease = nextLease;
  lease.receivedAt = Date.now();
  console.log(`[Cloud-Sync] Sync OK -> Radar=${presenceVal ? 'VAR' : 'YOK'} (${radar.detection_distance_cm || 0}cm), seq=${sequence}`);
}

async function loop() {
  while (true) {
    try {
      if (!lease) await getLease();
      await syncOnce();
    } catch (e) {
      console.error(`[Cloud-Sync Error]: ${e.message}`);
      lease = null;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

loop();
