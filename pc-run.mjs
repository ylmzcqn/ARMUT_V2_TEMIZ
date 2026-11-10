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
const raw = execFileSync('git', ['show', 'origin/pc-bridge:bridge.json'], { encoding: 'utf8' });
const bridge = JSON.parse(raw);

const response = await fetch(bridge.publicHttpsUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${bridge.token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ cmd, ...(cwd ? { cwd } : {}) })
});

if (!response.ok) {
  console.error(`PC Köprüsü HTTP hatası (${response.status}):`, await response.text());
  process.exit(1);
}

const result = await response.json();
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.exitCode ?? 0);
