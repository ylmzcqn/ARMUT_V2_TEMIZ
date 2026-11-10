# ARMUT V2: gerçek cihazlara geçiş mimarisi

Durum: 8 Kasım 2026, mimari önerisi ve uygulama kabul ölçütleri. Bu belge çalışan entegrasyon değildir. Cihazlara bağlantı, firmware yüklemesi, servis kurulumu veya otomasyon etkinleştirmesi yapılmadı.

## Güncel karar: Hub merkezli akış

Kullanıcı Hub merkezli V2’yi onayladı: Camera 1/2 mevcut yerel durum sözleşmeleriyle Hub’da toplanır; tek cloud yayıncısı Hub’dır. Panel/backend cloud’da, PC/telefon istemcidir. İlk kabul yalnız `camera-02/presence-radar`; gerçek radar akışı kabul edilince Kamera 1 ve Hub sağlığı aynı kaynak/yayıncı ayrımıyla eklenir. Video ayrı pakettir. Aşağıdaki doğrudan Kamera 2 yayın tasarımı tarihsel/yedek adaydır; mevcut Worker onu otomatik kabul etmez ve OTA yapılmaz.

Cloud alıcısı mevcut lease/CAS/D1 yolunu korur. `hello` ve `report` gövdesinde `publisherId=hub`, `deviceId=camera-02`, `componentId=presence-radar`; `bootId` Hub yayıncı oturumudur. Raporda ayrıca gerçek kameranın `sourceBootId` değeri vardır. Browser snapshot’ındaki `bootId` kameraya, `publisherBootId` Hub’a aittir. Dar yayıncı yetkisi artık Hub’a provision edilecektir; yeni anahtar üretilmedi veya mesajla taşınmadı.

`hub-presence.mjs` mevcut V1 ayrıştırıcısını kullanır. `sourceSampleAgeMs` (kameranın UART örneği), `hubResidenceMs` (Hub önbelleğinde geçen güncel süre), `sourceTransitMs` (ilk ağ geçişinin doğrulanmış ihtiyatlı payı) toplamı `sampleAgeMs` olmalıdır. Eksik ağ payı sıfır varsayılmaz. Toplam≥2000 veya kimlik/bozuk veri/null kaynak bilinmiyor olur. Alıcı da parçaları yeniden toplar; Hub→cloud lease/transit payını ve browser’da geçen süreyi ayrıca ekler. Kamera reboot’unda sourceBootId değişir; Hub reboot’u ile karıştırılmaz.

Yerel kaynak kanıtı: camera/Hub.cpp:121-140 mevcut tam systemJson’u `/api/node/sync` ile yollar; hub/Registry.cpp:26-40 system ve system_age_ms verir. Normal sync 2000 ms, hata 4000/8000 ms’dir. Radarın <2000 ms eşiği bundan uzun yapılmaz. Mevcut sync’ten alınan veri ancak tüm yaş/ağ payı doğrulanabiliyorsa kullanılabilir; system_age_ms tek başına geçiş gecikmesini kanıtlamaz. Sürekli taze radar için alternatif: **Hub’ın sabit Kamera 2 hedefine, mevcut Bearer yetkisiyle 1 sn aralıklı, tek eşzamanlı ve sınırlı süreli GET /api/system yapması**; tam istek süresi ilk geçiş payı olarak korunur. Yerel toplama mevcut kameranın API/firmware’ini değiştirmez. Yeni örnek alındığında cloud’a son güncel snapshot yayınlanır; FIFO eski örnek kuyruğu kurulmaz. Cloud göndericisi yalnız snapshot kopyalamalı, sensör/kamera işini veya yerel HTTP toplamasını kilitlememelidir. Kesintili güncellik gerçek yerel kabulde ölçülür; GET/CPU/heap etkisi fiziksel test edilmedi.

D1 schema SQL’i `drizzle/0001_presence.sql` yoluna, prepared pakette de `drizzle/` altına taşındı. Kaynakta daha önceki migrations/presence dosyası uygulanmış migration değildi; SQL içeriği değişmedi. Bu dizinin Sites build scriptinde aranması, journal/build metadata veya dolu d1 declaration biçiminin doğrulandığı anlamına gelmez. Doğrulanmış veritabanlı starter/build metadata ve binding declaration olmadan production deploy edilmez. Runtime DDL veya tahmini manifest eklenmedi. Aktif Site/audience aynı kaldı; gerçek kabul ve OTA ayrı/açık.

## Güncel hedef ve yayın kapasitesi — 10 Kasım 2026

Kabul: kod ve panel/backend bulutta kalır; Windows PC kapalıyken PC/telefon aynı özel panelden Kamera 2’nin gerçek var/yok/bilinmiyor durumunu okur. Kullanıcının PC’sine proje, Node sunucusu veya yardımcı servis kurmak çözüm değildir. Önce tek radar akışı; görüntü sonraki paket. Aşağıdaki 8 Kasım önerileri tarihsel kayıttır; bu güncel hedef onları önceler.

Doğrulanan yayın hedefi Sites’tır: `.openai/hosting.json` aynı proje kimliğiyle `static.directory=dist` içerir; mevcut yayın statiktir. Sites resmî beceri belgeleri `dist/server/index.js` Worker ESM backend’ini ve isteğe bağlı D1/R2 depolamayı destekler. Worker istekte çalışır; geliştirme VM’si, Windows PC veya sürekli Node süreci değildir. Bu salt okunur paket için her istekte güncel kaynağı okumak yeterlidir; geçmişi taze sanmamak için yeni veritabanı/kalıcı radar önbelleği eklenmedi.

Cloudflare’ın resmî [Workers VPC](https://developers.cloudflare.com/workers-vpc/) belgesi özel HTTP servisine Cloudflare Tunnel ve `vpc_services` servis binding’i ile, belirli host/port’a sınırlı erişim tarif eder. Genel [TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/#troubleshooting) belgesi localhost/özel IP’ye normal çıkışın kısıtlandığını belirtir. Bu oturumda resmî docs alan adı ağ politikasınca engellendi; aynı belgelerin Cloudflare’a ait `cloudflare/cloudflare-docs` deposundaki `production` kaynakları okundu. Güncel VPC belgesi beta ve beta sırasında ücretsiz olduğunu söylüyor; bu hesapta kullanılabilirlik/fiyat taahhüdü veya otomatik kurulum sayılmaz.

**Önemli sınır:** Sites’ın belgelenen manifest/binding araçlarında VPC service/tunnel alanı gösterilmedi; mevcut Sites projesine bu binding’i provision etme kapasitesi doğrulanmadı. Cloudflare Workers’ın genel özelliği Sites hesabında kullanılabilir diye varsayılmaz. Geliştirme ortamının Tailscale bağlantısı yayın Worker’ına aktarılmaz; bunun için VPN menüsü aranmamalı.

### Önceki özel ağ taslağının durumu

İlk hazırlıkta mevcut V1 GET API’sini yalnız açıkça sağlanan özel servis binding’iyle okuyan Worker taslağı test edildi. Bu, Sites’ta binding provision edildiği anlamına gelmiyordu. Kullanıcı daha sonra cihazdan dışarı HTTPS yönünü seçti; mevcut `cloud-presence-worker.mjs` artık bu push yolunu kullanır. Eski LAN/VPC Worker okuma yolu kaldırıldı. Yerel GET sağlayıcısı kaynak sözleşmesi ve isteğe bağlı yerel çalışma biçiminde korunur.

`node build-cloud.mjs` aktif statik manifesti/yayını değiştirmeden aynı panel varlıkları ve Worker alıcı artefaktını üretir. Güncel şema/kimlik/provisioning ve kabul sınırı aşağıdaki seçilen mimari bölümündedir.

### Özel bağlantı için seçenekler ve eksik tek bilgi

| Yol | Gereken ve etki | Şimdiki durum |
| --- | --- | --- |
| Mevcut router veya zaten sürekli açık uygun ağ cihazı → tek kamera HTTP servisine özel tünel → cloud backend | Windows gerekmez; V1 firmware korunur. Router/connector kurulumu, yalnız Kamera 2 host/port erişimi ve backend binding/ACL için somut kurulum yetkisi gerekir. | İlk tercih; router modeli/yetenekleri ve Sites binding olanağı henüz bilinmiyor. Tailscale kurulu PC uygun kalıcı uç değildir. |
| Mevcut Hub/ESP’den yalnız radar özetinin dışarı HTTPS gönderilmesi → kalıcı cloud backend | PC ve gelen port açma gerekmez. Mevcut firmware’de uygun dışarı yayın yoksa firmware/OTA değişikliği, backend alım/kalıcılık ve dar yayıncı yetkisi gerekir. | Kaynakta yerel node/sync var; cloud yayını yaptığı doğrulanmadı. Ayrı gerçek cihaz/yükleme kararı olmadan uygulanmaz. |
| Ayrı kalıcı cloud backend + evde uygun özel connector | Sites VPC bağlaması yoksa statik özel panel korunarak ayrı backend değerlendirilebilir; hesap/ücret, kimlik ve özel ağ bağlantısı ayrıca seçilir. | Hesap/servis satın alınmadı, dış yayın yapılmadı. Evde uygun uç gereksinimini tek başına ortadan kaldırmaz. |

Kullanıcı modemini **TP-Link TD-W9980** olarak bildirdi. [Resmî V1 kullanım kılavuzu](https://static.tp-link.com/resources/document/1910010923_TD-W9980_1.0_User_Guide.pdf), bölüm 4.5.8, en fazla 10 LAN-to-LAN IPSec tüneli ve tek adresle sınırlama tarif eder. [Resmî veri sayfası](https://static.tp-link.com/resources/document/TD-W9980_1.0.pdf) bunu doğrular. Bu, Tailscale veya Cloudflare Tunnel connector desteği değildir; standart kaynaklarda bu connector desteği belgelenmedi. Kurulu modem firmware’i/hardware revizyonu veya gerçek VPN hazırlığı ayrıca okunmadı.

Mevcut Sites yayınında uygun IPSec karşı ucu veya VPC bağlaması doğrulanmadığından router’daki IPSec menüsü tek başına çözüm değildir. Ayrı uyumlu VPN gateway/backend, dar ACL ve muhtemel ücret/operasyon gerektirecektir; satın alma veya router firmware değişikliği önerilen varsayılan yol değildir. Yeni donanım/PC sunucusu olmadan sonraki aday, **Kamera 2 veya mevcut Hub’ın yalnız varlık özetini doğrulanmış HTTPS ile cloud’a dışarı göndermesidir**. Mevcut GET API bunu tek başına yapmaz; firmware eklemesi, cloud alım/son veri/tazelik katmanı ve sınırlandırılmış cihaz yayın yetkisi gerektirir. Bu yol henüz uygulanmadı ve OTA yetkisi sayılmaz. Kullanıcıya tek karar olarak bu firmware/cloud ekinin hazırlanması sunulur; gerçek OTA hedef/derleme/bölüm/geri dönüş incelemesinden sonra ayrıca değerlendirilir. Sır istenmez, görüntü aktarılmaz, router portu açılmaz. Gerçek cihaz kabulü AÇIK kalır.

## Seçilen ve uygulanan mimari: cihazdan dışarı HTTPS — 10 Kasım 2026

Kullanıcı bu yönün mimarisini ve yazılımını oluşturmayı onayladı. Yeni varsayılan: **Kamera 2’nin mevcut radar sürücüsü → ayrı düşük öncelikli HTTPS yayın task’ı → sahibi-özel Sites Worker → D1’de tek son durum satırı → aynı özel panel**. Bilgisayar, router VPN’i, port yönlendirme, yeni donanım veya kamera görüntüsü aktarımı gerekmez. Cloud Worker’daki önceki VPC/LAN okuma taslağı kaldırıldı; tek kaynak seçimi nettir. V1’in sensör/kamera/yerel API/OTA işlevleri değiştirilmez; yayıncı yalnız mevcut radar snapshot callback’ini okur.

### Veri, yetki ve tazelik

- Cihaz, mevcut özel Sites servis erişimi başlığı yanında yalnız `camera-02/presence-radar` yayınını yetkilendiren `PRESENCE_PUBLISH_TOKEN` kullanır. Platform servis anahtarı özel Site kapısı içindir; yayıncı anahtarı uygulamada dar yazma yetkisidir. İkisi de cihazın güvenli provisioning alanında tutulur. LAN kamera API anahtarı cloud’a gönderilmez; hiçbir anahtar tarayıcıya/loga/Git’e konmaz. Browser okumaları Sites’ın mevcut özel oturumunu kullanır.
- `/api/presence/hello` ilk açılış/bağlantı onarımı için tek kullanımlık 5 saniyelik bilet verir; önceki varlığı bilinmiyor yapar. `/api/presence/report` yalnız doğru cihaz/bileşen/boot, ardışık sıra ve güncel biletle kabul edilir. Her başarılı işlem bir sonraki bileti verir. Bilet DB’de hash olarak tutulur; eski bilet/boot/sıra kabul edilmez. CAS revision güncellemesi eşzamanlı iki Worker’ın aynı bileti tüketmesini engeller. Ağ yazması belirsizse ESP eski paketi tekrarlamaz; yeniden hello yapıp yeni ölçüm alır.
- Firmware her rapordan hemen önce mevcut sürücünün son gözlemini/yaşını kopyalar. Bilet alındıktan ölçüm okumaya kadar geçen **monoton bekleme** `sinceLeaseMs` ile bildirilir. Muhafazakâr yaş = sunucuda biletin yaşı − bu bekleme + UART ölçüm yaşı + 10 ms pay. Bildirilen bekleme sunucudaki bilet yaşını aşamaz. Böylece normal 1 saniyelik heartbeat beklemesi gözlem yaşı sanılmaz; HTTP gecikmesi ve eski ölçüm yine sayılır. Kaynak alanlar yetkili fiziksel yayıncıya dayanır; kötü niyetli/bozuk firmware’in fiziksel yalanını kanıtlamaz.
- D1’de gözlemin ihtiyatlı zamanı saklanır; okurken ve tarayıcıda beklerken yaş artar. 2000 ms sınırında `value=null` olur. Eksik/eskimiş ölçüm false değildir. Yeni cihaz boot’u son değeri siler. Cloud restart’ında belleğe güvenilmez; DB okunur ve eski kayıt yaş kontrolünden geçer. DB kesintisinde başarı ACK’i verilmez; panel bilinmiyor olur ve yeniden dener.

### Bileşenler ve kesinti davranışı

`presence-ingest.mjs` doğrulama/lease/CAS ve D1 adaptörüdür. `drizzle/0001_presence.sql` yalnız tablo şemasıdır; request sırasında DDL yapılmaz. Tablo tek cihazın tek son satırını tutar, olay/görüntü kuyruğu veya sınırsız geçmiş yoktur. D1 read session `first-primary` ile başlar. [Resmî D1 API](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession) ve [hazır SQL statement API](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) esas alındı.

`firmware/armut_presence_push` ESP-IDF 5.5 bileşeni mevcut `armut_read_fn` snapshot sözleşmesini kullanır. Tek istek, 1 KiB yanıt, 1,5 sn socket timeout ve 2 sn işlem bütçesi, TLS CA bundle/hostname doğrulaması, redirect reddi, keep-alive istemcisi vardır. Bloklayan son native çağrı işlem bütçesini kendi timeout’u kadar aşabilir; mutlak gerçek zaman garantisi verilmez. Birikmiş telemetri tutulmaz. Ağ hatasında 1/2/4/8/16/30 sn + küçük jitter, yetki hatasında 30 sn bekler. Sensör/kamera task’ını durdurmaz; callback’in yalnız hızlı/thread-safe snapshot kopyalaması zorunludur. Wi-Fi ve saat senkronizasyonunu mevcut firmware sağlar; TLS doğrulaması gevşetilmez.

### Doğrulama ve devreye alma sınırı

Yazılım testleri: gerçek SQLite ile D1 sorguları, restart/expiry, CAS yarışı, eski/tekrar/yanlış paket, DB/HTTP/izin hatası ve hazırlanmış Worker artefaktından aynı browser runtime’ına var/yok/bilinmiyor akışı. C host testleri HTTPS yapılandırması, hello/report, doğru false, eski ölçümün null olması, 409 sonrası yeniden hello ve artan beklemeyi denetler. Bunlar gerçek ESP-IDF/linker/PSRAM/Wi-Fi performansı veya fiziksel radar kanıtı değildir.

Hazırlanan Worker artefaktı aktif Site manifestini/yayını değiştirmez. **D1 `DB` kaynağının bağlanması, şemanın onaylı migration akışında uygulanması ve yayıncı/özel Site servis erişiminin güvenli provisioning’i henüz yapılmadı.** Sites’ın D1 logical-binding/migration biçimi bu mevcut buildless projede uygulanıp doğrulanmadan manifest alanı tahmin edilmeyecek. Gerçek V1 çalışma kopyasında callback bağlanması ve IDF 5.5 derlemesi de açık iştir; kaynak sözleşmesi, fiziksel entegrasyonun yerine geçmez. Gerçek OTA ancak hedef/kurulu firmware/partitions/geri dönüş incelenip ayrıca yetkilendirilince yapılır.

Nominal yayın aralığı 1 saniyedir: kesintisiz çalışmada en fazla yaklaşık 86.400 rapor/gün, açık her panel için yaklaşık 86.400 okuma/gün oluşabilir. D1/Worker kapasitesi ve mevcut Sites hesap kotası devreye alma öncesi kontrol edilir; ücretsiz veya sınırsız çalışma sözü verilmez. Ücretli servis/plan seçilmedi. Fiziksel kabul: açılış/var-yok, radar kopması, Wi-Fi/internet kesilmesi, cihaz/cloud yeniden başlaması, uzun süre çalışma, heap/task yığını ve mevcut kamera akışına etki. **Gerçek kabul AÇIK.**

## Amaç ve mevcut kanıt

Hedef: Hub ve Kamera-01 ilk bağlandığında kimlik ve sürüm doğrulandıktan sonra gerçek durumun panelde görünmesi; eksik bilgi, yeniden başlama ve bağlantı kesintisinin yanlış başarıya veya fiziksel harekete dönüşmemesi.

V2 bağımlılıksız statik HTML/CSS/ES modülleridir. inventory.json cihaz/modül/pin envanterinin tek kaynağıdır. Canlı veri sağlayıcısı yoktur. Özel Sites yayını görüntüleme erişimini sınırlar; ev ağına bağlantı sağlamaz.

İncelenen eski depo: ylmzcqn/esp_armut_v1.1, commit 4bc3e5a8812e5349b9802ea4120247b4e5befb0e. camera/Hub.cpp, camera/SystemStatus.cpp, hub/SystemStatus.cpp, ai/server.py, ai/remote.py ve Android belgeleri kaynak kanıtıdır. Camera/Hub.cpp kimlik doğrulamalı POST /api/node/sync kullanır; normal aralık yanıt sonrasında 2 sn, hata beklemesi en fazla 8 sn, HTTP zaman aşımı 4500 ms. ai/server.py içinde /mobile/devices ve /mobile/system okuma yolları vardır.

GitHub Hub SystemStatus.cpp eski SH1106 ve SDA1/SCL2 bilgisi içerir; V2 snapshot kayıtları ST7789V3 ve IMU16/8 tarif eder. Bu commitin çalışan cihaz yazılımıyla eşleştiği doğrulanmadı. Mevcut /mobile sözleşmesi yeni Sites web uygulamasına hazır bir web oturumu sözleşmesi sayılmaz. Tarihsel gözlemler bugünkü cihaz sağlığı değildir.

## Seçilen yön ve alternatifler

Önerilen yön: mevcut Hub haberleşmesini korumak, ev içinde tek okuma adaptörü üzerinden sürümlü bir durum sözleşmesi sunmak. İlk aşama salt okunur. V2 paneli framework veya backend eklenmeden bu sözleşmenin tüketicisi olarak hazırlanır. Ev ağ geçidi ve bulut aktarımı ayrı dağıtım bileşenleridir; mevcut statik projede çalışıyormuş gibi gösterilmez.

Tarayıcıdan doğrudan her ESP'ye erişmek telefonun ev ağına bağımlılığını, HTTPS/yerel HTTP ve kimlik bilgisi sorunlarını artırır; önerilmez. Her cihazı buluta doğrudan bağlamak firmware ve kimlik yönetimini gereksiz büyütür; ilk sürüm için önerilmez. MQTT/Home Assistant geçişi ileride değerlendirilebilir, mevcut protokolün yerine şimdi ikinci bir haberleşme sistemi kurulmaz.

## Bileşenler ve sorumluluklar

1. Cihaz firmware'i: fiziksel okuma, sürücü durumu, açılış kimliği ve cihaz yetenekleri. Yerel güvenli çıkış davranışı bağlantıdan bağımsızdır.
2. Hub: yerel düğüm kaydı ve mevcut sync protokolü. Bir kameranın Wi-Fi bağlantısı ile Hub'ın kameradan veri alması ayrı durumlardır.
3. Ev ağ geçidi: mevcut yerel Python servisindeki okuma yollarını kullanacak dar bir adaptör. Yetkili cihaz listesini ve beklenecek rolleri eşler; sırları yerelde tutar; veriyi doğrulayıp normalize eder. V2 kapsamı ilk etapta yalnız veri okur.
4. Uzaktan aktarım: evden dışarı başlatılan kimlik doğrulamalı HTTPS bağlantısıyla sınırlı durum özeti taşır. Ev router'ında port açılmaz. İstemciye LAN bearer anahtarı verilmez.
5. Bulut durum API'si: ayrı sunucu bileşeni olarak tasarlanır; geçerli yayıncıyı ve panel kullanıcısını ayrı doğrular. Yalnız sahip kendi evinin durumunu okuyabilir. Sites giriş kapısı özel API yetkilendirmesinin yerine geçmez. Çalışan sunucu, depolama ve kimlik yöntemi doğrulanmadan aktarım etkinleştirilmez.
6. Panel: envanteri ve canlı gözlemleri birleştirerek sunar; komut üretmez, otomasyon yürütmez, fiziksel uygunluk çıkarmaz.

İnternet kesilince Hub ve cihazların yerel haberleşmesi sürmelidir. Ev bilgisayarı/ağ geçidi kapalıysa uzaktan durum güncellenmez; bu durum tüm cihazların kapalı olduğu anlamına gelmez. Yerel otomasyon daha sonra Hub veya sürekli açık yerel denetleyicide yürütülür; telefon ve bulut zamanlayıcısına dayanmaz.

## Envanter ve canlı durum ayrımı

inventory.json kalıcı donanım açıklaması ve kaynak kanıtlarını tutar. Telemetri ayrı bellekte/ayrı durum deposundadır; envanter JSON'una kaydedilmez ve manuel kablo düzenlemesi cihazda uygulanmaz.

Dış JSON'dan gelen liveStatus alanları tek başına canlı doğrulama sayılmaz. Güvenilir adaptörün o oturumda aldığı doğrulanmış durum üzerinden görünüm oluşturulur. Kaynakta tanımlı modül ile sürücünün algıladığı modül ayrı tutulur. component online=true fiziksel işlevin tamamının doğrulandığı anlamına gelmez; kamera sürücüsünün hazır olması yeni JPEG alındığını kanıtlamaz.

## Durum sözleşmesi v1 — uygulanacak hedef

Zarf: schemaVersion, homeId, gatewayId, gatewayBootId, sequence, generatedAt, devices. homeId sunucu oturumundan doğrulanır; istek gövdesine güvenilmez. sequence aynı gatewayBootId içinde artan tamsayıdır. Sunucu receivedAt zamanını kendisi ekler. Bilinmeyen sürüm, geçersiz alanlar, yinelenen cihaz kimlikleri ve boyut sınırı aşımı reddedilir. Başlangıç sınırı: 64 cihaz, cihaz başına 64 bileşen, 256 KiB zarf.

Cihaz: deviceId, role, firmwareVersion, firmwareBuildId (varsa), deviceBootId (varsa), observationAgeMs, capabilities, health ve components. Bir alan firmware tarafından verilmezse null/unknown taşınır; sürüm veya boot kimliği uydurulmaz. Bileşenler isim veya dizi sırası yerine kararlı componentId ile eşlenir. Eski firmware eşlemesi sürümüne özel adaptörde açıkça tanımlanır; belirsizlikte eşleşme yapılmaz.

observationAgeMs verinin ağ geçidinde alınma zamanı değil, cihazın son gerçek gözlemine göre yaşıdır. Hub önbelleğinden eski kayıt yeniden okununca yaş sıfırlanmaz. Kaynak bu yaşı sağlamıyorsa tazelik unknown kalır. Hub/firmware saatleri mutlak UTC için güvenilir kabul edilmez; yerelde geçen süre monotonik saatle ölçülür. Yeniden başlatmada yaş sayaçları ve önceki oturum verisi geçersizleştirilir.

Bulut tazeliği = kaynak gözlem yaşı + ağ geçidinde bekleme + aktarım gecikmesi + sunucuda bekleme. Aktarım gecikmesi için ilk tasarımda yayıncıya en fazla 10 saniye geçerli sunucu yayın penceresi verilir; sunucu bu pencerenin tam süresini yaşa ihtiyatlı biçimde ekler. Süresi geçmiş pencereli yayın reddedilir; kesinti sonrası kuyruktaki eski zarflar atılır, yeni gözlem alınır. Bu mekanizma uygulanmadan yalnız receivedAt ile veri güncel ilan edilmez.

Panel durumu aldıktan sonra geçen süreyi monotonik saatle ekler; arka plandan dönünce yeniden sorgular. Beklenen özet aralığı 5 sn, uyarı eşiği 15 sn, geçerlilik üst sınırı 30 sn önerilir; cihaz gecikmeleri ölçülünce uyarlanır. Mevcut efektlerdeki 90 sn sabiti bu hedefle henüz uyumlaştırılmadı.

Durumlar: bağlantı kurulmadı, güncel, veri gecikti, durum bilinmiyor, uyumsuz. Çevrimdışı yalnız güncel ve yetkili gözlem açıkça bunu bildiriyorsa gösterilir. Ağ geçidine ulaşılamaması kamera çevrimdışı diye çevrilmez. 401/403 erişim sorunu, timeout/ağ sorunu, geçersiz veri ve cihaz arızası ayrı gösterilir. Son geçerli değer zamanı ile birlikte görünür kalabilir, ancak güncel etiketi ve animasyon alamaz.

## Başlangıç sırası

1. Panel envanteri doğrular; canlı durum başlangıçta bilinmiyor, tüm kontrol işlevleri kapalıdır.
2. Ağ geçidi yerel yapılandırmayı okur. Eksik sır/rol/cihaz eşlemesinde açık tanı verir; varsayılan parola veya rastgele IP taramasıyla devam etmez.
3. Hub kimliği/rolü ve API yanıt yapısı doğrulanır. Bildirilen sürüm beklenen sürümle karşılaştırılır; cihaz üzerinde çalışan derleme ayrıca doğrulanmadan uyumluluk tamamlandı sayılmaz.
4. Cihazlar kimlikleri ve rolleriyle eşlenir. Aynı kimliği kullanan iki kaynak, yanlış rol veya bilinmeyen cihaz karantinada/uyumsuz görünür.
5. Hub eski kaydıyla kamera güncel sağlığı ayrılır. İlk canlı gözlemden sonra salt okunur durum açılır. Bir cihazın yokluğu paneli ve diğer cihazları engellemez.
6. Bağlantı kopunca sınırlı zaman aşımı ve artan bekleme kullanılır; aynı anda yalnız bir sorgu vardır. Hızlı yeniden deneme döngüsü kurulmaz.
7. Yeniden başlama/oturum değişiminde önceki gözlem ve bekleyen işler geçersizleşir. Gecikmiş cevap yeni durumu geriye götüremez.

## Fiziksel çıkış ve otomasyon sınırı

İlk aşamada uzaktan komut yoktur. Gelecek aşamada çıkış yeteneği yalnız firmware bildirimi, fiziksel yük/pin doğrulaması ve kullanıcı yetkilendirmesi tamamlanınca açılır. Reset, ilk eşleşme veya bağlantı geri gelmesi servo hareketi, ses çalma veya röle açma üretmez. Güvenli durum yük bazında tanımlanır; her yük için otomatik kapatma doğru varsayılmaz. Mevcut MOSFET/servo güç yolu doğrulanmadan sürülmez.

Komutlarda benzersiz commandId, hedef deviceId ve deviceBootId, son geçerlilik süresi, beklenen önceki durum ve uygulama onayı gerekir. Gönderildi, kabul edildi, uygulandı ve sonucu bilinmiyor ayrıdır. Timeout sonrası fiziksel etki belirsizse komut körlemesine tekrarlanmaz. Eski komutlar yeniden bağlantıda yürütülmez. Manuel müdahalenin otomasyonu durdurma süresi kural bazında belirlenir.

## Uygulama sırası ve tamamlanma ölçütleri

A. Cihazdan bağımsız sözleşme ve durum çekirdeğini önce geliştir. Firmware sürüm farkı bu geliştirmeyi engellemez; gerçek bağlantı adaptörü eklenirken bildirilen sürüm/rol doğrulanır ve desteklenmeyen alanlar unknown kalır.
B. Uygulandı: device-runtime.mjs kayıt, doğrulama ve salt okunur durum çekirdeği; sözleşme docs/DEVICE-RUNTIME.md içinde. Saf durum doğrulayıcı/normalleştirici ve sahte saatli davranış testleri geliştir. Envanter değişmezliği, eski veri, yanlış rol, yinelenen kimlik, sırasız cevap, gateway/device restart ve bozuk veri kapsanır. Test verisi gerçek envantere eklenmez.
C. Mevcut yerel servise ayrı salt okunur adaptör tasarla/uygula; gerçek çıktı örneğiyle doğrula. Kaynak değiştirme/yükleme için ilgili repo kapsamı netleştirilir. Bu aşamada bulut olmadan yerel okuma kanıtlanır.
D. Sahip yetkisi ve yayıncı yetkisi ayrılmış sunucu API'sini, yayın penceresini ve durum deposunu hazırla. Ağ geçidi dışarı bağlantısını ekle. Kimlik bilgisi olmayan/başka eve ait isteklerin reddi doğrulanır.
E. Panelde tek canlı veri sağlayıcısını bağla, tazelik politikasını ortaklaştır. Yükleme/yenileme, yetki hatası, veri yokluğu ve kesinti durumlarını mobilde dene. Özel yayın kontrolü korunur.
F. Gerçek cihazla devreye alma: Hub açık/kamera kapalı, kamera yeniden açılışı, Wi-Fi kaybı, internet kaybı, ağ geçidi yeniden başlatma ve telefon arka planından dönüş senaryolarını çalıştır. Tanımlı eşikte güncel etiketinin kalkması, toparlanınca yeni oturumun görünmesi ve hiçbir çıkışın kendiliğinden çalışmaması gözlenir.

Kaynak testleri fiziksel kabul değildir. İlk canlı sürümün kabulü: tek bir gerçek Hub ve Kamera-01 için kimlik/sürüm/sağlık doğru görünür; eski veri yenilenmiş gibi görünmez; bağlantı kesintileri ayrılır; telefon aynı özel adresten yetkili olarak okuyabilir; restart komut üretmez. Ancak bu kanıtlardan sonra oda/varlık otomasyonuna geçilir.

## Açık kararlar

Güncel yerel kaynak commit'i ve çalışan firmware kimlikleri bilinmiyor. Evde sürekli açık kalacak ağ geçidi cihazı belirlenmedi. İlk tercih mevcut Python servisinin çalıştığı ev bilgisayarıdır; çalışma sürekliliği doğrulanmalıdır. Sites sunucu API'si için kullanılabilir kimlik/servis yetkilendirmesi, depolama ve ağ politikası henüz seçilmedi; tarayıcıdan ESP erişimiyle geçici çözüm yapılmaz. Bu açık noktalar çözülmeden canlı bağlantı hazır veya gerçek cihaz açılışı sorunsuz diye raporlanmaz.

8 Kasım uygulama güncellemesi: Kullanıcı sürüm farkının geliştirmeyi engellememesini istedi. Cihazdan bağımsız çekirdek uygulandı; ağ geçidi/bulut ve panel entegrasyonu ayrı aşamalardır. Ayrıntılı uygulanan sözleşme için DEVICE-RUNTIME.md esas alınır.
