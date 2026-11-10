# ARMUT V2 — Yerel Ajan İçin Eylem ve Görev Talimatı (10 Kasım 2026)

Bu belge, kullanıcının Windows bilgisayarında (`C:\Users\icanp\OneDrive\Belgeler\ChatGPT\`) yerel olarak çalışan yapay zekâ ajanı için hazırlanmıştır. Kullanıcıdan manuel işlem talep etmeyin; aşağıdaki adımları yerel araç zinciriniz (PowerShell, Node.js 22+, ESP-IDF 5.5 vb.) ile doğrudan yürütün.

---

## 1. İlk Adım: Yerel Çalışma Alanını Güncelleme ve Test Kontrolü
1. `C:\Users\icanp\OneDrive\Belgeler\ChatGPT\ARMUT_V2_TEMIZ` dizinine gidin.
2. `git pull origin main` çalıştırarak buluttaki son commit'leri yerelle eşitleyin.
3. Test paketini çalıştırın:
   ```powershell
   node --test
   node source-check.mjs
   ```

---

## 2. PC Köprüsünü (PC Bridge / Tünel) Yeniden Başlatma
Buluttaki ajanın yereldeki ortamı doğrudan denetleyebilmesi için kullanılan HTTPS köprüsü şu anda `HTTP 502: no tunnel` vermektedir (tünel oturumu sonlanmış).
1. Yerel köprü servisini (PowerShell / Node.js HTTP dinleyici ve localhost.run / Cloudflare / Tailscale tüneli) çalıştırın.
2. Canlı tünel URL'sini ve token'ı `bridge.json` içine yazıp `origin/pc-bridge` dalına push edin:
   ```json
   {
     "updatedAt": "ISO_TIMESTAMP",
     "machine": "armut-windows-pc",
     "publicHttpsUrl": "https://<yeni-tunel-adresi>.lhr.life/run",
     "pingUrl": "https://<yeni-tunel-adresi>.lhr.life/ping",
     "tailscaleUrl": "http://100.82.246.76:8099/run",
     "token": "<guvenli-token>",
     "v2Path": "C:\\Users\\icanp\\OneDrive\\Belgeler\\ChatGPT\\ARMUT_V2_TEMIZ",
     "v1Path": "C:\\Users\\icanp\\OneDrive\\Belgeler\\ChatGPT\\ESP_ARMUT_V1.1"
   }
   ```
3. Böylece buluttaki ajan `node pc-run.mjs "<komut>"` ile yereldeki çıktıları okuyabilir.

---

## 3. Gerçek V1 Firmware Entegrasyonu ve ESP-IDF Derlemesi
**Amaç:** `camera-02` (veya `hub`) cihazının LD2410 radar snapshot'ını dışarı HTTPS ile güvenli şekilde iletmek ve fiziksel kabulü sağlamak.

- **V1 Referans Projesi:** `C:\Users\icanp\OneDrive\Belgeler\ChatGPT\ESP_ARMUT_V1.1` (Salt okunur referans, doğrudan tahrip edilmemeli).
- **V2 Firmware Bileşenleri:** `firmware/armut_presence_push` ve `firmware/armut_link`.

### Yapılacaklar:
1. `ESP_ARMUT_V1.1` projesinde LD2410 radar verisinin üretildiği callback fonksiyonunu inceleyin.
2. `firmware/armut_presence_push` bileşenini V1 derleme hattına bağlayın:
   - `read(context, "presence", &value, &age)` fonksiyonunun gerçek UART radar ölçüm yaşını ve 0/1 varlık durumunu doğru döndürdüğünü doğrulayın.
   - Örnek yaşı yokken veya sensör hazır değilken hata/null dönmelidir (`age=0` geçerli yokluk sayılmaz).
3. ESP-IDF 5.5 ortamında derlemeyi gerçekleştirin:
   ```powershell
   idf.py build
   ```
4. Derleme başarılı olduğunda, OTA veya USB üzerinden test cihazına kontrollü yükleme yapın. Rollback/güvenli boot adımlarını koruyun.
5. Ev ağında radar tazeliğinin `< 2000 ms` sınırını koruduğunu doğrulayın.

---

## 4. Ev Ağındaki Cihazların Canlı Durum Kontrolü
1. Ev ağındaki cihazların (`192.168.1.x`):
   - `camera-02` (Varlık radarı + Kamera)
   - `camera-01` (Kamera)
   - `hub` (Merkez denetleyici)
   canlı durum uçlarını (`GET /api/system` vb.) yerel ağdan çağırarak JSON yanıtlarını ve çalışma durumlarını test edin.
2. Gizli anahtarları ve token'ları Git'e yazmayın veya commit etmeyin.

---

## 5. Tamamlanan Adımları Bildirme
İşlemler tamamlandığında veya bir engelle karşılaşıldığında:
- Yapılan değişiklikleri `git status` ve `git commit` ile yerel dallarda veya `PROJECT.md` güncel durumunda özetleyin.
- Buluttaki ajana köprü veya GitHub üzerinden durumu aktarın.
