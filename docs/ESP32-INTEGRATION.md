# ESP32 yerel kontrolcü bağlantısı

`firmware/armut_link`, ESP-IDF 5.5 için yeniden kullanılabilir C bileşenidir. Wi-Fi/Ethernet, GPIO, kart başlangıcı, sensör sürücüleri veya OTA kurmaz. Çalışan ağa ve uygulamanın doğruladığı sürücülere bağlanır. Pin, besleme ve kart revizyonu bu bileşenle doğrulanmış olmaz.

## Güncel Hub sözleşmesi

Hub merkezli akış onaylandı. Aşağıdaki doğrudan Kamera 2 bileşenini aktif yayıncı olarak yüklemeyin. Güncel Worker, Hub kimliği ile kamera kaynak kimliğini ayrı doğrular. Eski doğrudan C yayıncı henüz yeni Hub envelope’u göndermez; yedek aday olarak korunmuştur. Gerçek Hub task entegrasyonu yerel V1 tarafında yapılacaktır.

Hello mevcut alanlara `publisherId:"hub"` ekler. `bootId` Hub yayıncı oturumudur. Report ayrıca `sourceBootId` (Kamera 2 boot_health.boot_id), `sourceSampleAgeMs`, `hubResidenceMs`, `sourceTransitMs` taşır; bunların toplamı `sampleAgeMs` ile birebir eşleşmelidir. Kaynak geçersizse value/sampleAgeMs ve üç yaş alanı null; sourceBootId biliniyorsa korunabilir, bilinmiyorsa null. Token yalnız Hub’da provision edilir. Nonce/sequence/sinceLeaseMs mekanizması değişmedi. Receiver sabit source camera-02/presence-radar dışında cihazı henüz kabul etmez; ilk gerçek kabul sonrası diğer sağlık kaynakları eklenir.

`normalizeHubPresence({system,systemAgeMs,sourceTransitMs},{expectedHostname,expectedRole})` saf referans normalleştiricisidir; yerel Hub uygulaması gerçek güncel registry yaşını ve ölçülmüş/bounded ağ payını sağlamalıdır. Eski snapshot yeniden okununca yaş sıfırlanmaz.

### Radar Tazelik Uyum Kararı (<2000ms)
- **V1 Sync Kısıtı:** Kamera 2'nin Hub'a `/api/node/sync` push döngüsü 2000 ms, hata durumunda 4000/8000 ms'dir. Tek yönlü push'ta ağ gecikmesi (`sourceTransitMs`) saat senkronizasyonu olmadan tam ölçülemez. Hub'da bekleme (`hubResidenceMs`) 0–2000 ms arasında salınır; sensör UART yaşı (`sourceSampleAgeMs`) ve ağ payı eklendiğinde döngü sonlarında toplam yaş 2000 ms sınırını aşarak düzenli olarak `null` (bilinmiyor) durumuna düşer (flicker).
- **Kesin Çözüm (Önerilen Birincil Yol):** Hub, Kamera 2'nin mevcut `GET /api/system` (Bearer token korumalı) ucuna 1000 ms aralıklı, 800 ms zaman aşımlı, tek eşzamanlı kısa GET isteği yapar.
  1. `sourceTransitMs` bizzat Hub tarafından ölçülür (`requestDurationMs`).
  2. Hub içi bekleme (`hubResidenceMs`) 0–1000 ms aralığında kalır.
  3. Toplam yaş (`sourceSampleAgeMs` + `requestDurationMs` + `hubResidenceMs`) daima 100–1150 ms bandında kalarak 2000 ms sınırını tavizsiz ve kesintisiz karşılar.
  4. Kamera 2'de firmware değişikliği veya OTA gerektirmez; mevcut V1 HTTP API'si korunur.
- **Yedek (Pasif Sync) Davranışı:** Hub yerel olarak GET yapamıyorsa ve yalnız `/api/node/sync` registry verisini kullanıyorsa, ağ payı bilinmiyorsa veya toplam yaş ≥2000 ms ise veri kesinlikle `null` döner; <2000 ms güvenlik sınırı asla gevşetilmez. Ayrıntılar mevcut [mimari](ARCHITECTURE.md#güncel-karar-hub-merkezli-akış) içindedir.

## Kamera 2 doğrudan cloud yayın bileşeni — yedek aday

Kullanıcı PC’den bağımsız dışarı HTTPS yayınını seçti. `firmware/armut_presence_push`, aynı IDF projesine `EXTRA_COMPONENT_DIRS` ve uygulamanın `REQUIRES` listesine eklenir. `armut_link` yalnız ortak read callback türü için bağımlılıktır; eski armut_link rapor task’ını ayrıca başlatmayın. V1’in kendi yerel Hub sync işlevini değiştirmek gerekmez. Sertifika bundle için `CONFIG_MBEDTLS_CERTIFICATE_BUNDLE=y` gerekir; mevcut Wi-Fi ve güvenilir saat/SNTP hazır olduktan sonra başlatılır.

```c
#include "armut_presence_push.h"
/* Uygulama tarafından sağlanan, mevcut radar sürücüsüne salt okunur köprü.
 * channel="presence": value yalnız 0/1, age gerçek son UART çerçevesinin yaşı.
 * enabled/driver_ready/online doğru değilse ESP_ERR_INVALID_STATE döndürür.
 * Yeni UART okuması veya ağ isteği yapmaz; thread-safe snapshot kopyalar. */
extern esp_err_t read_existing_radar_snapshot(void *, const char *, double *, uint32_t *);

esp_err_t start_cloud_presence(const char *origin, const char *publisher_key,
                               const char *site_access_key, void *radar_context,
                               armut_presence_push_handle_t *handle)
{
    armut_presence_push_config_t config = {
        .origin=origin, .publisher_key=publisher_key, .site_access_key=site_access_key,
        .read=read_existing_radar_snapshot, .context=radar_context,
    };
    return armut_presence_push_start(&config, handle);
}
```

Bu snippet bir pin/sensör sürücüsü değildir ve `read_existing_radar_snapshot` mevcut V1 çalışma kopyasına henüz bağlanmadı. Yerel kaynakta doğrulanan `radar.enabled/driver_ready/online/presence/sample_age_ms` verilerinden bu callback oluşturulmalı; yanlış profil/Kamera 1/Hub kaynakları varlık üretmemeli. Kamera 2 GPIO40/39 profili ve çalışan mevcut sürücü korunur. Kaynak `sample_age_ms=0` ama online=false ise geçerli yokluk üretmeyin.

Başlangıçta fiziksel çıkış veya komut yoktur. Okuma hatası/geçersiz value/yaş≥2000, raporda `value:null,sampleAgeMs:null` üretir. Cihaz anahtarları başlangıçta kopyalanır; context ve snapshot sürücüsü başarılı stop’a kadar yaşamalıdır. `armut_presence_push_stop(handle,10000)` timeout dönerse context/handle bırakılmaz; sonra stop tekrar denenir. Sensör task’ı yayıncıdan bağımsız kalır. Cloud DB/şema/servis erişimi ve gerçek IDF derlemesi/OTA devreye alma kapsamıdır; host testleri bunları kanıtlamaz. Güncel mimari ve kabul sınırı [ARCHITECTURE.md](ARCHITECTURE.md#seçilen-ve-uygulanan-mimari-cihazdan-dışarı-https--10-kasım-2026) içindedir.

Aşağıdaki GET yolu, mevcut API sözleşmesinin kanıtı ve yerel test/okuma alternatifi olarak korunur; cloud için yeni seçilen yol değildir.

## Mevcut Kamera 2 firmware’iyle USB’siz geçiş — 10 Kasım 2026

İlk tercih yeni firmware yüklemek değil, mevcut Kamera 2’nin `GET /api/system` çıktısını ev ağındaki yerel denetleyicide salt okunur adaptörle okumaktır. Aşağıdaki uç ve dosyalar yerel kaynak incelemesinden aktarılmış kanıttır; bu cloud oturumu özgün dosyaların tamamını veya kurulu cihazı incelemedi.

- `firmware-idf/src/camera/Camera.cpp:967-975`: `GET /api/system`, `POST /api/firmware` kayıtları.
- `firmware-idf/src/camera/SystemStatus.cpp:54,76`: sistem çıktısına radar ve OTA bilgisinin eklenmesi.
- `firmware-idf/src/common/Radar.cpp:111-124`: `radar` ve `components` içinde `presence-radar`. Mevcut V2 kaynak parçası bileşende `owner_device_id=camera-02`, `kind=ld2410c`, `model=HLK-LD2410C`, `online`, `value` ve `presence` alanlarını gösterir.
- `upload_ota.py:40,78-96`: hedef ön kontrolü, tek POST, hostname/SHA256 başlıkları ve belirsiz yazma makbuzu; cihaz işleyicisi `FirmwareUpload.cpp`, Kamera 2 bölüm tablosu `firmware-idf/partitions.camera-02.csv`.

### Adaptörün sınırı ve eşleme hazırlığı

1. Mevcut `camera-02` ve `presence-radar` kimliklerini kullan; yeni cihaz/modül veya ikinci varlık kaydı oluşturma. Envanter ile canlı ölçüm ayrı tutulur.
2. `GET /api/system` Bearer cihaz API tokenı ister; JSON/no-store, yetkisiz istekte 401 `{}`, bellek yetersizliğinde 503. Handler CORS izni eklemez. İleride yalnız yerel güvenilir köprü kullanılır; token tarayıcı paketine, envantere, Git’e veya loga konmaz. Kaynak: `Camera.cpp:734-750,856-873,967-969`.
3. Üst zarfta beklenen yerel `hostname` ve `role` doğrulanır. `firmware`, `build`, `boot_health.boot_id` (hex), `elf_sha256`, `healthy`, `pending_verification` izlenir. Boot değişimi önceki varlık gözlemini siler. Kimlik beklentisi yerelde verilir; cloud koduna gerçek adres/hostname aktarılmaz.
4. `components[]` içinde tek `id=presence-radar`, `owner_device_id=camera-02` ve `radar.installed_on=camera-02` gerekir. Asıl değer/tazelik kaynağı `radar` nesnesidir; bileşenin online veya boolean aynalama alanları çelişirse sonuç bilinmiyor olur.
5. `radar.enabled`, `driver_ready`, `online` kesin true; `presence` boolean; sonlu `0 <= sample_age_ms < 2000` olmalıdır. `false` geçerli yokluktur. Eksik/null/hatalı/eski örnek veya HTTP/istek hatası bilinmiyor olur; eski varlık korunmaz. `last_byte_age_ms` kullanılmaz. Hiç örnek yokken firmware age=0 döndürebilir; online=false olduğundan kabul edilmez. Kaynak: `Radar.cpp:58-105`.
6. Muhafazakâr yaş = cihaz `sample_age_ms` + GET istek süresi + alımdan beri monoton geçen süre. 2000 ms ve üzeri canlı sayılmaz. Duvar saati kullanılmaz. İstek süresi ölçümünü ileride yerel taşıyıcı sağlar; ayrıştırıcı ağ erişimi yapmaz.

### Uygulanan saf ayrıştırıcı

`legacy-camera-status.mjs` → `createCameraPresenceState({expectedHostname, expectedRole, now?})`:

- `accept({status, body, requestDurationMs})`: ayrıştırılmış sahte/yerel JSON yanıtını değerlendirir. Token, URL veya ağ erişimi almaz. JSON boyut sınırı ve JSON ayrıştırma hatası taşıyıcı katmanın sorumluluğudur.
- `snapshot()`: `deviceId`, `componentId`, `value` (boolean/null), `fresh`, `ageMs`, sabit neden kodu ve seçili firmware/boot metaverisini verir. Gözlem beklerken yaş artar. Saat gerilerse gözlem iptal edilir.
- `invalidate('network'|'timeout'|'aborted')`: istek hatasında eski gözlemi derhal iptal eder. Dış hata metnini çıktıya taşımaz.

Yedi Node testi tamamen sentetik yanıtlarla kimlik/rol, bozuk/eksik/çelişen veri, 2000 ms sınırı, geçerli false, örneksizlik, gecikme, saat gerilemesi, boot değişimi ve HTTP/istek hatasını kapsar. Girdi değiştirilmez; envanter veya cihaz kaydı yazılmaz.

`legacy-camera-provider.mjs`, mevcut API’ye yalnız GET yapar; Bearer cihaz tokenı yalnız Node sürecinde kalır. JSON 256 KiB, istek/gövde 1000 ms ile sınırlıdır; redirect yoktur. Tek eşzamanlı okuma ve mevcut runtime provider yolu kullanılır. Hata/eksik ölçüm açık null gözlem üretir. Kaynak 1000 ms arayla sorgulanır; başarılı GET sensör yaşını sıfırlamaz.

Mevcut `camera-02` cihaz kaydı korunur. Panelde aynı varlık işlevi varsa kullanılır; yoksa fiziksel `presence-radar` için bir mantıksal işlev görünümü eşlenir. Bu eşleme gereklidir çünkü ev paneli `home.entities` üzerinden gösterir; envanterdeki pin/modül kartı canlı işlev yerine geçmez. İkinci cihaz, cihaz anahtarı veya rapor/komut protokolü oluşturulmaz. Belirsiz birden fazla varlık işlevi veya aynı cihaz için paralel push kaynağı başlangıçta reddedilir.

`home-runtime` kaynaktaki `maxAgeMs=2000` sınırını monoton saatle uygular ve null gözlemi eski değerin yerine koyar. Sunucunun mevcut `/api/state` yolu bu sınırı tarayıcıya taşır; `remote-home` istek süresini de yaşa ekler. Cloud için sınırlı `/api/presence` GET yolu aynı runtime’dan yalnız radar özetini verir. `local-presence` istemcisi de aynı runtime’a bağlanır. Bu kaynağın gözlemleri salt okunurdur; mevcut otomasyonları veya fiziksel çıkışları tetiklemez.

### Yerel kabul ve OTA

Mevcut uç çalışıyorsa okuma için firmware değişikliği ve USB gerekmez. Kaynakta OTA bulunması cihazda OTA’nın çalıştığını veya bu cloud ortamından erişilebildiğini kanıtlamaz. Ağ erişimi ve canlı doğrulama bu aşamada yapılmaz. Daha sonra ayrıca yetkilendirilmiş yerel doğrulamada doğru cihaz, kurulu sürüm ve gerçek bölüm düzeni eşlenir. Firmware değişikliği gerçekten gerekirse geri dönüş imkânı doğrulanır ve ayrı açık yükleme yetkisi alınır; belirsiz yükleme tekrarlanmaz.

Durum: kaynak sözleşmesi, ayrıştırıcı, yerel GET taşıyıcısı ve panel veri yolu uygulandı; yalnız sentetik yanıtlarla doğrulandı. Gerçek cihaz ve tarayıcı yerel ağ kabulü açık; cihaz erişimi, OTA, servis değişikliği ve yeni yayın yapılmadı.

## Dahil etme

ESP-IDF projesinin ana `CMakeLists.txt` dosyasında `project(...)` öncesinde bileşen yolunu ekleyin:

```cmake
set(EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/path/to/firmware/armut_link")
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(my_device)
```

Uygulama bileşeninin `idf_component_register` çağrısına `REQUIRES armut_link` ekleyin. Bileşenin bağımlılıkları `esp_http_client`, `json`, `esp_timer`, `esp_system` ve ESP-IDF FreeRTOS'tur.

Yerel panelde cihaz kaydından alınan kimlik, rol ve yalnız bir kez gösterilen cihaz anahtarı aynı olmalıdır. Anahtarı Git'e, örnek koda, loglara veya herkese açık `sdkconfig` dosyasına yazmayın. Uygulamanın güvenli provisioning/depolama katmanından çalışma anında verin. Aşağıdaki iskelet anahtar veya gerçek pin içermez:

```c
#include "armut_link.h"

/* Uygulama sürücüleri tarafından sağlanır; burada GPIO varsayımı yapılmaz. */
extern esp_err_t read_observed_channel(void *ctx, const char *channel,
                                      double *value, uint32_t *age_ms);
extern esp_err_t set_confirmed_switch(void *ctx, const char *channel,
                                     bool desired, bool *actual);

static armut_link_handle_t link;

esp_err_t start_controller_link(const char *origin, const char *provisioned_id,
                                const char *provisioned_key, const char *ca_pem,
                                void *driver_context)
{
    static const armut_channel_t channels[] = {
        {.id="relay", .name="Anahtar", .kind=ARMUT_SWITCH},
        {.id="presence", .name="Varlık", .kind=ARMUT_PRESENCE},
        {.id="temperature", .name="Sıcaklık", .unit="°C", .kind=ARMUT_SENSOR},
    };
    armut_link_config_t cfg = {
        .server_url=origin, .device_id=provisioned_id,
        .device_key=provisioned_key, .role="node",
        .server_cert_pem=ca_pem, .channels=channels,
        .channel_count=sizeof(channels)/sizeof(channels[0]),
        .read=read_observed_channel, .apply=set_confirmed_switch,
        .context=driver_context, .timeout_ms=3000,
    };
    /* Ağ hazır olduktan sonra çağrılır. Başlangıçta fiziksel komut verilmez. */
    return armut_link_start(&cfg, &link);
}

esp_err_t stop_controller_link(void)
{
    esp_err_t err = armut_link_stop(link, 12000);
    if (err == ESP_OK) link = NULL;
    return err;
}
```

`origin`, ESP'nin erişebildiği denetleyici kök adresidir; son `/`, yol veya sorgu eklemeyin. Bilgisayarın `127.0.0.1` adresi ESP'den bilgisayara ulaşmaz. Kontrolcünün LAN'a dinleme ayarı ve ağ erişimi ayrıca hazırlanmalıdır; bu paket servis başlatmaz. HTTP anahtarı şifrelemez; güvenilir yerel ağ dışında HTTPS kullanın. HTTPS için güvenilen sunucu CA PEM'ini verin; sertifika doğrulaması kapatılmaz. Ağ sürücüsü, sistem saati ve TLS kurulumu uygulamanın sorumluluğudur.

## Callback ve ömür sözleşmesi

- `read` her raporda aynı link task'ında çağrılır. Switch/presence için yalnız `0`/`1`, sensör için sonlu sayısal değer ve ölçümün yaşı döner. Okuma hatasında kanal o rapordan çıkarılır. İlk raporda başarılı okunan kanallar kaydedilir; sonraki raporda tekrar gönderilebilir.
- `apply` yalnız kayıtlı switch kanalına, doğru `bootId` ve yeni komut `sequence` değeriyle çağrılır. İstenen durum atamadır; toggle değildir. Başarı yalnız fiziksel uygulama doğrulanınca `ESP_OK` döndürülerek bildirilir. Hata durumunda da gözlenen `actual` değeri doldurulur; hedefle uyuşmazlık başarısız ACK olur. Cihazın elektriksel güvenlik ve sahiplik denetimleri bu callback'te korunmalıdır.
- Callback'ler kısa ve süre sınırı olan işlemler yapmalıdır. `context` nesnesi `stop` tamamlanana kadar yaşamalıdır. Bileşen yapılandırma dizelerini/kanalları kopyalar. Callback'ten `stop` çağrılmaz. Aynı handle üzerinde eşzamanlı `stop` çağrısı yapılmaz; başarılı stop sonrası handle tekrar kullanılmaz. Timeout'ta handle geçerlidir; uygulama callback'i tamamladıktan sonra stop tekrar çağrılabilir.
- Link başlangıcı veya ağ geri gelişi röleye varsayılan değer yazmaz. Başlangıç fiziksel güvenli durumu uygulamanın kart sürücüsünün sorumluluğundadır. Ağ hatasında kendiliğinden eski komut tekrar uygulanmaz.

## Protokol ve sınırlar

`POST /api/device/report` Bearer anahtarıyla `version:1`, `deviceId`, `role`, rastgele `bootId`, monoton rapor `sequence`, `capabilities:[]`, kanallar ve önceki komut ACK'lerini gönderir. Response `commands` öğeleri `{commandId, channelId, value, bootId, sequence}` içerir. Sunucu komut sırası cihaz başına monoton ve kalıcıdır. ACK `{commandId, applied, value}` sonraki raporda gider; başarılı, geçerli v1 yanıt alınana kadar tutulur. Sunucu raporu kabul edip yanıt kaybolursa ACK yeniden gönderilebilir; fiziksel komut yeniden uygulanmaz.

Boot boyunca yüksek komut sıra değeri ve son 32 komutun ACK sonucu bellekte tutulur. Aynı kimlik+sıra ACK'i yeniden işaretler; cache'ten düşmüş eski sıra uygulanmaz. Yeni boot eski boot komutlarını reddeder. Komutlar sunucudan sıra düzeninde gelmelidir. Cihaz yeniden başladığında yeni boot, sunucunun yeni raporu görmesini gerektirir; eski komutlar oynatılmaz.

Cihaz ve kanal kimliği en fazla 96 ASCII karakterdir ve `[A-Za-z0-9][A-Za-z0-9_.-]*` biçimindedir; insan tarafından okunan kanal adı en fazla 63 UTF-8 bayttır. En fazla 16 kanal, 8 KiB yanıt, 16 kat JSON derinliği, 32 komut/yanıt, 32 ACK cache kaydı vardır. Rapor sırası JavaScript güvenli tamsayı aralığında kalır. HTTP işlem beklemesi varsayılan 3 sn (100–10000 ms ayarlanabilir), yanıt okuma süre sınırı ayrıca denetlenir. Ağ hatasında 2 sn rapor aralığıyla yeniden rapor gönderilir; başarılı sunucu yanıtı aralığı 250–60000 ms arasında değiştirebilir. Task yığını 6144 bayttır; gerçek kartta yığın/heap ölçümü gereklidir.

## Doğrulanan ve açık kalan

`firmware/tests/run-host-tests.sh` Linux `cc` ve sistem `libcjson.so.1` ile protokol yardımcılarını çalıştırır. Host SDK stub'ları yalnız test içindir; ESP-IDF bileşenine dahil edilmez. Testler doğru/yanlış boot, tekrar komut, eski sıra, bilinmeyen kanal, 32 kaydın aşılması, ACK ve bool telemetriyi kapsar.

Bu ortamda `idf.py` bulunmadığı için gerçek ESP-IDF 5.5 derlemesi, TLS/HTTP taşıma davranışı, ağ kopması, task yığını ve fiziksel callback doğrulanmadı. ESP erişimi, flash/OTA veya gerçek GPIO denemesi yapılmadı. Donanım kabulünde önce `idf.py build`, ardından kart özel güvenli başlangıç, ölçüm yaşı, yeniden başlatma/yanlış boot/tekrar komut ve ACK eşleşmesi gözlenmelidir.

## Hazır kamera sürücüsü için HTTP adaptörü

`firmware/armut_camera_http` ayrı, isteğe bağlı ESP-IDF 5.5 bileşenidir. `idf_component.yml`, managed dependency olarak **espressif/esp32-camera 2.1.3** sürümünü sabitler. Projenin `EXTRA_COMPONENT_DIRS` listesine bu klasörü, uygulamanın `REQUIRES` listesine `armut_camera_http` ekleyin. İlk IDF derlemesinde component manager bağımlılığı indirir; bu belge derleme yapıldığını iddia etmez.

Adaptör zaten başlatılmış, JPEG üreten kamera sürücüsünü ve çalışan `esp_http_server` handle'ını alır. `esp_camera_init`, Wi-Fi, GPIO, güç, servo, flash veya OTA işlemi yapmaz. Başlangıçta profil uygulamaz. Adaptör etkinken `esp_camera_fb_get/return` ve sensör ayarlarına yalnız bu bileşen erişmelidir; ayrı kamera sunucusu veya başka capture task'ıyla paylaşılmaz. Kamera sürücüsünün başlangıç ayarı, desteklenen en büyük profilin framebuffer kapasitesini ve yeterli heap/PSRAM'ı sağlamalıdır. Sensör SXGA desteklemiyorsa detail profili hata verir.

```c
#include "armut_camera_http.h"

static armut_camera_http_handle_t camera_http;

/* Sunucu ve JPEG kamera sürücüsü uygulama tarafından önceden başlatılmıştır.
 * Sunucu en az 3 boş URI handler ve stream + profil için yeterli socket sağlamalıdır.
 * Başlatma tamamlanmadan dış istek kabul etmeyin. */
esp_err_t attach_camera_routes(httpd_handle_t server, const char *provisioned_key)
{
    armut_camera_http_config_t cfg = {
        .server=server, .device_key=provisioned_key,
        .target_fps=25, .io_timeout_ms=1000,
        .frame_timeout_ms=2000, .max_frame_bytes=524288,
    };
    return armut_camera_http_start(&cfg, &camera_http);
}
```

Aynı cihazın kontrolcüye kaydedilmiş özel anahtarı üç endpoint'te de `Authorization: Bearer …` olarak gerekir. Yerel kontrolcü anahtarı özel cihaz kaydından alıp kamera proxy isteğine ekler; tarayıcıya verilmez. Anahtarı URL'ye veya örnek kaynak koduna yazmayın. Adaptör HTTP sunucusuna TLS eklemez; güvenilmeyen ağda uygulamanın HTTPS sunucusu gerekir.

| İstek | Davranış |
| --- | --- |
| `GET /camera.jpg` | Tek JPEG; capture hatasında 503, `Cache-Control: no-store`. |
| `GET /stream` | `multipart/x-mixed-replace` MJPEG. Aynı anda tek stream; ikincisine 409. |
| `POST /profile` | En fazla 128 bayt JSON: `{"profile":"smooth"}`, `lowlight` veya `detail`. |

Profil başarısı `{"profile":"smooth","maxTargetFps":25}` biçimindedir; `maxTargetFps`, yapılandırılmış hedef üst sınırıdır. `smooth`: VGA 640×480, JPEG kalite 18, otomatik exposure/gain/white balance, AE seviyesi 0. `lowlight`: VGA, kalite 16, aynı otomatik kontroller, daha yüksek AE seviyesi 2. `detail`: SXGA **1280×1024**, kalite 10, otomatik kontroller, AE seviyesi 0. Sensör çağrılarından biri başarısızsa 503 `profile-not-applied` döner; kısmen değişmiş sensör ayarları otomatik geri alınmaz. Başarı yanıtı fiziksel görüntü kalitesi veya FPS ölçümü değildir.

Stream `httpd_req_async_handler_begin` ile ayrı 6144 baytlık worker'a taşınır; profil HTTP sunucusunun ana task'ında işlenebilir. Her kare sensor/capture mutex'i altında alınır, sınırlandırılmış JPEG kopyası oluşturulur ve framebuffer ağ gönderiminden **önce** sürücüye iade edilir. Bu nedenle yavaş stream istemcisi profilin sensör kilidini tutmaz. Anlık görüntüyle birlikte en fazla iki JPEG kopyası bulunabilir; varsayılan kopya sınırı kare başına 512 KiB'dır. Yetersiz bellek, büyük/geç kare veya JPEG dışı çıktı başarısız olur. Gönderim/disconnect hatasında framebuffer ve kopyası bırakılır, async istek tam bir kez tamamlanır ve stream yuvası serbest bırakılır.

Ağ socket timeout'u varsayılan 1 sn; 100–3000 ms ayarlanabilir. Gönderim 4096 baytlık parçalara ayrılır ve varsayılan 2 sn kare gönderim bütçesi denetlenir; son bloklayan socket işlemi bu bütçeyi en fazla kendi timeout'u kadar aşabilir. Capture kilidi bekleme ve geç-kare bütçesi de varsayılan 2 sn'dir. Sabitlenmiş esp32-camera 2.1.3 kaynak kodunda `esp_camera_fb_get()` kendi **4000 ms** bekleme sınırına sahiptir: adaptör bu native çağrıyı iptal edemez, döndükten sonra geç kareyi reddeder. Bunlar mutlak gerçek zaman garantisi değildir. 25 FPS yalnız en yüksek hedef frekansıdır; gerçek FPS sensör, exposure, çözünürlük, bellek ve ağla fiziksel olarak ölçülmelidir.

Durdurma sırası: HTTP handler dışından `armut_camera_http_stop(camera_http, 15000)` çağırın; başarıda handle'ı `NULL` yapın. Sonra uygulamanın `httpd_stop` ve `esp_camera_deinit` işlemleri yapılabilir. Stop önce HTTP task'ında endpoint'leri kaldırır, aktif snapshot/profil/async stream'in bitmesini bekler. Timeout'ta handle ve sunucu/sürücü yaşamalıdır; stop tekrar denenebilir. Stop çağrıları eşzamanlı yapılmaz. Adaptör sunucuyu veya sürücüyü kendisi kapatmaz.

Sadece kamera olan cihaz da `armut_link` ile kayıt/heartbeat gönderebilir: `.role="camera", .channels=NULL, .channel_count=0, .read=NULL`. Fiziksel switch callback'i gerekmeksizin `entities:[]` raporlanır.

Host testleri Bearer karşılaştırmasını, üç profilin sensör parametrelerini, sensör hata sonucunu, JPEG kopyası/framebuffer iadesini, büyük/JPEG dışı kare reddini ve gönderim hatasında async tamamlama/stream yuvasının serbest kalmasını denetler. Bu testler ESP SDK ve kamera için stub kullanır; gerçek IDF ABI, HTTP socket zamanlaması, sürücü eşzamanlılığı, sensör ve fiziksel FPS doğrulaması değildir. Bu ortamda `idf.py` bulunmadığından gerçek ESP-IDF 5.5 derlemesi yapılmadı.

## Yerel V1 ajana kaynak devri — 10 Kasım 2026

Özel kaynak deposu: `https://github.com/ylmzcqn/ARMUT_V2_TEMIZ`, ayrılmış dal `camera02-cloud-publisher-20261110`. Bu dal kaynak devridir; main veya çalışan panel yayını değiştirilmez. Yayıncı uygulama commit’i: `f77acbe9de2fb5da9aad6be62ac0f98dabde22ef`.

Yerel V1’e yalnız şu bileşenler alınır:
- `firmware/armut_presence_push/armut_presence_push.c`
- `firmware/armut_presence_push/include/armut_presence_push.h`
- `firmware/armut_presence_push/CMakeLists.txt`
- Ortak callback tipi için `firmware/armut_link/include/armut_link.h`; mevcut component CMake bağımlılığı `armut_link` olduğundan bu component’in kaynak/CMake dosyaları da gerekir. İkinci armut_link task’ı başlatılmaz.

IDF 5.5 koşulları: `esp_http_client`, `esp_timer`, `esp_system`, `mbedtls`, `json`, `armut_link`; CA bundle etkin, mevcut Wi-Fi ve güvenilir cihaz saati hazır. `read(context,"presence",&value,&age)` mevcut radar snapshot’ından 0/1 ve gerçek UART ölçüm yaşını döndürür; enabled/driver_ready/online veya kimlik/profil uygun değilse hata döndürür. Callback hızlı/thread-safe olmalı, pin/driver/ağ başlatmamalı. Hiç örnek yokken age=0 geçerli yokluk değildir. Gönderici kanal/cihazı sabittir: `camera-02/presence-radar`.

Testler: `sh firmware/tests/run-host-tests.sh` (Linux cc + libcjson) üç host programını çalıştırır; gerçek IDF derlemesi değildir. `firmware/tests/push_test.c` yayıncıyı, `firmware/tests/stubs` yalnız host SDK sınırlarını içerir. Bunlar üretim component include yoluna eklenmez. V1’de gerçek CMake/SDK/heap/stack/kamera eşzamanlılık kabulü yerelde yapılmalı.

Cloud prod hedefi aynı sahibi-özel Site: `appgprj_6aef44c1c4bc8191897d459edbbea5ff`, `https://armut-v2-panel.jadeelm.chatgpt.site`. Kod `cloud-presence-worker.mjs`, D1 adaptörü `presence-ingest.mjs`, schema `drizzle/0001_presence.sql`; prepared paket `node build-cloud.mjs` ile oluşturulur. Bu geliştirme VM’sinde üretim servisi çalıştırılmayacak; hedef yayımlanmış Sites Worker + D1’dir. Şu anda prod statik, `DB` bağlaması/şema uygulanmamış ve yayıncı yetkisi provision edilmemiştir. Sites’ın bu buildless projede desteklediği D1 declaration/migration biçimi doğrulanmadan alan veya tablo yaratma yolu uydurulmaz. Yeni ücretli hesap/servis seçilmedi.

Cihaz için iki ayrı gizli değer gerekir: `PRESENCE_PUBLISH_TOKEN` ile eşleşen dar yayıncı anahtarı ve Sites platformunun özel servis erişim değeri. Değerler bu kaynak devrinde yoktur; güvenli provisioning ile aktarılmalı, sohbet/commit/loga konmamalıdır. Cloud alıcı ve erişim doğrulanmadan gerçek firmware yüklemesine geçmeyin. Kullanıcının yükleme onayı var; rutin tekrar onay yerine doğru hedef/kurulu sürüm/partition/geri dönüş ve tek OTA/sonuç doğrulaması korunur. Belirsiz yazmayı tekrarlamayın. PC’ye kalıcı V2 sunucusu veya yardımcı servis kurulmaz.
