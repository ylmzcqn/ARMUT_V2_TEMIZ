// ARMUT V2 — Olay Odaklı, Kota Korumalı & MQTT Destekli Ağ Geçidi (Event-Driven + Embedded MQTT Broker).
// - Gömülü MQTT 3.1.1 broker (LWT destekli) + devre kesicili (circuit breaker) yerel ağ adaptörünü birleştirir.
// - Worker desteklediğinde olay odaklı delta+kalp atışı (35 sn -> ~2.468 istek/gün) moduna geçer, aksi halde güvenli modda kalır.
// - Kamera snapshot'larını arka planda sürekli basmaz; yalnızca isteğe bağlı (on-demand) çeker.
// - Hub çevrimiçi iken bulut lease çakışmasında (409) ana yayıncılığı Hub'a devrederek PC bağımlılığını kaldırır.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMqttBroker } from './mqtt-broker.mjs';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EVENT_HEARTBEAT_MS = 35000;
const LEGACY_STRICT_CYCLE_MS = 940;
const IDLE_OFFLINE_CYCLE_MS = 5000;
const BUDGET_SAVER_CYCLE_MS = 3800;
const DAILY_SOFT_BUDGET = 94000;
const ENDPOINT_404_BACKOFF_MS = 10 * 60 * 1000;
const STALE_SAMPLE_LIMIT_MS = 1900;
const COMMAND_TTL_MS = 45000;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');
}

export function mapDisplayLayout(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'home' || v === 'status') return 'home';
  if (v === 'assistant' || v === 'presence' || v === 'sensors') return 'assistant';
  if (v === 'network' || v === 'system') return 'network';
  return 'home';
}

function loadPublishToken(explicitToken) {
  if (typeof explicitToken === 'string' && explicitToken.trim()) return explicitToken.trim();
  if (process.env.PRESENCE_PUBLISH_TOKEN?.trim()) return process.env.PRESENCE_PUBLISH_TOKEN.trim();
  try {
    const fileToken = fs.readFileSync(path.join(ROOT_DIR, 'local-data', 'publisher-token.txt'), 'utf8').trim();
    if (fileToken) return fileToken;
  } catch {}
  return '';
}

class EndpointTarget {
  constructor(id, urls) {
    this.id = id;
    this.urls = urls.filter(Boolean);
    this.preferredIndex = 0;
    this.failures = 0;
    this.nextProbeAt = 0;
  }

  shouldProbe(now) {
    return now >= this.nextProbeAt;
  }

  orderedUrls() {
    if (this.urls.length <= 1) return this.urls;
    const primary = this.urls[this.preferredIndex];
    return [primary, ...this.urls.filter((_, idx) => idx !== this.preferredIndex)];
  }

  recordSuccess(urlIndex) {
    this.failures = 0;
    this.nextProbeAt = 0;
    if (urlIndex >= 0 && urlIndex < this.urls.length) {
      this.preferredIndex = urlIndex;
    }
  }

  recordFailure(now) {
    this.failures++;
    const backoff = Math.min(15000, Math.round(1500 * Math.pow(2, Math.min(this.failures - 1, 4))));
    this.nextProbeAt = now + backoff;
  }
}

export class DeviceRegistry {
  constructor() {
    this.devices = new Map();
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
      bootId: props.bootId !== undefined ? props.bootId : (existing.bootId || null),
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
    const now = Date.now();
    for (const [id, d] of this.devices.entries()) {
      if (!['hub', 'camera-02', 'camera-01'].includes(id) && (now - d.updatedAt) > 86400000) {
        this.devices.delete(id);
      }
    }
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
    const parts = [];
    for (const d of this.devices.values()) {
      parts.push(`${d.deviceId}:${d.online ? 1 : 0}:${d.bootId || ''}:${d.extra?.presence ?? ''}:${d.extra?.distance ?? ''}`);
    }
    return parts.sort().join('|');
  }
}

export function createGatewayService({
  hubUrl = process.env.ARMUT_HUB_URL || 'http://192.168.1.118',
  cam02Url = process.env.ARMUT_CAM02_URL || 'http://192.168.1.116',
  cam01Url = process.env.ARMUT_CAM01_URL || 'http://192.168.1.119',
  cloudUrl = process.env.ARMUT_CLOUD_URL || 'https://armut.armut-home.workers.dev',
  publishToken,
  hubApiToken = process.env.ARMUT_HUB_TOKEN || '',
  syncPort = Number(process.env.SYNC_PORT || 8098),
  mqttPort = Number(process.env.MQTT_PORT ?? 1883),
  enableMqttBroker = true,
  yieldWhenHubOnline = true,
  host = '127.0.0.1',
  mqttHost = host,
  mqttAuthToken = process.env.MQTT_TOKEN || '',
  fetcher = globalThis.fetch,
  now = () => Date.now(),
  pollDelayMs = 700,
  enableCloudPush = true,
  enableCloudLoop = enableCloudPush
} = {}) {
  const token = loadPublishToken(publishToken);
  const registry = new DeviceRegistry();
  const hubTarget = new EndpointTarget('hub', [hubUrl, 'http://armut-hub.local']);
  const cam02Target = new EndpointTarget('camera-02', [cam02Url, 'http://armut-camera-02.local']);
  const cam01Target = new EndpointTarget('camera-01', [cam01Url, 'http://armut-camera-01.local']);

  const cloudMetrics = {
    utcDay: new Date(now()).toISOString().slice(0, 10),
    dailyRequests: 0,
    dailySoftBudget: DAILY_SOFT_BUDGET,
    cloudflareFreeLimit: 100000,
    workerMode: 'negotiating',
    workerUpgradeRecommended: false,
    yieldedToHub: false,
    cycleTargetMs: EVENT_HEARTBEAT_MS,
    estimatedDailyRequests: Math.round(86400000 / EVENT_HEARTBEAT_MS),
    budgetSaverActive: false,
    snapshotEndpointSupported: null,
    displayEndpointSupported: null,
    backgroundMediaUploads: false,
    eventDrivenWakeups: 0
  };

  const lanState = {
    hubOnline: false,
    hubBootId: 'a1ff8237',
    cam02Online: false,
    cam02BootId: 'c4dc00bb',
    cam02RadarOnline: false,
    cam02Presence: null,
    cam02SampleAgeMs: null,
    cam02TransitMs: 0,
    cam02DistanceCm: 0,
    cam02UpdatedAt: 0,
    lastReportOkAt: 0,
    lastSequence: 0,
    lastEventReason: 'startup'
  };

  const mediaCache = new Map();
  const seenCommands = new Map();
  const sseClients = new Set();
  let lease = null;
  let sequence = 0;
  let hubBootId = 'a1ff8237';
  let consecutiveErrors = 0;
  let lastKnownSignature = '';
  let wakeSyncResolve = null;
  let hubYieldUntil = 0;
  let lastSnapshotHash = '';
  let lastDisplayHash = '';
  let nextSnapshotAllowedAt = 0;
  let nextDisplayAllowedAt = 0;
  let snapshotInFlight = null;
  let displayInFlight = null;
  let running = false;
  let pollTimer = null;
  let pollInFlight = false;
  let camProbeInFlight = null;
  let syncAbort = null;

  function broadcastSse(eventName, payload) {
    if (!sseClients.size) return;
    const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of sseClients) {
      try {
        if (!res.writableEnded) res.write(frame);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  function recordCloudRequest() {
    const today = new Date(now()).toISOString().slice(0, 10);
    if (cloudMetrics.utcDay !== today) {
      cloudMetrics.utcDay = today;
      cloudMetrics.dailyRequests = 0;
    }
    cloudMetrics.dailyRequests++;
    cloudMetrics.budgetSaverActive = cloudMetrics.dailyRequests >= DAILY_SOFT_BUDGET;
  }

  function computeCycleMs() {
    if (cloudMetrics.yieldedToHub && lanState.hubOnline && now() < hubYieldUntil) {
      cloudMetrics.cycleTargetMs = 15000;
      cloudMetrics.estimatedDailyRequests = 0;
      return 15000;
    }
    const anyOnline = lanState.cam02Online || lanState.hubOnline || registry.get('camera-01')?.online;
    let target;
    if (lease?.mode === 'event') {
      target = Math.max(5000, Number(lease.reportIntervalMs) || EVENT_HEARTBEAT_MS);
    } else if (!anyOnline) {
      target = IDLE_OFFLINE_CYCLE_MS;
    } else {
      target = lease?.leaseMs
        ? Math.max(940, Math.min(LEGACY_STRICT_CYCLE_MS, lease.leaseMs - 1600))
        : LEGACY_STRICT_CYCLE_MS;
    }
    if (cloudMetrics.budgetSaverActive) {
      target = Math.max(target, BUDGET_SAVER_CYCLE_MS);
    }
    cloudMetrics.cycleTargetMs = target;
    cloudMetrics.estimatedDailyRequests = Math.round(86400000 / target);
    return target;
  }

  function triggerImmediateSync(reason = 'state-change') {
    lanState.lastEventReason = reason;
    cloudMetrics.eventDrivenWakeups++;
    broadcastSse('presence', getPresencePayload());
    if (wakeSyncResolve) {
      const resolve = wakeSyncResolve;
      wakeSyncResolve = null;
      resolve();
    }
  }

  function handleMqttPublish({ topic, payload }) {
    if (!topic.startsWith('armut/')) return;
    const statusMatch = topic.match(/^armut\/devices\/([^/]+)\/status$/);
    if (statusMatch) {
      const devId = statusMatch[1];
      const normalized = String(payload).trim().toLowerCase();
      const online = normalized === 'online' || normalized === '1' || normalized === 'true';
      registry.upsert(devId, { online, direct: true });
      if (devId === 'camera-02' && !online) {
        lanState.cam02Online = false;
        lanState.cam02RadarOnline = false;
        lanState.cam02Presence = null;
        lanState.cam02SampleAgeMs = null;
      }
      if (devId === 'hub' && !online) {
        lanState.hubOnline = false;
        cloudMetrics.yieldedToHub = false;
        hubYieldUntil = 0;
      }
      lastKnownSignature = registry.getSignature();
      triggerImmediateSync(`mqtt-status:${devId}`);
      return;
    }

    const stateMatch = topic.match(/^armut\/(?:devices|presence)\/([^/]+)(?:\/state)?$/);
    if (!stateMatch) return;
    const devId = stateMatch[1];
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const tNow = now();
    if (devId === 'camera-02') {
      lanState.cam02Online = parsed.online !== undefined ? Boolean(parsed.online) : true;
      if (typeof parsed.bootId === 'string' && /^[a-f0-9]{1,64}$/i.test(parsed.bootId)) {
        lanState.cam02BootId = parsed.bootId;
      }
      if (typeof parsed.presence === 'boolean') {
        const age = Number.isFinite(parsed.sampleAgeMs) ? Math.max(0, Math.round(parsed.sampleAgeMs)) : 10;
        lanState.cam02RadarOnline = age < STALE_SAMPLE_LIMIT_MS;
        lanState.cam02Presence = lanState.cam02RadarOnline ? parsed.presence : null;
        lanState.cam02SampleAgeMs = lanState.cam02RadarOnline ? age : null;
        lanState.cam02TransitMs = 0;
        lanState.cam02UpdatedAt = tNow;
      } else if (parsed.presence === null) {
        lanState.cam02Presence = null;
        lanState.cam02SampleAgeMs = null;
      }
      if (Number.isFinite(parsed.distanceCm)) {
        lanState.cam02DistanceCm = parsed.distanceCm;
      }
    }
    registry.upsert(devId, {
      role: parsed.role || (devId.startsWith('cam') ? 'camera' : devId === 'hub' ? 'hub' : 'node'),
      online: parsed.online !== undefined ? Boolean(parsed.online) : true,
      bootId: typeof parsed.bootId === 'string' ? parsed.bootId : undefined,
      capabilities: Array.isArray(parsed.capabilities) ? parsed.capabilities : undefined,
      direct: true,
      extra: {
        presence: parsed.presence,
        distance: parsed.distanceCm
      }
    });
    const nextSig = registry.getSignature();
    if (nextSig !== lastKnownSignature) {
      lastKnownSignature = nextSig;
      triggerImmediateSync(`mqtt:${devId}`);
    }
  }

  const mqttBroker = createMqttBroker({
    host: mqttHost,
    port: mqttPort,
    authToken: mqttAuthToken,
    onPublish: handleMqttPublish
  });

  async function probeJson(target, pathSuffix, timeoutMs = 1100) {
    const tNow = now();
    if (!target.shouldProbe(tNow)) return { skipped: true, data: null, rttMs: 0 };
    const urls = target.orderedUrls();
    for (const base of urls) {
      const idx = target.urls.indexOf(base);
      const started = now();
      try {
        const res = await fetcher(`${base}${pathSuffix}`, {
          headers: { Authorization: `Bearer ${hubApiToken}` },
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (res.ok) {
          const data = await res.json();
          const rttMs = Math.max(0, now() - started);
          target.recordSuccess(idx);
          return { skipped: false, data, rttMs };
        }
        await res.body?.cancel?.().catch(() => {});
      } catch {}
    }
    target.recordFailure(now());
    return { skipped: false, data: null, rttMs: 0 };
  }

  async function probeCam02Direct() {
    if (camProbeInFlight) return camProbeInFlight;
    camProbeInFlight = (async () => {
      const camProbe = await probeJson(cam02Target, '/api/system', 1100);
      const tNow = now();
      if (!camProbe.skipped && camProbe.data) {
        const camSys = camProbe.data;
        const radar = camSys.radar || {};
        lanState.cam02Online = true;
        lanState.cam02BootId = camSys.boot_health?.boot_id || lanState.cam02BootId;
        lanState.cam02RadarOnline = Boolean(radar.online && typeof radar.presence === 'boolean');
        const rawAge = Number.isFinite(radar.sample_age_ms) ? Math.max(0, Math.round(radar.sample_age_ms)) : 15;
        const transit = Math.min(200, Math.max(0, Math.round(camProbe.rttMs / 2)));
        if (lanState.cam02RadarOnline && (rawAge + transit) < STALE_SAMPLE_LIMIT_MS) {
          lanState.cam02Presence = radar.presence;
          lanState.cam02SampleAgeMs = rawAge;
          lanState.cam02TransitMs = transit;
        } else {
          lanState.cam02Presence = null;
          lanState.cam02SampleAgeMs = null;
          lanState.cam02TransitMs = 0;
        }
        lanState.cam02DistanceCm = radar.detection_distance_cm || 0;
        lanState.cam02UpdatedAt = tNow;

        registry.upsert('camera-02', {
          role: 'camera',
          online: true,
          bootId: lanState.cam02BootId,
          capabilities: ['presence', 'camera'],
          direct: true,
          extra: { presence: lanState.cam02Presence, distance: lanState.cam02DistanceCm }
        });
        return true;
      }
      if (!camProbe.skipped && (tNow - lanState.cam02UpdatedAt > 5000)) {
        lanState.cam02Online = false;
      }
      return false;
    })().finally(() => { camProbeInFlight = null; });
    return camProbeInFlight;
  }

  async function pollLanOnce() {
    const [hubProbe, gotCam02Direct] = await Promise.all([
      probeJson(hubTarget, '/api/devices', 1100),
      probeCam02Direct()
    ]);

    const tNow = now();

    if (!hubProbe.skipped && hubProbe.data) {
      const hubData = hubProbe.data;
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

      if (Array.isArray(hubData.devices)) {
        for (const d of hubData.devices) {
          if (!d || !d.device_id) continue;
          if (d.device_id === 'camera-02' && gotCam02Direct) continue;
          registry.upsert(d.device_id, {
            role: d.role || (d.device_id.startsWith('cam') ? 'camera' : 'node'),
            online: Boolean(d.online),
            bootId: d.system?.boot_health?.boot_id || d.boot_id || null,
            capabilities: d.capabilities || [d.role || 'switch'],
            direct: false
          });
        }
      }
    } else if (!hubProbe.skipped) {
      lanState.hubOnline = false;
      registry.upsert('hub', { role: 'hub', online: false, bootId: lanState.hubBootId, direct: false });
      for (const [devId, dev] of registry.devices.entries()) {
        if (!dev.direct && devId !== 'hub') {
          registry.upsert(devId, { online: false });
        }
      }
    }

    if (tNow - lanState.cam02UpdatedAt > 6000) {
      lanState.cam02Online = false;
      lanState.cam02RadarOnline = false;
      lanState.cam02Presence = null;
      lanState.cam02SampleAgeMs = null;
      registry.upsert('camera-02', { online: false, extra: { presence: null, distance: 0 } });
    }

    const currentSig = registry.getSignature();
    if (lastKnownSignature && currentSig !== lastKnownSignature) {
      triggerImmediateSync();
    }
    lastKnownSignature = currentSig;
  }

  function buildTelemetrySnapshot() {
    const tNow = now();
    const isFreshCam02 = lanState.cam02Online && lanState.cam02RadarOnline && (tNow - lanState.cam02UpdatedAt <= 6000) && typeof lanState.cam02Presence === 'boolean' && Number.isFinite(lanState.cam02SampleAgeMs);
    const residence = isFreshCam02 ? Math.max(0, Math.round(tNow - lanState.cam02UpdatedAt)) : null;
    const transit = isFreshCam02 ? lanState.cam02TransitMs : null;
    const sourceSample = isFreshCam02 ? lanState.cam02SampleAgeMs : null;
    const totalAge = isFreshCam02 ? (sourceSample + residence + transit) : null;
    const withinBudget = totalAge !== null && totalAge < STALE_SAMPLE_LIMIT_MS;

    return {
      presenceVal: withinBudget ? lanState.cam02Presence : null,
      sourceSample: withinBudget ? sourceSample : null,
      residence: withinBudget ? residence : null,
      transit: withinBudget ? transit : null,
      totalAge: withinBudget ? totalAge : null,
      camBootId: withinBudget ? lanState.cam02BootId : null,
      devices: registry.getAllForReport()
    };
  }

  function getPresencePayload() {
    const snap = buildTelemetrySnapshot();
    return {
      publisherId: 'hub',
      publisherBootId: hubBootId,
      deviceId: 'camera-02',
      componentId: 'presence-radar',
      bootId: snap.camBootId,
      value: snap.presenceVal,
      ageMs: snap.totalAge,
      maxAgeMs: 2000,
      sourceReady: lanState.cam02Online || lanState.hubOnline,
      devices: snap.devices
    };
  }

  async function postLanEndpoint(target, pathSuffix, payload) {
    const urls = target.orderedUrls();
    for (const base of urls) {
      const idx = target.urls.indexOf(base);
      for (let retry = 0; retry < 2; retry++) {
        try {
          const res = await fetcher(`${base}${pathSuffix}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${hubApiToken}`
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(2000)
          });
          if (res.ok) {
            await res.body?.cancel?.().catch(() => {});
            target.recordSuccess(idx);
            return true;
          }
          await res.body?.cancel?.().catch(() => {});
        } catch {
          if (retry === 0) await new Promise(r => setTimeout(r, 120));
        }
      }
    }
    return false;
  }

  function cleanupSeenCommands(tNow) {
    for (const [cmdId, exp] of seenCommands.entries()) {
      if (exp <= tNow) seenCommands.delete(cmdId);
    }
    while (seenCommands.size > 200) {
      const oldest = seenCommands.keys().next().value;
      seenCommands.delete(oldest);
    }
  }

  async function dispatchHardwareCommand(cmd) {
    const { commandId, entityId, value } = cmd;
    const tNow = now();
    if (cmd.at && (tNow - cmd.at) > COMMAND_TTL_MS) {
      return { applied: false, reason: 'stale' };
    }
    cleanupSeenCommands(tNow);
    if (commandId && seenCommands.has(commandId)) {
      return { applied: true, deduplicated: true };
    }
    if (commandId) {
      seenCommands.set(commandId, tNow + DEDUP_WINDOW_MS);
    }

    let ok = false;
    if (enableMqttBroker) {
      mqttBroker.publish(`armut/commands/${entityId}`, { commandId, entityId, value, at: tNow });
    }
    if (entityId === 'hub-relay') {
      ok = await postLanEndpoint(hubTarget, '/api/hardware', { action: 'set', name: 'relay', on: Boolean(value) });
    } else if (entityId === 'camera-snapshot') {
      const targetCam = /^[a-zA-Z0-9_-]{1,64}$/.test(String(value)) ? String(value) : 'camera-02';
      await pushCameraSnapshot(true, targetCam);
      ok = Boolean(mediaCache.get(`snapshot:${targetCam}`));
    } else if (entityId === 'hub-display-preview') {
      await pushDisplayPreview(true);
      ok = Boolean(mediaCache.get('preview:hub'));
    } else if (entityId === 'hub-display-layout') {
      ok = await postLanEndpoint(hubTarget, '/api/display', { layout: mapDisplayLayout(value) });
      if (ok) void pushDisplayPreview(true);
    } else if (entityId === 'hub-display-orientation') {
      const orientation = ['auto', '0', '90', '180', '270'].includes(String(value)) ? String(value) : 'auto';
      ok = await postLanEndpoint(hubTarget, '/api/display', { orientation });
      if (ok) void pushDisplayPreview(true);
    } else if (entityId === 'hub-display-expression') {
      ok = await postLanEndpoint(hubTarget, '/api/display', { expression: String(value), ttl_ms: 3000 });
      if (ok) void pushDisplayPreview(true);
    } else if (entityId === 'cam02-led') {
      const boolVal = Boolean(value);
      ok = await postLanEndpoint(cam02Target, '/api/hardware', { action: 'set', name: 'led', on: boolVal });
      if (!ok) ok = await postLanEndpoint(hubTarget, '/api/devices/camera-02/command', { led: boolVal, output: boolVal });
    } else if (entityId === 'cam01-led') {
      const boolVal = Boolean(value);
      ok = await postLanEndpoint(cam01Target, '/api/hardware', { action: 'set', name: 'led', on: boolVal });
      if (!ok) ok = await postLanEndpoint(hubTarget, '/api/devices/camera-01/command', { led: boolVal, output: boolVal });
    } else {
      const targetDevice = String(entityId).replace(/-(led|relay|switch)$/, '');
      ok = await postLanEndpoint(hubTarget, `/api/devices/${encodeURIComponent(targetDevice)}/command`, {
        led: Boolean(value),
        output: Boolean(value)
      });
    }
    return { applied: ok };
  }

  async function fetchCameraSnapshot(deviceId = 'camera-02', maxCacheMs = 1500) {
    const key = `snapshot:${deviceId}`;
    const existing = mediaCache.get(key);
    const tNow = now();
    if (existing && (tNow - existing.updatedAt) < maxCacheMs) return existing;

    const target = deviceId === 'camera-01' ? cam01Target : cam02Target;
    for (const base of target.orderedUrls()) {
      try {
        const res = await fetcher(`${base}/snapshot.jpg`, {
          headers: { Authorization: `Bearer ${hubApiToken}` },
          signal: AbortSignal.timeout(2000)
        });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8) continue;
        const entry = { bytes: buf, contentType: 'image/jpeg', updatedAt: now(), hash: sha256Hex(buf) };
        mediaCache.set(key, entry);
        return entry;
      } catch {}
    }
    return existing || null;
  }

  async function fetchDisplayPreview(maxCacheMs = 2000) {
    if (!lanState.hubOnline) {
      cloudMetrics.displayEndpointSupported = 'standby_hub_offline';
      return null;
    }
    const key = 'preview:hub';
    const existing = mediaCache.get(key);
    if (existing && (now() - existing.updatedAt) < maxCacheMs) return existing;

    for (const base of hubTarget.orderedUrls()) {
      try {
        const res = await fetcher(`${base}/api/display/preview`, {
          headers: { Authorization: `Bearer ${hubApiToken}` },
          signal: AbortSignal.timeout(2000)
        });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const contentType = buf[0] === 0x42 ? 'image/bmp' : 'image/png';
        const entry = { bytes: buf, contentType, updatedAt: now(), hash: sha256Hex(buf) };
        mediaCache.set(key, entry);
        return entry;
      } catch {}
    }
    return existing || null;
  }

  async function pushCameraSnapshot(force = false, deviceId = 'camera-02') {
    if (snapshotInFlight) return snapshotInFlight;
    snapshotInFlight = (async () => {
      if (!enableCloudPush || !token || cloudMetrics.budgetSaverActive) return;
      const tNow = now();
      if (!force && tNow < nextSnapshotAllowedAt) return;
      nextSnapshotAllowedAt = tNow + 2000;

      const entry = await fetchCameraSnapshot(deviceId, force ? 0 : 1000);
      if (!entry) return;
      if (!force && entry.hash === lastSnapshotHash) return;
      lastSnapshotHash = entry.hash;

      try {
        recordCloudRequest();
        const cloudRes = await fetcher(`${cloudUrl}/api/camera/snapshot?deviceId=${encodeURIComponent(deviceId)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
          body: entry.bytes,
          signal: AbortSignal.timeout(3000)
        });
        await cloudRes.body?.cancel?.().catch(() => {});
        if (cloudRes.status === 404 || cloudRes.status === 503) {
          cloudMetrics.snapshotEndpointSupported = false;
          nextSnapshotAllowedAt = now() + ENDPOINT_404_BACKOFF_MS;
        } else if (cloudRes.ok) {
          cloudMetrics.snapshotEndpointSupported = true;
        }
      } catch {}
    })().finally(() => { snapshotInFlight = null; });
    return snapshotInFlight;
  }

  async function pushDisplayPreview(force = false) {
    if (displayInFlight) return displayInFlight;
    displayInFlight = (async () => {
      if (!enableCloudPush || !token || cloudMetrics.budgetSaverActive) return;
      if (!lanState.hubOnline) {
        cloudMetrics.displayEndpointSupported = 'standby_hub_offline';
        return;
      }
      const tNow = now();
      if (!force && tNow < nextDisplayAllowedAt) return;
      nextDisplayAllowedAt = tNow + 30000;

      const entry = await fetchDisplayPreview(1000);
      if (!entry) return;
      if (!force && entry.hash === lastDisplayHash) {
        cloudMetrics.displayEndpointSupported = true;
        return;
      }
      lastDisplayHash = entry.hash;

      try {
        recordCloudRequest();
        const cloudRes = await fetcher(`${cloudUrl}/api/hub/display/preview`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': entry.contentType },
          body: entry.bytes,
          signal: AbortSignal.timeout(3000)
        });
        await cloudRes.body?.cancel?.().catch(() => {});
        if (cloudRes.status === 404 || cloudRes.status === 503) {
          cloudMetrics.displayEndpointSupported = false;
          nextDisplayAllowedAt = now() + ENDPOINT_404_BACKOFF_MS;
        } else if (cloudRes.ok) {
          cloudMetrics.displayEndpointSupported = true;
        }
      } catch {}
    })().finally(() => { displayInFlight = null; });
    return displayInFlight;
  }

  async function getLease() {
    recordCloudRequest();
    const res = await fetcher(`${cloudUrl}/api/presence/hello`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        mode: 'event',
        publisherId: 'hub',
        deviceId: 'camera-02',
        componentId: 'presence-radar',
        bootId: hubBootId
      }),
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) throw new Error(`Hello failed: ${res.status} ${await res.text()}`);
    const next = await res.json();
    next.receivedAt = now();
    lease = next;
    sequence = 0;
    const isEvent = next.mode === 'event';
    cloudMetrics.workerMode = isEvent ? 'event-driven' : 'legacy-strict-poll';
    cloudMetrics.workerUpgradeRecommended = !isEvent;
    computeCycleMs();
  }

  async function syncOnce() {
    if (!enableCloudPush || !token) return;
    const tCheck = now();
    if (yieldWhenHubOnline && lanState.hubOnline && tCheck < hubYieldUntil) {
      cloudMetrics.yieldedToHub = true;
      return;
    }
    if (!lanState.hubOnline || tCheck >= hubYieldUntil) {
      cloudMetrics.yieldedToHub = false;
    }

    const leaseRenewBeforeMs = lease?.mode === 'event'
      ? Math.max(40000, (lease.leaseMs || 90000) - 10000)
      : Math.max(2500, (lease?.leaseMs || 5000) - 800);
    if (!lease || (now() - lease.receivedAt) >= leaseRenewBeforeMs) {
      await getLease();
    }

    if (lease.mode !== 'event' && lanState.cam02Online && (now() - lanState.cam02UpdatedAt) > 150) {
      await probeCam02Direct().catch(() => {});
    }
    const tNow = now();
    const sinceLeaseMs = Math.max(0, tNow - lease.receivedAt - 20);
    const nextSeq = sequence + 1;
    const snap = buildTelemetrySnapshot();
    const activeMode = lease.mode === 'event' ? 'event' : 'strict';

    const report = {
      version: 1,
      mode: activeMode,
      publisherId: 'hub',
      deviceId: 'camera-02',
      componentId: 'presence-radar',
      bootId: hubBootId,
      nonce: lease.nonce,
      sequence: nextSeq,
      sinceLeaseMs,
      sourceBootId: snap.camBootId,
      value: snap.presenceVal,
      sampleAgeMs: snap.totalAge,
      sourceSampleAgeMs: snap.sourceSample,
      hubResidenceMs: snap.residence,
      sourceTransitMs: snap.transit,
      devices: snap.devices
    };

    recordCloudRequest();
    const repRes = await fetcher(`${cloudUrl}/api/presence/report`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(4000)
    });

    if (!repRes.ok) {
      const errText = await repRes.text();
      console.warn(`[Cloud-Sync] Report rejected (${repRes.status}): ${errText}`);
      if (yieldWhenHubOnline && lanState.hubOnline && repRes.status === 409 && errText.includes('boot-mismatch')) {
        cloudMetrics.yieldedToHub = true;
        hubYieldUntil = now() + 45000;
      }
      lease = null;
      return;
    }

    cloudMetrics.yieldedToHub = false;
    const nextLease = await repRes.json();
    nextLease.receivedAt = now();
    lease = nextLease;
    sequence = nextSeq;
    lanState.lastReportOkAt = now();
    lanState.lastSequence = sequence;
    const isEvent = nextLease.mode === 'event';
    cloudMetrics.workerMode = isEvent ? 'event-driven' : 'legacy-strict-poll';
    cloudMetrics.workerUpgradeRecommended = !isEvent;
    computeCycleMs();

    if (Array.isArray(nextLease.commands) && nextLease.commands.length > 0) {
      for (const cmd of nextLease.commands) {
        await dispatchHardwareCommand(cmd);
      }
    }
  }

  function scheduleLanPoll() {
    if (!running) return;
    pollTimer = setTimeout(async () => {
      if (!running || pollInFlight) return;
      pollInFlight = true;
      try {
        await pollLanOnce();
      } catch {} finally {
        pollInFlight = false;
        scheduleLanPoll();
      }
    }, pollDelayMs);
    pollTimer.unref?.();
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

  async function cloudLoop() {
    while (running) {
      const cycleStart = now();
      try {
        await syncOnce();
        consecutiveErrors = 0;
      } catch (e) {
        consecutiveErrors++;
        console.error(`[Cloud-Sync Error]: ${e.message}`);
        lease = null;
      }
      if (!running) break;
      const elapsed = now() - cycleStart;
      let targetMs = computeCycleMs();
      if (consecutiveErrors > 0) {
        targetMs = Math.min(15000, Math.round(1500 * Math.pow(1.5, Math.min(consecutiveErrors, 6))));
      }
      await waitForNextCycleOrWake(Math.max(200, targetMs - elapsed));
    }
  }

  function readSmallJson(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > 8192) {
          req.destroy();
          reject(Object.assign(new Error('Body too large'), { status: 413 }));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${syncPort}`);
    try {
      if ((url.pathname === '/' || url.pathname === '/health') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
          ok: true,
          service: 'cloud-hub-sync',
          architecture: 'Event-Driven Delta + Embedded MQTT Broker',
          uptime: Math.round(process.uptime()),
          deviceCount: registry.devices.size,
          consecutiveErrors,
          leaseActive: Boolean(lease),
          registeredDevices: registry.getAllForReport(),
          cloudMetrics,
          mqtt: mqttBroker.stats(),
          lanState
        }));
        return;
      }

      if (url.pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-store',
          Connection: 'keep-alive'
        });
        res.write(`event: presence\ndata: ${JSON.stringify(getPresencePayload())}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (url.pathname === '/api/presence' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(getPresencePayload()));
        return;
      }

      if (url.pathname === '/api/camera/snapshot' && req.method === 'GET') {
        const deviceId = url.searchParams.get('deviceId') || 'camera-02';
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(deviceId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid deviceId' }));
          return;
        }
        const entry = await fetchCameraSnapshot(deviceId, 1500);
        if (!entry) {
          res.writeHead(204);
          res.end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': entry.contentType,
          'Cache-Control': 'no-cache, max-age=1',
          'X-Updated-At': String(entry.updatedAt)
        });
        res.end(entry.bytes);
        return;
      }

      if (url.pathname === '/api/hub/display/preview' && req.method === 'GET') {
        const entry = await fetchDisplayPreview(2000);
        if (!entry) {
          res.writeHead(204);
          res.end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': entry.contentType,
          'Cache-Control': 'no-cache, max-age=1',
          'X-Updated-At': String(entry.updatedAt)
        });
        res.end(entry.bytes);
        return;
      }

      if (url.pathname === '/api/presence/command' && req.method === 'POST') {
        const body = await readSmallJson(req);
        const isDisplay = ['hub-display-layout', 'hub-display-orientation', 'hub-display-expression', 'camera-snapshot', 'hub-display-preview'].includes(body?.entityId);
        const validValue = isDisplay
          ? (typeof body?.value === 'string' && /^[a-z0-9_-]{1,32}$/i.test(body.value))
          : typeof body?.value === 'boolean';
        if (!body || body.version !== 1 || typeof body.commandId !== 'string' || !body.entityId || !validValue) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid command payload' }));
          return;
        }
        const execResult = await dispatchHardwareCommand(body);
        const resolvedBootId = (() => {
          const id = String(body.entityId || '');
          if (id === 'cam02-led' || id === 'camera-snapshot' || id.startsWith('cam02-') || id.startsWith('camera-02')) {
            return registry.get('camera-02')?.bootId || lanState.cam02BootId;
          }
          if (id === 'cam01-led' || id.startsWith('cam01-') || id.startsWith('camera-01')) {
            return registry.get('camera-01')?.bootId || body.bootId || lanState.hubBootId;
          }
          if (id === 'hub-relay' || id.startsWith('hub-')) {
            return registry.get('hub')?.bootId || lanState.hubBootId;
          }
          const devId = id.replace(/-(led|relay|switch)$/, '');
          return registry.get(devId)?.bootId || body.bootId || lanState.hubBootId;
        })();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
          commandId: body.commandId,
          applied: Boolean(execResult.applied),
          value: body.value,
          bootId: resolvedBootId,
          mode: execResult.applied ? 'lan' : 'offline'
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (e) {
      res.writeHead(e.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });

  async function start() {
    if (running) return;
    running = true;
    if (enableMqttBroker) {
      try {
        await mqttBroker.listen();
      } catch (err) {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[Cloud-Sync] MQTT port ${mqttPort} kullanımda; gömülü MQTT olmadan devam ediliyor.`);
        } else {
          throw err;
        }
      }
    }
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(syncPort, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    await pollLanOnce().catch(() => {});
    scheduleLanPoll();
    if (enableCloudLoop && enableCloudPush && token) {
      void cloudLoop();
    }
    return server.address();
  }

  async function close() {
    running = false;
    clearTimeout(pollTimer);
    triggerImmediateSync('shutdown');
    syncAbort?.abort();
    for (const sseRes of sseClients) {
      try { sseRes.end(); } catch {}
    }
    sseClients.clear();
    await mqttBroker.close();
    server.closeAllConnections?.();
    if (server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
  }

  return {
    server,
    mqttBroker,
    start,
    close,
    pollLanOnce,
    syncOnce,
    pushCameraSnapshot,
    pushDisplayPreview,
    getPresencePayload,
    dispatchHardwareCommand,
    cloudMetrics,
    lanState
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const token = loadPublishToken();
  if (!token) {
    console.warn('[Cloud-Sync] Uyarı: PRESENCE_PUBLISH_TOKEN veya local-data/publisher-token.txt yok; yalnızca yerel LAN köprüsü (8098) çalışacak, Cloud push devre dışı.');
  }
  const gw = createGatewayService({
    publishToken: token,
    enableCloudPush: Boolean(token),
    host: process.env.SYNC_HOST || '127.0.0.1',
    mqttHost: process.env.MQTT_HOST || '0.0.0.0'
  });
  gw.server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Cloud-Sync] Port ${process.env.SYNC_PORT || 8098} zaten kullanımda. Çıkılıyor.`);
      process.exit(0);
    }
    console.error(`[Cloud-Sync Error]: ${err.message}`);
    process.exit(1);
  });
  await gw.start();
  const addr = gw.server.address();
  console.log(`[Cloud-Sync] Dayanıklı Ağ Geçidi Aktif (http://${addr.address}:${addr.port}) -> Cloud=${process.env.ARMUT_CLOUD_URL || 'https://armut.armut-home.workers.dev'}`);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, async () => {
      await gw.close();
      process.exit(0);
    });
  }
}
