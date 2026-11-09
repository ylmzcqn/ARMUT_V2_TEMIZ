# ARMUT ev paneli

8 Kasım 2026. Bağımlılıksız, responsive web arayüzü; mevcut Cihazlar tasarımının renk, yüzey, köşe, yazı ve menü dili korunur. Asistan, mobil APK, servo sürüşü, gerçek cihaz yüklemesi ve ev dışı bağlantı kurulumu bu pakette yoktur.

## Sayfalar

- Genel bakış: ev modu, odalar/kameralar/kurallar sayıları, hızlı erişim, tanımlı işlev kontrolleri, sahneler ve cihaz sağlığı.
- Odalar: oluştur/düzenle/sil; cihaz atama, oda işlevleri ve kamera bağlantıları.
- Cihazlar: mevcut kaynaklı donanım haritası ve düzenleyici korunur. Canlı veri sağlayıcısı varsa cihaz etiketleri aynı runtime'dan güncellenir. Modül animasyonları gerçek çalışırlık kanıtı değildir.
- Kameralar: envanterdeki kameralar, açık bağlantı yapılandırması, seçili tek kamera görüntüleyicisi; JPEG veya MJPEG, üç profil, gerçek alınan kare FPS'i, fotoğraf indirme, tam ekran, aynalama/180 derece döndürme. Sayfa/sekme değişiminde bağlantı kapanır; arka plandan dönünce yayın kendiliğinden başlamaz.
- Otomasyonlar: saat, ev modu değişimi veya açıkça bildirilen boolean işlev değişimi → isteğe bağlı ev modu koşulu → aç/kapat. Varsayılan yalnız izleme. Etkin/devre dışı, düzenle/sil ve son çalışma sonucu. Başlangıçta geçmiş zaman için telafi komutu üretilmez. Aynı dakika yeniden çalıştırılmaz.
- Sahneler: birden fazla tanımlı aç/kapat işlevi; sırayla uygulanır, ilk belirsiz/başarısız sonuçta kalan işlemler durur. Geri alma garantisi yoktur; uygulanmış işlem geçmişte kalır.
- Geçmiş: son 200 mod/komut/otomasyon sonucu; temizleme. Yerel kayıttır, merkezi sunucu günlüğü değildir.
- Ayarlar: işlev tanımlama, yerel veri adresleri, saat dilimi, manuel öncelik süresi, yedek içe/dışa aktarma ve açık test modu.

## Kalıcılık ve çalışma sınırı

Ev ayarları `armut.home.v1` anahtarıyla bu tarayıcının localStorage alanında tutulur. Donanım envanteri yine inventory.json dosyasındadır; ev yedeği ayrı veridir ve firmware/pin değiştirmez. Başka tarayıcı veya cihazla otomatik eşitleme yoktur. Yedek içe aktarılırken doğrulanır ve mevcut yapılandırmanın değişmesi onaylanır. Bozuk yerel kayıt otomatik ezilmez.

Zaman kuralları ve izleme panel açıkken çalışır. Tarayıcı kapalı/uykudayken sürekli çalışma, kaçırılmış zamanların telafisi veya gerçek zaman garantisi verilmez. 24 saat işletim için ileride aynı kuralları kullanan yerel yürütücü gerekir. Şu an sunucu servisi kurulmadı.

Test modu yalnız oturumda tutulur ve tüm sayfalarda etiketlenir. Test ışığı/sensörü gerçek envantere yazılmaz. Test modunda gerçek işlevlere fiziksel komut gönderilmez. Bağlantı kesme ve yeniden bağlama Ayarlar test alanından denenir. İşlev eklemek veya kameraya adres yazmak donanımın gerçekten bağlı olduğunu doğrulamaz.

## Durum adaptörü HTTP sözleşmesi

Ayarlar'daki durum URL'sine kullanıcı Veriye bağlan düğmesine bastıktan sonra GET yapılır. İlk sorgu hemen, sonraki sorgu tamamlandıktan 5 saniye sonra; hatada 8 saniye beklenir. Yanıt gövdesi dahil 7 saniye timeout vardır. Tek sorgu; kesmede abort; yeni oturumda eski yanıt reddedilir. 256 KiB üzerindeki JSON gövdesi okuma sırasında kesilir. Kimlik bilgileri tarayıcıya gömülmez; fetch credentials omit kullanır. Adaptör kendi erişim kontrolünü sağlamalıdır. Kullanıcı adı/parola içeren URL reddedilir.

Örnek sözleşme (gösterim verisidir; uygulama envanterine eklenmez):

```json
{
  "devices": [{
    "deviceId": "hub", "role": "hub", "bootId": "cihazin-acilis-kimligi",
    "online": true, "observationAgeMs": 120,
    "capabilities": ["switch"], "components": []
  }],
  "entities": [{"entityId":"ayarlar-ile-olusturulan-islev-kimligi","value":false,"ageMs":120}]
}
```

role hub/camera olarak eşlenir; tarihsel Uno canlı kayda alınmaz. Device-runtime için oturum ve artan sıra numarası web adaptörü tarafından eklenir. Tanınan yetenekler camera/switch/sensor/presence/display'dir; bu bildirim tek başına komut izni değildir. İşlev kimliği Ayarlar'da görünür; aç/kapat ancak tanımlı switch işlevinde kullanılabilir. Bool değerler açıkça bildirilir; sessizlikten “varlık yok” çıkarılmaz. Sayısal sensör değeri Number olmalıdır. ageMs ve observationAgeMs kaynak önbelleği/ağ gecikmesi dahil toplam yaştır; bilinmiyorsa null gönderilir, güncel sayılmaz. Eski Hub kaydını yeniden okumak yaşı sıfırlama gerekçesi değildir.

Güncel veri 15 saniyeyi aşınca gecikmiş, 30 saniyeyi aşınca eski olur. Cihaz bootId değişince o cihaza ait önceki işlev değerleri silinir. İlk gözlem otomasyonu tetiklemez; yalnız önceki ve yeni gözlemi güncel olan gerçek değişim tetikler. Reddedilen/verilemeyen durum çevrimdışı cihazla karıştırılmaz.

## Komut adaptörü

Komut URL'sine JSON POST:

```json
{"version":1,"commandId":"tekil-id","entityId":"islev-id","value":true,"bootId":"hedef-acilis-id"}
```

Başarı cevabı, cihaz gerçekten uyguladıktan sonra:

```json
{"commandId":"ayni-tekil-id","applied":true,"value":true,"bootId":"ayni-hedef-acilis-id"}
```

8 saniye timeout; otomatik tekrar yok. Yanlış/eksik onay, boot değişimi, oturum değişimi veya ağ hatası “sonuç bilinmiyor” olarak kaydedilir. Güncel işlev gözlemi yokken komut gönderilmez. Tek işlevde eşzamanlı komut engellenir. Manuel kontrol/sahne, varsayılan 30 dakika otomasyon önceliğini erteler; süre Ayarlar'dan değişir. Kalıcı bir cihaz tarafı güvenlik kilidi değildir. Gerçek adaptör boot hedefini doğrulamalı, commandId tekrarlarını idempotent ele almalı ve kendi fiziksel sınırlarını uygulamalıdır. Bu depo ESP firmware komut sürücüsü içermez.

## Kamera adaptörü / ESP-IDF 5.5 bağlantısı

Tarayıcı görüntüleyicisi hazırdır; cihazda çalışan HTTP kamera sürücüsü bu depoda derlenmedi veya yüklenmedi. MJPEG sürekli JPEG karelerinden okunur; JPEG adresi ise her seferinde yeni kare döndürmelidir. CORS erişimi veya aynı kaynak üzerinden servis gerekir. HTTPS yayımlanmış panelden düz HTTP LAN adresine erişim tarayıcı tarafından engellenebilir; CORS tek başına mixed-content engelini çözmez. Yerel HTTP sunum ya da aynı kaynak HTTPS adaptörü kullanılmalıdır. APK/tünel/ev dışı çözüm kurulmadı.

Profiller:
- Akıcı: 640×480, JPEG quality 18, otomatik pozlama, hedef 25 FPS.
- Az ışık: 640×480, quality 16, lowlight pozlama hedefi, 12 FPS hedefi.
- Ayrıntılı: 1280×960, quality 10, otomatik pozlama, 8 FPS hedefi.

Bunlar adaptöre iletilen hedeflerdir. ESP-IDF 5.5 + sensör/PSRAM/saat/besleme/Wi-Fi ile fiziksel FPS ölçülmeden 25 FPS garantisi verilmez. Kamera sayfası gerçekten çözümlenen/alınan kare hızını gösterir. JPEG yolu HTTP gecikmesi yüzünden MJPEG'den düşük kalabilir.

İsteğe bağlı profil URL'sine `{version:1,profile:"smooth"|"lowlight"|"detail", name,targetFps,width,height,jpegQuality,exposure,note}` POST edilir. Adaptör sensörün desteklediği ayarları uyguladıktan sonra 2xx döndürmelidir. Sensör modeli desteklemiyorsa hata döndürür; görüntüleyici profil hatasını gizleyip yayına geçmez. Profil URL'si yoksa seçimin cihaz ayarlarını değiştirmediği açıkça belirtilir, yalnız istemci JPEG alma hedefi değişir. Servo komutu yoktur.

8 saniye yeni kare gelmezse yayın kesildi sayılır, eski görüntü kaldırılır. Akış hatasında en fazla üç artan beklemeli yeniden bağlantı; profil uygulama hatasında otomatik tekrar yok. JPEG kare belleği 4 MiB ile sınırlıdır. Sayfadan çıkma/sekme gizleme kullanıcı yayınına ait istekleri ve blob URL'lerini bırakır. FPS veya ses için örnek/sahte canlı veri eklenmez.

## Doğrulama

Kaynak testleri, sözleşme/oturum/eskime/komut onayı ve kamera parser/profil hatası regresyonları çalıştırıldı. Geçici DOM test ortamında yedi yeni sayfa, eski cihaz rotaları, oda/işlev/kural/sahne oluşturma ve test modu akışı doğrulandı. Bu test gerçek tarayıcı çizimi veya mobil taşma ölçümü değildir. Cloud CUA tarayıcı runtime'ı kullanılamadı; sites-preview rölesi 4173 portunda zaman aşımına uğradı. Gerçek görüntü, fiziksel kontrol ve 25 FPS cihazlarla ayrıca doğrulanacaktır.

## 9 Kasım 2026 — geçici test odası ve kural denemesi

Test modu artık ayrı bir geçici ev kopyasında çalışır. Test odası, ışık ve varlık sensörü otomasyon ve sahne formlarında seçilebilir. Testteki tüm düzenlemeler/geçmiş geçicidir; testten çıkınca gerçek ev ayarları, manuel öncelikler ve zaman kuralı izleri geri gelir. Testi yeniden bağlamak geçici kuralları silmez. Test sırasında Yedek indir gerçek evin yedeğini indirir; test kopyasını kalıcı kayıtla karıştırmaz. Bekleyen komut varken test moduna geçiş engellenir. Test modunda gerçek kamera bağlantısı açılmaz.

Otomasyon kartındaki Kuralı dene tetikleyiciyi ve etkinlik anahtarını beklemeden yalnız eylemi önizler; ev modu koşulu uygulanır. Hiçbir ağ komutu gönderilmez. Son deneme sonucu lastPreview, normal çalışma sonucu lastRun olarak ayrı tutulur. Geçmiş mesajında kural adı bulunur. Test otomasyonunda gerçek tetikleme için Test varlık sensörü kontrolü kullanılabilir.
