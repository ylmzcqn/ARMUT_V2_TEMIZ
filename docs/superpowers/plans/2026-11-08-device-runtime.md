# Cihaz ekleme temeli uygulama planı

Kullanıcı sürüm farkını engel olmaktan çıkardı; bağımsız, cihaz eklemeye hazır mimari geliştirilmesini istedi. Firmware, fiziksel erişim ve canlı ağ kurulumu bu pakette yoktur.

1. device-runtime.test.mjs: kayıt/yetenek eşleme, geçersiz veri, sırasız mesaj, oturum değişimi, eskime, bağlantı kesintisi ve kayıt dışı cihaz testlerini yaz; eksik modül nedeniyle kırmızıyı gözle.
2. device-runtime.mjs: ağdan bağımsız doğrulayıcı ve salt okunur durum deposu geliştir. Adaptör oturumu açıkça başlatır; eski oturum ve sıra numarası reddedilir. Girdi kopyalanır, geçersiz mesaj önceki durumu değiştirmez. Envanter ile telemetri ayrı kalır. Fiziksel komut yolu yoktur.
3. Testleri ve kaynak kontrolünü çalıştır; sözleşmeyi ve adaptörün sorumluluklarını belgeleyip PROJECT.md durumunu güncelle. Görsel değişiklik olmadığı için yayın gerekmiyor.
