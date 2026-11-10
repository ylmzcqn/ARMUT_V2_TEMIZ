---
trigger: always_on
---

# ARMUT GV2 — Codex Cloud Son 5 Oturum Devir Bağlamı (10 Kasım 2026)

Bu proje, Codex Cloud üzerindeki `ylmzcqn/ARMUT_V2_TEMIZ` deposunun en güncel geliştirme dalı olan **`camera02-cloud-publisher-20261110`** üzerinden `ARMUT_GV2` çalışma alanına devralınmıştır.

## 1. Mimari ve Ürün Özeti
- **Ana Hedef:** Home Assistant benzeri, sade, hızlı, bağımlılıksız (saf HTML/CSS/ES modülleri ve Node.js 22+) ve responsive bir kişisel ev otomasyonu paneli (`Genel bakış`, `Odalar`, `Kameralar`, `Otomasyonlar`, `Sahneler`, `Cihazlar`, `Geçmiş`, `Ayarlar`).
- **Tasarım Dili:** Mevcut `Cihazlar` (donanım haritası) sayfasının koyu/yeşil grafik estetiği tüm sayfalarda ortak kullanılır; sayfa başına ayrı tema üretilmez.
- **Donanım Haritası ve Envanter (`inventory.json`):**
  - Hangi cihaz/modülün nereye bağlı olduğunu, hangi GPIO'nun ne için kullanıldığını ve kart kısıtlarını şeffafça gösterir.
  - Bir pinin envanterde kullanılmaması fiziksel olarak boş/uygun olduğunun kanıtı değildir; kaynak, kullanıcı bildirimi, tarihsel gözlem ve çelişki ayrımları korunur.

## 2. Son 5 Codex Oturumunda Tamamlananlar (6–10 Kasım 2026)
1. **Güvenilir Donanım Haritası (6 Kasım):** ESP32-S3 (45 GPIO) ve Uno tarihsel kapsamı, I2S ortak ses saatleri, GPIO arama/filtreleme, onaylı pin düzenleme/geri alma ve `hardware-report.mjs` CLI/JSON raporu tamamlandı.
2. **Ev Otomasyonu Paneli, Test Alanı, Haftalık Kurallar ve Sahneler (8–9 Kasım):**
   - `home-model.mjs`, `home-runtime.mjs`, `home-panel.mjs` ile Odalar, Kameralar (Akıcı/Az ışık/Ayrıntılı profiller, MJPEG/JPEG akışı), Otomasyonlar (hafta günleri, tekrar aralığı, `Kuralı dene` önizlemesi), Sahneler (`Sahneyi dene`, ilerleme ve bağımlılık onaylı silme) ve Geçmiş filtreleri eklendi.
   - İzole `Test alanı` gerçek `localStorage` verisini kirletmeden kural/sahne denemesi sağlar.
3. **Yerel Denetleyici ve ESP-IDF Bileşenleri (9 Kasım):**
   - `server.mjs`, `controller-devices.mjs`, `firmware/armut_link` ve `firmware/armut_camera_http` hazırlandı.
4. **Kamera 2 (`camera-02`) Varlık Sensörü & PC'den Bağımsız Cloud Mimari (10 Kasım):**
   - Kullanıcının modemi TP-Link TD-W9980 (Tailscale/cloudflared connector desteklemiyor). PC kapalıyken de çalışması için dışarı doğru HTTPS push mimarisi seçildi.
   - `presence-ingest.mjs`, `cloud-presence-worker.mjs`, `hub-presence.mjs`, `build-cloud.mjs` ve `drizzle/0001_presence.sql` hazırlandı.
   - **Son Yön (10 Kasım):** Hub (`hub`) tek cloud yayıncısı, `camera-02/presence-radar` ayrı radar kaynağı olarak ayrıldı. Hub ve kamera boot kimlikleri ayrıldı; üç yaş parçası ve toplamı alıcıda doğrulanarak `<2000ms` tazelik sınırı korundu.

## 3. Yerel Bilgisayar Kaynakları ve Çözülen Engeller
- Codex Cloud'da erişilemeyen yerel V1 referans projesi bu bilgisayarda mevcuttur:
  - **V1 Referans Dizini:** `C:\Users\icanp\OneDrive\Belgeler\ChatGPT\ESP_ARMUT_V1.1` (salt okunur referans olarak kullanılmalı; izinsiz değiştirilmemelidir).
- **Windows Test Notu:** `server.mjs` `atomic()` artık geçici dosyayı `openSync(temporary, 'r+')` ile fsync eder ve dizin fsync'inde `EPERM` gibi desteklenmeyen durumları yok sayar (commit 72c7eed). Windows'ta tam paket bu düzeltmeden sonra yeniden doğrulanmalıdır; bu bulut VM'si Linux'tur.
- **Özel Tailscale Bulut / Uzaktan Erişim Adresleri:**
  - Şifresiz Önizleme Paneli: `http://armut.tailcbe65e.ts.net:8080/?v=cloud20261110-10#home` (`http://100.82.246.76:8080/?v=cloud20261110-10#home`)
  - Tam Denetleyici Sunucusu: `http://armut.tailcbe65e.ts.net:8090/login` (`http://100.82.246.76:8090/login`)
- **Yerel Önizleme Sunucusu:** `http://127.0.0.1:8080/?v=cloud20261110-10#home`
