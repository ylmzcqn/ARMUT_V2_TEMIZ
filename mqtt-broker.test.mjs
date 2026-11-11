import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createMqttBroker, topicMatches } from './mqtt-broker.mjs';

function encodeStr(str) {
  const b = Buffer.from(str, 'utf8');
  const len = Buffer.allocUnsafe(2);
  len.writeUInt16BE(b.length, 0);
  return Buffer.concat([len, b]);
}

function encodeRemLen(len) {
  const out = [];
  let x = len;
  do {
    let e = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) e |= 0x80;
    out.push(e);
  } while (x > 0);
  return Buffer.from(out);
}

function buildConnect({ clientId, will, username, password } = {}) {
  let flags = 0x02;
  const parts = [encodeStr('MQTT'), Buffer.from([4, 0, 0, 30]), encodeStr(clientId || 'test-client')];
  if (will) {
    flags |= 0x04 | (will.retain ? 0x20 : 0);
    parts.push(encodeStr(will.topic), encodeStr(will.payload));
  }
  if (username !== undefined) {
    flags |= 0x80;
    parts.push(encodeStr(username));
  }
  if (password !== undefined) {
    flags |= 0x40;
    parts.push(encodeStr(password));
  }
  parts[1][1] = flags;
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([0x10]), encodeRemLen(body.length), body]);
}

function buildSubscribe(packetId, filter, qos = 1) {
  const body = Buffer.concat([
    Buffer.from([(packetId >> 8) & 0xff, packetId & 0xff]),
    encodeStr(filter),
    Buffer.from([qos])
  ]);
  return Buffer.concat([Buffer.from([0x82]), encodeRemLen(body.length), body]);
}

function buildPublish(topic, payload, { qos = 1, packetId = 1, retain = false } = {}) {
  const parts = [encodeStr(topic)];
  if (qos > 0) parts.push(Buffer.from([(packetId >> 8) & 0xff, packetId & 0xff]));
  parts.push(Buffer.from(payload, 'utf8'));
  const body = Buffer.concat(parts);
  const byte0 = (3 << 4) | ((qos & 3) << 1) | (retain ? 1 : 0);
  return Buffer.concat([Buffer.from([byte0]), encodeRemLen(body.length), body]);
}

test('MQTT joker konu eşleşmesi + ve # kurallarına uyar', () => {
  assert.equal(topicMatches('armut/devices/+/state', 'armut/devices/hub/state'), true);
  assert.equal(topicMatches('armut/devices/+/state', 'armut/devices/hub/extra/state'), false);
  assert.equal(topicMatches('armut/#', 'armut/commands/hub-relay'), true);
  assert.equal(topicMatches('#', 'anything/at/all'), true);
});

test('MQTT 3.1.1 broker CONNECT, SUBSCRIBE, QoS1 PUBLISH ve LWT çevrimdışı bildirimini uygular', async t => {
  const events = [];
  const broker = createMqttBroker({
    port: 0,
    onPublish: ev => events.push(ev)
  });
  const addr = await broker.listen();
  t.after(() => broker.close());

  const sub = net.connect(addr.port, '127.0.0.1');
  t.after(() => sub.destroy());
  await new Promise(resolve => sub.once('connect', resolve));

  const subChunks = [];
  sub.on('data', chunk => subChunks.push(chunk));
  sub.write(buildConnect({ clientId: 'panel-sub' }));
  await new Promise(r => setTimeout(r, 40));
  assert.equal(subChunks[0][0], 0x20);
  assert.equal(subChunks[0][3], 0x00);

  sub.write(buildSubscribe(7, 'armut/devices/#', 1));
  await new Promise(r => setTimeout(r, 40));

  const pub = net.connect(addr.port, '127.0.0.1');
  t.after(() => pub.destroy());
  await new Promise(resolve => pub.once('connect', resolve));
  const pubChunks = [];
  pub.on('data', chunk => pubChunks.push(chunk));
  pub.write(buildConnect({
    clientId: 'esp32-cam-02',
    will: { topic: 'armut/devices/camera-02/status', payload: 'offline', retain: true }
  }));
  await new Promise(r => setTimeout(r, 40));

  pub.write(buildPublish('armut/devices/camera-02/state', JSON.stringify({ presence: true }), { qos: 1, packetId: 12 }));
  await new Promise(r => setTimeout(r, 60));

  assert.ok(pubChunks.some(b => b[0] === 0x40), 'QoS 1 PUBACK alınmalı');
  const combined = Buffer.concat(subChunks).toString('utf8');
  assert.ok(combined.includes('"presence":true'), 'Abone PUBLISH mesajını almalı');

  pub.destroy();
  await new Promise(r => setTimeout(r, 60));

  assert.ok(events.some(e => e.topic === 'armut/devices/camera-02/status' && e.payload === 'offline'), 'Ani kopmada LWT çevrimdışı yayınlanmalı');
  assert.equal(broker.stats().lwtTriggered, 1);
});

test('MQTT broker parola doğrular ve yetkisiz istemciyi reddeder', async t => {
  const broker = createMqttBroker({ port: 0, authToken: 'secret-token-123' });
  const addr = await broker.listen();
  t.after(() => broker.close());

  const bad = net.connect(addr.port, '127.0.0.1');
  t.after(() => bad.destroy());
  await new Promise(resolve => bad.once('connect', resolve));
  const chunks = [];
  bad.on('data', c => chunks.push(c));
  bad.write(buildConnect({ clientId: 'intruder', username: 'u', password: 'wrong' }));
  await new Promise(r => setTimeout(r, 40));
  assert.equal(Buffer.concat(chunks)[3], 4);
  assert.equal(broker.stats().connectedClients.length, 0);
});
