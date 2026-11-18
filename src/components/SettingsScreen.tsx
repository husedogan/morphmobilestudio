import React, {useCallback, useEffect, useState} from 'react';
import {
  Activity,
  Bell,
  Check,
  ClipboardCopy,
  ClipboardPaste,
  Cloud,
  Cpu,
  Download,
  ExternalLink,
  FolderCheck,
  GitBranch,
  Image as ImageIcon,
  Info,
  Palette,
  Play,
  RefreshCw,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Wifi,
} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {DownloadEngineId, Prefs, VideoQualityPref} from '../data/models';
import {THEME_PRESETS} from '../data/themes';
import {
  DIAGNOSTICS_UPDATED_EVENT,
  DownloadDiagnosticReport,
  clearDiagnosticReports,
  copyDiagnosticText,
  formatDiagnosticSummaryBundle,
  loadDiagnosticReports,
  shareDiagnosticText,
} from '../engine/downloadDiagnostics';
import {APP_VERSION, GITHUB_REPO, GithubUpdateInfo, getVersionChannel} from '../engine/githubUpdater';
import {
  EngineCardInfo,
  MorphNetworkStatus,
  getAllEnginesStatus,
  getLiveNetworkStatus,
  installOrUpdateEngineModule,
  runEngineSelfTest,
} from '../engine/morphEnginesBridge';
import {
  AppPermissionState,
  AppPermissionsSummary,
  checkAppPermissions,
  ensureStoragePermission,
  isNativeApp,
  requestAllAppPermissions,
} from '../engine/nativeBridge';
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
  onOpenWheelCustomize?: () => void;
  onShowToast?: (msg: string) => void;
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
  onOpenWheelCustomize,
  onShowToast,
}) => {
  const lang: Lang = prefs.lang;
  const [perms, setPerms] = useState<AppPermissionsSummary>({
    storage: 'ready',
    media: 'ready',
    notifications: 'prompt',
    clipboard: 'prompt',
  });
  const [requestingPerms, setRequestingPerms] = useState(false);

  // Smart Download & Engine States
  const [netStatus, setNetStatus] = useState<MorphNetworkStatus>({
    connected: true,
    connectionType: 'unknown',
    metered: false,
  });
  const [engineCards, setEngineCards] = useState<Record<DownloadEngineId, EngineCardInfo> | null>(null);
  const [installingEngineId, setInstallingEngineId] = useState<DownloadEngineId | null>(null);
  const [testingEngine, setTestingEngine] = useState(false);
  const [testBanner, setTestBanner] = useState<{ok: boolean; text: string} | null>(null);

  // Diagnostics & Feedback States
  const [reports, setReports] = useState<DownloadDiagnosticReport[]>(() => loadDiagnosticReports());
  const [showLogDetails, setShowLogDetails] = useState(false);
  const [copiedDiag, setCopiedDiag] = useState(false);

  const refreshPermissions = useCallback(async () => {
    const next = await checkAppPermissions();
    setPerms(next);
  }, []);

  const refreshNetworkAndEngines = useCallback(async () => {
    const [net, eng] = await Promise.all([getLiveNetworkStatus(), getAllEnginesStatus(prefs)]);
    setNetStatus(net);
    setEngineCards(eng);
  }, [prefs]);

  useEffect(() => {
    refreshPermissions();
    refreshNetworkAndEngines();
    const onFocus = () => {
      refreshPermissions();
      refreshNetworkAndEngines();
    };
    const onDiagUpdate = () => {
      setReports(loadDiagnosticReports());
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    window.addEventListener('offline', onFocus);
    window.addEventListener(DIAGNOSTICS_UPDATED_EVENT, onDiagUpdate);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      window.removeEventListener('offline', onFocus);
      window.removeEventListener(DIAGNOSTICS_UPDATED_EVENT, onDiagUpdate);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refreshPermissions, refreshNetworkAndEngines]);

  const handleGrantAllPermissions = async () => {
    setRequestingPerms(true);
    try {
      const updated = await requestAllAppPermissions();
      setPerms(updated);
      onShowToast?.(t('PermissionsUpdatedToast', lang));
    } finally {
      setRequestingPerms(false);
    }
  };

  const handleSinglePermission = async (kind: keyof AppPermissionsSummary) => {
    setRequestingPerms(true);
    try {
      if (kind === 'storage' || kind === 'media') {
        await ensureStoragePermission(true);
      } else if (kind === 'notifications' && typeof Notification !== 'undefined') {
        await Notification.requestPermission();
      } else if (kind === 'clipboard' && navigator.clipboard?.readText) {
        await navigator.clipboard.readText().catch(() => {});
      }
      const updated = await checkAppPermissions();
      setPerms(updated);
      onShowToast?.(t('PermissionsUpdatedToast', lang));
    } finally {
      setRequestingPerms(false);
    }
  };

  const handleInstallOrUpdateEngine = async (engineId: DownloadEngineId) => {
    setInstallingEngineId(engineId);
    setTestBanner(null);
    try {
      const res = await installOrUpdateEngineModule(engineId, prefs, lang);
      await refreshNetworkAndEngines();
      if (res.ok) {
        onChangePrefs((p) => ({...p, downloadEngine: engineId}));
      }
      setTestBanner({ok: res.ok, text: res.message});
      onShowToast?.(res.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestBanner({ok: false, text: msg});
      onShowToast?.(msg);
    } finally {
      setInstallingEngineId(null);
      setReports(loadDiagnosticReports());
    }
  };

  const handleTestSelectedEngine = async () => {
    const selected: DownloadEngineId = prefs.downloadEngine || 'builtin';
    setTestingEngine(true);
    setTestBanner(null);
    try {
      const res = await runEngineSelfTest(selected, prefs, lang);
      setTestBanner({ok: res.ok, text: res.summary});
      onShowToast?.(res.summary);
      await refreshNetworkAndEngines();
    } finally {
      setTestingEngine(false);
      setReports(loadDiagnosticReports());
    }
  };

  const handleCopyDiagnostics = async () => {
    const text = formatDiagnosticSummaryBundle(4);
    const ok = await copyDiagnosticText(text);
    if (ok) {
      setCopiedDiag(true);
      onShowToast?.(t('DiagnosticCopiedToast', lang));
      setTimeout(() => setCopiedDiag(false), 2400);
    }
  };

  const handleShareDiagnostics = async () => {
    const text = formatDiagnosticSummaryBundle(4);
    await shareDiagnosticText(text);
  };

  const permBadgeLabel = (state: AppPermissionState) => {
    switch (state) {
      case 'granted':
        return t('PermGranted', lang);
      case 'denied':
        return t('PermDenied', lang);
      case 'prompt':
        return t('PermPrompt', lang);
      case 'ready':
        return t('PermReady', lang);
    }
  };

  const selectedEngine: DownloadEngineId = prefs.downloadEngine || 'builtin';
  const wifiOnly = Boolean(prefs.downloadWifiOnly);
  const cellularLimitMb = typeof prefs.cellularLimitMb === 'number' ? prefs.cellularLimitMb : 150;
  const preferredQuality: VideoQualityPref = prefs.preferredVideoQuality || '720p';
  const autoFallback = prefs.autoFallbackEngine !== false;
  const concurrentFragments = prefs.concurrentFragments ?? 4;

  const liveNetLabel = !netStatus.connected
    ? t('LiveNetOffline', lang)
    : netStatus.connectionType === 'wifi'
      ? t('LiveNetWifi', lang)
      : netStatus.connectionType === 'cellular'
        ? t('LiveNetCellular', lang)
        : t('LiveNetActive', lang);

  const engineMetaList: Array<{
    id: DownloadEngineId;
    title: string;
    desc: string;
  }> = [
    {
      id: 'builtin',
      title: t('EngineBuiltinTitle', lang),
      desc: t('EngineBuiltinDesc', lang),
    },
    {
      id: 'newpipe',
      title: t('EngineNewpipeTitle', lang),
      desc: t('EngineNewpipeDesc', lang),
    },
    {
      id: 'ytdlp_native',
      title: t('EngineYtdlpTitle', lang),
      desc: t('EngineYtdlpDesc', lang),
    },
    {
      id: 'cobalt',
      title: t('EngineCobaltTitle', lang),
      desc: t('EngineCobaltDesc', lang),
    },
  ];

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

          {onOpenWheelCustomize && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--ink)]">
                  {t('WheelCustomizeTitle', lang)} ·{' '}
                  <span className="text-[var(--accent)]">
                    {prefs.wheelConfig?.mode === 'all'
                      ? t('WheelModeAll', lang)
                      : prefs.wheelConfig?.mode === 'pinned'
                        ? t('WheelModePinned', lang)
                        : t('WheelModeSmart', lang)}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
                  {t('WheelHoldHint', lang)}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenWheelCustomize}
                className="morph-tonal-btn flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-full px-4 text-xs font-semibold whitespace-nowrap transition-transform active:scale-[0.98]"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                <span>{t('WheelCustomizeOpenBtn', lang)}</span>
              </button>
            </div>
          )}
        </section>

        {/* Smart Download Preferences Section */}
        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)]">
                <Wifi className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold leading-tight text-[var(--ink)]">
                  {t('DownloadPrefsSection', lang)}
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
                  {t('DownloadPrefsDesc', lang)}
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--inset)] px-3 py-1 text-[11px] font-semibold text-[var(--ink)]">
              <span
                className={`h-2 w-2 rounded-full ${
                  !netStatus.connected
                    ? 'bg-red-400'
                    : netStatus.connectionType === 'cellular'
                      ? 'bg-amber-400'
                      : 'bg-[var(--accent-end)]'
                }`}
              />
              <span>{liveNetLabel}</span>
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Wi-Fi Only Toggle */}
            <button
              type="button"
              onClick={() => onChangePrefs((p) => ({...p, downloadWifiOnly: !p.downloadWifiOnly}))}
              className="flex min-h-[72px] items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-3.5 text-left transition-colors hover:border-[var(--accent)]/50"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--ink)]">{t('DownloadWifiOnly', lang)}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
                  {t('DownloadWifiOnlyDesc', lang)}
                </p>
              </div>
              <span
                className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                  wifiOnly ? 'bg-[var(--accent)]' : 'bg-[var(--surface)] border border-[var(--line)]'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    wifiOnly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>

            {/* Auto-Fallback Engine Toggle */}
            <button
              type="button"
              onClick={() =>
                onChangePrefs((p) => ({...p, autoFallbackEngine: p.autoFallbackEngine === false}))
              }
              className="flex min-h-[72px] items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-3.5 text-left transition-colors hover:border-[var(--accent)]/50"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--ink)]">{t('AutoFallbackLabel', lang)}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
                  {t('AutoFallbackDesc', lang)}
                </p>
              </div>
              <span
                className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                  autoFallback ? 'bg-[var(--accent)]' : 'bg-[var(--surface)] border border-[var(--line)]'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    autoFallback ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Mobile Data Size Cap */}
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('CellularLimitLabel', lang)}</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    [50, '50 MB'],
                    [150, '150 MB'],
                    [500, '500 MB'],
                    [0, t('Unlimited', lang)],
                  ] as const
                ).map(([mb, label]) => {
                  const active = cellularLimitMb === mb;
                  return (
                    <button
                      key={mb}
                      type="button"
                      onClick={() => onChangePrefs((p) => ({...p, cellularLimitMb: mb}))}
                      className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors ${
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
            </div>

            {/* Preferred Video Quality */}
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('PreferredQualityLabel', lang)}</p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['360p', '360p'],
                    ['480p', '480p'],
                    ['720p', '720p'],
                    ['1080p', '1080p'],
                    ['best', t('QualityBest', lang)],
                  ] as const
                ).map(([q, label]) => {
                  const active = preferredQuality === q;
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onChangePrefs((p) => ({...p, preferredVideoQuality: q}))}
                      className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors ${
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
            </div>

            {/* Concurrent Fragments */}
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
                {t('ConcurrentFragmentsLabel', lang)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {([1, 4, 8] as const).map((frags) => {
                  const active = concurrentFragments === frags;
                  return (
                    <button
                      key={frags}
                      type="button"
                      onClick={() => onChangePrefs((p) => ({...p, concurrentFragments: frags}))}
                      className={`min-h-[36px] rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--ink)]'
                          : 'border-[var(--line)] bg-[var(--inset)] text-[var(--muted)]'
                      }`}
                    >
                      {frags}×
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Selectable & On-Demand Installable Download Engines Section */}
        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)]">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold leading-tight text-[var(--ink)]">
                    {t('DownloadEnginesSection', lang)}
                  </h2>
                  <span className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                    Beta {APP_VERSION}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
                  {t('DownloadEnginesDesc', lang)}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={testingEngine}
              onClick={handleTestSelectedEngine}
              className="morph-tonal-btn flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-full px-4 text-xs font-semibold transition-transform active:scale-[0.98] disabled:opacity-70"
            >
              <Play className={`h-3.5 w-3.5 shrink-0 text-[var(--accent)] ${testingEngine ? 'animate-pulse' : ''}`} />
              <span className="whitespace-nowrap">
                {testingEngine ? t('TestingEngine', lang) : t('TestSelectedEngine', lang)}
              </span>
            </button>
          </div>

          {testBanner && (
            <div
              className={`mt-3.5 rounded-2xl border px-3.5 py-2.5 text-xs font-medium leading-relaxed ${
                testBanner.ok
                  ? 'border-[var(--accent-end)]/45 bg-[var(--accent-end)]/12 text-[var(--ink)]'
                  : 'border-[var(--accent)]/50 bg-[var(--accent)]/12 text-[var(--ink)]'
              }`}
            >
              {testBanner.text}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {engineMetaList.map(({id, title, desc}) => {
              const info = engineCards?.[id];
              const isSelected = selectedEngine === id;
              const isInstalling = installingEngineId === id;
              const nativeApp = isNativeApp();

              let badgeText = t('EngineBadgeReady', lang);
              if (id === 'builtin') {
                badgeText = t('EngineBadgeBuiltin', lang);
              } else if (id === 'cobalt') {
                badgeText = (prefs.cobaltUrl || '').trim()
                  ? t('EngineBadgeReady', lang)
                  : t('EngineBadgeNeedUrl', lang);
              } else if (!nativeApp) {
                badgeText = t('EngineBadgeApkOnly', lang);
              } else if (info?.installed) {
                badgeText = `${t('EngineBadgeReady', lang)}${info.version ? ` · ${info.version}` : ''}`;
              } else {
                badgeText = t('EngineBadgeNeedInstall', lang);
              }

              const showInstallBtn = id === 'ytdlp_native' || id === 'newpipe';
              const installLabel = isInstalling
                ? t('EngineInstalling', lang)
                : id === 'ytdlp_native'
                  ? info?.installed
                    ? t('EngineUpdateBtn', lang)
                    : t('EngineInstallBtn', lang)
                  : t('EngineEnableBtn', lang);

              return (
                <div
                  key={id}
                  className={`flex flex-col justify-between rounded-2xl border p-4 transition-colors ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--line)] bg-[var(--inset)]'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-[var(--ink)]">{title}</p>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--ink)]'
                            : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]'
                        }`}
                      >
                        {badgeText}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{desc}</p>
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onChangePrefs((p) => ({...p, downloadEngine: id}))}
                      className={`flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                        isSelected
                          ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                          : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--accent)]'
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                      <span>
                        {isSelected ? t('EngineSelectedBadge', lang) : t('EngineSelectBtn', lang)}
                      </span>
                    </button>

                    {showInstallBtn && (
                      <button
                        type="button"
                        disabled={isInstalling}
                        onClick={() => handleInstallOrUpdateEngine(id)}
                        className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)] disabled:opacity-65"
                      >
                        <Download
                          className={`h-3.5 w-3.5 text-[var(--accent)] ${isInstalling ? 'animate-bounce' : ''}`}
                        />
                        <span>{installLabel}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cobalt Endpoint Configuration (visible whenever Cobalt is selected or already filled) */}
          {(selectedEngine === 'cobalt' || Boolean((prefs.cobaltUrl || '').trim())) && (
            <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                  {t('CobaltUrlLabel', lang)}
                </label>
                <input
                  type="url"
                  value={prefs.cobaltUrl || ''}
                  onChange={(e) => onChangePrefs((p) => ({...p, cobaltUrl: e.target.value}))}
                  placeholder="https://cobalt.example.com"
                  className="min-h-[44px] w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                  {t('CobaltKeyLabel', lang)}
                </label>
                <input
                  type="password"
                  value={prefs.cobaltApiKey || ''}
                  onChange={(e) => onChangePrefs((p) => ({...p, cobaltApiKey: e.target.value}))}
                  placeholder={t('Optional', lang)}
                  className="min-h-[44px] w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
          )}

          {/* Effortless 1-Tap Diagnostic & Feedback Panel */}
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Activity className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                <div>
                  <p className="text-xs font-bold text-[var(--ink)]">{t('DiagnosticsTitle', lang)}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">
                    {t('DiagnosticsDesc', lang)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyDiagnostics}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-[var(--accent)]/45 bg-[var(--surface)] px-3.5 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                >
                  <ClipboardCopy className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>{copiedDiag ? (lang === 'tr' ? 'Kopyalandı!' : 'Copied!') : t('CopyDiagnosticBtn', lang)}</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareDiagnostics}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                >
                  <Share2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>{t('ShareDiagnosticBtn', lang)}</span>
                </button>
                {reports.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowLogDetails((s) => !s)}
                      className="min-h-[36px] rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      {showLogDetails ? t('HideDiagnosticLogs', lang) : `${t('ShowDiagnosticLogs', lang)} (${reports.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearDiagnosticReports();
                        setReports([]);
                      }}
                      aria-label={t('Clear', lang)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {showLogDetails && (
              <pre className="mt-3 max-h-56 overflow-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-[11px] leading-relaxed text-[var(--muted)] whitespace-pre-wrap break-words">
                {formatDiagnosticSummaryBundle(5)}
              </pre>
            )}
          </div>
        </section>

        {/* App Permissions Section */}
        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold leading-tight text-[var(--ink)]">
                  {t('PermissionsSection', lang)}
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
                  {t('PermissionsDesc', lang)}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={requestingPerms}
              onClick={handleGrantAllPermissions}
              className="morph-tonal-btn flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-full px-4 text-xs font-semibold transition-transform active:scale-[0.98] disabled:opacity-70"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span className="whitespace-nowrap">{t('RequestPermissionsBtn', lang)}</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {(
              [
                {
                  key: 'storage' as const,
                  title: t('PermStorage', lang),
                  desc: t('PermStorageDesc', lang),
                  Icon: FolderCheck,
                },
                {
                  key: 'media' as const,
                  title: t('PermMedia', lang),
                  desc: t('PermMediaDesc', lang),
                  Icon: ImageIcon,
                },
                {
                  key: 'notifications' as const,
                  title: t('PermNotifications', lang),
                  desc: t('PermNotificationsDesc', lang),
                  Icon: Bell,
                },
                {
                  key: 'clipboard' as const,
                  title: t('PermClipboard', lang),
                  desc: t('PermClipboardDesc', lang),
                  Icon: ClipboardPaste,
                },
              ] as const
            ).map(({key, title, desc, Icon}) => {
              const state = perms[key];
              const isActionable = state === 'prompt';
              const isGranted = state === 'granted' || state === 'ready';
              return (
                <button
                  key={key}
                  type="button"
                  disabled={requestingPerms}
                  onClick={() => handleSinglePermission(key)}
                  className="flex min-h-[68px] items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-3.5 text-left transition-colors hover:border-[var(--accent)]/50"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--accent)]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--ink)]">{title}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">{desc}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      isGranted
                        ? 'border-[var(--accent-end)]/45 bg-[var(--accent-end)]/14 text-[var(--ink)]'
                        : isActionable
                          ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]'
                          : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]'
                    }`}
                  >
                    {permBadgeLabel(state)}
                  </span>
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
                    <span className="text-[11px] font-semibold text-[var(--accent)]">
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
                  href={updateInfo?.apkDownloadUrl ?? `https://github.com/${GITHUB_REPO}/releases`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[42px] min-w-0 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--inset)] px-3 py-2 text-center text-xs font-semibold leading-none text-[var(--ink)] whitespace-nowrap transition-colors hover:border-[var(--accent)]"
                >
                  <Download className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">{t('DownloadApk', lang)}</span>
                </a>
                <a
                  href={updateInfo?.repoUrl ?? `https://github.com/${GITHUB_REPO}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[42px] min-w-0 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--inset)] px-3 py-2 text-center text-xs font-semibold leading-none text-[var(--ink)] whitespace-nowrap transition-colors hover:border-[var(--accent)]"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">{t('OpenGithubRepo', lang)}</span>
                </a>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)]/70 pt-3">
              <span className="text-[11px] text-[var(--muted)]">{t('ApkBuildHint', lang)}</span>
              <div className="ml-auto flex items-center gap-2 text-[11px]">
                <span className="font-mono-num font-bold text-[var(--accent)]">Morph {APP_VERSION}</span>
                <span aria-hidden="true" className="text-[var(--muted)]">
                  ·
                </span>
                <span className="font-semibold text-[var(--ink)]">
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
