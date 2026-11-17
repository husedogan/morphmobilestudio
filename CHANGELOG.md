# Sürüm Geçmişi (Changelog)

Sürüm numaralandırması **Morph 1.1.2** ile başlar:
- **Çift son numara (`1.1.2`, `1.1.4`, `1.1.6`, ...)** → **Kararlı** (GitHub Releases *Latest*)
- **Tek son numara (`1.1.3`, `1.1.5`, ...)** → **Beta** (GitHub Releases *Pre-release*)

## [1.1.6] — Kararlı
- **İsim ve İkon Güncellemesi:** Uygulama adı tüm platformlarda (**Android APK**, **PWA**, üst başlık ve dil dosyaları) **Morph** olarak sadeleştirildi ("Studio" ifadesi kaldırıldı); resmi küçük **m** uygulama ikonu tüm Android `mipmap-*` yoğunluklarına ve PWA simgelerine entegre edildi.
- **Android Durum Çubuğu (Safe-Area) Düzeltmesi:** Android 15/16 uçtan uca (edge-to-edge) ekranlarda üst başlığın (`morph` logosu ve çark ikonu) saat/şarj çubuğuyla üst üste binmesi Capacitor `SystemBars` CSS güvenli alanlarıyla giderildi.
- **Mobil Radyal Çark (Basılı Tutma & Yanma/Kül Efekti):** Telefonda çarka basılı tutarken Android metin seçme/kopyalama çubuğunun çıkması engellendi; 0–15 sn hızlanıp ateş kırmızısı dişliye dönme, 15–30 sn korlaşıp kararma ve 30. saniyede küle dönüşme animasyonu parmak basılı tutulduğu sürece çalışacak şekilde yenilendi. Hızlı dokunuş menüyü açar, basılı tutup yatay sürükleme sol/sağ köşeyi değiştirir.
- **Android APK Çevrimdışı FFmpeg & İptal Desteği:** Capacitor WebView'da çevrimdışı yüklemeyi bozan `HEAD` isteği kaldırıldı ve işlem iptalinde `ffmpeg.terminate()` ile arka plan işlemci tüketimi anında durduruldu.
- **Android Bağlantı İndirici & Depolama:** APK içinde `CapacitorHttp` ile CORS engeli olmadan doğrudan medya ve OpenGraph (`og:image`, `og:video`, `og:audio`) çözümlemesi eklendi; Android Scoped Storage çoklu dosya kaydetme iyileştirildi.
- **Görsel, PDF, Belge ve Güncelleyici İyileştirmeleri:** PNG/WebP filtre ve filigran şeffaflığı korundu, PDF damgalarına tam Türkçe karakter desteği eklendi, XLSX sayısal hücre okuma ve PPTX slayt sıralaması düzeltildi, sürüm numarası (`1.1.6`) otomatik eşitlendi.

## [1.1.4] — Kararlı
- **Kararlı Sürüm Yayını:** Tek numaralı sürümler **Beta**, çift numaralı sürümler **Kararlı** kanal olarak yayınlanır (`Morph-v1.1.4.apk`).
- Ana ekrandaki tüm dış kartlar eşit genişliğe getirildi.
- Alt radyal çark butonuna 15. saniyede ateş kırmızısı dişliye dönen, 30. saniyeye yaklaşırken kararıp 30. saniyede küle dönüşen görsel efekt eklendi.
- Geliştirme ortamında WebSocket HMR bağlantı hatası giderildi ve üretim derlemesi doğrulandı.

## [1.1.3] — Beta
- Ayarlar ekranında sürüm ve APK kartı düzenlendi; alt köşe sürüm rozeti ve temiz Türkçe durum görünümü eklendi, ayarlar ekranından alt çark kaldırıldı.
- Alt motor çubuğu ve güncelle/yönet butonları eşit boyutlu, dış kutusuz ve tek/çift sürüm kanalına uyumlu hale getirildi.
- Ana ekrandaki tüm dış kutucuklar eşit genişliğe getirildi; alt çarka 15 saniyede ateş kırmızısı dişliye dönen, 30. saniyeye yaklaşırken kararıp 30. saniyede küle dönüşen deneysel efekt eklendi.

## [1.1.2] — Kararlı
- Varsayılan ana tema **Gece Yarısı (Midnight)** olarak ayarlandı; **Kutup Işığı (Aurora)** teması yüksek kontrastla yenilendi.
- Görsel, PDF, ZIP, video/ses (FFmpeg WASM) ve belge dönüştürme (DOCX/PDF/TXT) motorları doğrudan uygulama içine entegre edildi.
- Doğrudan medya bağlantısı ve kapak görseli indirici sunucusuz hale getirildi.
- Sağ/sol köşeye sürüklenebilir radyal çark menüsü, açılır motor çubukları ve tek dokunuşlu GitHub güncelleme denetimi eklendi.
- Capacitor Android APK ve otomatik GitHub Releases yayın akışı eklendi.
