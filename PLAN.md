# Donanım envanteri uygulama planı

Onaylanan kapsam: statik liste ve ayrıntı, tek inventory.json; ek backend yok.

1. İlgili eski donanım kaynaklarından dosya/satır/SHA referanslı iddiaları çıkar. Kaynak, bildirim, tarihsel fiziksel gözlem ve belirsizlikleri ayır.
2. Envanter sözleşmesi ve hata durumları için odaklı doğrulama yaz; başarısız başlangıcı gözle.
3. Bağımlılıksız arayüzü uygula; yalnız inventory.json oku, cihazlara ağ isteği yapma.
4. Gerçek envanter, boş/bozuk/veri erişim hatası ve seçim davranışını doğrula. PROJECT.md güncelle.

Geri dönüş: başlangıç dosyaları [yerel geri dönüş kopyası] altında. Git henüz ilk commit içermiyor; mevcut kullanıcı dosyaları korunur. Yeni dosyalar tek paket halinde kaldırılabilir.

## Koyu ana panel paketi
Kullanıcı yönüyle aynı statik uygulamada koyu tema, genel bakış ve cihaz kartları; envanter ve kaynak sözleşmesi korunur. Kaynak testleri, tarayıcı gezinmesi ve mobil taşma kontrolü tamamlandı. Kullanıcı incelemesi için yalnız localhost sunumu açık bırakıldı. Geri dönüş kopyası: [yerel geri dönüş kopyası]

## Bağlantı düzenleyicisi
İç kaydırma kaldırıldı; modül seçimi + tekil kablo düzenleme, kullanıcı düzenlemesi geçmişi, geri al ve JSON kaydet/indir/aç tamamlandı. Hoparlör yükselticiye doğrudan yönlendirildi. Yerel modül SVG’leri oluşturuldu. Kaynak testleri ve düzenle/geri al/JSON indir-aç/mobil arayüz doğrulandı. Doğrudan dosya yazma kullanıcı seçimiyle ayrıca denenebilir.


## Güvenilir donanım haritası — 6 Kasım 2026
Kabul: Kullanıcı ve asistan aynı JSON’dan GPIO kullanımını/kaynağını, tarihsel ve ayrılmış pinleri, ortak hatları ve belirsizlikleri okuyabilir. Kayıtsız pin kullanılabilir sayılmaz. Manuel değişiklik haritayı anında günceller; çakışmalar gizlenmez. Masaüstü ve mobil tarayıcı testleri bu paket için yetkilidir.
- [x] Kaynaklı yonga profilleri ve cihaz rezervasyonlarını veri sözleşmesine ekle; gerçek kart kimlikleri belirsiz kalır.
- [x] Test öncelikli ortak pin analizini uygula: kaynak, tarihsel kullanım, paylaşımlı hat, olası çakışma ve besleme ayrımı.
- [x] Okunabilir arama/filtreli pin haritası, kaynak ayrıntıları ve aynı raporu üreten CLI/JSON dışa aktarımı.
- [x] Manuel düzenlemede GPIO doğrulama/uyarı; tarihsel ve kullanıcı kayıtlarının korunması.
- [x] Kaynak regresyonu; masaüstü/mobil gezinme, düzenleme/geri al, hata/boş durum ve ekran doğrulaması.
- [x] PROJECT.md ve kullanım belgesinde uygulanmış durum ile fiziksel açık işleri ayır.
