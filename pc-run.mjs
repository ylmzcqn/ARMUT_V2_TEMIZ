// Buluttaki ajanın evdeki Windows bilgisayarda doğrudan komut çalıştırmasını sağlayan köprü aracı.
// Kullanım: node pc-run.mjs "<powershell-komutu>" [çalışma-dizini]
import { execFileSync } from 'node:child_process';

const cmd = process.argv[2];
const cwd = process.argv[3];

if (!cmd) {
  console.error('Kullanım: node pc-run.mjs "<komut>" [cwd]');
  process.exit(2);
}

function loadBridgeConfig() {
  try {
    execFileSync('git', ['fetch', 'origin', 'pc-bridge', '-q'], { stdio: 'ignore' });
    const raw = execFileSync('git', ['show', 'FETCH_HEAD:bridge.json'], { encoding: 'utf8' });
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

let bridge = loadBridgeConfig();
let response, lastError;

for (let attempt = 1; attempt <= 4; attempt++) {
  if (attempt > 1) {
    // Yeniden denemede tünel rotasyonunu yakalamak için origin/pc-bridge'i tekrar çek
    const refreshed = loadBridgeConfig();
    if (refreshed) bridge = refreshed;
  }

  if (!bridge || !bridge.publicHttpsUrl) {
    lastError = 'bridge.json okunamadı veya tünel URL eksik';
    await new Promise(r => setTimeout(r, 1200));
    continue;
  }

  // Yerel loopback testi: Eğer yerel makinedeyse ve 8099 portu açıksa öncelikli dene
  const targetUrls = [];
  targetUrls.push(bridge.publicHttpsUrl);
  if (bridge.tailscaleUrl) targetUrls.push(bridge.tailscaleUrl);

  for (const targetUrl of targetUrls) {
    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bridge.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cmd, ...(cwd ? { cwd } : {}) }),
        signal: AbortSignal.timeout(15000)
      });
      if (response.status < 500) break;
      lastError = `HTTP ${response.status}: ${await response.text()}`;
    } catch (err) {
      lastError = err.message;
    }
  }

  if (response && response.status < 500) break;
  await new Promise(r => setTimeout(r, 1500));
}

if (!response || !response.ok) {
  console.error(`PC Köprüsü HTTP hatası:`, lastError || (response ? `(${response.status})` : 'Yanıt yok'));
  process.exit(1);
}

const result = await response.json();
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.exitCode ?? 0);
