---
name: yerel
description: Alias for pc-bridge. Connect to, inspect, and execute commands on the local Windows PC from the cloud or local agent environment. Triggers on '/yerel' or 'yerel'.
---

# Yerel (PC Bridge) Becerisi

Bu beceri `/pc-bridge` ile tamamen aynıdır. Kullanıcı `/yerel` veya `yerel` yazdığında çalışır.

Buluttan veya yerelden Windows bilgisayara bağlanmak, dosya incelemek ve komut çalıştırmak için `pc-bridge` talimatlarını uygulayın:

## 1. Hızlı Sağlık Kontrolü (Ping)
```bash
git fetch origin pc-bridge -q
node -e "
const { execFileSync } = require('node:child_process');
const bridge = JSON.parse(execFileSync('git', ['show', 'FETCH_HEAD:bridge.json'], { encoding: 'utf8' }));
fetch(bridge.pingUrl).then(r => r.json()).then(console.log).catch(console.error);
"
```

## 2. Komut Çalıştırma
```bash
node pc-run.mjs "<powershell-komutu>" [çalışma-dizini]
```

Ayrıntılı rehber için `pc-bridge` beceri belgesini inceleyin.
