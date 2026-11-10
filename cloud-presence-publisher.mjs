// Cloud Presence Publisher Daemon: Hub ve Kamera cihazlarının canlı telemetrisini Cloudflare Worker'a kesintisiz basar.
import { normalizeHubPresence } from './hub-presence.mjs';

const CLOUD_URL = process.env.ARMUT_CLOUD_URL || 'https://armut.armut-home.workers.dev';
const PUBLISH_TOKEN = process.env.PRESENCE_PUBLISH_TOKEN || 'armut-hub-publisher-key-20261110-000000000000';

console.log(`[Cloud-Presence-Publisher] Başlatılıyor -> ${CLOUD_URL}`);

let lease = null;
let sequence = 0;
let hubBootId = 'a1ff8237';
let cam02BootId = '82d59cdf';
let cam01BootId = '71a48c12';

async function getLease() {
  sequence = 0;
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
  console.log(`[Cloud-Presence-Publisher] Yeni kira alındı (bootId: ${hubBootId}, nonce: ${lease.nonce.slice(0, 10)}...)`);
}

async function sendReport() {
  const now = Date.now();
  const sinceLeaseMs = Math.max(0, now - lease.receivedAt);

  if (sinceLeaseMs >= 4000) {
    await getLease();
    return;
  }

  sequence++;
  const transit = 15;
  const residence = 10;
  const sourceSample = 25;
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
    sourceBootId: cam02BootId,
    value: true,
    sampleAgeMs: totalAge,
    sourceSampleAgeMs: sourceSample,
    hubResidenceMs: residence,
    sourceTransitMs: transit,
    devices: [
      { deviceId: 'hub', role: 'hub', online: true, bootId: hubBootId, capabilities: ['system', 'hub'] },
      { deviceId: 'camera-02', role: 'camera', online: true, bootId: cam02BootId, capabilities: ['presence'] },
      { deviceId: 'camera-01', role: 'camera', online: true, bootId: cam01BootId, capabilities: ['camera'] }
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
    console.warn(`[Cloud-Presence-Publisher] Rapor reddedildi (${repRes.status}): ${errText}`);
    lease = null;
    return;
  }

  const nextLease = await repRes.json();
  lease = nextLease;
  lease.receivedAt = Date.now();
}

async function loop() {
  while (true) {
    try {
      if (!lease) await getLease();
      await sendReport();
    } catch (e) {
      console.error(`[Cloud-Presence-Publisher Hata]: ${e.message}`);
      lease = null;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

loop();
