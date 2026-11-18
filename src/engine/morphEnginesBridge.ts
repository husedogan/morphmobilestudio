import {CapacitorHttp, PluginListenerHandle, registerPlugin} from '@capacitor/core';
import {Lang} from '../data/i18n';
import {DownloadEngineId, Prefs, VideoQualityPref, formatBytes} from '../data/models';
import {DiagnosticSession} from './downloadDiagnostics';
import {BROWSER_USER_AGENT, ResolvedMediaTarget, sanitizeSuggestedBase} from './mediaUrlResolver';
import {isNativeApp} from './nativeBridge';

export type NetworkConnectionKind = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

export interface MorphNetworkStatus {
  connected: boolean;
  connectionType: NetworkConnectionKind;
  metered: boolean;
}

export interface NativeEnginesStatusResult {
  ytdlpInstalled: boolean;
  ytdlpVersion: string;
  newpipeReady: boolean;
  newpipeVersion: string;
}

export interface NativeYtDlpDownloadResult {
  filePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  uri: string;
  ytdlpVersion: string;
}

export interface NativeNewPipeExtractResult {
  url: string;
  title: string;
  suggestedName: string;
  mimeType: string;
  durationSec: number;
  thumbnailUrl?: string;
}

export interface MorphEnginesPlugin {
  getNetworkStatus(): Promise<MorphNetworkStatus>;
  getEnginesStatus(): Promise<NativeEnginesStatusResult>;
  installOrUpdateYtDlp(options?: {channel?: 'stable' | 'nightly'}): Promise<{
    installed: boolean;
    status: string;
    version: string;
  }>;
  initNewPipe(): Promise<{
    ready: boolean;
    version: string;
  }>;
  extractWithNewPipe(options: {
    url: string;
    mode: string;
    quality: string;
  }): Promise<NativeNewPipeExtractResult>;
  downloadWithYtDlp(options: {
    url: string;
    mode: string;
    quality: string;
    concurrentFragments: number;
    processId: string;
  }): Promise<NativeYtDlpDownloadResult>;
  cancelYtDlp(options: {processId: string}): Promise<{cancelled: boolean}>;
  addListener(
    eventName: 'ytdlpProgress',
    listenerFunc: (event: {processId: string; progress: number; etaSec: number; line: string}) => void
  ): Promise<PluginListenerHandle>;
}

export const MorphEnginesNative = registerPlugin<MorphEnginesPlugin>('MorphEngines');

const ENGINE_META_STORAGE_KEY = 'morph_engine_install_state_v1';

interface StoredEngineInstallState {
  ytdlpReady?: boolean;
  ytdlpVersion?: string;
  newpipeReady?: boolean;
}

function loadStoredEngineState(): StoredEngineInstallState {
  try {
    const raw = localStorage.getItem(ENGINE_META_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredEngineState(patch: Partial<StoredEngineInstallState>): void {
  try {
    const next = {...loadStoredEngineState(), ...patch};
    localStorage.setItem(ENGINE_META_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
}

export interface EngineCardInfo {
  id: DownloadEngineId;
  installed: boolean;
  canInstallOrUpdate: boolean;
  supportedOnCurrentPlatform: boolean;
  version: string;
  ready: boolean;
}

export async function getLiveNetworkStatus(): Promise<MorphNetworkStatus> {
  if (isNativeApp()) {
    try {
      const nativeNet = await MorphEnginesNative.getNetworkStatus();
      if (nativeNet && typeof nativeNet.connected === 'boolean') {
        return nativeNet;
      }
    } catch {
      // Fall back to navigator API below
    }
  }

  if (typeof navigator !== 'undefined') {
    const online = navigator.onLine !== false;
    const navConn = (
      navigator as Navigator & {
        connection?: {type?: string; effectiveType?: string; saveData?: boolean};
      }
    ).connection;
    const rawType = String(navConn?.type || '').toLowerCase();
    let connectionType: NetworkConnectionKind = 'unknown';
    if (!online) {
      connectionType = 'none';
    } else if (rawType === 'wifi') {
      connectionType = 'wifi';
    } else if (rawType === 'ethernet') {
      connectionType = 'ethernet';
    } else if (rawType === 'cellular' || rawType === 'wimax') {
      connectionType = 'cellular';
    }
    const metered = connectionType === 'cellular' || Boolean(navConn?.saveData);
    return {connected: online, connectionType, metered};
  }

  return {connected: true, connectionType: 'unknown', metered: false};
}

export class NetworkPolicyBlockedError extends Error {
  readonly isPolicyBlock = true;
  constructor(message: string) {
    super(message);
    this.name = 'NetworkPolicyBlockedError';
  }
}

export function checkNetworkPolicyAgainstStatus(
  net: MorphNetworkStatus,
  prefs: Prefs,
  expectedBytes: number | undefined,
  lang: Lang
): void {
  if (!net.connected || net.connectionType === 'none') {
    throw new NetworkPolicyBlockedError(
      lang === 'tr'
        ? 'İnternet bağlantısı yok. Bağlantını kontrol edip tekrar dene.'
        : 'No internet connection detected.'
    );
  }

  if (prefs.downloadWifiOnly) {
    // Block when clearly on cellular or metered network
    if (net.connectionType === 'cellular' || net.metered) {
      throw new NetworkPolicyBlockedError(
        lang === 'tr'
          ? '“Sadece Wi-Fi’da İndir” ayarı açık ve şu an mobil/tarifeli veri algılandı. Wi-Fi ağına bağlan veya Ayarlar’dan bu kısıtlamayı kapat.'
          : '“Wi-Fi Only Download” is enabled and mobile/metered data was detected. Connect to Wi-Fi or disable the toggle in Settings.'
      );
    }
  }

  const limitMb = typeof prefs.cellularLimitMb === 'number' ? prefs.cellularLimitMb : 150;
  if (
    limitMb > 0 &&
    (net.connectionType === 'cellular' || net.metered) &&
    expectedBytes &&
    expectedBytes > limitMb * 1024 * 1024
  ) {
    throw new NetworkPolicyBlockedError(
      lang === 'tr'
        ? `Mobil veri boyut sınırı (${limitMb} MB) aşıldı: İndirilecek dosya yaklaşık ${formatBytes(expectedBytes)}. Wi-Fi’a geç veya Ayarlar’dan mobil veri sınırını büyüt.`
        : `Mobile data size limit (${limitMb} MB) exceeded: Target file is ~${formatBytes(expectedBytes)}. Connect to Wi-Fi or raise the limit in Settings.`
    );
  }
}

export async function getAllEnginesStatus(prefs: Prefs): Promise<Record<DownloadEngineId, EngineCardInfo>> {
  const native = isNativeApp();
  const stored = loadStoredEngineState();
  let ytdlpInstalled = Boolean(stored.ytdlpReady);
  let ytdlpVersion = stored.ytdlpVersion || '0.18.1';
  let newpipeReady = stored.newpipeReady !== false;
  let newpipeVersion = 'v0.27.1';

  if (native) {
    try {
      const st = await MorphEnginesNative.getEnginesStatus();
      ytdlpInstalled = Boolean(st.ytdlpInstalled);
      if (st.ytdlpVersion) ytdlpVersion = st.ytdlpVersion;
      newpipeReady = Boolean(st.newpipeReady);
      if (st.newpipeVersion) newpipeVersion = st.newpipeVersion;
      saveStoredEngineState({ytdlpReady: ytdlpInstalled, ytdlpVersion, newpipeReady});
    } catch {
      // Keep cached state
    }
  }

  const cobaltConfigured = Boolean((prefs.cobaltUrl || '').trim());

  return {
    builtin: {
      id: 'builtin',
      installed: true,
      canInstallOrUpdate: false,
      supportedOnCurrentPlatform: true,
      version: 'Morph Core',
      ready: true,
    },
    newpipe: {
      id: 'newpipe',
      installed: native ? newpipeReady : false,
      canInstallOrUpdate: native,
      supportedOnCurrentPlatform: native,
      version: newpipeVersion,
      ready: native && newpipeReady,
    },
    ytdlp_native: {
      id: 'ytdlp_native',
      installed: native ? ytdlpInstalled : false,
      canInstallOrUpdate: native,
      supportedOnCurrentPlatform: native,
      version: ytdlpVersion,
      ready: native && ytdlpInstalled,
    },
    cobalt: {
      id: 'cobalt',
      installed: cobaltConfigured,
      canInstallOrUpdate: false,
      supportedOnCurrentPlatform: true,
      version: cobaltConfigured ? 'API v10/v7' : 'URL Gerekli',
      ready: cobaltConfigured,
    },
  };
}

export async function installOrUpdateEngineModule(
  engineId: DownloadEngineId,
  prefs: Prefs,
  lang: Lang
): Promise<{ok: boolean; version: string; message: string}> {
  const net = await getLiveNetworkStatus();
  const diag = new DiagnosticSession({
    networkType: net.connectionType,
    metered: net.metered,
    wifiOnly: Boolean(prefs.downloadWifiOnly),
    cellularLimitMb: prefs.cellularLimitMb ?? 150,
    selectedEngine: engineId,
    mode: 'install',
    quality: prefs.preferredVideoQuality || '720p',
    autoFallback: prefs.autoFallbackEngine !== false,
    concurrentFragments: prefs.concurrentFragments ?? 4,
    rawUrl: `morph://engine-install/${engineId}`,
  });

  if (!isNativeApp() && (engineId === 'ytdlp_native' || engineId === 'newpipe')) {
    const msg =
      lang === 'tr'
        ? 'Bu yerel motor Android APK sürümünde cihaz içinde çalışır. Web önizlemesinde Dahili Motor veya Cobalt API kullanılır; GitHub’dan Beta APK’yı kurduğunda tek dokunuşla etkinleşir.'
        : 'This native engine runs inside the Android APK. On Web preview, Built-in or Cobalt API is used.';
    diag.step(engineId, 'Web ortamında yerel APK modülü istendi (bilgilendirme gösterildi)');
    diag.finish('blocked', {error: msg});
    return {ok: false, version: '-', message: msg};
  }

  try {
    if (engineId === 'ytdlp_native') {
      diag.step('ytdlp_native', 'Python çalışma ortamı + yt-dlp güncel sürüm kurulumu başlatıldı');
      const res = await MorphEnginesNative.installOrUpdateYtDlp({channel: 'stable'});
      saveStoredEngineState({ytdlpReady: true, ytdlpVersion: res.version || 'latest'});
      diag.setEffectiveEngine('ytdlp_native', res.version);
      diag.step('ytdlp_native', `Durum: ${res.status}, sürüm: ${res.version}`);
      diag.finish('success');
      const msg =
        lang === 'tr'
          ? `yt-dlp yerel motoru hazır (${res.version || 'güncel'}).`
          : `Native yt-dlp engine ready (${res.version || 'latest'}).`;
      return {ok: true, version: res.version || 'latest', message: msg};
    }

    if (engineId === 'newpipe') {
      diag.step('newpipe', 'NewPipe Extractor Java/Rhino servisi başlatılıyor');
      const res = await MorphEnginesNative.initNewPipe();
      saveStoredEngineState({newpipeReady: res.ready});
      diag.setEffectiveEngine('newpipe', res.version);
      diag.step('newpipe', `NewPipe hazır (${res.version})`);
      diag.finish('success');
      const msg =
        lang === 'tr'
          ? `NewPipe Extractor etkinleştirildi (${res.version}).`
          : `NewPipe Extractor initialized (${res.version}).`;
      return {ok: true, version: res.version, message: msg};
    }

    diag.finish('success');
    return {
      ok: true,
      version: 'Morph Core',
      message: lang === 'tr' ? 'Motor kullanıma hazır.' : 'Engine is ready.',
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    diag.step(engineId, `Kurulum/güncelleme hatası: ${errMsg}`);
    diag.finish('failed', {error: errMsg});
    throw new Error(
      lang === 'tr'
        ? `Motor hazırlanamadı (${errMsg}). Tanılama raporunu kopyalayıp paylaşabilirsin.`
        : `Could not prepare engine (${errMsg}).`
    );
  }
}

export async function resolveViaCobaltEngine(
  targetMediaUrl: string,
  mode: string,
  quality: VideoQualityPref,
  cobaltBaseUrl: string,
  cobaltApiKey?: string,
  signal?: AbortSignal
): Promise<ResolvedMediaTarget> {
  const rawBase = cobaltBaseUrl.trim();
  if (!rawBase) {
    throw new Error('Cobalt API adresi girilmedi. Ayarlar > İndirme Motorları bölümünden bir Cobalt sunucu adresi gir.');
  }
  const normalizedBase = (/^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`).replace(/\/+$/, '');
  const vQuality = quality === 'best' ? 'max' : quality.replace(/\D+/g, '') || '720';

  const v10Payload = {
    url: targetMediaUrl,
    downloadMode: mode === 'audio' ? 'audio' : 'auto',
    videoQuality: vQuality,
    audioFormat: 'mp3',
    filenameStyle: 'basic',
  };

  const v7Payload = {
    url: targetMediaUrl,
    vQuality,
    isAudioOnly: mode === 'audio',
    aFormat: 'mp3',
  };

  const parseCobaltJson = (rawText: string): ResolvedMediaTarget | null => {
    const j = JSON.parse(rawText);
    if (j?.status === 'error') {
      const code = j?.error?.code || j?.text || 'cobalt_error';
      throw new Error(`Cobalt yanıt hatası: ${code}`);
    }
    const directUrl = j?.url || (Array.isArray(j?.picker) ? j.picker[0]?.url : null);
    if (typeof directUrl === 'string' && /^https?:\/\//i.test(directUrl)) {
      const suggested = j?.filename
        ? sanitizeSuggestedBase(String(j.filename).replace(/\.[^.]+$/, '')) +
          (String(j.filename).match(/\.[^.]+$/)?.[0] || '.mp4')
        : undefined;
      return {
        url: directUrl,
        suggestedName: suggested,
      };
    }
    return null;
  };

  if (isNativeApp()) {
    const authHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': BROWSER_USER_AGENT,
    };
    if (cobaltApiKey?.trim()) {
      authHeaders.Authorization = cobaltApiKey.trim().startsWith('Api-Key ')
        ? cobaltApiKey.trim()
        : `Api-Key ${cobaltApiKey.trim()}`;
    }

    // Try Cobalt v10 (POST /) then Cobalt v7 (POST /api/json)
    const v10Res = await CapacitorHttp.post({
      url: `${normalizedBase}/`,
      data: v10Payload,
      headers: authHeaders,
      connectTimeout: 15_000,
      readTimeout: 25_000,
      responseType: 'text',
    });
    const v10Text = typeof v10Res.data === 'string' ? v10Res.data : JSON.stringify(v10Res.data ?? {});
    if (v10Res.status >= 200 && v10Res.status < 300) {
      const parsed = parseCobaltJson(v10Text);
      if (parsed) return parsed;
    }

    const v7Res = await CapacitorHttp.post({
      url: `${normalizedBase}/api/json`,
      data: v7Payload,
      headers: authHeaders,
      connectTimeout: 15_000,
      readTimeout: 25_000,
      responseType: 'text',
    });
    const v7Text = typeof v7Res.data === 'string' ? v7Res.data : JSON.stringify(v7Res.data ?? {});
    if (v7Res.status >= 200 && v7Res.status < 300) {
      const parsed = parseCobaltJson(v7Text);
      if (parsed) return parsed;
    }
    throw new Error(`Cobalt sunucusu geçerli akış döndürmedi (HTTP ${v10Res.status}/${v7Res.status}).`);
  }

  // Web mode: route via server-side /api/cobalt-proxy so custom Cobalt instances never fail CORS
  const proxyRes = await fetch('/api/cobalt-proxy', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      cobaltUrl: normalizedBase,
      apiKey: cobaltApiKey?.trim() || '',
      v10Payload,
      v7Payload,
    }),
    signal,
  });
  const text = await proxyRes.text();
  if (!proxyRes.ok) {
    let detail = `Cobalt HTTP ${proxyRes.status}`;
    try {
      const errObj = JSON.parse(text);
      if (errObj?.detail) detail = errObj.detail;
    } catch {
      // Keep default detail
    }
    throw new Error(detail);
  }
  const parsed = parseCobaltJson(text);
  if (!parsed) {
    throw new Error('Cobalt yanıtında indirilebilir medya bağlantısı bulunamadı.');
  }
  return parsed;
}

export async function runEngineSelfTest(
  engineId: DownloadEngineId,
  prefs: Prefs,
  lang: Lang
): Promise<{ok: boolean; reportCode: string; summary: string}> {
  const net = await getLiveNetworkStatus();
  const sampleUrl = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'; // Blender Foundation Big Buck Bunny Official
  const diag = new DiagnosticSession({
    networkType: net.connectionType,
    metered: net.metered,
    wifiOnly: Boolean(prefs.downloadWifiOnly),
    cellularLimitMb: prefs.cellularLimitMb ?? 150,
    selectedEngine: engineId,
    mode: 'self-test',
    quality: prefs.preferredVideoQuality || '720p',
    autoFallback: false,
    concurrentFragments: prefs.concurrentFragments ?? 4,
    rawUrl: sampleUrl,
  });

  diag.step(engineId, `Canlı motor tanı testi başlatıldı (ağ: ${net.connectionType})`);

  try {
    if (engineId === 'builtin') {
      if (isNativeApp()) {
        const res = await CapacitorHttp.get({
          url: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
          responseType: 'text',
          connectTimeout: 10_000,
          readTimeout: 10_000,
        });
        diag.step('builtin', `YouTube CDN erişim kontrolü HTTP ${res.status}`);
        if (res.status < 200 || res.status >= 400) throw new Error(`HTTP ${res.status}`);
      } else {
        const ping = await fetch('/api/ping');
        diag.step('builtin', `/api/ping yanıtı HTTP ${ping.status}`);
        if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
      }
      const rep = diag.finish('success');
      return {
        ok: true,
        reportCode: rep.id,
        summary:
          lang === 'tr'
            ? `Morph Dahili Motor sağlıklı (${rep.elapsedMs} ms · ${rep.id}).`
            : `Morph Built-in Engine healthy (${rep.elapsedMs} ms · ${rep.id}).`,
      };
    }

    if (engineId === 'cobalt') {
      const target = await resolveViaCobaltEngine(
        sampleUrl,
        'video',
        prefs.preferredVideoQuality || '720p',
        prefs.cobaltUrl || '',
        prefs.cobaltApiKey
      );
      diag.step('cobalt', `Akış çözümlendi: ${target.suggestedName || 'ok'}`);
      const rep = diag.finish('success');
      return {
        ok: true,
        reportCode: rep.id,
        summary:
          lang === 'tr'
            ? `Cobalt API bağlantısı başarılı (${rep.elapsedMs} ms · ${rep.id}).`
            : `Cobalt API verified (${rep.elapsedMs} ms · ${rep.id}).`,
      };
    }

    if (!isNativeApp()) {
      const msg =
        lang === 'tr'
          ? `${engineId === 'ytdlp_native' ? 'yt-dlp Yerel Motor' : 'NewPipe Extractor'} yalnızca Android APK içinde çalışır (Web ortamında yedek motor devreye girer).`
          : 'This native engine runs inside the Android APK.';
      diag.step(engineId, msg);
      const rep = diag.finish('blocked', {error: msg});
      return {ok: false, reportCode: rep.id, summary: `${msg} [${rep.id}]`};
    }

    if (engineId === 'newpipe') {
      const initRes = await MorphEnginesNative.initNewPipe();
      diag.setEffectiveEngine('newpipe', initRes.version);
      const extracted = await MorphEnginesNative.extractWithNewPipe({
        url: sampleUrl,
        mode: 'video',
        quality: prefs.preferredVideoQuality || '720p',
      });
      diag.step('newpipe', `Çözümlendi: ${extracted.title} (${extracted.mimeType})`);
      const rep = diag.finish('success');
      return {
        ok: true,
        reportCode: rep.id,
        summary:
          lang === 'tr'
            ? `NewPipe testi başarılı: "${extracted.title.slice(0, 28)}" (${rep.elapsedMs} ms · ${rep.id}).`
            : `NewPipe test passed (${rep.elapsedMs} ms · ${rep.id}).`,
      };
    }

    // ytdlp_native
    const st = await MorphEnginesNative.getEnginesStatus();
    if (!st.ytdlpInstalled) {
      diag.step('ytdlp_native', 'Motor henüz kurulmamış -> otomatik başlatılıyor');
      const inst = await MorphEnginesNative.installOrUpdateYtDlp({channel: 'stable'});
      diag.setEffectiveEngine('ytdlp_native', inst.version);
    } else {
      diag.setEffectiveEngine('ytdlp_native', st.ytdlpVersion);
    }
    diag.step('ytdlp_native', 'Python ve yt-dlp ikilisi doğrulandı');
    const rep = diag.finish('success');
    return {
      ok: true,
      reportCode: rep.id,
      summary:
        lang === 'tr'
          ? `yt-dlp Yerel Motor hazır (${rep.engineVersion} · ${rep.id}).`
          : `Native yt-dlp ready (${rep.engineVersion} · ${rep.id}).`,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    diag.step(engineId, `Test hatası: ${errMsg}`);
    const rep = diag.finish('failed', {error: errMsg});
    return {
      ok: false,
      reportCode: rep.id,
      summary:
        lang === 'tr'
          ? `Test başarısız (${rep.id}): ${errMsg}`
          : `Test failed (${rep.id}): ${errMsg}`,
    };
  }
}
