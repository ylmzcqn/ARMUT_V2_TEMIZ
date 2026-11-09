# ARMUT — yerel kurulum

Bu paket, mevcut minimal paneli ve aynı evde çalışan Node.js denetleyicisini içerir. Ek npm paketi veya veritabanı kurulumu gerekmez. Node.js 22 veya üzeri gerekir.

## İlk açılış

1. Paketi bilgisayarınızda kalıcı bir klasöre çıkarın.
2. Windows'ta `BASLAT.cmd`, Linux/macOS'ta `sh baslat.sh` çalıştırın. Alternatif: klasörde `node server.mjs`.
3. Tarayıcıda `http://127.0.0.1:8080/login` açın. Giriş anahtarı oluşan `local-data/admin-key.txt` dosyasındadır; onu giriş ekranına yapıştırın.
4. Panel artık **Yerel denetleyici** modundadır. Bu işlem açık kaldığı sürece otomasyonlar panel sekmesi kapalıyken de çalışır. Bilgisayarın kapanması/uyuması denetleyiciyi durdurur.

## ESP32'lerin bağlanması

Varsayılan sunum yalnız bu bilgisayardadır. ESP32'lerin bilgisayara ulaşması için ev ağına açın:

- Windows: `ESP32-LAN-BASLAT.cmd`.
- Linux/macOS: `ARMUT_HOST=0.0.0.0 node server.mjs`.

Tarayıcı ve firmware adresi bilgisayarın ev ağındaki IP'sini kullanır; örneğin `http://192.168.1.50:8080`. IP burada örnektir. Router'ın DHCP rezervasyonuyla bu bilgisayara sabit adres vermek yararlıdır. Bilgisayar güvenlik duvarı bu portu yalnız özel ev ağı için açmalıdır. Router'da internet port yönlendirmesi yapmayın.

1. **Ayarlar → Yerel denetleyici → Cihaz kaydet** ile kimlik, ad ve rolü kaydedin. Mevcut `hub`, `camera-01`, `camera-02` kimlikleri doğru rolle kullanılabilir.
2. Tek gösterimlik cihaz anahtarını firmware yapılandırmasına alın. Tarayıcıya veya Git'e kaydetmeyin.
3. `firmware/armut_link` bileşenini ESP-IDF projesine ekleyin. Sunucu adresi/kimlik/anahtar ve kendi gerçek sensör/çıkış callback'lerinizi tanımlayın; ayrıntılar `docs/ESP32-INTEGRATION.md` içindedir. Bileşen Wi-Fi'yi veya donanım pinlerini tahmin etmez.
4. İlk raporda cihazın bildirdiği işlevler otomatik eklenir. Panelden adını ve odasını düzenleyin; güncel durumunu kontrol edin.
5. Önce **Kuralı dene / Sahneyi dene**, ardından izin verdiğiniz gerçek aç/kapat işlemini doğrulayın. Komut ancak cihaz uyguladığını bildirdiğinde başarılı olur.

Bu tek seferlik firmware/provizyon adımları tamamlanmadan ESP'yi açmak kendi başına bağlantı oluşturmaz. Bu geliştirmede cihazınıza firmware yüklenmedi.

## Kameralar

Mevcut JPEG/MJPEG uçları kullanılabilir. ESP-IDF için `firmware/armut_camera_http` bileşeni de vardır; önceden başlatılmış `esp32-camera` sürücüsüne `/camera.jpg`, `/stream`, `/profile` uçlarını ekler. Kamera pinleri gerçek karta göre firmware tarafında belirlenir.

Kameralar sayfasında görüntü adresini `http://KAMERA-IP/stream`, profil adresini `http://KAMERA-IP/profile` olarak girin. Cihaz kimliği kayıtlı kamerayla eşleşmelidir. Yerel panel görüntüyü yetkili aynı-kaynak proxy üzerinden alır; tarayıcıya kamera anahtarı verilmez. Akıcı/Az ışık/Ayrıntılı profilleri vardır; 25 FPS gerçek sensör, PSRAM, saat ve Wi-Fi koşullarında ayrıca ölçülmelidir. Servo veya APK yoktur.

## Saklama ve yedek

`local-data` gerçek ev kayıtlarını ve özel anahtarları içerir. Bu klasörü silmeyin veya Git'e göndermeyin. Paneldeki ev yedeği ayarları taşır; özel cihaz anahtarlarını içermez. Tam kurtarma için `local-data` klasörünün bilgisayarınızda güvenli bir kopyasını ayrıca tutun. Bozuk dosya otomatik sıfırlanmaz.

Özel Cloud adresi statik önizleme ve tarayıcı test modu olarak kullanılmaya devam eder. Ev ağındaki bu sunucuyu Cloud üzerinden çalıştırmaz. İnternete açık hosting, VPN veya sürekli servis kurulumu bu pakette otomatik yapılmaz.

## Doğrulama sınırı

Node birim ve gerçek HTTP entegrasyon testleri, yeniden başlatma/ACK/kalıcılık testleri ve C host protokol testleri uygulanmıştır. Bu ortamda ESP-IDF araç zinciri ve fiziksel kartlar bulunmadığından gerçek IDF derlemesi, yükleme, kamera görüntüsü ve elektriksel davranış doğrulanmadı. Önce kendi kartında bu adımları doğrulayın; test modu fiziksel başarı kanıtı değildir.
