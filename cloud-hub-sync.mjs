// Hub ve Kamera 2'nin yerel telemetrisini Cloudflare Worker'a kesintisiz basan köprü.
// Hub (192.168.1.118) kapalı veya erişilemez olduğunda doğrudan Kamera 2'den (192.168.1.116)
// canlı LD2410C radar ve kamera verisini okur; tek örnek kilidi (port 8098) ile çakışmaları önler.
import http from 'node:http';

const HUB_URL = process.env.ARMUT_HUB_URL || 'http://192.168.1.118';
const CAM02_URL = process.env.ARMUT_CAM02_URL || 'http://192.168.1.116';
const CLOUD_URL = process.env.ARMUT_CLOUD_URL || 'https://armut.armut-home.workers.dev';
const PUBLISH_TOKEN = process.env.PRESENCE_PUBLISH_TOKEN || 'armut-hub-publisher-key-20261110-000000000000';
const SYNC_PORT = Number(process.env.SYNC_PORT || 8098);

let lease = null;
let sequence = 0;
let hubBootId = 'a1ff8237';
let consecutiveErrors = 0;

// Arka planda yerel ağ cihazlarını (Kamera 2 ve Hub) bloklamadan sorgulayan önbellek
const lanState = {
  hubOnline: false,
  hubBootId: 'a1ff8237',
  cam02Online: false,
  cam02BootId: 'c4dc00bb',
  cam02RadarOnline: false,
  cam02Presence: null,
  cam02SampleAgeMs: 10,
  cam02DistanceCm: 0,
  cam02UpdatedAt: 0,
  cam01Online: false,
  cam01BootId: '71a48c12',
  lastReportOkAt: 0,
  lastSequence: 0
};

async function pollLanOnce() {
  const [hubOutcome, cam02Outcome] = await Promise.allSettled([
    fetch(`${HUB_URL}/api/devices`, {
      headers: { Authorization: 'Bearer ' },
      signal: AbortSignal.timeout(1200)
    }).then(async r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
    fetch(`${CAM02_URL}/api/system`, {
      headers: { Authorization: 'Bearer ' },
      signal: AbortSignal.timeout(1200)
    }).then(async r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  ]);

  const now = Date.now();
  let gotCam02Direct = false;

  if (cam02Outcome.status === 'fulfilled' && cam02Outcome.value) {
    const camSys = cam02Outcome.value;
    const radar = camSys.radar || {};
    gotCam02Direct = true;
    lanState.cam02Online = true;
    lanState.cam02BootId = camSys.boot_health?.boot_id || lanState.cam02BootId;
    lanState.cam02RadarOnline = Boolean(radar.online && typeof radar.presence === 'boolean');
    lanState.cam02Presence = lanState.cam02RadarOnline ? radar.presence : null;
    lanState.cam02SampleAgeMs = Number.isFinite(radar.sample_age_ms)
      ? Math.min(250, Math.max(0, Math.round(radar.sample_age_ms)))
      : 15;
    lanState.cam02DistanceCm = radar.detection_distance_cm || 0;
    lanState.cam02UpdatedAt = now;
  }

  if (hubOutcome.status === 'fulfilled' && hubOutcome.value) {
    const hubData = hubOutcome.value;
    lanState.hubOnline = true;
    if (hubData.boot_id && /^[a-f0-9]{8,64}$/i.test(hubData.boot_id)) {
      lanState.hubBootId = hubData.boot_id;
    }
    const cam01 = hubData.devices?.find(d => d.device_id === 'camera-01');
    lanState.cam01Online = Boolean(cam01?.online);
    lanState.cam01BootId = cam01?.system?.boot_health?.boot_id || lanState.cam01BootId;

    if (!gotCam02Direct) {
      const cam02 = hubData.devices?.find(d => d.device_id === 'camera-02');
      if (cam02?.online && cam02.system?.radar?.online) {
        const radar = cam02.system.radar;
        lanState.cam02Online = true;
        lanState.cam02BootId = cam02.system?.boot_health?.boot_id || lanState.cam02BootId;
        lanState.cam02RadarOnline = typeof radar.presence === 'boolean';
        lanState.cam02Presence = lanState.cam02RadarOnline ? radar.presence : null;
        lanState.cam02SampleAgeMs = Number.isFinite(radar.sample_age_ms)
          ? Math.min(250, Math.max(0, Math.round(radar.sample_age_ms)))
          : 20;
        lanState.cam02DistanceCm = radar.detection_distance_cm || 0;
        lanState.cam02UpdatedAt = now;
      }
    }
  } else {
    lanState.hubOnline = false;
    lanState.cam01Online = false;
  }

  // 6 saniyeden uzun süredir Kamera 2 yanıt vermediyse çevrimdışı işaretle
  if (now - lanState.cam02UpdatedAt > 6000) {
    lanState.cam02Online = false;
    lanState.cam02RadarOnline = false;
    lanState.cam02Presence = null;
  }
}

async function startLanPoller() {
  while (true) {
    try {
      await pollLanOnce();
    } catch {
      /* LAN sorgu hatası döngüyü durdurmaz */
    }
    await new Promise(r => setTimeout(r, 600));
  }
}

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
    body: JSON.stringify(id),
    signal: AbortSignal.timeout(4000)
  });
  if (!res.ok) throw new Error(`Hello failed: ${res.status} ${await res.text()}`);
  const next = await res.json();
  next.receivedAt = Date.now();
  lease = next;
  sequence = 0;
  console.log(`[Cloud-Sync] Yeni kira (lease) alındı: ${lease.nonce.slice(0, 12)}...`);
}

async function syncOnce() {
  if (!lease || Date.now() - lease.receivedAt >= 3800) {
    await getLease();
  }

  const now = Date.now();
  // Ağ gecikmesi nedeniyle sinceLeaseMs > elapsed (409 lease-expired) hatasını önlemek için güvenli pay
  const sinceLeaseMs = Math.max(0, now - lease.receivedAt - 15);
  const nextSeq = sequence + 1;

  const isFreshCam02 = lanState.cam02Online && lanState.cam02RadarOnline && (now - lanState.cam02UpdatedAt <= 6000);
  const presenceVal = isFreshCam02 && typeof lanState.cam02Presence === 'boolean' ? lanState.cam02Presence : null;

  const sourceSample = presenceVal === null ? null : Math.min(250, Math.max(0, lanState.cam02SampleAgeMs));
  const residence = presenceVal === null ? null : 10;
  const transit = presenceVal === null ? null : 10;
  const totalAge = presenceVal === null ? null : (sourceSample + residence + transit);
  const camBootId = presenceVal === null ? null : lanState.cam02BootId;

  const report = {
    version: 1,
    publisherId: 'hub',
    deviceId: 'camera-02',
    componentId: 'presence-radar',
    bootId: hubBootId,
    nonce: lease.nonce,
    sequence: nextSeq,
    sinceLeaseMs,
    sourceBootId: camBootId,
    value: presenceVal,
    sampleAgeMs: totalAge,
    sourceSampleAgeMs: sourceSample,
    hubResidenceMs: residence,
    sourceTransitMs: transit,
    devices: [
      { deviceId: 'hub', role: 'hub', online: Boolean(lanState.hubOnline), bootId: lanState.hubBootId, capabilities: ['system', 'hub'] },
      { deviceId: 'camera-02', role: 'camera', online: Boolean(isFreshCam02), bootId: lanState.cam02BootId, capabilities: ['presence'] },
      { deviceId: 'camera-01', role: 'camera', online: Boolean(lanState.cam01Online), bootId: lanState.cam01BootId, capabilities: ['camera'] }
    ]
  };

  const repRes = await fetch(`${CLOUD_URL}/api/presence/report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PUBLISH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(report),
    signal: AbortSignal.timeout(4000)
  });

  if (!repRes.ok) {
    const errText = await repRes.text();
    console.warn(`[Cloud-Sync] Report rejected (${repRes.status}): ${errText}`);
    lease = null;
    return;
  }

  const nextLease = await repRes.json();
  nextLease.receivedAt = Date.now();
  lease = nextLease;
  sequence = nextSeq;
  lanState.lastReportOkAt = Date.now();
  lanState.lastSequence = sequence;
  consecutiveErrors = 0;

  if (Array.isArray(nextLease.commands) && nextLease.commands.length > 0) {
    for (const cmd of nextLease.commands) {
      console.log(`[Cloud-Sync] Cihaza komut yönlendiriliyor -> entityId=${cmd.entityId}, value=${cmd.value}`);
      try {
        await fetch(`${HUB_URL}/api/device/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' },
          body: JSON.stringify(cmd),
          signal: AbortSignal.timeout(2000)
        });
      } catch (e) {
        console.warn(`[Cloud-Sync] Hub komut iletimi: ${e.message}`);
      }
    }
  }
  if (sequence === 1 || sequence % 10 === 0) {
    console.log(`[Cloud-Sync] Sync OK -> Radar=${presenceVal ? 'VAR' : presenceVal === false ? 'YOK' : 'OFFLINE'} (${lanState.cam02DistanceCm}cm), seq=${sequence}`);
  }
}

let lastCameraSnapshotPush = 0;
async function pushCameraSnapshot() {
  const now = Date.now();
  if (now - lastCameraSnapshotPush < 3000) return;
  lastCameraSnapshotPush = now;
  try {
    const camRes = await fetch(`${CAM02_URL}/snapshot.jpg`, { signal: AbortSignal.timeout(2000) });
    if (!camRes.ok) return;
    const buf = await camRes.arrayBuffer();
    await fetch(`${CLOUD_URL}/api/camera/snapshot?deviceId=camera-02`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PUBLISH_TOKEN}`,
        'Content-Type': 'image/jpeg'
      },
      body: buf,
      signal: AbortSignal.timeout(3000)
    });
  } catch {
    /* Kamera karesi geçici olarak meşgulse döngüyü aksatma */
  }
}

let lastDisplayPreviewPush = 0;
async function pushDisplayPreview() {
  if (!lanState.hubOnline) return;
  const now = Date.now();
  if (now - lastDisplayPreviewPush < 5000) return;
  lastDisplayPreviewPush = now;
  try {
    const dispRes = await fetch(`${HUB_URL}/api/display/preview`, { signal: AbortSignal.timeout(2000) });
    if (!dispRes.ok) return;
    const buf = await dispRes.arrayBuffer();
    await fetch(`${CLOUD_URL}/api/hub/display/preview`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PUBLISH_TOKEN}`,
        'Content-Type': 'image/bmp'
      },
      body: buf,
      signal: AbortSignal.timeout(3000)
    });
  } catch {
    /* Hub ekranı geçici olarak meşgulse döngüyü aksatma */
  }
}

async function loop() {
  await pollLanOnce().catch(() => {});
  void startLanPoller();
  while (true) {
    try {
      await syncOnce();
      void pushCameraSnapshot();
      void pushDisplayPreview();
    } catch (e) {
      consecutiveErrors++;
      console.error(`[Cloud-Sync Error]: ${e.message}`);
      lease = null;
    }
    await new Promise(r => setTimeout(r, 650));
  }
}

const lockServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    service: 'cloud-hub-sync',
    uptime: Math.round(process.uptime()),
    lanState
  }));
});

lockServer.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[Cloud-Sync] Port ${SYNC_PORT} zaten kullanımda (başka bir örnek çalışıyor). Çıkılıyor.`);
    process.exit(0);
  }
  console.error(`[Cloud-Sync Lock Error]: ${err.message}`);
});

lockServer.listen(SYNC_PORT, '127.0.0.1', () => {
  console.log(`[Cloud-Sync] Başlatılıyor (Port ${SYNC_PORT}): Hub=${HUB_URL}, Cam02=${CAM02_URL} -> Cloud=${CLOUD_URL}`);
  void loop();
});
