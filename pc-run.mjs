// Buluttaki ajanın evdeki Windows bilgisayarda doğrudan komut çalıştırmasını sağlayan köprü aracı.
// Kullanım: node pc-run.mjs "<powershell-komutu>" [çalışma-dizini]
import { execFileSync } from 'node:child_process';

const cmd = process.argv[2];
const cwd = process.argv[3];

if (!cmd) {
  console.error('Kullanım: node pc-run.mjs "<komut>" [cwd]');
  process.exit(2);
}

execFileSync('git', ['fetch', 'origin', 'pc-bridge', '-q'], { stdio: 'ignore' });
const raw = execFileSync('git', ['show', 'FETCH_HEAD:bridge.json'], { encoding: 'utf8' });
const bridge = JSON.parse(raw);

let response, lastError;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    response = await fetch(bridge.publicHttpsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bridge.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cmd, ...(cwd ? { cwd } : {}) })
    });
    if (response.status < 500) break;
    lastError = `HTTP ${response.status}: ${await response.text()}`;
  } catch (err) {
    lastError = err.message;
  }
  await new Promise(r => setTimeout(r, 1000));
}

if (!response || !response.ok) {
  console.error(`PC Köprüsü HTTP hatası:`, lastError || (response ? `(${response.status})` : 'Yanıt yok'));
  process.exit(1);
}

const result = await response.json();
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.exitCode ?? 0);
