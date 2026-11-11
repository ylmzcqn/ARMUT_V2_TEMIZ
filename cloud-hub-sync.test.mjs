import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGatewayService } from './cloud-hub-sync.mjs';
import { createControllerServer } from './server.mjs';

const sampleCameraBody = (ageMs = 380, presence = true) => ({
  hostname: 'armut-camera-02',
  role: 'camera',
  boot_health: { boot_id: 'c4dc00bb', healthy: true },
  radar: {
    online: true,
    presence,
    sample_age_ms: ageMs,
    detection_distance_cm: 92
  }
});

test('ağ geçidi dürüst sample_age_ms taşır ve bayat örnekte null döner', async t => {
  let ageMs = 420;
  let nowMs = 100000;
  const gw = createGatewayService({
    syncPort: 0,
    enableCloudPush: false,
    now: () => nowMs,
    fetcher: async url => {
      if (url.includes('116/api/system')) {
        return Response.json(sampleCameraBody(ageMs, true));
      }
      throw new Error('offline');
    }
  });
  await gw.start();
  t.after(() => gw.close());

  let presence = gw.getPresencePayload();
  assert.equal(presence.value, true);
  assert.equal(presence.ageMs, 420);

  ageMs = 1950;
  nowMs += 2000;
  await gw.pollLanOnce();
  presence = gw.getPresencePayload();
  assert.equal(presence.value, null);
  assert.equal(presence.ageMs, null);
});

test('devre kesici çevrimdışı Hub adresini her döngüde tekrar zaman aşımına sokmaz', async t => {
  let nowMs = 50000;
  let hubAttempts = 0;
  const gw = createGatewayService({
    syncPort: 0,
    enableCloudPush: false,
    now: () => nowMs,
    fetcher: async url => {
      if (url.includes('118') || url.includes('armut-hub.local')) {
        hubAttempts++;
      }
      throw new Error('EHOSTUNREACH');
    }
  });
  await gw.start();
  t.after(() => gw.close());
  assert.equal(hubAttempts, 2);

  nowMs += 500;
  await gw.pollLanOnce();
  assert.equal(hubAttempts, 2);

  nowMs += 2000;
  await gw.pollLanOnce();
  assert.equal(hubAttempts, 4);
});

test('komut tekilleştirme aynı commandId değerini iki kez donanıma basmaz', async t => {
  let hardwareCalls = 0;
  const gw = createGatewayService({
    syncPort: 0,
    enableCloudPush: false,
    fetcher: async url => {
      if (url.includes('/api/hardware')) {
        hardwareCalls++;
        return Response.json({ ok: true });
      }
      throw new Error('offline');
    }
  });
  await gw.start();
  t.after(() => gw.close());

  const first = await gw.dispatchHardwareCommand({ version: 1, commandId: 'cmd-dup-1', entityId: 'cam02-led', value: true });
  const second = await gw.dispatchHardwareCommand({ version: 1, commandId: 'cmd-dup-1', entityId: 'cam02-led', value: true });
  assert.equal(first.applied, true);
  assert.equal(second.applied, true);
  assert.equal(second.deduplicated, true);
  assert.equal(hardwareCalls, 1);
});

test('yerel denetleyici ve ağ geçidi uçtan uca snapshot ve komut köprüsü sağlar', async t => {
  const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const gw = createGatewayService({
    syncPort: 0,
    enableCloudPush: false,
    fetcher: async url => {
      if (url.includes('116/api/system')) return Response.json(sampleCameraBody(120, false));
      if (url.includes('116/snapshot.jpg')) return new Response(fakeJpeg, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
      if (url.includes('/api/display')) return Response.json({ ok: true });
      throw new Error('offline');
    }
  });
  await gw.start();
  t.after(() => gw.close());
  const gwPort = gw.server.address().port;

  const dir = await mkdtemp(join(tmpdir(), 'armut-gw-e2e-'));
  const ctrl = await createControllerServer({
    dataDir: dir,
    port: 0,
    adminKey: 'gw-test-key-01',
    gatewayUrl: `http://127.0.0.1:${gwPort}`
  });
  await ctrl.listen();
  t.after(async () => {
    await ctrl.close();
    await rm(dir, { recursive: true, force: true });
  });

  const login = await fetch(ctrl.baseUrl + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'gw-test-key-01' })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const { csrfToken } = await login.json();

  const snapRes = await fetch(ctrl.baseUrl + '/api/camera/snapshot?deviceId=camera-02', { headers: { cookie } });
  assert.equal(snapRes.status, 200);
  assert.deepEqual(new Uint8Array(await snapRes.arrayBuffer()), fakeJpeg);

  const cmdRes = await fetch(ctrl.baseUrl + '/api/presence/command', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ version: 1, commandId: 'disp-1', entityId: 'hub-display-layout', value: 'assistant' })
  });
  assert.equal(cmdRes.status, 200);
  const cmdBody = await cmdRes.json();
  assert.equal(cmdBody.applied, true);
  assert.equal(cmdBody.mode, 'lan');

  const unauthSnap = await fetch(ctrl.baseUrl + '/api/camera/snapshot?deviceId=camera-02');
  assert.equal(unauthSnap.status, 401);
});

test('MQTT yayın ve LWT ağ geçidi durumunu anlık günceller', async t => {
  const net = await import('node:net');
  const gw = createGatewayService({
    syncPort: 0,
    mqttPort: 0,
    enableCloudPush: false,
    fetcher: async () => { throw new Error('offline'); }
  });
  await gw.start();
  t.after(() => gw.close());
  const mqttPort = gw.mqttBroker.stats().port;

  const str = s => { const b = Buffer.from(s, 'utf8'); const h = Buffer.allocUnsafe(2); h.writeUInt16BE(b.length, 0); return Buffer.concat([h, b]); };
  const sock = net.connect(mqttPort, '127.0.0.1');
  t.after(() => sock.destroy());
  await new Promise(resolve => sock.once('connect', resolve));

  const willTopic = str('armut/devices/camera-02/status');
  const willMsg = str('offline');
  const connBody = Buffer.concat([str('MQTT'), Buffer.from([4, 0x06, 0, 30]), str('cam02-mqtt'), willTopic, willMsg]);
  sock.write(Buffer.concat([Buffer.from([0x10, connBody.length]), connBody]));
  await new Promise(r => setTimeout(r, 30));

  const pubBody = Buffer.concat([str('armut/devices/camera-02/state'), Buffer.from(JSON.stringify({ presence: true, bootId: 'deadbeef01', sampleAgeMs: 15 }))]);
  sock.write(Buffer.concat([Buffer.from([0x30, pubBody.length]), pubBody]));
  await new Promise(r => setTimeout(r, 40));

  let payload = gw.getPresencePayload();
  assert.equal(payload.value, true);
  assert.equal(payload.bootId, 'deadbeef01');

  sock.destroy();
  await new Promise(r => setTimeout(r, 50));
  payload = gw.getPresencePayload();
  assert.equal(payload.value, null);
});

test('olay odaklı mod kotayı düşürür, arka planda snapshot basmaz ve Hub çevrimiçi olunca devreder', async t => {
  const { createMemoryPresenceStore, createPresenceIngest } = await import('./presence-ingest.mjs');
  const store = createMemoryPresenceStore();
  const ingest = createPresenceIngest({ store });
  let snapshotUploads = 0;
  let nowMs = 100000;
  let hubAlive = false;

  const gw = createGatewayService({
    syncPort: 0,
    mqttPort: 0,
    enableCloudPush: true,
    enableCloudLoop: false,
    publishToken: 'a'.repeat(40),
    now: () => nowMs,
    fetcher: async (url, init) => {
      if (url.includes('116/api/system')) return Response.json(sampleCameraBody(20, true));
      if (url.includes('118/api/devices')) {
        if (!hubAlive) throw new Error('offline');
        return Response.json({ boot_id: 'f00dbabe12', devices: [] });
      }
      if (url.includes('/api/presence/hello')) {
        const body = JSON.parse(init.body);
        return Response.json(await ingest.hello(body));
      }
      if (url.includes('/api/presence/report')) {
        const body = JSON.parse(init.body);
        try {
          return Response.json(await ingest.report(body));
        } catch (err) {
          return Response.json({ error: err.message }, { status: err.status || 400 });
        }
      }
      if (url.includes('/api/camera/snapshot')) {
        snapshotUploads++;
        return Response.json({ ok: true });
      }
      throw new Error('unexpected ' + url);
    }
  });
  await gw.start();
  t.after(() => gw.close());

  await gw.syncOnce();
  assert.equal(gw.cloudMetrics.workerMode, 'event-driven');
  assert.equal(gw.cloudMetrics.backgroundMediaUploads, false);
  assert.equal(snapshotUploads, 0);

  hubAlive = true;
  nowMs += 2000;
  await gw.pollLanOnce();
  await ingest.hello({ version: 1, publisherId: 'hub', deviceId: 'camera-02', componentId: 'presence-radar', bootId: 'beefcafe99' });
  await gw.syncOnce();
  assert.equal(gw.cloudMetrics.yieldedToHub, true);
});
