# ARMUT V2: gerçek cihazlara geçiş mimarisi

Durum: 8 Kasım 2026, mimari önerisi ve uygulama kabul ölçütleri. Bu belge çalışan entegrasyon değildir. Cihazlara bağlantı, firmware yüklemesi, servis kurulumu veya otomasyon etkinleştirmesi yapılmadı.

## Güncel hedef ve yayın kapasitesi — 10 Kasım 2026

Kabul: kod ve panel/backend bulutta kalır; Windows PC kapalıyken PC/telefon aynı özel panelden Kamera 2’nin gerçek var/yok/bilinmiyor durumunu okur. Kullanıcının PC’sine proje, Node sunucusu veya yardımcı servis kurmak çözüm değildir. Önce tek radar akışı; görüntü sonraki paket. Aşağıdaki 8 Kasım önerileri tarihsel kayıttır; bu güncel hedef onları önceler.

Doğrulanan yayın hedefi Sites’tır: `.openai/hosting.json` aynı proje kimliğiyle `static.directory=dist` içerir; mevcut yayın statiktir. Sites resmî beceri belgeleri `dist/server/index.js` Worker ESM backend’ini ve isteğe bağlı D1/R2 depolamayı destekler. Worker istekte çalışır; geliştirme VM’si, Windows PC veya sürekli Node süreci değildir. Bu salt okunur paket için her istekte güncel kaynağı okumak yeterlidir; geçmişi taze sanmamak için yeni veritabanı/kalıcı radar önbelleği eklenmedi.

Cloudflare’ın resmî [Workers VPC](https://developers.cloudflare.com/workers-vpc/) belgesi özel HTTP servisine Cloudflare Tunnel ve `vpc_services` servis binding’i ile, belirli host/port’a sınırlı erişim tarif eder. Genel [TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/#troubleshooting) belgesi localhost/özel IP’ye normal çıkışın kısıtlandığını belirtir. Bu oturumda resmî docs alan adı ağ politikasınca engellendi; aynı belgelerin Cloudflare’a ait `cloudflare/cloudflare-docs` deposundaki `production` kaynakları okundu. Güncel VPC belgesi beta ve beta sırasında ücretsiz olduğunu söylüyor; bu hesapta kullanılabilirlik/fiyat taahhüdü veya otomatik kurulum sayılmaz.

**Önemli sınır:** Sites’ın belgelenen manifest/binding araçlarında VPC service/tunnel alanı gösterilmedi; mevcut Sites projesine bu binding’i provision etme kapasitesi doğrulanmadı. Cloudflare Workers’ın genel özelliği Sites hesabında kullanılabilir diye varsayılmaz. Geliştirme ortamının Tailscale bağlantısı yayın Worker’ına aktarılmaz; bunun için VPN menüsü aranmamalı.

### Uygulanan ve çevrimdışı doğrulanan

`cloud-presence-worker.mjs` aynı Sites özel oturum kimliğiyle yalnız GET `/api/presence` sunar. Mevcut `legacy-camera-provider` ve V1 `/api/system` ayrıştırıcısını kullanır. Yalnız özel servis binding’i açıkça mevcutsa bu kaynaktan veri ister; normal/public fetch ile LAN’a geri dönüş yapmaz. Kaynak yokken `sourceReady=false`, varlık null döner. Kamera tokenı yalnız backend env’indedir; kullanıcıya kamera JSON’u, tokenı, adresi veya video dönmez. Binding’in adı kaynak kodunda bir **gelecek entegrasyon noktasıdır**, bugün Sites’ta kurulduğu iddiası değildir.

`node build-cloud.mjs` aktif statik manifesti değiştirmeden `build/cloud-prepared` altında aynı proje kimliğiyle Worker/varlık paketi oluşturur. Mevcut HTML/CSS/browser modül grafiği ve envanter taşınır; Node sunucusu, sırlar, çalışma verisi ve testler pakete alınmaz. Mevcut cloud panelinde yalnız aynı origin’e, özel oturumla okuma modu hazırlanmıştır. Yerel IP/yönetici anahtarı formu cloud hedefinin varsayılan yolu olmaktan çıkarıldı. Bu build/yazılım testi yayın veya gerçek ağ kabulü değildir.

### Özel bağlantı için seçenekler ve eksik tek bilgi

| Yol | Gereken ve etki | Şimdiki durum |
| --- | --- | --- |
| Mevcut router veya zaten sürekli açık uygun ağ cihazı → tek kamera HTTP servisine özel tünel → cloud backend | Windows gerekmez; V1 firmware korunur. Router/connector kurulumu, yalnız Kamera 2 host/port erişimi ve backend binding/ACL için somut kurulum yetkisi gerekir. | İlk tercih; router modeli/yetenekleri ve Sites binding olanağı henüz bilinmiyor. Tailscale kurulu PC uygun kalıcı uç değildir. |
| Mevcut Hub/ESP’den yalnız radar özetinin dışarı HTTPS gönderilmesi → kalıcı cloud backend | PC ve gelen port açma gerekmez. Mevcut firmware’de uygun dışarı yayın yoksa firmware/OTA değişikliği, backend alım/kalıcılık ve dar yayıncı yetkisi gerekir. | Kaynakta yerel node/sync var; cloud yayını yaptığı doğrulanmadı. Ayrı gerçek cihaz/yükleme kararı olmadan uygulanmaz. |
| Ayrı kalıcı cloud backend + evde uygun özel connector | Sites VPC bağlaması yoksa statik özel panel korunarak ayrı backend değerlendirilebilir; hesap/ücret, kimlik ve özel ağ bağlantısı ayrıca seçilir. | Hesap/servis satın alınmadı, dış yayın yapılmadı. Evde uygun uç gereksinimini tek başına ortadan kaldırmaz. |

Bir sonraki gerekli bilgi yalnız **ev modem/router’ının marka-modelidir**. Önce mevcut donanımla PC’den bağımsız yol olup olmadığı kontrol edilir. Uygun değilse Hub’dan dışarı yayın ve gerekirse ayrı backend için gereken tek paket karar kullanıcıya somut etkileriyle sunulur; yeni donanım/ücretli servis/firmware/router değişikliği varsayılmaz. Şu aşamada adres, token veya sır istenmez. Gerçek cihaz kabulü AÇIK kalır.

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
