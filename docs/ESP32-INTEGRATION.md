# ESP32 yerel kontrolcü bağlantısı

`firmware/armut_link`, ESP-IDF 5.5 için yeniden kullanılabilir C bileşenidir. Wi-Fi/Ethernet, GPIO, kart başlangıcı, sensör sürücüleri veya OTA kurmaz. Çalışan ağa ve uygulamanın doğruladığı sürücülere bağlanır. Pin, besleme ve kart revizyonu bu bileşenle doğrulanmış olmaz.

## Mevcut Kamera 2 firmware’iyle USB’siz geçiş — 10 Kasım 2026

İlk tercih yeni firmware yüklemek değil, mevcut Kamera 2’nin `GET /api/system` çıktısını ev ağındaki yerel denetleyicide salt okunur adaptörle okumaktır. Aşağıdaki uç ve dosyalar yerel kaynak incelemesinden aktarılmış kanıttır; bu cloud oturumu özgün dosyaların tamamını veya kurulu cihazı incelemedi.

- `firmware-idf/src/camera/Camera.cpp:967-975`: `GET /api/system`, `POST /api/firmware` kayıtları.
- `firmware-idf/src/camera/SystemStatus.cpp:54,76`: sistem çıktısına radar ve OTA bilgisinin eklenmesi.
- `firmware-idf/src/common/Radar.cpp:111-124`: `radar` ve `components` içinde `presence-radar`. Mevcut V2 kaynak parçası bileşende `owner_device_id=camera-02`, `kind=ld2410c`, `model=HLK-LD2410C`, `online`, `value` ve `presence` alanlarını gösterir.
- `upload_ota.py:40,78-96`: hedef ön kontrolü, tek POST, hostname/SHA256 başlıkları ve belirsiz yazma makbuzu; cihaz işleyicisi `FirmwareUpload.cpp`, Kamera 2 bölüm tablosu `firmware-idf/partitions.camera-02.csv`.

### Adaptörün sınırı ve eşleme hazırlığı

1. Mevcut `camera-02` ve `presence-radar` kimliklerini kullan; yeni cihaz/modül veya ikinci varlık kaydı oluşturma. Varlık değeri ev modelindeki aynı işlevle eşlenmeli, envanter dosyasına yazılmamalı.
2. GET yanıtının tam zarfı, kimlik/rol/sürüm/boot alanları, erişim kontrolü ve ölçüm yaşı sözleşmesi yerel kaynakta doğrulanmadan alan adları tahmin edilmez. `radar.online` ile bileşenin `online` bilgisi çelişirse güncel varlık üretme. Başarısız/eksik sensör verisi `false` değildir.
3. HTTP yanıt zamanı sensörün ölçüm zamanı sayılmaz. Radarın son geçerli UART paketine göre yaşı sağlanmıyorsa sensör tazeliği `unknown` kalır ve bu veri otomasyon tetiklemez. Cihaz bağlantısı ile sensör sağlığı ayrı gösterilir.
4. Mevcut `home-runtime` provider sözleşmesinin `{devices,entities}` okuma yoluna uyarlanır; eski GET verisi yeni firmware’in anahtarlı `/api/device/report` protokolünü destekliyormuş gibi sunulmaz. Adaptör yazma/komut/OTA sağlamaz. Tek yetkili kaynak seçilir; push/pull aynı cihazı paralel güncellemez.
5. Uygulama aşamasında GET için tek eşzamanlı sorgu, sınırlı gövde/zaman aşımı, redirect reddi, iptal ve eski oturum yanıtını atma gerekir. Ağ ve kimlik bilgileri yalnız yerelde saklanır; cloud koduna, Git’e veya rapora taşınmaz.

Bu hazırlığı tamamlayan sonraki kaynak aktarımı, gerçek IP/hostname/anahtar içermeyen **alan adları, türler, enum değerleri ve tazelik hesabını yapan kod parçası** olmalıdır: `/api/system` üst zarfı, radar JSON üreticisinin tamamı, erişim denetimi, boot/sürüm üretimi. Canlı cihaza istek gerektirmez. Bunlarla adaptörün saf normalleştirme testleri; yanlış kimlik/rol, bozuk/çelişen veri, ölçüm yaşı yokluğu, stale veri ve restart davranışını kapsayacak şekilde hazırlanabilir.

### Yerel kabul ve OTA

Mevcut uç çalışıyorsa okuma için firmware değişikliği ve USB gerekmez. Kaynakta OTA bulunması cihazda OTA’nın çalıştığını veya bu cloud ortamından erişilebildiğini kanıtlamaz. Ağ erişimi ve canlı doğrulama bu aşamada yapılmaz. Daha sonra ayrıca yetkilendirilmiş yerel doğrulamada doğru cihaz, kurulu sürüm ve gerçek bölüm düzeni eşlenir. Firmware değişikliği gerçekten gerekirse geri dönüş imkânı doğrulanır ve ayrı açık yükleme yetkisi alınır; belirsiz yükleme tekrarlanmaz.

Durum: yalnız kaynak incelemesi ve entegrasyon hazırlığı. Adaptör henüz uygulanmadı; cihaz erişimi, OTA, servis değişikliği ve yayın yapılmadı.

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
