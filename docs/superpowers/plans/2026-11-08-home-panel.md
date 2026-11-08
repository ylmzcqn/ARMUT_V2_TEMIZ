# Ev paneli uygulama planı
Kullanıcı konuşulan kapsamı soru sormadan uygulama ve özel yayına alma yetkisi verdi. Tek uygulayıcı, mevcut bağımlılıksız yapı ve Cihazlar estetiği korunur. Eski duraklama notları bu istekle aşılmıştır.

1. home-model.mjs: sürümlü yerel yapılandırma; odalar, cihaz/işlev eşleme, kamera bağlantıları, ev modları, sahneler, basit zaman/olay otomasyonları ve sınırlı geçmiş. Doğrulama/yedekleme ve komut sonuçları davranış testleri.
2. home-runtime.mjs: device-runtime kullanan tek durum sağlayıcısı; açık demo, HTTP durum adaptörü, aynı komut yolu; fiziksel sürücü yoksa komut başarı sayılmaz. Olay ve zaman kuralları panel açıkken işler; sessizlik varlık yokluğu değildir, manuel müdahale otomasyonu geçici engeller.
3. camera-stream.mjs: üç profil, JPEG periyodik görüntü ve MJPEG byte akışı; kare sayımı, watchdog/yeniden bağlantı, profil değişimi ve durdurmada kaynak bırakma. Servo yok. Profillerin cihaz tarafına uygulanması desteklenen adaptör gerektirir.
4. home-panel.mjs ve ortak CSS: Genel bakış, Odalar, Kameralar, Otomasyonlar, Sahneler, Geçmiş, Ayarlar. Form/dialog, boş/hata durumları, içe/dışa aktarma ve mevcut envanter rotaları korunur. Asistan/APK yok.
5. Kaynak testleri, tarayıcı/taşma ve etkileşim doğrulaması; kod incelemesi ve düzeltmeler; aynı sahibi özel Sites kimliğiyle yayımla, PROJECT/README durumunu güncelle.
