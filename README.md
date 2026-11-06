# ARMUT V2 donanım envanteri

Bağımlılıksız cihaz listesi, ayrıntı ekranı ve envanter bağlantı düzenleyicisi. Tek kayıt kaynağı `inventory.json`; örnek cihaz içermez. Eski proje uygulama bağımlılığı değildir: kaynak yolları kanıt referansıdır, uygulama bu dosyaları okumaz.

Bu klasörde yerel sunum için:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Tarayıcıda http://127.0.0.1:8080 adresini açın. Durdurmak için Ctrl+C. Sunucu otomatik başlamaz. Cloud’da localhost cloud bilgisayarını belirtir; bu adres evdeki cihazlara erişim sağlamaz. `file://` JSON okuma kısıtına takılabilir.

Doğrulama: `node --test *.test.mjs` ve `node source-check.mjs`. Derleme veya paket kurulumu gerekmez.

## Veri sözleşmesi

`version: 1`, `sources` sözlüğü ve `devices` dizisi zorunlu. Her cihazda tekil `id`, `name`, `summary`, `claims` bulunur. Her iddiada `subject`, `kind`, `text`, en az bir geçerli kaynak kimliği bulunur. Türler: `source`, `reported`, `physical`, `unknown`, `conflict`. `physical` tarihsel fiziksel gözlem **kaydıdır**; bu oturumda fiziksel doğrulama değildir. Belgeye aktarılan kullanıcı gözlemi bağımsız ölçüm sayılmaz.

Her kaynakta referans proje ve proje-göreli dosya yolu, bir tabanlı başlangıç/bitiş satırı ve inceleme anındaki dosyanın SHA-256 değeri vardır. Referanslar ayrıntılarda açılır. Eski dosya değişirse hash ve satır aralığı yeniden incelenmelidir. Çelişki eski iddiayı silerek çözülmez. Bilinmeyenler metinde açık tutulur. `devices: []` geçerli boş envanterdir. Bozuk JSON, geçersiz sözleşme ve okunamayan dosya için anlaşılır hata ve yeniden deneme sunulur.

İnceleme bağlı tüm donanımın keşfi değildir. Kamera-01 servoları ve Uno tarihsel kayıt; güncel bağlılık bilinmiyor. MOSFET planı ve genel sürücü seçenekleri bağlı cihaz olarak eklenmemiştir. Güncel cihaz sağlığı, yayın veya fiziksel başarı iddiası yoktur.

Ana panel: `#home` genel bakış, `#devices` cihazlar; cihaz kimliği hash’i ayrıntıyı açar. Tarayıcı geri/ileri gezinmesi desteklenir.

`presentation` isteğe bağlı cihaz sunumudur: `facts`, `notice`, `components` içerir. Modüllerin `claimIndexes` dizileri orijinal iddiaları tam ve bir kez kapsar; kaynak metinler değiştirilmeden açılır bölümlerde sunulur. Kısa bağlantı satırları da inventory.json içinde tutulur. Sunum alanı olmayan kayıtlar iddia başlıklarıyla gösterilir.

Modülün `connections` dizisi varsa, ayrıntı ve SVG tekil pin görünümünde bu dizi kullanılır. Her uçta `terminal`, `target`, `kind`, `claimIndex` bulunur; `claimIndex` modülün kendi kanıtlarından birine bağlanmak zorundadır. `rows` eski kısa özet/fallback alanıdır. Tekil uçlar grup metninden çalışma anında tahminle ayrıştırılmaz.

## Bağlantı düzenleme ve kaydetme

Tüm modüller görünümünden modül seçin. Kabloyu veya uç etiketini tıklayın; iki uç adı, hedef modül ve hat türünü değiştirip uygulayın. Bu işlem donanım bağlantısı/GPIO çıkışı değiştirmez. Kaynak iddiası korunur; `history` önceki değerleri, `evidence: user_edit` kullanıcı düzenlemesini belirtir. Geri al son bellek değişikliğini geri getirir.

Değişiklikler otomatik olarak diske yazılmaz. **JSON kaydet**, File System Access desteği olan tarayıcıda seçtiğiniz dosyaya yazar. Aynı dosyanın disk içeriği yüklenen sürümden farklıysa üzerine yazılmaz. Bu yolu gerçek dosya seçim izniyle kullanıcı tamamlar. **JSON indir** her tarayıcıda güncel envanteri indirir; kalıcı sunum için proje kökündeki inventory.json dosyasını indirdiğiniz dosyayla değiştirin. **JSON aç** seçtiğiniz dosyayı doğrulayıp belleğe yükler. Yerel depolamada gizli ikinci envanter yoktur. Kaydedilmemiş değişiklik varken sayfadan ayrılmada tarayıcı uyarısı istenir.

Doğrulama: `node --test inventory.test.mjs wiring-model.test.mjs`. Tarayıcıda düzenle/geri al ve JSON indir/aç doğrulandı; doğrudan dosyaya yazma kullanıcı dosya seçimi yapılmadan doğrulanmış sayılmaz.

## Pin ekleme ve modül silme

Şemada modül seçin. **Pin bağlantısı ekle** ile iki uç adını, hedef modülü ve hat türünü girin. Yeni kayıt `evidence: user_added`, `createdAt` alanları taşır; sahte kaynak referansı eklenmez. **Modülü sil** ardından **Kayıttan sil**, modülü kendi iddialarıyla ve gelen/giden aktif bağlantılarıyla birlikte kaldırır. İndeksler ve kullanılmayan kaynak referansları tutarlı biçimde güncellenir. Ana kart kaydı bu düğmeyle silinmez. Her iki işlem de **Geri al** ile geri döner; kalıcı dosya için JSON kaydedilmelidir.

Üst geri düğmesi uygulama içi önceki sayfaya gider. Doğrudan cihaz adresiyle açılmışsa cihaz listesine, doğrudan listeyle açılmışsa ana sayfaya döner. Bölüm adı üst çubukta, cihaz adı ana başlıktadır.

Sade araç çubuğu: modül seçimi açılır alandadır. Pin ekle seçicinin yanında, Modülü sil “Diğer” altında bulunur. Geri al, Kaydet, JSON indir ve JSON aç başlığın sağındaki “İşlemler” menüsündedir. Menüler Escape ile kapatılabilir. Son görsel/etkileşimli kontrol kullanıcıya bırakılmıştır.

Cihaz listesinin sağındaki filtre kayıt türüne göre çalışır; canlı çevrimiçi durumu tahmin etmez. Filtre ve modül seçimi aynı choice-dialog.mjs bileşenini kullanır. Genel kapsam açıklamaları listeden kaldırılmıştır; inventory.json içindeki kapsam ve dışlanan kayıtlar korunur. Filtre kontrolü: `node --test device-filters.test.mjs`. Görsel kontrol kullanıcıya bırakılmıştır.


## GPIO / pin haritası
Cihaz ayrıntısındaki **GPIO / pin haritası** bölümünü veya bağlantı sayısı düğmesini açın. GPIO adı, modül veya ADC işleviyle arayın; kullanım, ayrılmış/kısıtlı, tarihsel, incelenmesi gereken ve kayıtsız pinleri filtreleyin. Pin satırında bağlantı sahibi, kaynak türü, kısıtlar ve kaynak referansları bulunur. Bağlantı sahibi düğmesi aynı sensör düzenleyicisini açar.

**Bağlantı kaydı yok, boş/kullanılabilir demek değildir.** S3 profili yonga kapsamıdır; fiziksel header sırası değildir. Üretici/revizyon, bellek varyantı ve pinin fiziksel durumu bilinmiyorsa panel uygunluk onayı üretmez. Mevcut dört cihaz için kullanılabilirliği doğrulanmış pin kaydı yoktur. Kaynakta atanan bir pin, modülü envanterden silince otomatik serbest kalmaz. Kamera 1 servo ve Uno köprüsü tarihsel; Hub ses saatleri kayıtlı ortak hatlardır. Güç/GND hatları GPIO gibi veya her ortak GND çakışma gibi değerlendirilmez.

**Rapor indir**, panelle aynı analizin kaynaklı JSON çıktısını verir. Asistan/yerel geliştirme için:

```powershell
node hardware-report.mjs --device hub
node hardware-report.mjs --device hub --pin GPIO41
```

Cihaz veya pin yoksa komut hata koduyla çıkar. Komut cihazlara bağlanmaz; yalnız bu klasördeki inventory.json dosyasını okur. Pin profilleri, üretici referansları, kaynak rezervasyonları, tarihsel kapsam ve ortak-hat kimlikleri aynı JSON içinde tutulur. Önceki JSON dosyaları profil içermiyorsa pin uygunluğu bilinmiyor olarak kalır.

Manuel düzenleme yalnız envanteri değiştirir. Profilde olmayan GPIO reddedilir; çakışma/kısıt uyarısı açık onay gerektirir. Geri al ve mevcut JSON kaydetme yolu korunur. Haritayı açmak/aramak veri değiştirmez. Animasyon şimdilik kullanıcı onaylı demodur; enerji, çevrimiçi durum veya fiziksel çalışırlık ölçümü değildir.

Mevcut bağımsız uygulama için derleme gerekmez. Arayüz sürüm kimliği giriş dosyalarında ve yerel modül bağımlılıklarında birlikte tutulur; `ui-assets.test.mjs` eski/yeni kod karışmasını denetler. Yerel önizlemede dosya değişikliğinden sonra sayfayı yenileyin.


6 Kasım 2026 doğrulaması: kaynak testleri, masaüstü/mobil taşma ve gezinme, arama/filtre/kaynak görünümü, geçersiz GPIO ve onaylı çakışma/geri al, bozuk/boş JSON ve yeniden yükleme kontrol edildi. Tarayıcıdan indirilen rapor CLI ile aynı analiz çıktısıyla eşleşti. Bu kontroller fiziksel pin/cihaz doğrulaması değildir.


## Codex Cloud / taşınabilir çalışma
Node.js 22 veya üzeri ve yerel önizleme için Python 3 yeterlidir; npm kurulumu gerekmez. Kaynak özetleri inventory.json içinde olduğundan eski proje dosyaları veya Windows dizinleri olmadan tüm testler çalışır. `node source-check.mjs` yalnız taşınmış özetlerin bütünlüğünü denetler. İstenirse `node source-check.mjs --root <eski-proje-dizini>` özgün dosya SHA ve satırlarını ayrıca denetler; cloud testleri bunu zorunlu tutmaz.

`source.sha256` özgün dosyanın inceleme hashidir. `snapshot.sha256` ise yalnız taşınan LF-normalize satır özetinindir. Snapshot, güncel fiziksel donanım veya bugün değişmemiş özgün dosya garantisi değildir. Kaynak parçaları kanıt metnidir; bağımlılık/çalıştırılacak firmware değildir.

Cloud görevi önce AGENTS.md ve PROJECT.md okumalı, `node --test *.test.mjs` ve `node source-check.mjs` çalıştırmalıdır. Cihaz erişimi/firmware/OTA ve dış site yayını yapılmaz. Testler kaynak değişiklikleriyle birlikte Git’e alınır; yerel yedek ve sırlar alınmaz.
