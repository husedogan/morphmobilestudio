# Morph

[![Morph Version](https://img.shields.io/badge/Morph-1.1.7%20(Beta)-42C9D9?style=flat-square)](https://github.com/husodogan/morphmobilestudio/releases)
[![Android APK](https://img.shields.io/github/v/release/husodogan/morphmobilestudio?label=APK%20Release&color=42C9D9&style=flat-square)](https://github.com/husodogan/morphmobilestudio/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/husodogan/morphmobilestudio/build-apk.yml?branch=main&label=APK%20Build&style=flat-square)](https://github.com/husodogan/morphmobilestudio/actions)

**Morph**, görsel, PDF, arşiv, video, ses ve belge dosyalarını cihaz içinde dönüştüren **Android APK** ve **Web / PWA** mobil uygulamasıdır. Orijinal dosyalarına dokunmadan yerel olarak çalışır.

## İndirme ve Kurulum

- **Android APK:** [Releases](https://github.com/husodogan/morphmobilestudio/releases) sayfasından güncel `Morph-v*.apk` dosyasını indirip kurabilirsin.
- **Web / PWA:** Tarayıcıdan **Telefona Kur / Ana Ekrana Ekle** ile uygulama olarak yüklenebilir; çevrimdışı çalışır.

## Sürüm Sistemi

Sürüm akışı **Morph 1.1.2** ile başlar ve GitHub Actions (`.github/workflows/build-apk.yml`) üzerinden otomatik derlenip yayınlanır:

| Sürüm Türü | Numara Kuralı | Örnekler | GitHub Yayın Türü |
| :--- | :--- | :--- | :--- |
| **Kararlı** | Son rakam **çift** | `1.1.2`, `1.1.4`, `1.1.6` | Latest Release |
| **Beta** | Son rakam **tek** | `1.1.3`, `1.1.5`, `1.1.7` | Pre-release |

Uygulama içindeki **Güncellemeleri Kontrol Et** düğmesi GitHub Releases ve PWA önbelleğini denetleyerek yeni sürüm hazır olduğunda **Güncelleme İndir** seçeneğini sunar.

## Temel Özellikler

- **Görsel & PDF:** Format dönüştürme, sıkıştırma, kırpma, şeffaflık korumalı filtreler ve filigran, kolaj; PDF birleştirme, bölme, döndürme, Türkçe karakter destekli sayfa no/damga ve PDF ↔ Görsel.
- **Video, Ses & Belge (Cihaz İçi):** Entegre çevrimdışı FFmpeg WASM ile video/ses dönüştürme, kesme, hız/kanal ayarı; DOCX/ODT/XLSX/PPTX/HTML/TXT ↔ PDF ve PDF → DOCX.
- **Arşiv & Bağlantı İndirici:** ZIP oluşturma/çıkarma ve doğrudan medya/dosya veya kapak görseli indirme (Android `CapacitorHttp` destekli).
- **Mobil Arayüz:** Android sistem durum çubuğu (safe-area) uyumlu üst bar, basılı tutarken yanan/küle dönüşen ve sürüklenerek köşe değiştiren radyal çark menüsü, çoklu koyu/açık tema seçenekleri ve Türkçe/İngilizce dil desteği.

## Geliştirme Komutları

```bash
npm install
npm run dev          # Yerel geliştirme (http://localhost:3000)
npm run lint         # TypeScript kontrolü
npm run build        # Üretim derlemesi (dist/)
npm run android:sync # Web derleme + Android Capacitor ikon/sürüm eşitleme
```
