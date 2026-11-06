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
