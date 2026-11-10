import http from 'node:http';

async function checkIp(ip) {
  return new Promise((resolve) => {
    const req = http.get({
      host: ip,
      port: 80,
      path: '/api/system',
      timeout: 1000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ip, status: res.statusCode, data: parsed });
        } catch {
          resolve({ ip, status: res.statusCode, text: data.slice(0, 100) });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => {
      resolve(null);
    });
  });
}

async function checkSnapshot(ip) {
  return new Promise((resolve) => {
    const req = http.get({
      host: ip,
      port: 80,
      path: '/snapshot.jpg',
      timeout: 1200,
    }, (res) => {
      resolve({ ip, status: res.statusCode, contentType: res.headers['content-type'] });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => { resolve(null); });
  });
}

async function main() {
  console.log('Taranıyor: 192.168.1.100 - 192.168.1.135...');
  const ips = [];
  for (let i = 100; i <= 135; i++) {
    ips.push(`192.168.1.${i}`);
  }

  const results = await Promise.all(ips.map(ip => checkIp(ip)));
  const active = results.filter(Boolean);

  console.log(`\nBulunan /api/system yanıtları (${active.length}):`);
  for (const a of active) {
    console.log(`- IP: ${a.ip} [${a.status}] =>`, a.data || a.text);
  }

  // Also check snapshots
  const snapResults = await Promise.all(ips.map(ip => checkSnapshot(ip)));
  const activeSnaps = snapResults.filter(Boolean);
  console.log(`\nBulunan /snapshot.jpg yanıtları (${activeSnaps.length}):`);
  for (const s of activeSnaps) {
    console.log(`- IP: ${s.ip} [${s.status}] => ${s.contentType}`);
  }
}

main().catch(console.error);
