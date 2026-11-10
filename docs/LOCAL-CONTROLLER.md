# Yerel denetleyici

Node.js 22 veya 24 ile proje kökünde `node server.mjs` çalıştırılır. Otomatik servis kurulmaz. Varsayılan adres `http://127.0.0.1:8080`; giriş `/login` sayfasındadır. İlk açılışta üretilen yönetici anahtarı `local-data/admin-key.txt` dosyasından okunur. Dosyayı yerel editörde açın; anahtarı terminal çıktısı, Git veya ekran görüntüsüyle paylaşmayın.

Ev ve kimlik bilgileri `local-data/` altında izinleri kısıtlı ayrı dosyalara, geçici dosya + fsync + atomic rename ile yazılır. Ev değişmediğinde disk yazımı yapılmaz. Bu dizin Git dışıdır. Yedekler gizli cihaz anahtarı içermez; `credentials.json` cihazlara giden kamera proxy yetkilendirmesi için cihaz anahtarlarının kendisini, anahtar hashlerini, yönetici giriş anahtarı, boot/sıra tekrar kayıtları ve komut sıra sayacını içerir. Dosyaları elle değiştirmeden önce denetleyiciyi durdurun. Bozuk mevcut dosya boş evle sessizce değiştirilmez. Aynı veri dizini için `controller.lock` dosyası özel izinlerle ve exclusive oluşturulur; PID/token sahipliği ikinci örneğin açılmasını engeller. Normal kapanışta, başlangıç doğrulama veya dinleme hatasında kilit bırakılır. Aniden kapanmış süreç yalnız işletim sistemi PID için artık süreç bulunmadığını doğrularsa otomatik temizlenir. Yaşayan/izni belirsiz PID veya bozuk kilit dosyası sessizce devralınmaz; çalışan süreci kontrol etmeden dosyayı elle silmeyin.

`ARMUT_HOST`, `ARMUT_PORT`, `ARMUT_DATA_DIR`, `ARMUT_ADMIN_KEY` isteğe bağlıdır. Sabit yönetici anahtarı en az 12 karakter olmalıdır; ortam değişkenindeki anahtar yeniden başlatmada mevcut giriş anahtarını değiştirir. Varsayılan loopback erişimidir. LAN cihazları bağlanacaksa kullanıcı yerelde açıkça `ARMUT_HOST=0.0.0.0` seçer; paneli bilgisayarın gerçek LAN IP adresinden açar. Hizmet TLS sağlamaz: güvenilen ev ağı ve işletim sistemi güvenlik duvarıyla sınırlayın. Ev dışı yayın veya port yönlendirme bu kurulumun parçası değildir. DNS adları yerine bağlı arayüzün IP adresi, loopback için ayrıca localhost kabul edilir; yanlış Host/Origin reddedilir. Sunucu loopback'te dinlerken önünde yerel bir özel ağ proxy'si (ör. tailnet adı) varsa bu adlar kaynakta değil, yalnız yerel ortamda `ARMUT_TRUSTED_HOSTS=ad1,ad2` (port eklemeden, virgülle) ile tanımlanır; bu izin yalnız loopback bağlantılarında geçerlidir.

## Tarayıcı API

`GET /api/health` hizmet sürümü ve giriş durumunu verir. `POST /api/login {key}` HttpOnly, SameSite=Strict bir günlük oturum çerezi ve `{csrfToken}` döndürür. Yönetici yazma istekleri aynı oturum çerezi ve `X-CSRF-Token` başlığı ister; Origin varsa istek adresiyle aynı olmalıdır. Token ayrıca `/api/state` içindeki `controller.csrfToken` alanındadır. Başarısız girişler adres başına dakikada 10 denemeyle sınırlıdır; anahtarlar yanıta veya günlüğe yazılmaz.

`GET /api/state` tek yetkili ev ve canlı durum kaynağıdır: `{home,revision,devices,entities,controller}`. `controller.bootId` her süreçte yenidir, `stateSequence` her snapshot'ta artar; istemci eski yanıtları atar. `PUT /api/home {revision,home}` eşzamanlı değişiklikte 409 döndürür. Geçmiş, mod, sahne/kural `lastRun` ve `lastPreview` sunucu tarafından korunur. Cihaz kataloğu yalnız kayıt/kaldırma API ile yönetilir; PUT katalog veya kayıtlı fiziksel kanalın cihaz/kanal/tür kimliğini değiştiremez. Konfigürasyon revizyonunu yalnız yapılandırma değişiklikleri artırır; çalışma kayıtları artırmaz.

`POST /api/action` türleri: `{type:'command',entityId,value}`, `{type:'mode',mode}`, `{type:'scene',id,observeOnly}`, `{type:'previewRule',id}`. Yanıt `{result?,state}`. Otomasyonlar aynı runtime içinde, tarayıcı kapalıyken yürür; istemci ikinci otomasyon motoru çalıştırmaz. Giriş yoksa API 401 verir; statik cloud paneli bu Node hizmetini barındırmaz.

## Cihaz protokolü

`POST /api/devices {id,name,role}` (`hub`, `camera`, `node`) kaydı oluşturur; `{device,deviceKey,state}` yanıtındaki anahtar yalnız bir kez gösterilir. `GET /api/devices` anahtarsız kayıt/son görülme özetidir. `DELETE /api/devices/:id` bağlı işlev, kamera veya oda varsa 409 verir; kaldırma cihaz anahtarını iptal eder.

Cihaz `Authorization: Bearer <deviceKey>` ile `POST /api/device/report` gönderir:

```json
{"version":1,"deviceId":"node1","role":"node","bootId":"unique-per-boot","sequence":1,"capabilities":["switch"],"entities":[{"id":"relay","name":"Lamba","kind":"switch","value":false,"ageMs":0}],"acknowledgements":[]}
```

`entities[].id` firmware'in kararlı kanal kimliğidir; server bunu `channelId` olarak saklar, cihaz/kanaldan kararlı global işlev kimliği üretir. Sensör değeri sonlu sayı; switch/presence boolean olmalıdır. Birim en çok 24 karakterdir; yetenekler yalnız `camera`, `switch`, `sensor`, `presence`, `display` listesinden seçilir. Kümülatif fiziksel kanal ve ev işlevi sınırı 200’dür; geçersiz/taşan rapor sıra kaydına veya canlı duruma işlenmez. Yaş her raporda gerçek ölçüm yaşını belirtir, yeniden raporlamak eski ölçümü tazelemez. Kayıtlı cihaz kimliği/rolü/anahtarı eşleşmeli; sıra aynı boot içinde artmalı; eski boot kimliği geri dönmemelidir. Yeni firmware boot kimliği açılış başına benzersiz olmalıdır.

Mevcut envanterdeki Hub/Kamera kimliği, doğru rolle henüz kayıtlı değilse kaydedilebilir; envanter kanıtı tek başına cihaz kimlik bilgisi değildir.

Yanıt `{version:1,commands:[{commandId,sequence,channelId,value,bootId}],reportIntervalMs:2000}`. Her komut yalnız tek raporda teslim edilir. Cihaz başına en çok 8 bekleyen komut ve rapor başına en çok 8 teslim vardır; fazlası kuyruğa alınmadan reddedilir. Komut sequence değeri cihaz başına kalıcı ve artandır; rapor sequence değerinden ayrıdır. Firmware boot hedefini ve sequence'i doğrulayıp hedef boolean durumu idempotent biçimde uygular; uygulama tamamlanınca sonraki raporda `{commandId,applied:true,value}` onayı gönderir. ACK cihaz/boot/değer/teslim edilen komutla eşleşmeden fiziksel başarı raporlanmaz. Tekrar edilen/gecikmiş ACK önbellekleri artık beklemeyen komutları yeniden uygulamaz. Bekleyen komut yanlış ACK alırsa rapor reddedilir. `applied:false` onayı telemetriyi engellemeden beklemeyi bitirir ve fiziksel başarı sayılmaz. 8 saniyelik zaman aşımında sonuç bilinmiyor olur; otomatik tekrar yapılmaz. Yeniden başlatmada canlı gözlem ve komutlar geri oynatılmaz; anahtarlar ve tekrar engelleme kayıtları kalır.

## Kameralar

Kayıtlı kamera yapılandırmasının `GET /api/cameras/:id/stream` ve `POST /api/cameras/:id/profile {profile}` yolları kullanılır. Profil `smooth`, `lowlight`, `detail` olmalıdır. Hedef yalnız saklanan `url`/`profileUrl` değeridir; kullanıcı sorgu parametresiyle proxy hedefi seçemez. Kayıtlı cihazın özel anahtarı varsa yalnız sunucudan hedefe `Authorization: Bearer` başlığı eklenir; anahtar ev durumuna, cihaz listesine veya tarayıcı kamera ayarına verilmez. Eski yalnız hash içeren kayıtta sunucu anahtarı geri çıkaramaz; kimlik doğrulamalı kamera için cihazı yeniden kaydetmek gerekir. Yönlendirme izlenmez. Profil için ayarlı fiziksel hedef yoksa 409; erişim/biçim sorunu varsa hata döner. Görüntü JPEG veya MJPEG olmalıdır. Akışta backpressure korunur; istemci ayrıldığında upstream iptal edilir; 8 saniye veri gelmezse bağlantı kesilir. Fiziksel kamera görüntüsü ve 25 FPS hedefi donanım olmadan doğrulanmış değildir.

## Doğrulama

`node --test server.test.mjs controller-devices.test.mjs` yalnız ephemeral loopback HTTP hizmetleriyle kayıt, telemetri, tek teslim, ACK, replay/boot, oturum/CSRF/Origin/Host, revizyon/kalıcılık, kamera profil aktarımı ve akış iptalini doğrular. Gerçek ESP, ev ağı, pinler veya üretim servisleri bu testlerle değiştirilmez.

## Kamera 2: mevcut firmware ile varlık okuma

**Güncel tercih:** Kullanıcı Windows PC kapalıyken cloud backend’den çalışmayı istiyor. Aşağıdaki yerel sunucu/CORS yolu bu hedefin çözümü değildir; eski isteğe bağlı mod olarak korunur. Cloud Worker hazırlığı ve özel ağ kapasitesi için [ARCHITECTURE.md](ARCHITECTURE.md#güncel-hedef-ve-yayın-kapasitesi--10-kasım-2026) geçerlidir.

Bu yol mevcut V1 `/api/system` API’sini kullanır; USB, yeni cihaz kaydı veya firmware yükleme istemez. Şu dört değer yalnız yerel Node sürecinin ortamında birlikte tanımlanır: `ARMUT_CAMERA_02_ORIGIN` (yalnız cihaz origin’i, `/api/system` eklemeyin), `ARMUT_CAMERA_02_TOKEN` (mevcut cihaz API tokenı), `ARMUT_CAMERA_02_HOSTNAME`, `ARMUT_CAMERA_02_ROLE` (mevcut yerel hedeften doğrulanmış tam değerler). Hiçbiri cloud’a veya Git’e aktarılmaz. Kod yapılandırma olmadan Kamera 2’ye istek yapmaz.

Cloud panelinden ev ağına okuma için ayrıca `ARMUT_PANEL_ORIGIN=https://armut-v2-panel.jadeelm.chatgpt.site` tanımlanır. Yalnız **tam eşleşen origin** için `/api/presence` CORS ve GET/Authorization ön kontrolü açılır. `Access-Control-Allow-Private-Network: true` yalnız bu origin’in ilgili preflight isteğine verilir; wildcard/credentials CORS yoktur. Diğer API yolları dış origin’e açılmaz. Gerçek cihaz tokenı bu yolda asla dönmez.

Yerel giriş çerezi HttpOnly/SameSite=Strict olduğu için cloud origin’den kullanılamaz. Salt okunur uç, yeni anahtar üretmek yerine mevcut `local-data/admin-key.txt` yönetici anahtarını Bearer olarak doğrular. Panel Ayarlar → **Ev ağından canlı varlık** formunda yerel sunucu origin’i ve bu yönetici anahtarı girilir. Kamera tokenını bu forma girmeyin. Form URL/anahtarı sunucuya kaydetmez; anahtar yalnız sekme belleğindedir, alan gönderim anında temizlenir ve bağlantı kesilince istemci anahtarı bırakır. Sekme yeniden açılınca tekrar bağlantı gerekir. Bu yol kamera görüntüsü/komut/yazma sağlamaz.

### En küçük gerçek yerel kabul — henüz yapılmadı

Ön koşul: güncel kod yerel V2’ye aktarılmış ve yeni panel sürümü kullanıcı yetkisiyle yayımlanmış olmalı. Bu pakette mevcut cloud yayını değiştirilmedi; eski yayında yeni form henüz yoktur.

1. Yerel yetkili çalışma kapsamında mevcut Kamera 2 adresi, tokenı, hostname ve rolü dört yerel ortam değerine bağlayın; mevcut sunucuyu bu yapılandırmayla çalıştırma/değiştirme işlemi ayrıca yetkilendirilmelidir. LAN sunumu gerekiyorsa mevcut `ARMUT_HOST`/özel ağ güvenlik duvarı ayarları kullanılır; ağ taraması ve internet port yönlendirme yoktur.
2. Aynı ev ağındaki tarayıcıdan cloud panelini açıp Ayarlar’daki forma yerel V2 sunucusunun IP/port’unu ve yerel yönetici anahtarını girin. Tarayıcı yerel ağ izni isterse kullanıcı verir.
3. Genel bakıştaki tek Varlık sensörü kartında gerçek **var/yok** geçişini, radar/bağlantı kesilince **bilinmiyor** olmasını ve toparlanmasını gözleyin. Sensörün fiziksel boşluğu bildirmesi ile bağlantı kaybını karıştırmayın. Kamera, firmware, OTA ve çıkış denemesi bu kabulün parçası değildir.

CORS izni tek başına HTTPS→HTTP mixed-content, tarayıcı Local Network Access izni veya hosting CSP kısıtını aşmaz. Sentetik Node testleri gerçek tarayıcı iznini kanıtlamaz. Cloud tarayıcısı isteği engellerse en küçük işleyen alternatif **aynı yerel sunucunun kendi panelini açmaktır**; o yol aynı radar verisini kullanır ve cross-origin gerektirmez. Cloud panelini açık tutma şartı için tarayıcı tanısı alınmadan yeni proxy/TLS/hosting altyapısı eklenmez. Gerçek tarayıcı erişimi doğrulanana kadar cloud→LAN kabulü açıktır.
