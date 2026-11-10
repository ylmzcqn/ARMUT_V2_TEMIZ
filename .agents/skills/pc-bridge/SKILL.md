---
name: pc-bridge
description: Connect to, inspect, and execute commands on the local Windows PC from a cloud VM/container or remote IoT agent. Use when running in a cloud/remote environment and you need to access local files (ESP_ARMUT_V1.1, ARMUT_V2_TEMIZ), run PowerShell commands, execute ESP-IDF builds, query home LAN devices (192.168.1.x), or check PC bridge health.
---

# PC Bridge — Buluttan Yerel Bilgisayara Bağlantı ve Komut Çalıştırma Becerisi

Bu beceri, bulut ortamında (Cloud VM, GitHub Codespaces, Cloudflare Workers, bulut IoT ajanı vb.) çalışan bir ajanın, kullanıcının evindeki Windows geliştirme bilgisayarına güvenli HTTPS köprüsü üzerinden bağlanmasını, yerel dosyaları incelemesini ve yerel komutları koşturmasını sağlar.

## 1. Temel İlkeler ve Ağ Sınırları (Zero Unverified Claims)
- **Doğrudan Yerel IP / Tailscale Yasağı:** Bulut VM'leri veya dış servisler evdeki yerel ağ IP'lerine (`192.168.1.x`) veya doğrudan VPN rotası olmayan `100.x.x.x` Tailscale IP'lerine doğrudan erişemez.
- **Genel HTTPS Tüneli:** Bağlantı, Windows bilgisayarda çalışan `runner.mjs` arka plan servisinin açtığı genel HTTPS tüneli (`*.lhr.life/run`) ve Bearer anahtarı ile sağlanır.
- **Canlı Uç Noktası Kaynağı:** Canlı tünel adresi ve token'ı daima GitHub deposunun `origin/pc-bridge` dalındaki `bridge.json` dosyasında tutulur.

## 2. Tünel Durum Kontrolü (Ping)
Herhangi bir işlem yapmadan önce köprünün aktif olup olmadığını doğrulamak için:
```bash
# 1. pc-bridge dalındaki son tünel bilgisini çek
git fetch origin pc-bridge -q

# 2. bridge.json içindeki pingUrl adresine GET isteği atarak sağlık kontrolü yap
node -e "
const { execFileSync } = require('node:child_process');
const bridge = JSON.parse(execFileSync('git', ['show', 'FETCH_HEAD:bridge.json'], { encoding: 'utf8' }));
fetch(bridge.pingUrl).then(r => r.json()).then(console.log).catch(console.error);
"
```
**Beklenen Yanıt:**
```json
{
  "status": "ok",
  "machine": "armut-windows-pc",
  "tunnelUrl": "https://<subdomain>.lhr.life",
  "v2Dir": "C:\\Users\\icanp\\OneDrive\\Belgeler\\ChatGPT\\ARMUT_V2_TEMIZ",
  "v1Dir": "C:\\Users\\icanp\\OneDrive\\Belgeler\\ChatGPT\\ESP_ARMUT_V1.1"
}
```
*Not:* Eğer HTTP 502 ("no tunnel") veya bağlantı hatası alınırsa tünel düşmüştür; yerelde `KOPRU-BASLAT.cmd` dosyasının çalıştırılması gerekir.

## 3. Buluttan Komut Çalıştırma (`pc-run.mjs`)
Yerel bilgisayarda komut çalıştırmak için depodaki `pc-run.mjs` aracı kullanılır:

```bash
# Temel durum ve ortam kontrolü
node pc-run.mjs "Get-Location ; node --version"

# ARMUT V2 testlerini yerel Windows ortamında koşturma
node pc-run.mjs "node --test ; node source-check.mjs" "C:\Users\icanp\OneDrive\Belgeler\ChatGPT\ARMUT_V2_TEMIZ"

# Yerel V1 referans projesini (ESP_ARMUT_V1.1) listeleme
node pc-run.mjs "Get-ChildItem 'C:\Users\icanp\OneDrive\Belgeler\ChatGPT\ESP_ARMUT_V1.1' -Name"

# V1 içerisindeki radar/callback kodunu inceleme
node pc-run.mjs "Get-Content 'C:\Users\icanp\OneDrive\Belgeler\ChatGPT\ESP_ARMUT_V1.1\firmware-idf\src\main.c' -Head 60"

# Ev ağındaki cihazları (192.168.1.118 Hub vb.) Windows PC üzerinden sorgulama
node pc-run.mjs "Invoke-RestMethod -Uri 'http://192.168.1.118/api/devices' -TimeoutSec 3 | ConvertTo-Json -Depth 3"

# ESP-IDF derleme adımı (idf.py build)
node pc-run.mjs "idf.py build" "C:\Users\icanp\OneDrive\Belgeler\ChatGPT\ESP_ARMUT_V1.1\firmware-idf"
```

## 4. Güvenlik ve Geliştirme Kuralları
1. **Salt Okunur Referans Koruması:** `ESP_ARMUT_V1.1` projesi altın referanstır. Bu dizindeki dosyalar kesinlikle salt-okunur incelenmelidir; kullanıcı açıkça istemeden üzerine yazılmaz.
2. **Karakter Kaçışları:** PowerShell komutlarında tek ve çift tırnak hiyerarşisine dikkat edilmeli, kaçış gerektiren karmaşık komutlar yerine sade parçalı komutlar tercih edilmelidir.
3. **Zaman Aşımı Sınırı:** Komutlar en fazla 120 sn (üst sınır 300 sn) çalışabilir. Sonsuz döngü veya etkileşimli (`Read-Host` vb.) komutlar gönderilmemelidir.
4. **Sırların Korunması:** Token'lar komut parametrelerinde değil, `bridge.json` içindeki yetkilendirmeyle otomatik iletilir.
