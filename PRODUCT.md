# ARMUT V2

## Güncel ürün
Home Assistant benzeri, kişisel kullanım için sade ve responsive ev otomasyonu paneli. Mevcut Cihazlar sayfasının grafik/yeşil estetiği tüm sayfaların referansıdır. Donanım haritası yardımcı bölümdür; ana ürün gerçek cihaz durumu, kameralar, kontroller, odalar, sahneler ve otomasyonlardır. Bu panel ilk aşamadır. Ürün hedefi, V1’in Türkçe konuşan ve kullanıcının amacını takip eden kişisel ev asistanı kimliğini korumaktır. Asistanın uygulanması sonraki aşamadır; APK, servo ve internetten ev erişimi bu paketin kapsamı dışındadır.

## Çalışma biçimleri
- Statik önizleme: bağımlılıksız HTML/CSS/ES modülleri, tarayıcı kaydı, açık test alanı. Kurallar panel açıkken çalışır.
- Yerel denetleyici: bağımlılıksız Node.js22+ servisi; aynı panel, kalıcı dosya kaydı, merkezi otomasyon, kimliği doğrulanmış ESP32 raporu/ACK ve kamera proxy'si. Tarayıcı istemcidir, ikinci otomasyon motoru çalıştırmaz.

## Veri ve sınırlar
inventory.json tek donanım/kanıt kaynağı kalır; canlı durum ve ev ayarları ayrı tutulur. local-data klasörü kullanıcı anahtarları ve kalıcı ev verisidir, Git/yayın/kurulum paketine konmaz. Cihaz ekleme kaydı, firmware entegrasyonu ve gerçek çalışırlık farklıdır. Node/HTTP ve C host testleri fiziksel başarı değildir. ESP-IDF5.5 gerçek derlemesi, elektriksel davranış ve25FPS ayrıca ölçülür.

## Başlangıç
BASLA.md tek başlangıç rehberidir. docs/LOCAL-CONTROLLER.md sunucu sözleşmesini; docs/ESP32-INTEGRATION.md gerçek firmware entegrasyonunu açıklar. Üretim servisi otomatik kurulmaz veya cihazlara yükleme yapılmaz.
