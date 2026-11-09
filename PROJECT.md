# ARMUT V2

## Amaç

ARMUT'u temiz bir başlangıçla, daha sade ve kararlı adımlarla geliştirmek. Geliştirme kullanımını azaltırken doğruluk, güvenlik ve gerekli doğrulama korunur.

Panelin ana amacı, kullanıcı ve geliştirme asistanı için güvenilir, şeffaf ve okunabilir donanım haritasıdır: hangi cihaz/modülün nereye bağlı olduğunu, hangi GPIO’nun ne için kullanıldığını ve yeni donanım eklenirken hangi kısıtların dikkate alınacağını göstermek. Manuel pin düzenleme, sorun ve özel değişikliklerde kullanıcı müdahalesi için yardımcı araçtır.

Bir pinin envanterde kullanılmaması, fiziksel olarak boş veya yeni iş için kullanılabilir olduğunun kanıtı değildir. Kullanım/ayrılma, kart kısıtları ve doğrulama kaynağı ayrı gösterilmelidir. Kart modeli/revizyonu bilinmiyorsa kullanılabilir pin listesi kesinmiş gibi sunulmaz. Kaynak, kullanıcı bildirimi, fiziksel gözlem, tarihsel kayıt ve belirsizlik ayrımı görsel sadeleştirme sırasında kaybolmamalıdır.

Animasyonlar bağlantıları okumayı kolaylaştırır; demo akışı gerçek enerji, çevrimiçi durum veya çalışır sensör kanıtı değildir. Kullanıcı ve asistan aynı envanter/doğrulama kaynağına başvurmalı; kod geliştirme kararı doğrulanmamış boş pin varsayımına dayanmamalıdır.

## Güncel durum

6 Kasım 2026 — güvenilir donanım haritası paketi uygulandı ve doğrulandı:
- Tek inventory.json: kaynaklı ESP32-S3/UNO referans pin kapsamı, yonga kısıtları, firmware rezervasyonları, modül kapsamı (kaynak/belge/tarihsel) ve ortak ses saatleri eklendi. Önceki claims ve tüm bağlantı değerleri korundu.
- GPIO / pin haritası arama/filtre, bağlantı sahibi ve kanıt/kısıt ayrıntılarıyla çalışır. Kayıtsız pin boş sayılmaz; profil header yerleşimi değildir. GPIO41/42 gibi kaynakta atanmamış pinlerin JTAG işlevi ayrıca gösterilir. Hiçbir mevcut pin kullanılabilirliği doğrulanmış olarak işaretlenmedi.
- Manuel değişiklikte geçersiz GPIO reddi, açık çakışma/kısıt onayı, kaynak rezervasyonlarının modül silmede korunması ve geri al doğrulandı. Salt okunur analiz yanlışlıkla veri değiştirmeyecek şekilde düzeltildi ve regresyonla korundu.
- Panel JSON raporu ve hardware-report.mjs CLI aynı analyzeHardware çıktısını üretir. Kart doğrulamasının tarih/kaynakları da raporda korunur. Bütün modül dosyaları tek sürüm kimliğiyle yüklenir; eski/yeni önbellek karışımı denetlenir.
- Doğrulama: tüm Node testleri ve modül sözdizimi kontrolleri geçti. Tarayıcıda masaüstü (1280/920), mobil (390/320) taşma, harita arama/filtre/kaynak, kart/sensör modalı, geçersiz ve çakışan GPIO, onaylı düzenleme/geri al, JSON rapor indirme ve bozuk/boş JSON ile yeniden yükleme kontrol edildi. Son indirilen Hub raporu CLI analiziyle birebir karşılaştırıldı. Konsolda hata/uyarı görülmedi. Test değişiklikleri yalnız test sekmesinde yapılıp temizlendi; inventory.json içine test verisi yazılmadı.
- Sınır: gerçek kart üretici/revizyonu, header erişimi, fiziksel boş pinler, güç bütçesi ve güncel çalışma durumu doğrulanmadı. Cihaz erişimi/yükleme/servis işlemi/dış yayın yapılmadı. Animasyon kullanıcı isteğiyle temsili demo olarak kalır.
- Geri dönüş kopyası: yerel geri dönüş kaydı (cloud deposuna aktarılmaz).


## Arayüz ve çalışma sözleşmesi
- Bağımlılıksız HTML/CSS/ES modülleri; tek inventory.json. Backend veya framework eklenmez.
- Genel bakışta temsili Hub merkezli animasyonlu cihaz şeması, Cihazlar sayfasında arama/filtre ve cihaz kartları. Cihaz ayrıntısında pin haritası ve modül topolojisi; merkez cihaz kart/besleme modalını açar.
- Sensör düzenleme yalnız ortak modalda. Pinler kapalı Pin bağlantıları bölümünde; bağlantı sayısı başlıkta, Pin ekle içeride. Silme onaylıdır, geri al vardır. Düzenleme önce bellekte; kalıcılık kullanıcı seçtiği JSON dosyasınadır.
- Kaynak/bildirim/tarihsel gözlem/çelişki ayrımı korunur. Kamera 1 servo/IMU derleme profili kapalı; Uno köprüsü tarihsel. Hub amfi SD VIN/3V3 ile GND kayıtları çelişkilidir. Bunları varsayımla çözme.
- Gizli anahtar, kişisel veri, görüntü veya model dosyası ekleme. Cihaz erişimi, pin denemesi, test tonu, firmware/OTA, telefon yükleme, eski projede değişiklik ve dış yayın ayrıca yetkilendirilmiş değildir.
- Kullanıcı bu donanım haritası paketinde ekran testlerini yetkilendirdi. Odaklı kontroller, önemli ortak değişikliklerde uygun regresyon; tek sorumlu ve az tekrarla çalışma tercih edilir.

## Cloud aktarımı
Kullanıcı Codex Cloud’da geliştirmeye devam etmek için aktarımı istedi. Yeni proje eski ARMUT deposundan ve cloud ortamından ayrı tutulur; GitHub deposu gizli olmalıdır. Kaynak kod, statik varlıklar, inventory.json ve gerekli test/talimatlar aktarılır; yerel yedekler, kimlik bilgileri ve eski projenin tamamı aktarılmaz.

Kaynak referansları proje-göreli kimliklerle ve yalnız kullanılan satırların LF-normalize SHA-256 kontrollü snapshot metniyle taşınabilirdir. source.sha256 özgün dosyanın geçmiş inceleme hashidir; snapshot.sha256 yalnız özet metninin hashidir. Bu kayıtlar özgün dosyanın bugün hâlâ aynı olduğunu veya donanımın çalıştığını ispatlamaz. Cloud’da eski dosyaların varlığına ihtiyaç yoktur. Yerelde source-check.mjs --root ile özgün dosyalar ayrıca karşılaştırılabilir.

6 Kasım 2026 — aktarım tamamlandı:
- Gizli GitHub deposu: https://github.com/ylmzcqn/ARMUT_V2_TEMIZ, dal: main. Bağımsız klonda tüm testler ve source-check.mjs geçti.
- Ayrı Codex Cloud ortamı: ARMUT_V2_TEMIZ. Yalnız bu depoya bağlı, erişim Yalnızca ben; yayımlandı ve çalıştırılabilir durumu doğrulandı. Ortam kimliği: 56d8d2ac-c6d4-4ae5-a885-0207c46ff92f~asenvcfg_08c9dcf655d08191896702a82513e5d7.
- Cloud kurulum raporu: Node.js 24/Python 3 ile 40 test, kaynak bütünlüğü ve HTTP envanter yükleme başarılı. Yeniden kullanılabilir başlangıç talimatları ortama kaydedildi. Yeni geliştirme görevinin yayımlanmış snapshot üzerinden başlatılması henüz ayrıca denenmedi.
- Eski proje/ortam değiştirilmedi. Bu işlem geliştirme ortamı aktarımıdır; site hosting yayını veya fiziksel donanım doğrulaması değildir. Yeni Cloud sohbetinde bu ortamı seçip AGENTS.md ve PROJECT.md üzerinden devam et.

## Açık işler ve sınırlar
Yazılım/sunuma ilişkin donanım haritası ve testler hazırdır. Takılı kartların tam üretici/model/revizyonları, fiziksel header erişimi, bellek varyantları, besleme/GND ve kullanılacak pinin gerçek durumunu yeni kanıtla tamamlamak gerekir. Canlı veri sağlayıcı bağlı değildir; animasyon temsili demodur.

## Özel panel yayını — 7 Kasım 2026
Kullanıcı telefonundan incelemek için özel web yayınını yetkilendirdi. Sites üzerinde yalnız sahibine açık sürüm 1 yayımlandı: https://armut-v2-panel.jadeelm.chatgpt.site
Site kimliği: appgprj_6aef44c1c4bc8191897d459edbbea5ff. Yayın çalışma kopyası: /workspace/sites/armut-v2-panel; manifest .openai/hosting.json içindedir. Sonraki yayınlarda aynı Site kimliğini ve özel erişimi koru. Kaynak commit: c2dd962d5e4a0c9936f7bbc26f3d451911042052. 40 test ve kaynak bütünlük kontrolü geçti; yayın servisi başarı bildirdi. Tarayıcı aracı kullanılamadığı için bu oturumda görsel kontrol yapılmadı. JSON düzenlemeleri mevcut dosya kaydetme/indirme sözleşmesini korur; cihazlar arasında otomatik eşitleme yoktur.

7 Kasım 2026 — özel panel sürüm 2: Cihazlar listesine cihaz kimliği/adı/özeti ve modül adı araması, Türkçe karakter normalizasyonu, tür filtresiyle birleşik sonuç sayacı ve temizleme eklendi. Ayrıntıdan dönüşte sorgu bellekte korunur. 41 test, kaynak bütünlüğü ve app sözdizimi geçti. Sites yayını başarıyla tamamlandı; erişim yalnız sahipte korundu. Yayın commit: c3e55a444efa88f06e52e764c76acf94c5d59bd0. Mobil görsel/etkileşim kontrolü henüz yapılmadı.

## Gerçek cihaz mimarisi — 8 Kasım 2026
Kullanıcı gerçek cihazlara kontrollü geçiş için mimari hazırlığını istedi. docs/ARCHITECTURE.md mimari önerisini, kaynak kanıtlarını, canlı durum sözleşmesini, başlangıç sırasını ve fiziksel kabul ölçütlerini içerir. İlk aşama salt okunur Hub/Kamera-01 sağlığı; envanter ile telemetri ayrılır, yeniden bağlantı fiziksel komut üretmez. Mevcut statik panel ve yayın değiştirilmedi; entegrasyon uygulanmadı. Eski GitHub commit 4bc3e5a8812e5349b9802ea4120247b4e5befb0e Hub pin/ekran tanımlarında V2 snapshotlarından farklıdır. Sıradaki bağımlılık: yereldeki güncel kaynak ve çalışan firmware kimliklerini eşleştirmek; ev ağ geçidi sürekliliği ve özel bulut API yetkilendirmesini belirlemek.

## Cihazdan bağımsız çalışma zamanı — 8 Kasım 2026
Kullanıcı sürüm farkını mimari geliştirmenin ön koşulu olmaktan çıkardı. device-runtime.mjs uygulandı: açık cihaz/rol/yetenek kaydı, kararlı bileşen kimliği, adaptör oturumu ve sıra doğrulama, kaynak yaşını koruyan monotonik tazelik, bağlantı kaybı ve yeniden başlatmada eski gözlemi devralmama. Envanter/telemetri ayrı; komut ve donanım yan etkisi yok. docs/DEVICE-RUNTIME.md uygulanan API ve adaptör sorumluluklarını, docs/superpowers/plans/2026-11-08-device-runtime.md planı açıklar. 50 test ve source-check geçti. Canlı ağ adaptörü, sunucu API yetkilendirmesi ve panel bağlantısı henüz uygulanmadı; özel yayın görünümü değişmedi. Sıradaki adım, bu çekirdeğe tek veri sağlayıcısı bağlayacak adaptör ve panel entegrasyonudur; firmware farkını çözmek bağımsız geliştirme için engel değildir.

## Sıradaki hedef — 8 Kasım 2026
Kullanıcı bu hedefi birazdan geliştirmek üzere not almamızı istedi; henüz uygulama talep etmedi. Durum çekirdeği tek veri sağlayıcısıyla panele bağlanacak. Hub/Kamera-01 için son haberleşme, bağlantı ve veri gecikmesi gösterilecek. Önce açıkça test olarak işaretlenen sağlayıcıyla veri gelişi, kesinti, sırasız/gecikmiş yanıt ve yeniden bağlantı doğrulanacak; test verisi gerçek inventory.json içine yazılmayacak. Kabul: veri eskidiğinde çevrimiçi etiketi kalkar; yeniden bağlantıda eski oturum yanıtı kabul edilmez; gerçek adaptör aynı arayüze takılabilir. Kullanıcı bu hedefi koruyarak diğer akıllı ev geliştirme fikirlerini değerlendirmek istiyor.

## Değerlendirilecek akıllı ev fikirleri — 8 Kasım 2026
Kullanıcı aşağıdaki fikirleri mantıklı buldu ve not alınmasını istedi. Bunlar uygulanacak kesin kapsam veya uygulama onayı değildir:
- Oda ve işlev modeli: fiziksel cihaz kimliğini odanın işlevinden ayırmak; cihaz değişiminde otomasyon bağlarını korumak.
- Gözlemleri anlamlandırma: hareket, yakınlık ve varlık ayrımı; tek sensör sessizliğinden oda boşluğu çıkarmamak.
- Ev çalışma modları: evde, dışarıda, uyku ve misafir durumları için tutarlı kural kapsamı.
- Karar öncelikleri: fiziksel düğme, kullanıcı komutu ve otomasyon çakışmalarında açık öncelik ve manuel müdahale süresi.
- Otomasyonları önce izleme: fiziksel çıkış üretmeden kuralın yapacağı eylemi kaydetmek ve yanlış tetiklemeleri değerlendirmek.
- Karar açıklaması: eylemin/eylemsizliğin sensör, kural ve kullanıcı müdahalesi nedenlerini göstermek.
Önerilen sıra henüz kesinleşmedi: canlı durum bağlantısı, oda/işlev modeli, ardından tek senaryoda izleme modu. Kullanıcı biraz daha düşünmek istiyor; tümünü gerçekleştirme onayını daha sonra verecek. Sıradaki hedef dahil yeni geliştirme, uygulama veya yayın başlatılmayacak; bu aşamada yalnız fikir değerlendirmesi ve not tutulması isteniyor.

## Yapılacaklara eklenen: Otomasyonlar sayfası — 8 Kasım 2026
Kullanıcı otomasyon sayfasının yapılacaklara eklenmesini istedi; bu kayıt uygulama veya yayın başlatma onayı değildir.
- Donanım haritasından ayrı bir Otomasyonlar sayfası; aynı projede, şimdilik aynı sohbet ve tek uygulayıcıyla geliştirilecek.
- Sade kural yapısı: Ne zaman → varsa koşul → yapılacak eylem. İlk kapsam: otomasyon listesi, ekleme/düzenleme, etkinleştirme/devre dışı bırakma ve son çalışma sonucu/hata.
- Panel ve otomasyon aynı ortak cihaz/komut yolunu kullanacak. Basit aç/kapat ihtiyacı için gereksiz ayrı sistemler kurulmayacak; kalıcılık ve çalıştırma yeri uygulama öncesinde netleştirilecek. Sayfa oluşturmak çalışan otomasyon motoru veya gerçek cihaz kontrolü tamamlandı demek değildir.
- Yapay zekâ/asistan bu aşamanın dışında; ileride mevcut işlevleri kontrol eden arayüz olarak düşünülecek. Ayrı kodlama ajanı veya paralel geliştirme şu an planlanmıyor.

## Ana ürün yönü ve kamera kapsamı — 8 Kasım 2026
Kullanıcı ARMUT'un ana hedefini netleştirdi: Home Assistant benzeri, sade ve responsive bir ev otomasyonu paneli. Ürün donanım envanterinden ibaret değildir; donanım haritası yardımcı bölümdür. Cihaz durumları, cihaz kontrolü, otomasyonlar ve gerçek kamera görüntüsüne erişim temel işlevlerdir. Home Assistant benzerliği ürün kullanım yönüdür; Home Assistant altyapısına geçiş kararı değildir.
Kamera sayfası salt durum kartı olmayacak; seçilen kameranın gerçek JPEG/MJPEG görüntüsünü panel içinde gösterecek. Responsive web yeterli; mobil APK ve ev dışı erişim kurulumu şu an kapsam dışı. Servo yön kontrolü şimdilik etkinleştirilmeyecek; mevcut tarihsel donanım kayıtları bunun için değiştirilmez.
Görüntü profilleri: Akıcı (en az 25 FPS hedefi; gerçek cihazda ölçülmeden garanti edilmez), Az ışık (pozlama/FPS dengesi), Ayrıntılı (çözünürlük önceliği). Seçili kameranın canlı yayını, yayın kesildiğinin açık gösterimi, profil değişiminde kontrollü yeniden başlatma ve sayfadan ayrılınca bağlantının bırakılması hedeflenir. Cihaz olmadan gerçek görüntü varmış gibi örnek yayın sunulmaz; bağlantı altyapısı ile fiziksel görüntü/FPS doğrulaması ayrı raporlanır.
Kullanıcı fikir ve kapsamı netleştirme aşamasındadır; önceki toplu uygulama onayını daha sonra verme kararı devam eder. Bu mesaj ürün yönünü ve görüntü ihtiyacını vurgular; tek başına firmware yükleme veya canlı cihaz erişimi yetkisi değildir.

## Görsel bütünlük — 8 Kasım 2026
Kullanıcı mevcut Cihazlar/donanım sayfasının estetiğini açıkça beğendi ve tüm yeni sayfalarda aynı tasarım dilinin korunmasını kritik gereksinim olarak belirtti. Referans mevcut Cihazlar sayfasıdır; yeni bir tema veya görsel yeniden tasarım istenmiyor. Renk paleti, tipografi, kart yüzeyleri/kenarlıkları/köşeleri, boşluklar, ikon dili, başlıklar, gezinme, menü/modal ve responsive davranış ortak olmalı. Yeni sayfanın içeriğine uygun yerleşim değişebilir; görsel kimliği değişmez. Genel bakış, Kameralar, Otomasyonlar ve sonraki sayfalar mevcut ortak stil/bileşenleri kullanmalı; sayfa başına bağımsız tema ve yinelenen CSS sistemi kurulmaz. Kullanıcı bu aşamada ek sayfa fikirleri istiyor; uygulama başlatılmadı.

## Ev paneli uygulaması — 8 Kasım 2026
Kullanıcı bu akşam konuşulan kapsamı soru sormadan uygulama ve özel yayına alma yetkisi verdi; önceki bekleme/onay notları bu istekle aşılmıştır. Genel bakış, Odalar, Kameralar, Otomasyonlar, Sahneler, Geçmiş ve Ayarlar uygulandı; mevcut Cihazlar görünümü/kanıtları korundu. Ortak grafik/yeşil tasarım değişkenleri ve minimal kart/form dili kullanılır.
Yeni home-model/runtime/panel modülleri: tarayıcıda kalıcı oda/işlev/kamera/kural/sahne ayarları ve yedekleme; device-runtime'a bağlı tek durum sağlayıcısı, ayrı test modu, boot/onay doğrulamalı ortak aç/kapat yolu; ev modları, manuel öncelik, izleme ve panel açıkken çalışan basit otomasyonlar. Kamera görüntüleyicisi gerçek JPEG/MJPEG adresine bağlanabilir; üç profil, ölçülen kare FPS'i, kesinti/retry, fotoğraf, tam ekran ve yön seçenekleri vardır. Servo/asistan/APK eklenmedi.
68 Node testi, kaynak bütünlük kontrolü ve DOM etkileşim/rota kontrolleri geçti. Gerçek tarayıcı CUA runtime'ı kullanılamadı; sites-preview rölesi 4173 için zaman aşımına uğradı. Bu nedenle mobil çizim/taşma ve görsel eşdeğerlik bu oturumda gözlenmedi. DOM kontrolü gerçek tarayıcı testi değildir.
Gerçek cihazlar ve firmware değiştirilmedi. Gerçek görüntü/25 FPS/fiziksel komut başarısı henüz ölçülmedi. HTTPS panelden HTTP LAN bağlantısı tarayıcı engeline takılabilir; adres/HTTP sözleşmesi docs/HOME-PANEL.md içinde. Zaman otomasyonları sürekli sunucu işi değildir, panel açıkken yürür. Ev ayarları bu tarayıcıdadır; cihazlar arası eşitleme yoktur. Yayın aynı özel Site kimliğini kullanacaktır; kaynak hosting kimliği .openai/hosting.json içine de kaydedildi.

Yayın sonucu: aynı sahibi-özel Site üzerinde ev paneli başarıyla yayımlandı: https://armut-v2-panel.jadeelm.chatgpt.site . Kaynak Site commit: a358938db77add2f61017036472f2d6e43837447; deployment: appgdep_6af10044021c8191a51e935a33982ad4; saved version: appgprj_6aef44c1c4bc8191897d459edbbea5ff~appgver_98bf8dd9ffac8191be3dd5cf121bc4e4. Backend status succeeded. Yayın doğrulaması görsel tarayıcı veya fiziksel cihaz doğrulaması değildir. Çalışma deposu uygulama commit'i efd7c82.

## Test alanı ve otomasyon denemesi — 9 Kasım 2026
Kullanıcı geliştirmeye devam edilmesini istedi. Somut eksik: önceki test işlevleri otomasyon formunun home.entities listesinde olmadığı için uçtan uca kural denemesi yapılamıyordu. Test alanı geçici ev kopyasına alındı; test odası/işlevleri formda seçilebilir. Geçici düzenlemeler localStorage'a yazılmaz; çıkışta gerçek ev, manuel öncelikler ve zaman kuralı izleri geri yüklenir. Test yedeği gerçek evi döndürür; test modunda gerçek kamera bağlantısı başlatılmaz. Otomasyonlara Kuralı dene eklendi: komut göndermeden, ev modu koşulunu koruyarak eylem önizlemesi; lastPreview normal lastRun kaydından ayrıdır, geçmişte kural adı görünür. Testte yeniden bağlanma geçici kuralları korur.
72 kaynak testi, source-check ve DOM uçtan uca akışları geçti. Kod incelemesinde veri sızıntısı veya gerçek komut için yeni engel bulunmadı. Tarayıcı kontrol aracı sandbox hatası verdi; görsel/mobil çizim bu oturumda doğrulanmadı. Gerçek cihaz/firmware değişikliği yapılmadı. Aynı özel Site üzerinde yayımlanacak.
Yayın başarılı: https://armut-v2-panel.jadeelm.chatgpt.site . Site kaynak commit bc8a59d5e5f3b1f46944674047fc345d5541059c; deployment appgdep_6af1c0fae37081918ba051e987f8f7ea; saved version appgprj_6aef44c1c4bc8191897d459edbbea5ff~appgver_0c63a18587f48191ba6430dc432313d1. Çalışma deposu uygulama commit 264d7d2. Özel erişim korunmuştur.
