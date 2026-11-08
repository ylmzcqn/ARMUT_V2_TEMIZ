# Cihaz ekleme sözleşmesi

8 Kasım 2026. Uygulanan bölüm: device-runtime.mjs ve davranış testleri. Çekirdek ağ erişimi yapmaz; statik panel, envanter ve gerçek donanım üzerinde yan etkisi yoktur. HTTP/MQTT adaptörleri, uzaktan API ve panel bağlantısı sonraki entegrasyonlardır. Çalışan firmware farkı bu modülün geliştirilmesi için ön koşul değildir.

## Kayıt

createDeviceRuntime(registry, options) cihaz başına deviceId, role, capabilities ve components alır. Her bileşende componentId ve capabilities zorunludur. Kimlikler kararlı, tekil, 1–96 karakterdir. İzin verilen karakterler harf, sayı, alt çizgi, nokta, iki nokta ve tiredir; ilk karakter harf/sayıdır. En çok 64 cihaz, cihaz başına 64 bileşen/yetenek vardır. Kayıt kopyalanır; sonradan çağıranın nesnesi değiştirilince yetki değişmez. Yeni cihaz eklemek açık bir kayıt değişikliğidir; keşfedilmiş cihaz otomatik yetkilendirilmez. Pin kaydı cihaz yeteneği veya fiziksel doğrulama yerine geçmez.

## Adaptör sınırı

Adaptör veri kaynağının kimliğini, ev kapsamını ve yetkisini doğruladıktan sonra beginSession(uniqueSessionId) çağırır. Bu bir oturum sıfırlama API'sidir, kimlik doğrulama mekanizması değildir. İlk bağlantı ve her yeniden bağlantı için yeni kimlik gerekir. Aynı çalışma zamanında eski kimlik tekrar kullanılamaz; önceki oturumun tüm gözlemleri sıfırlanır. Ağ kaybında disconnect() çağrılır. Yeniden bağlanmak için beginSession zorunludur.

Adaptör eski bağlantının geç gelen cevaplarını kendi yakaladığı sessionId ile gönderir; güncel sessionId ile yeniden etiketlemez. Bekleyen eski istekleri iptal eder; aynı anda tek okuma yapar. Sıra numarası adaptör oturumu boyunca cihaz başına artan güvenli tamsayıdır. Cihaz yeniden başladığında da sıfırlanmaz; bunu adaptör üretir. bootId cihaz açılış kimliğidir; kaynak bunu sağlamıyorsa adaptör dürüstçe tanımlanmış bir gözlem oturumu kimliği kullanabilir, fiziksel restart saptanmış gibi raporlayamaz. Yeni cihaz gözlemi tüm bileşen listesini değiştirir; eksik bileşen önceki çalışır bilgisini devralmaz.

## ingest(message)

Zorunlu alanlar: schemaVersion:1, sessionId, sequence, deviceId, role, bootId, online:boolean, observationAgeMs:number|null, capabilities:string[], components:[{componentId,online:boolean}]. Bilinmeyen alanlar durum deposuna taşınmaz. Mesaj tam cihaz gözlemidir; parça güncellemesi değildir. Kayıt dışı cihaz/rol/yetenek/bileşen, tekrar eden bileşen, geçersiz tip/yaş, eski oturum ve artmayan sequence reddedilir. Hata fırlatılır; önceki geçerli gözlem korunur. Ağ katmanı bu hatayı tanıya çevirir; sessizce yok sayıp güncel göstermek doğru değildir.

observationAgeMs adaptörün mesajı çalışma zamanına teslim ettiği andaki toplam kaynak yaşıdır. Hub önbelleğinden veri alınca sıfırlanmaz. Yayın, kuyruk ve ağ gecikmesi dahil edilir. Bu toplam bilinmiyorsa null verilir ve durum unknown kalır. Çekirdek gözlemden sonraki süreyi performance.now() ile ekler; testlerde sahte monotonik saat verilebilir. now fonksiyonu sonlu ve geri gitmeyen değer üretmelidir. Başka süreç/oturumdan performans zamanı veya kalıcı telemetri geri yüklenmez. Firmware'in UTC saatine güvenmek gerekmez.

Ağ adaptörü her yanıtın byte sınırını JSON ayrıştırmadan önce uygular (hedef 256 KiB), timeout, kimlik doğrulama ve yeniden deneme beklemesini yönetir. Bu sorumluluklar çekirdeğin içinde uygulanmış değildir. Ev ağı ve bulut kaynakları aynı anda yetkili kaynak gibi kullanılmaz; tek seçili adaptör vardır.

## status(deviceId), snapshot()

Yeni nesne döner; dışarıdan değiştirilince depo değişmez. Durumlar:
- unregistered: bu kimlik için kayıt yok.
- unknown: henüz geçerli gözlem yok veya kaynak yaşı bilinmiyor.
- online/offline: yetkili güncel kaynak açıkça bildiriyor.
- delayed: yaş 15 saniyeyi geçti.
- stale: yaş 30 saniyeyi geçti; eski değer gösterilebilir ama güncel sağlık/animasyon üretilemez.
- disconnected: gözlem vardı ancak adaptör bağlantısı kesildi. Bu cihazın fiziksel olarak kapalı olduğunu söylemez.

Eşikler delayedAfterMs ve staleAfterMs ile birlikte yapılandırılır. Tazelikte eşik üstü kullanılır: 15000 ms güncel, 15001 ms delayed, 30001 ms stale. Panel yalnız state==='online' ise güncel çevrimiçi gösterebilir; components[].online ham son gözlemdir ve tek başına güncel çalışırlık kanıtı değildir. Modül online bilgisi fiziksel işlevin veya enerji akışının doğrulanması anlamına gelmez.

## Kullanım örneği

```js
import {createDeviceRuntime} from './device-runtime.mjs';
const runtime=createDeviceRuntime([
 {deviceId:'hub',role:'hub',capabilities:['display'],components:[{componentId:'screen',capabilities:['display']}]}
]);
runtime.beginSession('authenticated-adapter-session-1');
// Adaptör kimliği doğrulanmış gerçek gözlemi normalize ederek runtime.ingest(...) çağırır.
// Veri gelene kadar:
runtime.status('hub'); // state: unknown
// Ağ kaybında:
runtime.disconnect();
```

Bu örnek yürütülen demo veya inventory.json içine eklenmiş örnek cihaz değildir. Mevcut gerçek kayıtlar değiştirilmedi. Çekirdek komut API'si sunmaz; röle/servo/ses çıkışları hiçbir açılışta veya yeniden bağlantıda tetiklenmez.

## Doğrulananlar ve kalanlar

node --test *.test.mjs: 50 test geçti; dokuzu yeni durum çekirdeğine aittir. node source-check.mjs ve modül sözdizimi kontrolü geçti. Kayıt/rol/yetenek kontrolü, bozuk ve sırasız veri, oturum değişimi, kaynak yaşı, bağlantı kaybı, yeniden başlama gözlemi ve nesne kopyalama test edildi.

Gerçek veri adaptörü, otomatik sorgu döngüsü, özel bulut API'si, firmware uyumluluk adaptörleri ve UI canlı durum tüketimi bu pakette uygulanmadı. live-evidence.mjs mevcut 90 saniyelik gösterim yolunu kullanmaya devam ediyor; yeni çekirdeğe bağlanınca ortak politikaya geçirilecek. Donanım/şebeke kesintisi ve fiziksel açılış kabulü gerçek cihazlarla ayrıca yapılır.
