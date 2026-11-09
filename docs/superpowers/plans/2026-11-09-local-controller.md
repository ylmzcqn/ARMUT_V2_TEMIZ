# Cihaz entegrasyonuna hazır yerel ev paneli

Kullanıcı tüm temel boşlukların büyük bir görev olarak tamamlanmasını, soru sorulmadan çalışılmasını istedi. Minimal mevcut tasarım, cihaz haritası ve özel cloud önizlemesi korunur. Gerçek ESP'ye yükleme/ev ağına erişim yapılmaz.

## Karar
Tek bağımlılıksız Node.js yerel servis hem paneli hem kalıcı ev verisini hem de aynı home-runtime otomasyon çekirdeğini sunar. Tarayıcı yalnız istemci olduğunda otomasyon yürütmez; test alanı yine geçicidir. Cloud Sites statik önizleme/yerel test modu kalır. Yerel servis node server.mjs ile çalıştırılır, otomatik üretim servisi kurulmaz. Böylece HTTPS cloud→HTTP LAN engelini yerel aynı-kaynak kamera aktarımıyla çözeriz.

## Sözleşme (uygulayıcılar arası)
- createHomeRuntime ek seçenekler: manageAutomations=true; provider={read({signal}),send(command,{signal})}. provider read mevcut {devices,entities} zarfını döndürür; send onay JSON'unu döndürür. connect provider ile settings URL istemez. receiveState(batch) haricî yetkili istemci verisini alır. config.devices opsiyonel [{id,name,role:'hub'|'camera'|'node'}]; entity.channelId opsiyonel kararlı firmware kanalı. Node rolü runtime'da desteklenir.
- server.mjs createControllerServer({dataDir,inventory,host,port,adminKey?}) async -> {server,runtime,listen(),close(),baseUrl}. Sadece testlerde ephemeral loopback listen; CLI default127.0.0.1:8080. Kalıcı veri local-data altında atomic yazılır.
- GET /api/health -> {service:'armut-controller',version:1,authenticated:boolean}; browser auth cookie, API login POST /api/login {key}; /login sade yerel giriş ekranı.
- GET /api/state -> {home,revision,devices,entities,controller:{...}}. revision yapılandırma içindir, runtime logları artırmaz.
- PUT /api/home {revision,home}: revision conflict409; runtime-owned events/mode/lastRun/lastPreview korunur, yapılandırma doğrulanır. /api/action POST {type:'command',entityId,value}|{type:'mode',mode}|{type:'scene',id,observeOnly}|{type:'previewRule',id}. Yanıt {result?,state:<GET state>}. GETstate süregelen tek otoritedir.
- POST /api/devices {id,name,role} -> {device:{id,name,role},deviceKey,state}; tekil per-devicekey sadece ilk yanıtta, credentials dosyası Git dışı. GET /api/devices -> kayıt/son gözlem özeti (anahtar yok). DELETE /api/devices/:id: silmeden bağlı işlev varsa409; anahtar iptal.
- POST /api/device/report Bearer deviceKey: {version:1,deviceId,role,bootId,sequence,name?,capabilities:[],entities:[{id,name,kind:'switch'|'presence'|'sensor',unit?,value,ageMs}],acknowledgements:[{commandId,applied,value}]}. Kayıtlı kimlik/rol/anahtar eşleşir; boot ve sequence replay reddedilir. Cihaz kanalları ilk geçerli raporda stable entity ID ve channelId ile eklenir; fiziksel kontrol ancak cihaz uygulama onayıyla başarılıdır. Rapor yanıtı {version:1,commands:[{commandId,channelId,value,bootId}],reportIntervalMs:2000}. Komut bir kez teslim edilir; timeout bilinmiyor, otomatik tekrar yok.
- GET /api/cameras/:cameraConfigId/stream ve POST /api/cameras/:id/profile: saklanan kamera URL'lerine same-origin proxy; auth, timeout, streaming abort/backpressure; profile doğrulama; fiziksel target yokken anlamlı hata.
- createRemoteHomeRuntime({inventory,fetcher,baseUrl}) async -> mevcut runtime arayüzü + remote=true, controllerInfo, listDevices(),provisionDevice(def),removeDevice(id),cameraConfig(config). update async PUT; APIstate local read modeline receiveState ile uygulanır. API'de tekrar browser otomasyonu yok. Test modunda tüm eylemler yerel sandbox'a gider. backup gerçek server home'u döndürür.
- home-panel createHomePanel({inventory,runtime?}) injected runtime desteği; app.mjs başlangıçta detect runtime createPanelRuntime() async kullanır. Remote API yoksa statik local runtime'a döner; mevcut server erişim hatasını sessizce yeni boş ev olarak açmaz.

## İş parçaları
1. Ana uygulayıcı: model/runtime provider + dış state + headless çalışma; remote-home.mjs ve davranış testleri; entegrasyon ve son yayın.
2. Sunucu uygulayıcı: server.mjs, controller-devices.mjs, server/device testleri, local çalıştırma rehberi. Ana model/runtime dosyalarına dokunmaz.
3. UI uygulayıcı: home-panel.mjs, app.mjs, style.css, index.html. Kurulum/bağlantı ekranı, remote kayıt ve cihaz ekleme anahtarını bir kere gösterme, sağlıklı/eksik durumları; mevcut estetik.
4. Firmware uygulayıcı: firmware/armut_link ESP-IDF5.5 C bileşeni + entegrasyon örneği/rehberi; pin/besleme varsayımı ve gerçek yükleme yok. Protokolü ve idempotent komut callback sözleşmesini uygular.
5. Birim/HTTP/DOM ve varsa tarayıcı kontrolü; bağımsız kod incelemesi, düzeltme; aynı sahibi-özel Site'a statik kaynak yayını. Yerel servis statik Sites'ta çalışıyormuş gibi sunulmaz.

## Kabul
Simüle HTTP cihazı kayıt olur, telemetri panel modelinde görünür, komut sonraki report ile alınır, ACK doğru boot/id/value ile doğrulanır; yanlış anahtar/kimlik/sequence reddedilir. Panel kapalıyken aynı runtime zaman/olay kuralı yürütür. Yeniden başlatmada ayarlar kalır, eski canlı değerler ve komutlar tekrar oynatılmaz. İki istemci revision çakışmasında birbirini sessizce ezmez. Kamera proxy auth/abort ve profil aktarımı test edilir. Gerçek ESP32 açılışı ve 25 FPS ancak donanımla doğrulanır.

## Son durum
Tüm beş iş parçası uygulandı. 121 Node testi, HTTP uçtan uca cihaz/ACK ve tarayıcısız otomasyon testi, iki C host test programı, DOM akışları ve LAN HTTP crypto uyumluluğu geçti. Kod incelemelerindeki kimlik, kapasite, işlem sırası, kilit, sandbox ve kamera zamanlama sorunları düzeltildi. Son işlev kaldırma/geri getirme yaşam döngüsü model ve HTTP regresyonuyla korundu. Donanım ve gerçek IDF derlemesi henüz doğrulanmadı. Görsel tarayıcı denetimi ortam hatasıyla engellendi. Kurulum paketi gerçek sırlar/çalışma verisi içermeden hazırlanır.
