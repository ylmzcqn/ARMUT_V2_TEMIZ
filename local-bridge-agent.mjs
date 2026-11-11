// ARMUT V2 — Yerel Köprü ve Bağlantı Ajanı (Local Relay/Bridge Agent & Watchdog)
// Cloud tarafındaki yapay zekâ ajanlarından gelen istekleri yerel Windows ortamında çalıştırır,
// çıktıları geri döndürür, tünel sağlığını dış uçtan izler ve cloud-hub-sync sürecini canlı tutar.
// Bağımlılıksız Node.js 22+

import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RUNNER_DIR = 'C:\\Users\\icanp\\.gemini\\antigravity\\remote-runner';
const KEY_FILE = path.join(RUNNER_DIR, 'runner-key.txt');
const STATE_FILE = path.join(RUNNER_DIR, 'bridge.json');
const V2_PATH = process.env.V2_PATH || 'C:\\Users\\icanp\\OneDrive\\Belgeler\\ChatGPT\\ARMUT_V2_TEMIZ';
const V1_PATH = process.env.V1_PATH || 'C:\\Users\\icanp\\OneDrive\\Belgeler\\ChatGPT\\ESP_ARMUT_V1.1';
const PORT = Number(process.env.BRIDGE_PORT || 8099);
const MACHINE = process.env.BRIDGE_MACHINE || 'armut-windows-pc';

fs.mkdirSync(RUNNER_DIR, { recursive: true });

let secretKey;
try {
  secretKey = fs.readFileSync(KEY_FILE, 'utf8').trim();
} catch {
  secretKey = '';
}
if (!secretKey) {
  secretKey = process.env.BRIDGE_TOKEN || crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(KEY_FILE, secretKey, { mode: 0o600 });
}

const TOKEN = secretKey;
const digest = v => crypto.createHash('sha256').update(v).digest();

function checkAuth(req) {
  const auth = req.headers['authorization'];
  const supplied = auth && auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return Boolean(supplied && crypto.timingSafeEqual(digest(supplied), digest(TOKEN)));
}

let activeTunnelUrl = null;
let currentSsh = null;
let tunnelHealthFailures = 0;

// 1. Yerel HTTP İşleyici
const server = http.createServer((req, res) => {
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
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      status: 'ok',
      machine: MACHINE,
      uptime: Math.round(process.uptime()),
      tunnel: activeTunnelUrl,
      tunnelUrl: activeTunnelUrl,
      v2Dir: V2_PATH,
      v1Dir: V1_PATH
    }));
    return;
  }

  if (url.pathname === '/run' && req.method === 'POST') {
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        req.destroy();
      }
    });

    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const { cmd, cwd } = parsed;
      const timeoutMs = Math.min(Number(parsed.timeoutMs) || 120000, 300000);
      if (!cmd || typeof cmd !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
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
        stderr += `\n[Zaman aşımı: Komut ${Math.round(timeoutMs / 1000)} saniyeyi aştı ve durduruldu]`;
      }, timeoutMs);

      child.on('close', code => {
        clearTimeout(timer);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          stdout,
          stderr,
          exitCode: code ?? 1,
          error: null
        }));
      });

      child.on('error', err => {
        clearTimeout(timer);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          stdout,
          stderr: err.message,
          exitCode: 1,
          error: err.message
        }));
      });
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// 2. Git Üzerinden bridge.json Güncelleme
function publishBridgeMetadata(publicUrl) {
  activeTunnelUrl = publicUrl;
  tunnelHealthFailures = 0;
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

  const jsonText = JSON.stringify(bridgeData, null, 2);
  try {
    fs.writeFileSync(STATE_FILE, jsonText, 'utf8');
  } catch {}

  const tempJson = path.join(RUNNER_DIR, `.bridge-temp-${process.pid}.json`);
  fs.writeFileSync(tempJson, jsonText, 'utf8');

  try {
    console.log('[YEREL AJAN] bridge.json pc-bridge dalına aktarılıyor...');
    const blobHash = execSync(`git hash-object -w "${tempJson}"`, { cwd: V2_PATH, encoding: 'utf8' }).trim();
    const treeEntry = `100644 blob ${blobHash}\tbridge.json\n`;
    const treeHash = execSync('git mktree', { cwd: V2_PATH, input: treeEntry, encoding: 'utf8' }).trim();

    let parentArg = '';
    try {
      execSync('git fetch origin pc-bridge -q', { cwd: V2_PATH, stdio: 'ignore' });
      const parentHash = execSync('git rev-parse FETCH_HEAD', { cwd: V2_PATH, encoding: 'utf8' }).trim();
      if (parentHash) parentArg = `-p ${parentHash}`;
    } catch {}

    const commitMsg = `Update live PC bridge endpoint [${new Date().toISOString()}]`;
    const commitHash = execSync(`git commit-tree ${treeHash} ${parentArg} -m "${commitMsg}"`, { cwd: V2_PATH, encoding: 'utf8' }).trim();

    execSync(`git push origin ${commitHash}:refs/heads/pc-bridge --force -q`, { cwd: V2_PATH, stdio: 'inherit' });
    console.log(`[YEREL AJAN] Başarılı! Canlı köprü URL'si GitHub pc-bridge dalına push edildi: ${publicUrl}`);
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
    '-o', 'ServerAliveInterval=20',
    '-o', 'ServerAliveCountMax=2',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', `80:127.0.0.1:${PORT}`,
    'nokey@localhost.run'
  ]);
  currentSsh = ssh;

  // 25 saniye içinde URL alınamazsa zorla yeniden başlat
  const startupTimer = setTimeout(() => {
    if (currentSsh === ssh && !activeTunnelUrl) {
      console.warn('[YEREL AJAN] 25 sn içinde tünel URL alınamadı, SSH yeniden başlatılıyor...');
      try { ssh.kill(); } catch {}
    }
  }, 25000);

  const onData = chunk => {
    const text = chunk.toString('utf8');
    process.stdout.write(text);
    const matches = text.match(/https:\/\/[a-z0-9-]+\.lhr\.life/gi);
    if (matches && matches.length > 0) {
      const latestUrl = matches[matches.length - 1];
      if (latestUrl !== activeTunnelUrl) {
        clearTimeout(startupTimer);
        publishBridgeMetadata(latestUrl);
      }
    }
  };

  ssh.stdout.on('data', onData);
  ssh.stderr.on('data', onData);

  ssh.on('close', code => {
    clearTimeout(startupTimer);
    if (currentSsh === ssh) {
      currentSsh = null;
      activeTunnelUrl = null;
    }
    console.log(`[YEREL AJAN] Tünel kapandı (kod: ${code}). 3 saniye sonra yeniden bağlanacak...`);
    setTimeout(startTunnel, 3000);
  });

  ssh.on('error', err => {
    clearTimeout(startupTimer);
    console.error(`[YEREL AJAN] Tünel hatası: ${err.message}.`);
  });
}

// 4. Dış Uçtan Canlı Tünel Sağlık Kontrolü (502 / Düşme Koruması)
setInterval(async () => {
  if (!activeTunnelUrl || !currentSsh) return;
  try {
    const res = await fetch(`${activeTunnelUrl}/ping`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      tunnelHealthFailures = 0;
    } else {
      tunnelHealthFailures++;
      console.warn(`[YEREL AJAN] Dış tünel ping HTTP ${res.status} (${tunnelHealthFailures}/2)`);
    }
  } catch (err) {
    tunnelHealthFailures++;
    console.warn(`[YEREL AJAN] Dış tünel ping hatası: ${err.message} (${tunnelHealthFailures}/2)`);
  }
  if (tunnelHealthFailures >= 2 && currentSsh) {
    console.warn('[YEREL AJAN] Tünel dışarıdan yanıt vermiyor (502/kopuk). Tünel yenileniyor...');
    tunnelHealthFailures = 0;
    try { currentSsh.kill(); } catch {}
  }
}, 25000);

// 5. Cloud-Hub-Sync Sürecini Gözetleme (Supervisor)
function startCloudSyncSupervisor() {
  const syncScript = path.join(V2_PATH, 'cloud-hub-sync.mjs');
  if (!fs.existsSync(syncScript)) return;
  const child = spawn(process.execPath, [syncScript], {
    cwd: V2_PATH,
    stdio: 'inherit'
  });
  child.on('close', code => {
    setTimeout(startCloudSyncSupervisor, 3000);
  });
  child.on('error', () => {
    setTimeout(startCloudSyncSupervisor, 5000);
  });
}

process.on('uncaughtException', err => {
  console.error('[YEREL AJAN] Uncaught exception:', err.message);
});
process.on('unhandledRejection', err => {
  console.error('[YEREL AJAN] Unhandled rejection:', err);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[YEREL AJAN] Port ${PORT} zaten kullanımda. Mevcut köprü aktif.`);
    process.exit(0);
  }
  console.error('[YEREL AJAN] Sunucu hatası:', err.message);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log('ARMUT V2 — Yerel Köprü ve Bağlantı Ajanı Çalışıyor');
  console.log(`Yerel Port: http://127.0.0.1:${PORT}`);
  console.log('====================================================');
  startTunnel();
  startCloudSyncSupervisor();
});
