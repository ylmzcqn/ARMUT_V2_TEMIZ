# ARMUT V2

## Platform
web

## Stack
Kullanıcı onayı: bağımlılıksız statik HTML/CSS/JavaScript, tek inventory.json. Backend ve framework yok.

## Amaç ve sınırlar
Kullanıcının cihazlarını, bileşenlerini, pin/besleme bağlantılarını ve bilgi kaynaklarını liste ve ayrıntı görünümünde sunmak. Kaynak tanımı, kullanıcı bildirimi ve tarihsel fiziksel gözlem ayrılır. Bilinmeyenler ve çelişkiler korunur. Gerçek kayıtlara örnek veri katılmaz. Canlı cihaz erişimi, yükleme ve servis işlemi yok.

## Kabul
Cihaz seçilince ayrıntılar aynı JSON kaynağından açılır. Okunamayan dosya, bozuk veri ve boş envanter anlaşılır gösterilir. Küçük teknik kararlar uygulayıcıya bırakılmıştır.

## Ana panel
Kullanıcı isteği: Home Assistant benzeri fakat sade bir koyu panel. Genel bakış ve Cihazlar bölümleri; mevcut envanter ayrıntıları korunur. Kullanıcının incelemesi için yalnız bu bilgisayardan erişilen yerel HTTP sunumu onaylıdır; cihaz bağlantısı veya dış yayın kapsamda değildir.

## Kullanıcı envanter düzenlemesi
Kablo uç adları ve hedef modül panelden düzenlenebilir. Donanıma uygulanmaz; kaynak kanıtından ayrılır. Tek envanter JSON’u dışa/içe aktarılır, destekleyen tarayıcıda kullanıcı seçtiği dosyaya kaydeder. Ek backend yok.

Kullanıcı kapsam genişletmesi: seçili modüle kullanıcı pin bağlantısı ekleme ve modülü kayıtları/bağlantılarıyla silme. Bağlantı düzenlemede kaynak kanıtı korunur; açık modül silme işleminde o modülün iddiaları kaldırılır. Geri alma ve mevcut JSON kaydetme yolu kullanılır.

8 Kasım 2026 kullanıcı onayı: kişisel Home Assistant benzeri sade web ev paneli; tüm konuşulan sayfaları soru sormadan uygulama ve mevcut özel yayına alma. Yeni yön ve sınırlar docs/HOME-PANEL.md içindedir. Asistan, APK ve servo kontrolü kapsam dışı; kamera görüntüleme temel işlevdir. Mevcut envanter tek donanım kaynağı, tarayıcı ev yapılandırması ayrı kayıttır.
