import net from 'node:net';
import http from 'node:http';

function checkPort(host, port, timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = 'closed';

    socket.setTimeout(timeout);
    socket.once('connect', () => {
      status = 'open';
      socket.destroy();
      resolve(port);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(null);
    });
    socket.once('error', () => {
      resolve(null);
    });

    socket.connect(port, host);
  });
}

async function probeHost(host) {
  console.log(`\n--- Hedef Taranıyor: ${host} ---`);
  const ports = [80, 81, 8080, 8090, 8000, 8888, 3000, 5000, 23, 21, 554, 8266];
  const results = await Promise.all(ports.map(p => checkPort(host, p)));
  const openPorts = results.filter(Boolean);
  console.log(`${host} Açık portlar:`, openPorts);

  for (const port of openPorts) {
    await new Promise((resolve) => {
      const req = http.get({
        host,
        port,
        path: '/',
        timeout: 1500,
      }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          console.log(`${host}:${port}/ => HTTP ${res.statusCode}, len: ${body.length}`);
          if (body.length < 200) console.log(`  İçerik: ${body.trim()}`);
          resolve();
        });
      });
      req.on('error', (e) => {
        console.log(`${host}:${port}/ => HTTP Hata: ${e.message}`);
        resolve();
      });
      req.on('timeout', () => {
        req.destroy();
        console.log(`${host}:${port}/ => HTTP Zaman Aşımı`);
        resolve();
      });
    });
  }
}

async function main() {
  await probeHost('192.168.1.103');
  await probeHost('192.168.1.116');
  await probeHost('192.168.1.118');
}

main().catch(console.error);
