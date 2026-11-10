// ARMUT V2 — Yerel Köprü ve Bağlantı Ajanı (Local Relay/Bridge Agent)
// Cloud tarafındaki yapay zekâ ajanlarından gelen istekleri yerel Windows ortamında çalıştırır,
// çıktıları geri döndürür ve cloud-yerel arasında çift yönlü köprü görevi görür.
// Bağımlılıksız Node.js 22+

import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BRIDGE_PORT || 8099);
const MACHINE = process.env.BRIDGE_MACHINE || 'armut-windows-pc';
const TOKEN = process.env.BRIDGE_TOKEN || crypto.randomBytes(24).toString('hex');
const V1_PATH = process.env.V1_PATH || 'C:\\Users\\icanp\\OneDrive\\Belgeler\\ChatGPT\\ESP_ARMUT_V1.1';
const V2_PATH = process.env.V2_PATH || __dirname;

let activeTunnelUrl = null;

// 1. Yerel HTTP İşleyici
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/ping' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, machine: MACHINE, uptime: Math.round(process.uptime()), tunnel: activeTunnelUrl }));
    return;
  }

  if (url.pathname === '/run' && req.method === 'POST') {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
      }
    });

    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const { cmd, cwd } = parsed;
      if (!cmd) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing cmd parameter' }));
        return;
      }

      console.log(`[YEREL AJAN] Komut alındı: "${cmd}" (Dizin: ${cwd || V2_PATH})`);

      const isWin = process.platform === 'win32';
      const shellCmd = isWin ? 'powershell.exe' : 'bash';
      const shellArgs = isWin
        ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd]
        : ['-c', cmd];

      const child = spawn(shellCmd, shellArgs, {
        cwd: cwd || V2_PATH,
        env: { ...process.env, CI: 'true' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        child.kill();
        stderr += '\n[Zaman aşımı: Komut 120 saniyeyi aştı ve durduruldu]';
      }, 120000);

      child.on('close', code => {
        clearTimeout(timer);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          stdout,
          stderr,
          exitCode: code ?? 1
        }));
      });

      child.on('error', err => {
        clearTimeout(timer);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          stdout,
          stderr: err.message,
          exitCode: 1
        }));
      });
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// 2. Git Üzerinden bridge.json Güncelleme
function publishBridgeMetadata(publicUrl) {
  activeTunnelUrl = publicUrl;
  const bridgeData = {
    updatedAt: new Date().toISOString(),
    machine: MACHINE,
    publicHttpsUrl: `${publicUrl}/run`,
    pingUrl: `${publicUrl}/ping`,
    tailscaleUrl: `http://100.82.246.76:${PORT}/run`,
    token: TOKEN,
    v2Path: V2_PATH,
    v1Path: V1_PATH,
    exampleCurl: `curl -sS -X POST "${publicUrl}/run" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d '{"cmd":"git status"}'`
  };

  const tempJson = path.join(__dirname, '.bridge-temp.json');
  fs.writeFileSync(tempJson, JSON.stringify(bridgeData, null, 2), 'utf8');

  try {
    console.log('[YEREL AJAN] bridge.json pc-bridge dalına aktarılıyor...');
    // Dalı kontrol et, geçici nesne oluşturup doğrudan pc-bridge dalına push et
    const blobHash = execSync(`git hash-object -w "${tempJson}"`, { cwd: __dirname, encoding: 'utf8' }).trim();
    const treeEntry = `100644 blob ${blobHash}\tbridge.json\n`;
    const treeHash = execSync(`git mktree`, { cwd: __dirname, input: treeEntry, encoding: 'utf8' }).trim();
    
    let parentArg = '';
    try {
      execSync('git fetch origin pc-bridge -q', { cwd: __dirname, stdio: 'ignore' });
      const parentHash = execSync('git rev-parse FETCH_HEAD', { cwd: __dirname, encoding: 'utf8' }).trim();
      if (parentHash) parentArg = `-p ${parentHash}`;
    } catch {}

    const commitMsg = `Update live PC bridge endpoint [${new Date().toISOString()}]`;
    const commitHash = execSync(`git commit-tree ${treeHash} ${parentArg} -m "${commitMsg}"`, { cwd: __dirname, encoding: 'utf8' }).trim();
    
    execSync(`git push origin ${commitHash}:refs/heads/pc-bridge --force -q`, { cwd: __dirname, stdio: 'inherit' });
    console.log(`[YEREL AJAN] Başarılı! Canlı köprü URL'si GitHub pc-bridge dalına push edildi.`);
    console.log(`[YEREL AJAN] Tünel Adresi: ${publicUrl}`);
  } catch (err) {
    console.error('[YEREL AJAN] bridge.json push hatası:', err.message);
  } finally {
    try { fs.unlinkSync(tempJson); } catch {}
  }
}

// 3. Tünel İzleyici ve Otomatik Yeniden Bağlanma (Watchdog)
function startTunnel() {
  console.log('[YEREL AJAN] localhost.run SSH tüneli başlatılıyor...');
  const ssh = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-R', `80:localhost:${PORT}`,
    'nokey@localhost.run'
  ]);

  let announced = false;

  const onData = chunk => {
    const text = chunk.toString();
    process.stdout.write(text);
    if (!announced) {
      const match = text.match(/https:\/\/[a-z0-9]+\.lhr\.life/i);
      if (match) {
        announced = true;
        publishBridgeMetadata(match[0]);
      }
    }
  };

  ssh.stdout.on('data', onData);
  ssh.stderr.on('data', onData);

  ssh.on('close', code => {
    console.log(`[YEREL AJAN] Tünel kapandı (kod: ${code}). 5 saniye sonra yeniden bağlanacak...`);
    activeTunnelUrl = null;
    setTimeout(startTunnel, 5000);
  });

  ssh.on('error', err => {
    console.error(`[YEREL AJAN] Tünel hatası: ${err.message}. 5 saniye sonra yeniden denenecek...`);
    activeTunnelUrl = null;
    setTimeout(startTunnel, 5000);
  });
}

// 4. Başlatma
server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`ARMUT V2 — Yerel Köprü ve Bağlantı Ajanı Çalışıyor`);
  console.log(`Yerel Port: http://127.0.0.1:${PORT}`);
  console.log(`Yetki Tokenı: ${TOKEN}`);
  console.log(`====================================================`);
  startTunnel();
});
