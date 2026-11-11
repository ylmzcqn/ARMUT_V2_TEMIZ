import http from 'node:http';

async function checkIp(ip) {
  return new Promise((resolve) => {
    const req = http.get({
      host: ip,
      port: 80,
      path: '/',
      timeout: 800,
    }, (res) => {
      resolve({ ip, status: res.statusCode });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => { resolve(null); });
  });
}

async function main() {
  console.log('Taranıyor: 192.168.1.151 - 192.168.1.254...');
  const ips = [];
  for (let i = 151; i <= 254; i++) {
    ips.push(`192.168.1.${i}`);
  }
  const results = await Promise.all(ips.map(ip => checkIp(ip)));
  const active = results.filter(Boolean);
  console.log(`Aktif port 80 yanıtları (${active.length}):`, active);
}

main().catch(console.error);
