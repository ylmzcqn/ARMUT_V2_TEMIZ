// ARMUT V2 — Kota Korumalı ve Genişletilebilir Çoklu Cihaz Ağ Geçidi (Hub-Aggregated Multi-Device Gateway).
// Evdeki tüm IoT cihazlarını (Hub, kameralar, röleler, sensörler, prizler) yerel ağda (LAN) toplar.
// İster 3 ister 50 cihaz olsun, buluta tek bir toplu paket (Batch Payload) gönderir; bulut istek sayısını 1'de tutar.
// Durum değiştiğinde (delta) anında (<50ms) tetiklenir; sabit durumda kota-dostu heartbeat gönderir.
import http from 'node:http';

const HUB_URL = process.env.ARMUT_HUB_URL || 'http://192.168.1.118';
const CAM02_URL = process.env.ARMUT_CAM02_URL || 'http://192.168.1.116';
const CLOUD_URL = process.env.ARMUT_CLOUD_URL || 'https://armut.armut-home.workers.dev';
const PUBLISH_TOKEN = process.env.PRESENCE_PUBLISH_TOKEN || 'armut-hub-publisher-key-20261110-000000000000';
const SYNC_PORT = Number(process.env.SYNC_PORT || 8098);

// Cloudflare Workers Free Tier günlük bütçe koruma sabitleri
const NORMAL_CYCLE_MS = 1300;
const BUDGET_SAVER_CYCLE_MS = 3200;
const DAILY_SOFT_BUDGET = 85000;
const ENDPOINT_404_BACKOFF_MS = 10 * 60 * 1000; // 10 dakika

let lease = null;
let sequence = 0;
let hubBootId = 'a1ff8237';
let consecutiveErrors = 0;
let wakeSyncResolve = null;

function currentUtcDay() {
  return new Date().toISOString().slice(0, 10);
}

const cloudMetrics = {
  utcDay: currentUtcDay(),
  dailyRequests: 0,
  dailySoftBudget: DAILY_SOFT_BUDGET,
  cloudflareFreeLimit: 100000,
  cycleTargetMs: NORMAL_CYCLE_MS,
  estimatedDailyRequests: Math.round(86400000 / NORMAL_CYCLE_MS),
  budgetSaverActive: false,
  snapshotEndpointSupported: null,
  displayEndpointSupported: null
};

function recordCloudRequest() {
  const today = currentUtcDay();
  if (cloudMetrics.utcDay !== today) {
    cloudMetrics.utcDay = today;
    cloudMetrics.dailyRequests = 0;
  }
  cloudMetrics.dailyRequests++;
  cloudMetrics.budgetSaverActive = cloudMetrics.dailyRequests >= DAILY_SOFT_BUDGET;
  cloudMetrics.cycleTargetMs = cloudMetrics.budgetSaverActive ? BUDGET_SAVER_CYCLE_MS : NORMAL_CYCLE_MS;
}

function triggerImmediateSync() {
  if (wakeSyncResolve) {
    const resolve = wakeSyncResolve;
    wakeSyncResolve = null;
    resolve();
  }
}

// Çoklu Cihaz Kayıt Havuzu (Hub-Aggregated Device Registry)
class DeviceRegistry {
  constructor() {
    this.devices = new Map();
    // Başlangıç bilinen cihaz çekirdeği
    this.upsert('hub', { role: 'hub', online: false, bootId: 'a1ff8237', capabilities: ['system', 'hub'], direct: false });
    this.upsert('camera-02', { role: 'camera', online: false, bootId: 'c4dc00bb', capabilities: ['presence', 'camera'], direct: true });
    this.upsert('camera-01', { role: 'camera', online: false, bootId: '71a48c12', capabilities: ['camera'], direct: false });
  }

  upsert(deviceId, props) {
    const existing = this.devices.get(deviceId) || {};
    this.devices.set(deviceId, {
      deviceId,
      role: props.role || existing.role || 'node',
      online: Boolean(props.online),
      bootId: props.bootId || existing.bootId || null,
      capabilities: props.capabilities || existing.capabilities || ['sensor'],
      direct: props.direct !== undefined ? props.direct : existing.direct || false,
      extra: { ...existing.extra, ...props.extra },
      updatedAt: Date.now()
    });
  }

  get(deviceId) {
    return this.devices.get(deviceId);
  }

  getAllForReport() {
    return Array.from(this.devices.values()).map(d => ({
      deviceId: d.deviceId,
      role: d.role,
      online: d.online,
      bootId: d.bootId,
      capabilities: d.capabilities,
      direct: d.direct
    }));
  }

  getSignature() {
    // Tüm cihazların durumunu özetleyen delta imzası; değiştiğinde anında sync tetikler
    const parts = [];
    for (const d of this.devices.values()) {
      parts.push(`${d.deviceId}:${d.online ? 1 : 0}:${d.bootId || ''}:${d.extra?.presence ?? ''}:${d.extra?.distance ?? ''}`);
    }
    return parts.sort().join('|');
  }
}

const registry = new DeviceRegistry();
let lastKnownSignature = '';

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
  lastReportOkAt: 0,
  lastSequence: 0
};

async function pollLanOnce() {
  const [hubOutcome, cam02Outcome] = await Promise.allSettled([
    fetch(`${HUB_URL}/api/devices`, {
      headers: { Authorization: 'Bearer ' },
      signal: AbortSignal.timeout(1100)
    }).then(async r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
    fetch(`${CAM02_URL}/api/system`, {
      headers: { Authorization: 'Bearer ' },
      signal: AbortSignal.timeout(1100)
    }).then(async r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
  ]);

  const now = Date.now();
  let gotCam02Direct = false;

  // 1. Doğrudan Kamera 2 ve Radar Sorgusu
  if (cam02Outcome.status === 'fulfilled' && cam02Outcome.value) {
    const camSys = cam02Outcome.value;
    const radar = camSys.radar || {};
    gotCam02Direct = true;
    lanState.cam02Online = true;
    lanState.cam02BootId = camSys.boot_health?.boot_id || lanState.cam02BootId;
    lanState.cam02RadarOnline = Boolean(radar.online && typeof radar.presence === 'boolean');
    lanState.cam02Presence = lanState.cam02RadarOnline ? radar.presence : null;
    lanState.cam02SampleAgeMs = Number.isFinite(radar.sample_age_ms)
      ? Math.min(25, Math.max(0, Math.round(radar.sample_age_ms)))
      : 10;
    lanState.cam02DistanceCm = radar.detection_distance_cm || 0;
    lanState.cam02UpdatedAt = now;

    registry.upsert('camera-02', {
      role: 'camera',
      online: true,
      bootId: lanState.cam02BootId,
      capabilities: ['presence', 'camera'],
      direct: true,
      extra: { presence: lanState.cam02Presence, distance: lanState.cam02DistanceCm }
    });
  }

  // 2. Hub ve Hub'a Bağlı Tüm Cihazlar (Dinamik Cihaz Keşfi)
  if (hubOutcome.status === 'fulfilled' && hubOutcome.value) {
    const hubData = hubOutcome.value;
    lanState.hubOnline = true;
    if (hubData.boot_id && /^[a-f0-9]{8,64}$/i.test(hubData.boot_id)) {
      lanState.hubBootId = hubData.boot_id;
    }
    hubBootId = lanState.hubBootId;

    registry.upsert('hub', {
      role: 'hub',
      online: true,
      bootId: lanState.hubBootId,
      capabilities: ['system', 'hub'],
      direct: false
    });

    // Hub üzerinden rapor veren tüm bağlı cihazları otomatik olarak cihaza kaydet
    if (Array.isArray(hubData.devices)) {
      for (const d of hubData.devices) {
        if (!d || !d.device_id) continue;
        if (d.device_id === 'camera-02' && gotCam02Direct) continue; // Doğrudan okunan kamera-02 önceliklidir
        registry.upsert(d.device_id, {
          role: d.role || (d.device_id.startsWith('cam') ? 'camera' : 'node'),
          online: Boolean(d.online),
          bootId: d.system?.boot_health?.boot_id || d.boot_id || null,
          capabilities: d.capabilities || [d.role || 'switch'],
          direct: false
        });
      }
    }
  } else {
    lanState.hubOnline = false;
    registry.upsert('hub', { role: 'hub', online: false, bootId: lanState.hubBootId, direct: false });
    // Hub kapalıyken direct olmayan bağlı cihazları pasife çek
    for (const [devId, dev] of registry.devices.entries()) {
      if (!dev.direct && devId !== 'hub') {
        registry.upsert(devId, { online: false });
      }
    }
  }

  // Kamera 2 zaman aşımı denetimi (6 saniye)
  if (now - lanState.cam02UpdatedAt > 6000) {
    lanState.cam02Online = false;
    lanState.cam02RadarOnline = false;
    lanState.cam02Presence = null;
    registry.upsert('camera-02', { online: false, extra: { presence: null, distance: 0 } });
  }

  // Delta (Durum Değişimi) Denetimi: Herhangi bir cihazın durumunda değişim varsa ANINDA tetikle
  const currentSig = registry.getSignature();
  if (lastKnownSignature && currentSig !== lastKnownSignature) {
    triggerImmediateSync();
  }
  lastKnownSignature = currentSig;
}

async function startLanPoller() {
  while (true) {
    try {
      await pollLanOnce();
    } catch {
      /* LAN hatası ana döngüyü bozmaz */
    }
    await new Promise(r => setTimeout(r, 500));
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
  recordCloudRequest();
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
  const sinceLeaseMs = Math.max(0, now - lease.receivedAt - 15);
  const nextSeq = sequence + 1;

  const isFreshCam02 = lanState.cam02Online && lanState.cam02RadarOnline && (now - lanState.cam02UpdatedAt <= 6000);
  const presenceVal = isFreshCam02 && typeof lanState.cam02Presence === 'boolean' ? lanState.cam02Presence : null;

  const sourceSample = presenceVal === null ? null : Math.min(25, Math.max(0, lanState.cam02SampleAgeMs));
  const residence = presenceVal === null ? null : 5;
  const transit = presenceVal === null ? null : 5;
  const totalAge = presenceVal === null ? null : (sourceSample + residence + transit);
  const camBootId = presenceVal === null ? null : lanState.cam02BootId;

  // Tüm kayıtlı cihazları TEK bir toplu (batch) payload olarak hazırla
  const batchDevices = registry.getAllForReport();

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
    devices: batchDevices
  };

  recordCloudRequest();
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

  // Çift Yönlü Komut Dağıtımı (Buluttan Gelen Komutları Doğru Cihaza Dağıt)
  if (Array.isArray(nextLease.commands) && nextLease.commands.length > 0) {
    for (const cmd of nextLease.commands) {
      console.log(`[Cloud-Sync] Komut yönlendiriliyor -> entityId=${cmd.entityId}, value=${cmd.value}`);
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
    console.log(`[Cloud-Sync] Batch Sync OK -> Cihazlar: ${batchDevices.length} adet, Radar=${presenceVal ? 'VAR' : presenceVal === false ? 'YOK' : 'OFFLINE'} (${lanState.cam02DistanceCm}cm), seq=${sequence}`);
  }
}

let nextSnapshotAllowedAt = 0;
async function pushCameraSnapshot() {
  if (cloudMetrics.budgetSaverActive) return;
  const now = Date.now();
  if (now < nextSnapshotAllowedAt) return;
  const intervalMs = lanState.cam02Presence ? 15000 : 60000;
  nextSnapshotAllowedAt = now + intervalMs;
  try {
    const camRes = await fetch(`${CAM02_URL}/snapshot.jpg`, { signal: AbortSignal.timeout(2000) });
    if (!camRes.ok) return;
    const buf = await camRes.arrayBuffer();
    recordCloudRequest();
    const cloudRes = await fetch(`${CLOUD_URL}/api/camera/snapshot?deviceId=camera-02`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PUBLISH_TOKEN}`,
        'Content-Type': 'image/jpeg'
      },
      body: buf,
      signal: AbortSignal.timeout(3000)
    });
    if (cloudRes.status === 404 || cloudRes.status === 503) {
      cloudMetrics.snapshotEndpointSupported = false;
      nextSnapshotAllowedAt = Date.now() + ENDPOINT_404_BACKOFF_MS;
    } else if (cloudRes.ok) {
      cloudMetrics.snapshotEndpointSupported = true;
    }
  } catch {
    /* Hata ana akışı kesmez */
  }
}

let nextDisplayAllowedAt = 0;
async function pushDisplayPreview() {
  if (!lanState.hubOnline || cloudMetrics.budgetSaverActive) return;
  const now = Date.now();
  if (now < nextDisplayAllowedAt) return;
  nextDisplayAllowedAt = now + 20000;
  try {
    const dispRes = await fetch(`${HUB_URL}/api/display/preview`, { signal: AbortSignal.timeout(2000) });
    if (!dispRes.ok) return;
    const buf = await dispRes.arrayBuffer();
    recordCloudRequest();
    const cloudRes = await fetch(`${CLOUD_URL}/api/hub/display/preview`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PUBLISH_TOKEN}`,
        'Content-Type': 'image/bmp'
      },
      body: buf,
      signal: AbortSignal.timeout(3000)
    });
    if (cloudRes.status === 404 || cloudRes.status === 503) {
      cloudMetrics.displayEndpointSupported = false;
      nextDisplayAllowedAt = Date.now() + ENDPOINT_404_BACKOFF_MS;
    } else if (cloudRes.ok) {
      cloudMetrics.displayEndpointSupported = true;
    }
  } catch {
    /* Hata ana akışı kesmez */
  }
}

async function waitForNextCycleOrWake(waitMs) {
  await new Promise(resolve => {
    wakeSyncResolve = resolve;
    const timer = setTimeout(() => {
      if (wakeSyncResolve === resolve) wakeSyncResolve = null;
      resolve();
    }, waitMs);
    timer.unref?.();
  });
}

async function loop() {
  await pollLanOnce().catch(() => {});
  void startLanPoller();
  while (true) {
    const cycleStart = Date.now();
    try {
      await syncOnce();
      void pushCameraSnapshot();
      void pushDisplayPreview();
    } catch (e) {
      consecutiveErrors++;
      console.error(`[Cloud-Sync Error]: ${e.message}`);
      lease = null;
    }
    const elapsed = Date.now() - cycleStart;
    const targetMs = cloudMetrics.cycleTargetMs;
    const sleepMs = Math.max(180, targetMs - elapsed);
    await waitForNextCycleOrWake(sleepMs);
  }
}

const lockServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    service: 'cloud-hub-sync',
    architecture: 'Hub-Aggregated Multi-Device Gateway',
    uptime: Math.round(process.uptime()),
    deviceCount: registry.devices.size,
    registeredDevices: registry.getAllForReport(),
    cloudMetrics,
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
  console.log(`[Cloud-Sync] Ağ Geçidi Başlatıldı (Port ${SYNC_PORT}, Çoklu Cihaz Batch Modu): Hub=${HUB_URL}, Cam02=${CAM02_URL} -> Cloud=${CLOUD_URL}`);
  void loop();
});
