import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Read API_TOKEN from V1 secrets if available
function getApiToken() {
  const secretsPaths = [
    'C:/Users/icanp/OneDrive/Belgeler/ChatGPT/ESP_ARMUT_V1.1/armut-hub/include/secrets.h',
    'C:\\Users\\icanp\\OneDrive\\Belgeler\\ChatGPT\\ESP_ARMUT_V1.1\\armut-hub\\include\\secrets.h',
  ];
  for (const p of secretsPaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      const m = content.match(/#define\s+API_TOKEN\s+"([^"]+)"/);
      if (m) return m[1];
    }
  }
  return '';
}

async function checkApi(ip, token) {
  return new Promise((resolve) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.get({
      host: ip,
      port: 80,
      path: '/api/system',
      headers,
      timeout: 1200,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ip, status: res.statusCode, data: parsed });
        } catch {
          resolve({ ip, status: res.statusCode, text: data.slice(0, 80) });
        }
      });
    });

    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => { resolve(null); });
  });
}

async function main() {
  const token = getApiToken();
  console.log(`API Token bulundu mu: ${Boolean(token)}`);

  console.log('Taranıyor: 192.168.1.1 - 192.168.1.150...');
  const ips = [];
  for (let i = 1; i <= 150; i++) {
    ips.push(`192.168.1.${i}`);
  }

  const results = await Promise.all(ips.map(ip => checkApi(ip, token)));
  const active = results.filter(Boolean);

  console.log(`\nAktif HTTP yanıtları (${active.length}):`);
  for (const a of active) {
    console.log(`[${a.ip}] HTTP ${a.status}:`, JSON.stringify(a.data || a.text));
  }
}

main().catch(console.error);
