// ARMUT V2 — Bağımlılıksız Gömülü MQTT 3.1.1 Broker (LAN Olay Veri Yolu).
// ESP32 düğümleri ve yerel köprü için değişim odaklı publish/subscribe + LWT (son vasiyet) desteği sağlar.
import net from 'node:net';

const PACKET = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  PUBACK: 4,
  SUBSCRIBE: 8,
  SUBACK: 9,
  UNSUBSCRIBE: 10,
  UNSUBACK: 11,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14
};

function encodeRemainingLength(len) {
  const bytes = [];
  let x = len;
  do {
    let encoded = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) encoded |= 0x80;
    bytes.push(encoded);
  } while (x > 0);
  return Buffer.from(bytes);
}

function decodeRemainingLength(buf, offset) {
  let multiplier = 1;
  let value = 0;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos++];
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) {
      return { value, nextOffset: pos };
    }
    multiplier *= 128;
    if (multiplier > 128 * 128 * 128) {
      throw new Error('Malformed MQTT remaining length');
    }
  }
  return null;
}

function readUtf8(buf, offset) {
  if (offset + 2 > buf.length) throw new Error('Truncated MQTT string length');
  const len = buf.readUInt16BE(offset);
  if (offset + 2 + len > buf.length) throw new Error('Truncated MQTT string body');
  return {
    value: buf.toString('utf8', offset + 2, offset + 2 + len),
    nextOffset: offset + 2 + len
  };
}

function writeUtf8(str) {
  const body = Buffer.from(String(str), 'utf8');
  const head = Buffer.allocUnsafe(2);
  head.writeUInt16BE(body.length, 0);
  return Buffer.concat([head, body]);
}

function buildPublishPacket(topic, payloadBuf, qos = 0, packetId = 0, retain = false) {
  const topicPart = writeUtf8(topic);
  const idPart = qos > 0 ? Buffer.from([(packetId >> 8) & 0xff, packetId & 0xff]) : Buffer.alloc(0);
  const varHeaderAndPayload = Buffer.concat([topicPart, idPart, payloadBuf]);
  const flags = ((qos & 0x03) << 1) | (retain ? 0x01 : 0x00);
  const fixedHeader = Buffer.concat([
    Buffer.from([(PACKET.PUBLISH << 4) | flags]),
    encodeRemainingLength(varHeaderAndPayload.length)
  ]);
  return Buffer.concat([fixedHeader, varHeaderAndPayload]);
}

export function topicMatches(filter, topic) {
  if (filter === '#') return true;
  const fParts = String(filter).split('/');
  const tParts = String(topic).split('/');
  for (let i = 0; i < fParts.length; i++) {
    const fp = fParts[i];
    if (fp === '#') return i === fParts.length - 1;
    if (i >= tParts.length) return false;
    if (fp !== '+' && fp !== tParts[i]) return false;
  }
  return fParts.length === tParts.length;
}

export function createMqttBroker({
  host = '127.0.0.1',
  port = 1883,
  authToken = '',
  onPublish = null,
  onClientConnect = null,
  onClientDisconnect = null
} = {}) {
  const clients = new Set();
  const retained = new Map();
  let nextOutPacketId = 1;
  let totalPublished = 0;
  let lwtTriggered = 0;
  let brokerHost = host;
  let brokerPort = port;

  function allocatePacketId() {
    nextOutPacketId = (nextOutPacketId % 65535) + 1;
    return nextOutPacketId;
  }

  function deliverToClient(client, topic, payloadBuf, retain = false) {
    if (!client.connected || client.socket.destroyed) return;
    let maxQos = -1;
    for (const [filter, subQos] of client.subscriptions.entries()) {
      if (topicMatches(filter, topic)) {
        if (subQos > maxQos) maxQos = subQos;
      }
    }
    if (maxQos < 0) return;
    const qos = maxQos > 0 ? 1 : 0;
    const packetId = qos > 0 ? allocatePacketId() : 0;
    try {
      client.socket.write(buildPublishPacket(topic, payloadBuf, qos, packetId, retain));
    } catch {}
  }

  function publish(topic, payload, { retain = false, sourceClientId = 'broker' } = {}) {
    if (typeof topic !== 'string' || !topic || topic.length > 512) return;
    const payloadBuf = Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8');
    totalPublished++;
    if (retain) {
      if (payloadBuf.length === 0) retained.delete(topic);
      else retained.set(topic, payloadBuf);
    }
    for (const c of clients) {
      deliverToClient(c, topic, payloadBuf, false);
    }
    if (typeof onPublish === 'function') {
      try {
        onPublish({
          topic,
          payload: payloadBuf.toString('utf8'),
          bytes: payloadBuf,
          retain,
          sourceClientId
        });
      } catch {}
    }
  }

  function sendConnack(socket, returnCode = 0) {
    socket.write(Buffer.from([PACKET.CONNACK << 4, 2, 0, returnCode]));
  }

  function handlePacket(client, type, flags, payload) {
    if (type === PACKET.CONNECT) {
      let pos = 0;
      const proto = readUtf8(payload, pos);
      pos = proto.nextOffset;
      if (pos + 4 > payload.length) throw new Error('Invalid CONNECT');
      const level = payload[pos++];
      const connectFlags = payload[pos++];
      const keepAliveSec = payload.readUInt16BE(pos);
      pos += 2;
      if (!['MQTT', 'MQIsdp'].includes(proto.value) || ![3, 4].includes(level)) {
        sendConnack(client.socket, 1);
        client.socket.end();
        return;
      }
      const cid = readUtf8(payload, pos);
      pos = cid.nextOffset;
      client.clientId = cid.value || `anon-${Math.random().toString(36).slice(2, 8)}`;

      let will = null;
      if (connectFlags & 0x04) {
        const wTopic = readUtf8(payload, pos);
        pos = wTopic.nextOffset;
        if (pos + 2 > payload.length) throw new Error('Invalid will length');
        const wLen = payload.readUInt16BE(pos);
        pos += 2;
        if (pos + wLen > payload.length) throw new Error('Invalid will body');
        const wMsg = payload.subarray(pos, pos + wLen);
        pos += wLen;
        will = {
          topic: wTopic.value,
          payload: Buffer.from(wMsg),
          retain: Boolean(connectFlags & 0x20)
        };
      }

      let username = '';
      let password = '';
      if (connectFlags & 0x80) {
        const u = readUtf8(payload, pos);
        username = u.value;
        pos = u.nextOffset;
      }
      if (connectFlags & 0x40) {
        if (pos + 2 > payload.length) throw new Error('Invalid password length');
        const pLen = payload.readUInt16BE(pos);
        pos += 2;
        if (pos + pLen > payload.length) throw new Error('Invalid password body');
        password = payload.toString('utf8', pos, pos + pLen);
      }

      if (authToken && password !== authToken && username !== authToken) {
        sendConnack(client.socket, 4);
        client.socket.end();
        return;
      }

      client.connected = true;
      client.will = will;
      client.keepAliveSec = keepAliveSec;
      if (keepAliveSec > 0) {
        client.socket.setTimeout(Math.max(5000, Math.round(keepAliveSec * 1500)));
      }
      sendConnack(client.socket, 0);
      if (typeof onClientConnect === 'function') {
        try { onClientConnect({ clientId: client.clientId, keepAliveSec }); } catch {}
      }
      return;
    }

    if (!client.connected) {
      client.socket.destroy();
      return;
    }

    if (type === PACKET.PINGREQ) {
      client.socket.write(Buffer.from([PACKET.PINGRESP << 4, 0]));
      return;
    }

    if (type === PACKET.DISCONNECT) {
      client.cleanDisconnect = true;
      client.will = null;
      client.socket.end();
      return;
    }

    if (type === PACKET.SUBSCRIBE) {
      if (payload.length < 3) throw new Error('Invalid SUBSCRIBE');
      const packetId = payload.readUInt16BE(0);
      let pos = 2;
      const grants = [];
      const newTopics = [];
      while (pos < payload.length) {
        const filter = readUtf8(payload, pos);
        pos = filter.nextOffset;
        if (pos >= payload.length) throw new Error('Missing QoS');
        const reqQos = payload[pos++] & 0x03;
        const granted = reqQos > 0 ? 1 : 0;
        client.subscriptions.set(filter.value, granted);
        grants.push(granted);
        newTopics.push(filter.value);
      }
      const suback = Buffer.concat([
        Buffer.from([PACKET.SUBACK << 4]),
        encodeRemainingLength(2 + grants.length),
        Buffer.from([(packetId >> 8) & 0xff, packetId & 0xff, ...grants])
      ]);
      client.socket.write(suback);
      for (const filter of newTopics) {
        for (const [rTopic, rBuf] of retained.entries()) {
          if (topicMatches(filter, rTopic)) {
            deliverToClient(client, rTopic, rBuf, true);
          }
        }
      }
      return;
    }

    if (type === PACKET.UNSUBSCRIBE) {
      if (payload.length < 3) throw new Error('Invalid UNSUBSCRIBE');
      const packetId = payload.readUInt16BE(0);
      let pos = 2;
      while (pos < payload.length) {
        const filter = readUtf8(payload, pos);
        pos = filter.nextOffset;
        client.subscriptions.delete(filter.value);
      }
      client.socket.write(Buffer.from([
        PACKET.UNSUBACK << 4,
        2,
        (packetId >> 8) & 0xff,
        packetId & 0xff
      ]));
      return;
    }

    if (type === PACKET.PUBLISH) {
      const qos = (flags >> 1) & 0x03;
      const retain = Boolean(flags & 0x01);
      const t = readUtf8(payload, 0);
      let pos = t.nextOffset;
      let packetId = 0;
      if (qos > 0) {
        if (pos + 2 > payload.length) throw new Error('Missing PUBLISH packetId');
        packetId = payload.readUInt16BE(pos);
        pos += 2;
      }
      const msgBuf = payload.subarray(pos);
      if (qos === 1) {
        client.socket.write(Buffer.from([
          PACKET.PUBACK << 4,
          2,
          (packetId >> 8) & 0xff,
          packetId & 0xff
        ]));
      }
      publish(t.value, msgBuf, { retain, sourceClientId: client.clientId });
    }
  }

  const server = net.createServer(socket => {
    const client = {
      socket,
      clientId: '',
      connected: false,
      cleanDisconnect: false,
      keepAliveSec: 0,
      will: null,
      subscriptions: new Map(),
      buffer: Buffer.alloc(0)
    };
    clients.add(client);

    socket.on('data', chunk => {
      client.buffer = Buffer.concat([client.buffer, chunk]);
      try {
        while (client.buffer.length >= 2) {
          const byte0 = client.buffer[0];
          const type = (byte0 >> 4) & 0x0f;
          const flags = byte0 & 0x0f;
          const rem = decodeRemainingLength(client.buffer, 1);
          if (!rem) break;
          const totalLen = rem.nextOffset + rem.value;
          if (totalLen > 131072) throw new Error('MQTT packet too large');
          if (client.buffer.length < totalLen) break;
          const body = client.buffer.subarray(rem.nextOffset, totalLen);
          client.buffer = client.buffer.subarray(totalLen);
          handlePacket(client, type, flags, body);
        }
      } catch {
        socket.destroy();
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
    });

    const cleanup = () => {
      if (!clients.delete(client)) return;
      if (client.connected && !client.cleanDisconnect && client.will?.topic) {
        lwtTriggered++;
        publish(client.will.topic, client.will.payload, {
          retain: client.will.retain,
          sourceClientId: client.clientId
        });
      }
      if (client.connected && typeof onClientDisconnect === 'function') {
        try {
          onClientDisconnect({
            clientId: client.clientId,
            clean: client.cleanDisconnect
          });
        } catch {}
      }
    };

    socket.once('close', cleanup);
    socket.on('error', () => {});
  });

  async function listen() {
    if (server.listening) return server.address();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    const addr = server.address();
    brokerHost = addr.address;
    brokerPort = addr.port;
    return addr;
  }

  async function close() {
    for (const c of clients) {
      c.will = null;
      c.socket.destroy();
    }
    clients.clear();
    if (server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
  }

  function stats() {
    return {
      listening: server.listening,
      host: brokerHost,
      port: brokerPort,
      connectedClients: Array.from(clients).filter(c => c.connected).map(c => c.clientId),
      retainedTopics: retained.size,
      totalPublished,
      lwtTriggered
    };
  }

  return Object.freeze({
    server,
    listen,
    close,
    publish,
    stats
  });
}
