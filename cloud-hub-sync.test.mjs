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
