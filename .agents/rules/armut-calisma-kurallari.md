---
trigger: always_on
---

# ARMUT GV2 — Çalışma Kuralları ve Kullanıcı Tercihleri

## Temel İlkeler (Codex Modu + Sıfır Teori / Sıfır Ödev Verme)
- **Dil:** Kullanıcıyla her zaman Türkçe konuş.
- **Kullanıcıya İş/Komut Yıkma Yasağı:** Kullanıcıya "şunu çalıştır", "bunu dene", "dosyayı kopyala", "sen test et" demek KESİNLİKLE YASAKTIR. Terminalin, dosya düzenleme araçların ve PC köprün var; komutu kendin çalıştır, dosyayı kendin düzenle, testi kendin yap, sonucu teslim et.
- **İstenmeyen Fikir / Tavsiye Yasağı:** Kullanıcı açıkça mimari fikir veya beyin fırtınası istemedikçe fikir verme, alternatif sıralama, ders anlatma. Doğrudan sonuca ve eyleme odaklan.
- **Bağlam Önceliği:** Amaç, güncel durum ve sıradaki iş için önce `PROJECT.md` dosyasını oku; ardından yalnız ilgili güncel kaynakları ve çağıranlarını incele.
- **Sadelik ve Tutarlılık:** Başarı, daha az özel kuralla daha tutarlı ve doğrulanabilir davranıştır. Mevcut ortak yolu kullan; gereksiz paralel mekanizma ve yinelenen belge üretme.
- **Paket Kapsamı:** Her pakette hedefi ve gözlenebilir kabul ölçütünü netleştir. Bir yararlı uçtan uca davranışı tamamla; isteğe bağlı fikirlerle kapsamı genişletme.
- **Tek Uygulayıcı Disiplini:** Küçük bağlantılı işler aynı sohbette ve tek uygulayıcıda kalsın. Ek ajan, devir veya bağımsız inceleme yalnız işin bağımsızlığı, riski ve uzmanlık ihtiyacı gerektirdiğinde kullanılsın. Aynı dosyayı iki ajan düzenlemesin.
- **Odaklı Doğrulama (Token ve Süre Tasarrufu):**
  - İlgili okumaları ve değişiklikleri grupla (batch).
  - Küçük, düşük riskli değişikliklerde yalnız etkilenen davranışın odaklı testlerini çalıştır; her küçük düzenlemeden sonra tüm regresyon paketini tekrarlama.
  - Ortak veya riskli değişikliklerde ve iş tamamlandığında tam regresyon doğrulaması (`node --test` ve `node source-check.mjs`) yap.
  - Kısa sonuç, doğrulama ve kalan sınırları bildir; rutin uzun çıktı ve istenmeyen görsel sunma.
- **Güvenli Değişiklik, Uçtan Uca Sınama ve Durum Ayrımı:**
  - Kaynak değişikliğinden önce mevcut değişiklikleri kontrol et (`git status`) ve geri dönüş noktası oluştur. Eşzamanlı düzenlemeyi ezme.
  - *Planlandı*, *uygulandı*, *test edildi*, *yayımlandı* ve *fiziksel olarak gözlendi* durumlarını birbirinden ayır. Simülasyon veya kaynak testi fiziksel cihaz başarısı değildir.
  - **Test Edilmemiş İddia Yasağı:** Herhangi bir aracı, dosyayı, uzak bağlantıyı veya özelliği hedef ortamın gerçek ağ/erişim sınırları altında (`localhost` yerine gerçek dış uçtan, uzak Git dalı görünürlüğünü doğrulayarak) bizzat sınamadan "yaptım / çalışıyor" deme.
- **Gizlilik ve Yetki Sınırları:**
  - Gizli anahtarları, kişisel veriyi, görüntüleri ve yerel model dosyalarını Git'e ekleme.
  - Proje oluşturma veya kod düzenleme izni; cihaza firmware/OTA yükleme, servis başlatma/durdurma, dış yayın veya eski projeleri (`ESP_ARMUT_V1.1`) değiştirme izni değildir. Zamanlanmış otomasyon oluşturma isteği ayrıca açık olmalıdır.
  - `PROJECT.md` içinde yalnız değişen karar, durum ve açık işi güncelle.
