# Sürüm Geçmişi (Changelog)

Sürüm numaralandırması **Morph 1.1.2** ile başlar:
- **Çift son numara (`1.1.2`, `1.1.4`, `1.1.6`, ...)** → **Kararlı** (GitHub Releases *Latest*)
- **Tek son numara (`1.1.3`, `1.1.5`, ...)** → **Beta** (GitHub Releases *Pre-release*)

## [1.1.9] — Beta (Test Sürümü)
- **Seçilebilir & Sonradan Kurulabilir İndirme Motorları (Test):** Ayarlar ve Bağlantıdan İndir ekranlarına 4 ayrı motor eklendi: **Morph Dahili Motor** (0 MB ek boyut, hızlı sosyal/bulut akışı), **NewPipe Extractor** (Android cihaz içi Java/Rhino YouTube & SoundCloud imza çözücü), **yt-dlp Yerel Motor (`youtubedl-android`)** (uygulama içinden tek dokunuşla **"İndir & Kur / Güncelle"** destekli Python tabanlı yerel indirici) ve **Cobalt API** (özel/genel Cobalt sunucu köprüsü).
- **Akıllı İndirme ve Veri Koruma Ayarları:** Ayarlar ekranına **Sadece Wi-Fi'da İndir** (canlı ağ durumu algılamalı), **Mobil Veride Boyut Sınırı** (`50 MB` / `150 MB` / `500 MB` / `Sınırsız`), **Tercih Edilen Video Kalitesi** (`360p`–`1080p` / `En İyi`), **Hata Olursa Yedek Motora Otomatik Geç** ve **Çoklu Parça İndirme (`1x` / `4x` / `8x`)** seçenekleri eklendi.
- **2 Saatlik / Büyük Video İndirme Mimarisi:** Android'de Base64 bellek darboğazı kaldırılarak doğrudan `Documents/Morph` klasörüne arka plan disk akışı, parça parça (`2 MB`) dosya yazımı, `100 MB` üzeri dosyalarda IndexedDB koruma kalkanı ve canlı bayt/yüzde ilerleme göstergesi eklendi.
- **Tek Dokunuşla Hata & Tanılama Geri Bildirimi:** Test sürecinde olası motor hatalarını kolayca iletebilmek için hem Hata ekranına hem Ayarlar ekranına **Seçili Motoru Test Et**, **Tanılama Raporunu Kopyala** ve **Paylaş** araçları eklendi.
- **Genişletilmiş Dönüştür, Araçlar ve Dosya İşlemleri Paketi:** Görsel (**Belge Tarayıcı**, **Sosyal Medya Sığdır**, **Dokunmatik Sansür/Mozaik**, **Izgara/Carousel Bölücü**, **Hareketli GIF**, **Vesikalık Baskı Dizilimi**, **İkon & Favicon Paketi**, `ICO/GIF/SVG`), PDF (**Sayfa Sil**, **Sayfa Ayıkla/Ters Çevir**, **Çapraz Filigran**, **Siyah-Beyaz**, **2’li/4’lü A4 Baskı**, `PDF → TXT/HTML`), Belge/Tablo (`DOCX`, `HTML`, `CSV ↔ JSON`), Video/Ses (**Videodan Ses Ayıkla**, **Döndür/Aynala**, **Ters Çevir**, **Bumerang**, **Döngü**, **Ses Birleştir**, **Slowed/Nightcore Hız & Ton**, **Fade**) ve **Dosya İşlemleri & SHA-256 Denetçisi** (**Toplu Yeniden Adlandır**, sıralama, Base64 kopyalama, evrensel önizleyici) eklendi; Ayarlar ekranındaki **APK İndir** butonu tek satır ve sade görünüme kavuşturuldu.
- **Kitaplık & İşlem Geçmişi İsimlendirmesi ve Özelleştirilebilir Radyal Çarklar:** Uygulama genelindeki "Çıktı / Çıktılar" ifadeleri doğal **Kitaplık & İşlem Geçmişi (`Kitaplık · X kayıt`)** yapısıyla yenilendi. **Dönüştür**, **Araçlar** ve **İşlemler** çarklarına **Dosyaya Göre Akıllı**, **Öne Çıkardıklarım** ve **Tümünü Çarka Ekle** (çift halkalı tam çark) modları eklendi; açık herhangi bir çarkın ortasındaki **m** harfine **3 saniye basılı tutulduğunda** logonun dönen **dişliye** dönüşerek **Çark Özelleştirme** penceresini pop-up olarak açması sağlandı.

## [1.1.8] — Kararlı
- **Akıcı ve Kalıcı Güncelleme & Yönet Çubuğu:** Ana ekrandaki **"Güncellemeleri Kontrol Et"** ve **"Yönet"** butonlarındaki kasılma/geri atlama kaldırıldı; akıcı esnek geçiş (`flex-grow`) eklendi ve en son hangi buton (**"Yönet"** veya **"Güncellemeleri Kontrol Et"**) seçildiyse ekran değişse bile o buton açık/takılı kalır.
- **Kapsamlı Uygulama İzinleri & Hızlı Yapıştır:** Android APK (`AndroidManifest.xml` + çalışma zamanı izin istemleri) ve Web için **Depolama & Belgeler (`Documents/Morph`)**, **Medya/Fotoğraf/Video/Ses**, **Arka Plan İşlem Bildirimleri**, **Titreşim (`Vibrate`)**, **İşlem Sırasında Ekran Uyanık Tutma (`WakeLock`)** ve **Pano (`Yapıştır`)** izinleri eklendi; Ayarlar ekranına canlı **Uygulama İzinleri** yönetim kartı eklendi.
- **Sürüklenirken Dönen & Yanan Radyal Çark:** Alt radyal çarkı basılı tutarak sol veya sağ köşeye taşırken hızlanma, ateş kırmızısı dişliye dönüşme, kıvılcım/kor ve 30. saniye kül olma efektleri kesintisiz devam eder; dönerken de istenen an sol veya sağ köşeye bırakılabilir.
- **Gelişmiş Bağlantıdan İndirici:** TikTok, X (Twitter), Reddit, Instagram, Google Drive, Dropbox, GitHub ve doğrudan medya/dosya bağlantıları için yerleşik akış çözümleyici, tek dokunuşla panodan **Yapıştır** butonu ve **Ses** modunda otomatik MP3 dönüştürme eklendi.
- **Android APK & Cihaz İçi Motor Kararlılığı:** Capacitor güvenli bağlam (`https`), uzantısız Android galeri/dosya seçici desteği, PDF işçi (`worker`) uyumluluğu ve 10-bit/tek piksel boyutlu telefon videolarında FFmpeg uyumluluğu iyileştirildi.

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
