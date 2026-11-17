import React from 'react';
import {Check, Cloud, Download, ExternalLink, GitBranch, Info, Palette, RefreshCw, Smartphone} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {Prefs, formatBytes} from '../data/models';
import {THEME_PRESETS} from '../data/themes';
import {APP_VERSION, GithubUpdateInfo, getVersionChannel} from '../engine/githubUpdater';
import {isNativeApp} from '../engine/nativeBridge';
import {PWAInstallButton} from './PWAInstallButton';

interface SettingsScreenProps {
  prefs: Prefs;
  isDark: boolean;
  serverStatus: string;
  updateInfo: GithubUpdateInfo | null;
  checkingUpdate: boolean;
  onChangePrefs: (updater: (prev: Prefs) => Prefs) => void;
  onTestServer: () => void;
  onCheckUpdate: () => void;
  onApplyUpdate: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  prefs,
  isDark,
  serverStatus,
  updateInfo,
  checkingUpdate,
  onChangePrefs,
  onTestServer,
  onCheckUpdate,
  onApplyUpdate,
}) => {
  const lang: Lang = prefs.lang;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-5 sm:px-6 lg:pb-12 lg:pt-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--ink)] sm:text-3xl">
        {t('Settings', lang)}
      </h1>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Appearance & Theme Presets */}
        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <Palette className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-base font-bold text-[var(--ink)]">{t('Appearance', lang)}</h2>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ['system', t('ThemeModeSystem', lang)],
                ['dark', t('ThemeModeDark', lang)],
                ['light', t('ThemeModeLight', lang)],
              ] as const
            ).map(([value, label]) => {
              const active = prefs.theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChangePrefs((p) => ({...p, theme: value}))}
                  className={`min-h-[42px] rounded-full border px-4 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--ink)]'
                      : 'border-[var(--line)] bg-[var(--inset)] text-[var(--muted)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <p className="mt-5 text-xs font-semibold text-[var(--muted)]">{t('Themes', lang)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-6">
            {THEME_PRESETS.map((preset) => {
              const pal = isDark ? preset.dark : preset.light;
              const selected = prefs.preset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChangePrefs((p) => ({...p, preset: preset.id}))}
                  className="group flex flex-col items-stretch text-left"
                >
                  <div
                    className={`relative flex aspect-[3/4] w-full flex-col overflow-hidden rounded-xl border-2 transition-transform duration-150 group-active:scale-[0.97] ${
                      selected ? 'border-[var(--accent)] shadow-md' : 'border-[var(--line)]'
                    }`}
                    style={{
                      background: `linear-gradient(180deg, ${pal.paper} 0%, ${pal.sidebar} 100%)`,
                    }}
                  >
                    {/* Mini Top Bar */}
                    <div
                      className="flex h-4 shrink-0 items-center justify-between border-b px-2 sm:h-5"
                      style={{borderColor: pal.line, backgroundColor: pal.paper}}
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className="h-2 w-2 rounded-sm"
                          style={{
                            background: `linear-gradient(135deg, ${pal.accent}, ${pal.accentEnd})`,
                          }}
                        />
                        <span className="h-1 w-5 rounded-full" style={{backgroundColor: pal.ink, opacity: 0.75}} />
                      </div>
                      <span className="h-1 w-2.5 rounded-full" style={{backgroundColor: pal.muted, opacity: 0.5}} />
                    </div>

                    {/* Mini Vertical Body */}
                    <div className="flex flex-1 flex-col justify-between p-2">
                      <div className="space-y-1">
                        <div className="h-1.5 w-4/5 rounded-full" style={{backgroundColor: pal.ink, opacity: 0.85}} />
                        <div className="h-1 w-3/5 rounded-full" style={{backgroundColor: pal.muted, opacity: 0.55}} />
                      </div>

                      <div
                        className="flex flex-col gap-1 rounded-lg border p-1.5"
                        style={{backgroundColor: pal.surface, borderColor: pal.line}}
                      >
                        <div
                          className="h-3.5 rounded border sm:h-4"
                          style={{backgroundColor: pal.inset, borderColor: pal.line}}
                        />
                        <div
                          className="h-2.5 w-full rounded-full sm:h-3"
                          style={{
                            background: `linear-gradient(135deg, ${pal.accent}, ${pal.accentEnd})`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Mini Bottom Bar */}
                    <div
                      className="flex h-4 shrink-0 items-center justify-around border-t px-2"
                      style={{backgroundColor: pal.sidebar, borderColor: pal.line}}
                    >
                      <span className="h-1 w-3 rounded-full" style={{backgroundColor: pal.accent}} />
                      <span className="h-1 w-1 rounded-full" style={{backgroundColor: pal.muted, opacity: 0.55}} />
                      <span className="h-1 w-1 rounded-full" style={{backgroundColor: pal.muted, opacity: 0.55}} />
                    </div>

                    {selected && (
                      <span
                        className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full text-white shadow"
                        style={{backgroundColor: pal.accent}}
                      >
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-1.5 text-center text-[11px] font-semibold leading-tight ${
                      selected ? 'text-[var(--ink)]' : 'text-[var(--muted)]'
                    }`}
                  >
                    {lang === 'tr' ? preset.nameTr : preset.nameEn}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Language & Updates / APK */}
        <section className="space-y-5">
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 className="text-base font-bold text-[var(--ink)]">{t('Language', lang)}</h2>
            <div className="mt-3 flex gap-2">
              {(
                [
                  ['tr', 'Türkçe'],
                  ['en', 'English'],
                ] as const
              ).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => onChangePrefs((p) => ({...p, lang: code}))}
                  className={`min-h-[42px] flex-1 rounded-full border text-xs font-semibold ${
                    prefs.lang === code
                      ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--ink)]'
                      : 'border-[var(--line)] bg-[var(--inset)] text-[var(--muted)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)]">
                <Smartphone className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold leading-tight text-[var(--ink)]">
                  {t('AboutSection', lang)}
                </h2>
                <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">{t('AboutDesc', lang)}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {updateInfo?.hasUpdate ? (
                <button
                  type="button"
                  onClick={onApplyUpdate}
                  className="morph-accent-btn flex min-h-[44px] w-full min-w-0 items-center justify-center gap-2 rounded-full px-4 py-2 text-center text-xs font-semibold leading-tight shadow transition-transform active:scale-[0.98]"
                >
                  <Download className="h-4 w-4 shrink-0" />
                  <span>{t('DownloadUpdate', lang)}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCheckUpdate}
                  disabled={checkingUpdate}
                  className="morph-tonal-btn flex min-h-[44px] w-full min-w-0 items-center justify-center gap-2 rounded-full px-4 py-2 text-center text-xs font-semibold leading-tight transition-all active:scale-[0.98] disabled:opacity-70"
                >
                  <RefreshCw className={`h-4 w-4 shrink-0 text-[var(--accent)] ${checkingUpdate ? 'animate-spin' : ''}`} />
                  <span>{checkingUpdate ? t('CheckingUpdates', lang) : t('CheckUpdates', lang)}</span>
                </button>
              )}

              {updateInfo && (
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3.5 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--ink)]">
                      <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                      {t('LatestCommit', lang)}
                    </span>
                    <span className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/12 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                      {updateInfo.hasUpdate ? t('UpdateAvailable', lang) : t('UpToDate', lang)}
                    </span>
                  </div>
                  {updateInfo.error && (
                    <p className="mt-1 text-[11px] text-[var(--accent)]">{updateInfo.error}</p>
                  )}
                </div>
              )}

              {!isNativeApp() && <PWAInstallButton lang={lang} variant="card" />}

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={updateInfo?.apkDownloadUrl ?? 'https://github.com/husodogan/morphmobile/releases'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[42px] min-w-0 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--inset)] px-3 py-2 text-center text-xs font-semibold leading-tight text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                >
                  <Download className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                  <span>
                    {t('DownloadApk', lang)}
                    {updateInfo?.apkSizeBytes ? ` (${formatBytes(updateInfo.apkSizeBytes)})` : ''}
                  </span>
                </a>
                <a
                  href={updateInfo?.repoUrl ?? 'https://github.com/husodogan/morphmobile'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[42px] min-w-0 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--inset)] px-3 py-2 text-center text-xs font-semibold leading-tight text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                  <span>{t('OpenGithubRepo', lang)}</span>
                </a>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)]/70 pt-3">
              <span className="text-[11px] text-[var(--muted)]">{t('ApkBuildHint', lang)}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="font-mono-num rounded-full border border-[var(--line)] bg-[var(--inset)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent)]">
                  Morph {APP_VERSION}
                </span>
                <span className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--ink)]">
                  {getVersionChannel(APP_VERSION) === 'stable'
                    ? t('ReleaseStable', lang)
                    : t('ReleasePreview', lang)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Optional Python Morph Server */}
        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex items-center gap-2.5">
            <Cloud className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-base font-bold text-[var(--ink)]">{t('ServerSection', lang)}</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{t('ServerDesc', lang)}</p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                {t('ServerUrl', lang)}
              </label>
              <input
                type="url"
                value={prefs.serverUrl}
                onChange={(e) => onChangePrefs((p) => ({...p, serverUrl: e.target.value}))}
                placeholder="http://192.168.1.20:8000"
                className="min-h-[46px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                {t('ServerToken', lang)}
              </label>
              <input
                type="password"
                value={prefs.serverToken}
                onChange={(e) => onChangePrefs((p) => ({...p, serverToken: e.target.value}))}
                placeholder={t('Optional', lang)}
                className="min-h-[46px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onTestServer}
                className="flex min-h-[42px] items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--inset)] px-4 text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)]"
              >
                <Cloud className="h-4 w-4 text-[var(--accent)]" />
                <span>{t('TestConnection', lang)}</span>
              </button>
              {serverStatus && (
                <span className="text-xs font-medium text-[var(--muted)]">{serverStatus}</span>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-xs text-[var(--muted)]">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('NoServerUrl', lang)}</span>
          </div>
        </section>
      </div>
    </div>
  );
};
