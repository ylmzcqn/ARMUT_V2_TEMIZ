# ARMUT V2 paneli

Kullanıcı yönü: Home Assistant benzeri, karmaşık olmayan minimal ana panel; göz yormayan koyu tema.
Operate: genel bakış → cihazlar → cihaz ayrıntısı. Kalıcı ana gezinme, mobilde üst menü. İşlevsiz menü ve sahte canlı telemetri yok.

Grafit zemin #171b1a, sol menü #141817, yüzey #202623; metin #e1e7e2, ikincil metin #a6b3aa. Yumuşak yeşil vurgu #aad6b5. Sistem yazı tipi; kaynak yollarında monospace. Hareket yalnız kısa hover geçişleri; azaltılmış hareket tercihi korunur.

Tek inventory.json; kaynak/bildirim/tarihsel gözlem/bilinmeyen/çelişki ayrımı korunur. Veri gelmeme, bozuk dosya ve boş envanter durumları korunur. Kontrol veya canlı sağlık gösterilmez.

Ayrıntı ekranında uzun kanıt metinleri varsayılan kapalıdır. Üstte kısa kart bilgisi ve önemli belirsizlik; altta modül kartlarında uç/pin/besleme etiket-değer satırları bulunur. Masaüstünde iki, dar ekranda tek sütun. Kanıt türleri açılır bölümde korunur.

Modül kategorileri yerel, hareketsiz SVG simgeleriyle ayrılır. Başlığın sağında açıkça temsili kart çizimi vardır; gerçek kart pin sırası kullanılmaz. Şematik çizgiler doğrudan inventory.json bağlantı satırlarını gösterir; metin etiketleri erişilebilir kalır.

Son kullanıcı tercihi: modül kartında yalnız simge, ad, kısa model bilgisi. Ayrıntılar tıklamayla modal pencerede açılır; Escape/Kapat ve odağı geri verme korunur. Kartın yanında tıklanabilir toplu mantıksal şema, modül uçlarını kayıtlı pin/besleme değerleriyle birlikte gösterir.

Güncel şema: tam genişlik, uç başına ayrı çizgi, her iki uçta sinyal/GPIO etiketi. Sinyal yeşil, saat mavi, besleme kehribar, GND nötr; çelişki/bilinmeyen kesik çizgi. Renk dışında metin ve uç işaretleri korunur. Orta kart bağlantı eşlemesini taşır, fiziksel PCB header yerleşimi değildir.

Güncel tercih: iç kaydırmalı şema yok. Önce küçük gerçekçi modül SVG’leriyle topoloji, seçili modülde tıklanabilir tekil kablolar. Her kablo iki uç etiketi ve hedef modülle düzenlenebilir; düzenleyici kompakt modal formdur. Genel topoloji hoparlörü yükselticiye doğrudan bağlar. SVG varlıkları temsili, pin eşlemeleri inventory.json kaynaklıdır.

Üst çubuk: Windows benzeri geri oku ve bölüm adı. Ana başlıkta cihaz adı; yinelenen cihaz başlığı yok. Cihaz kartlarında ayrıntılı SVG varlıkları. Seçili modülde pin ekleme ve modül silme eylemleri; silme etkisi kısa onay penceresinde açık, geri al korunur.

Son başlık kararı: tüm rotalarda tek sayfa/cihaz başlığı üst çubukta, geri okunun yanında. İçerikte aynı başlık yinelenmez.

Araç çubuğu sadeleştirmesi: tek modül seçicisi; yanında Pin ekle ve kapalı Diğer menüsünde silme. Dosya işlemleri başlığın sağındaki İşlemler menüsünde. Menü kapalıyken dosya adı ve düğme kalabalığı yoktur; kaydedilmemiş durum küçük metinle belirtilir.

Modül seçici artık bağlantı alanının başlığıdır; Donanım bağlantıları metni kaldırıldı. SVG’li seçim listesi masaüstünde ortalı dialog, mobilde alt panel olarak açılır. Büyük dokunma alanları ve seçili durum metni kullanılır.

Cihaz filtresi açıklama satırının sağında; modül seçicisiyle aynı mobil alt panel. Cihaz kartları yatay: SVG sol, ad/özet sağ. Liste altında genel kaynak açıklama bölümü yok; cihaza özel kanıtlar ayrıntılarda durur.

Kullanıcı yönü güncellemesi: kişisel elektronik atölyesi hissi. Modül/kartlarda küçük devre ayrıntıları, kablolarda kısa temsili sinyal geçişi; sürekli döngü yok. Yeşil/grafit temel ve sarı ses hattı korunur. Hareket canlı telemetri anlamına gelmez, azaltılmış hareket tercihiyle kapanır.

8 Kasım 2026: ürün sade ev otomasyonu paneline genişledi. Genel bakış, Odalar, Kameralar, Otomasyonlar, Sahneler, Geçmiş ve Ayarlar aynı mevcut Cihazlar estetiğindedir. `hp-` ortak yüzey/form/grid sınıfları mevcut CSS değişkenlerini kullanır; bağımsız tema yoktur. Yeni işlevlerde gerçek veri yoksa bilinmiyor/bağlantı bekliyor gösterilir, test modu açıkça ayrılır. Bu genişleme önceki “kontrol gösterilmez” kapsamını aşar; gerçek donanım başarısı yalnız cihaz onayıyla gösterilir. Mobil ana menü yatay kaydırılır, içerik kartları dar ekranda tek sütundur.
