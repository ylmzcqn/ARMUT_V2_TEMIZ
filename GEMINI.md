# ARMUT V2 — Otomatik Ajan Bağlamı ve Çalışma Rehberi (10 Kasım 2026)

Bu dosya Antigravity (Yerel ve Bulut) tarafından her oturumda otomatik olarak yüklenir. Kullanıcıya hiçbir geçmişi tekrar sorma; doğrudan aşağıdaki bağlam ve `PROJECT.md` üzerinden **Türkçe** olarak devam et.

## 1. Bağlayıcı Çalışma Kuralları (`AGENTS.md` + Token Tasarrufu)
- **Dil:** Kullanıcıyla her zaman Türkçe konuş.
- **İlk Adım:** Eğer bu bulut çalışma alanında `home-panel.mjs` veya `hub-presence.mjs` henüz görünmüyorsa, çalışma alanını güncellemek için hemen `git pull origin main` komutunu çalıştır.
- **Bağlam Önceliği:** Amaç, güncel durum ve sıradaki iş için önce `PROJECT.md` dosyasını oku; ardından yalnız ilgili güncel kaynakları ve çağıranlarını incele.
- **Sadelik ve Tutarlılık:** Başarı, daha az özel kuralla daha tutarlı ve doğrulanabilir davranıştır. Mevcut ortak yolu kullan; gereksiz paralel mekanizma ve yinelenen belge üretme.
- **Odaklı Doğrulama (Token ve Süre Tasarrufu):**
  - İlgili okumaları ve değişiklikleri grupla (batch).
  - Küçük, düşük riskli değişikliklerde yalnız etkilenen davranışın odaklı testlerini çalıştır (`node --test <ilgili-test>.test.mjs`); her küçük düzenlemeden sonra tüm regresyon paketini tekrarlama.
  - Ortak veya riskli değişikliklerde ve paket tamamlandığında tam regresyon doğrulaması (`node --test` ve `node source-check.mjs`) yap.
  - Kısa sonuç, doğrulama ve kalan sınırları bildir; rutin uzun çıktı ve istenmeyen görsel sunma.
- **Durum ve Yetki Sınırları:**
  - *Planlandı*, *uygulandı*, *test edildi*, *yayımlandı* ve *fiziksel olarak gözlendi* durumlarını birbirinden ayır. Simülasyon veya kaynak testi fiziksel cihaz başarısı değildir.
  - Gizli anahtarları, kişisel veriyi, görüntüleri ve yerel model dosyalarını Git'e ekleme.
  - Kod düzenleme izni; cihaza firmware/OTA yükleme, servis başlatma/durdurma veya dış yayın izni değildir.

---

## 2. Son 5 Codex Oturumu Devir Özeti (6–10 Kasım 2026)
1. **Güvenilir Donanım Haritası (6 Kasım):**
   - Tek kayıt kaynağı `inventory.json` üzerinde ESP32-S3 (45 GPIO) ve Uno tarihsel kapsamı, I2S ortak ses saatleri, GPIO arama/filtreleme, onaylı pin düzenleme/geri alma ve `hardware-report.mjs` CLI/JSON raporu tamamlandı.
2. **Ev Otomasyonu Paneli, Test Alanı, Haftalık Kurallar ve Sahneler (8–9 Kasım):**
   - `home-model.mjs`, `home-runtime.mjs`, `home-panel.mjs` ile `Genel bakış`, `Odalar`, `Kameralar` (Akıcı/Az ışık/Ayrıntılı profiller, MJPEG/JPEG akışı), `Otomasyonlar` (hafta günleri, tekrar aralığı, `Kuralı dene` önizlemesi), `Sahneler` (`Sahneyi dene`, ilerleme ve bağımlılık onaylı silme), `Cihazlar` ve `Geçmiş` filtreleri eklendi.
   - İzole `Test alanı` gerçek veriyi kirletmeden kural ve sahne denemesi sağlar.
3. **Yerel Denetleyici ve ESP-IDF Bileşenleri (9 Kasım):**
   - `server.mjs` (Node.js 22+ bağımlılıksız yerel denetleyici), `controller-devices.mjs`, `firmware/armut_link` ve `firmware/armut_camera_http` hazırlandı. Windows `fsyncSync` uyumluluğu (`openSync(..., 'r+')`) düzeltildi.
4. **Kamera 2 (`camera-02`) Varlık Sensörü & PC'den Bağımsız Cloud Mimari (10 Kasım):**
   - Kullanıcının modemi TP-Link TD-W9980 (Tailscale/cloudflared connector desteklemiyor). PC kapalıyken de çalışması için dışarı doğru HTTPS push mimarisi seçildi.
   - `presence-ingest.mjs`, `cloud-presence-worker.mjs`, `hub-presence.mjs`, `build-cloud.mjs`, `drizzle/0001_presence.sql` ve `firmware/armut_presence_push` hazırlandı.
   - **En Son Mimari Yön (10 Kasım):** Hub (`hub`) tek cloud yayıncısı, `camera-02/presence-radar` ayrı radar kaynağı olarak ayrıldı. Hub ve kamera boot kimlikleri ayrıldı; üç yaş parçası (`measurementAgeMs + hubSyncAgeMs + publishWaitMs`) ve toplamı alıcıda doğrulanarak `<2000ms` tazelik sınırı korundu.
   - **Doğrulama Durumu:** 154 Node testi (`node --test`) ve `node source-check.mjs` eksiksiz geçmektedir.

---

## 3. Sıradaki Açık İşler (Öncelik Sırasıyla)
1. **Hub ↔ Kamera 2 Radar Tazelik (`<2000ms`) Uyumunun Çözülmesi:**
   - Mevcut V1 kaynağındaki 2 sn sync ve 4/8 sn retry bilgisiyle `<2000ms` radar tazeliğinin çakışması değerlendirilecek (öncelik mevcut tam `systemJson`/registry; ağ payı bilinmiyorsa `unknown`; gerekirse sabit hedefli yetkili kısa `GET` alternatifinin etkisi).
2. **Cloud Worker + Veritabanı (D1) Provisioning ve Canlı Yayın:**
   - `cloud-presence-worker.mjs` ve `drizzle/0001_presence.sql` şemasının canlı bulut veritabanına bağlanması ve `PRESENCE_PUBLISH_TOKEN` yayıncı anahtarının güvenli eşleştirilmesi.
3. **Gerçek V1 Firmware Entegrasyonu ve ESP-IDF Derlemesi:**
   - `firmware/armut_presence_push` bileşeninin gerçek V1 (`ESP_ARMUT_V1.1`) snapshot callback'ine bağlanıp ESP-IDF 5.5 ile derlenmesi ve fiziksel radar kabul testi.
4. **Sonraki Aşamalar:**
   - Gerçek `camera-02` radar kabulünden sonra sırasıyla `camera-01` ve `hub` canlı sağlık durumu, ardından ayrı canlı kamera video akışı.
