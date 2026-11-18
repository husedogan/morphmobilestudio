import React, {useState} from 'react';
import {Download, Smartphone, WifiOff, X} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {useOnlineStatus} from '../hooks/useOnlineStatus';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  lang: Lang;
  variant?: 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({lang, variant = 'compact'}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (!isInstallable && !isIOS) {
    return null;
  }

  return (
    <>
      {isInstallable ? (
        <button
          type="button"
          onClick={install}
          className={
            variant === 'card'
              ? 'morph-accent-btn flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-xs font-semibold transition-transform active:scale-[0.98] whitespace-nowrap'
              : 'morph-accent-btn flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-transform active:scale-[0.97]'
          }
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span>{t('InstallApp', lang)}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'card'
              ? 'flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)] whitespace-nowrap'
              : 'flex min-h-[36px] items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--inset)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] whitespace-nowrap shrink-0'
          }
        >
          <Smartphone className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
          <span>{t('InstallIOS', lang)}</span>
        </button>
      )}

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 pb-[calc(var(--morph-safe-bottom)+1rem)] backdrop-blur-sm sm:items-center sm:pb-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">{t('InstallIOS', lang)}</h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--inset)]"
                aria-label={t('Close', lang)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>
                {lang === 'tr'
                  ? '1. Safari alt çubuğundaki Paylaş simgesine dokun.'
                  : '1. Tap the Share icon in the Safari toolbar.'}
              </li>
              <li>
                {lang === 'tr'
                  ? '2. Aşağı kaydırıp “Ana Ekrana Ekle” seçeneğine dokun.'
                  : '2. Scroll down and tap “Add to Home Screen”.'}
              </li>
              <li>
                {lang === 'tr'
                  ? '3. Sağ üstten “Ekle”ye bas — Morph ana ekranına tam ekran uygulama olarak eklenir.'
                  : '3. Tap “Add” — Morph launches standalone without browser chrome.'}
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 min-h-[44px] w-full rounded-full border border-[var(--line)] bg-[var(--inset)] text-sm font-semibold text-[var(--ink)]"
            >
              {t('Done', lang)}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineBanner: React.FC<{lang: Lang}> = ({lang}) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-[calc(var(--morph-safe-bottom)+5rem)] left-4 right-4 z-40 mx-auto flex max-w-md items-center gap-2.5 rounded-2xl border border-amber-400/30 bg-amber-950/90 px-4 py-2.5 text-xs font-medium text-amber-100 shadow-lg backdrop-blur-md">
      <WifiOff className="h-4 w-4 shrink-0 text-amber-300" />
      <span>{t('OfflineMode', lang)}</span>
    </div>
  );
};
