import {CapacitorHttp, PluginListenerHandle} from '@capacitor/core';
import {Directory, Encoding, Filesystem} from '@capacitor/filesystem';
import {
  DownloadEngineId,
  ExportItem,
  Prefs,
  VideoQualityPref,
  buildPickedFile,
  createId,
  extFromMime,
  formatBytes,
  mimeFromExt,
} from '../data/models';
import {DiagnosticSession} from './downloadDiagnostics';
import {runLocalFfmpegTool} from './ffmpegOps';
import {
  BROWSER_USER_AGENT,
  HttpJsonFetcher,
  ResolvedMediaTarget,
  extractYouTubeId,
  resolveMediaFromHtml,
  resolvePlatformMedia,
  rewriteCloudDirectUrl,
} from './mediaUrlResolver';
import {
  MorphEnginesNative,
  MorphNetworkStatus,
  NetworkPolicyBlockedError,
  checkNetworkPolicyAgainstStatus,
  getLiveNetworkStatus,
  resolveViaCobaltEngine,
} from './morphEnginesBridge';
import {ensureStoragePermission, isNativeApp, writeBlobToNativeChunked} from './nativeBridge';

// Thresholds to prevent 32-bit WASM / mobile WebView Out-Of-Memory crashes on 2-hour videos
const MAX_FFMPEG_WASM_INPUT_BYTES = 150 * 1024 * 1024; // 150 MB max for in-browser FFmpeg.wasm transcode
const MAX_NATIVE_IMAGE_PREVIEW_BYTES = 25 * 1024 * 1024; // Read into Blob on Android only for <=25 MB image previews
const MAX_HTML_SNIFF_BYTES = 512 * 1024; // Pages larger than 512 KB without HTML header are binary streams

function base64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const comma = b64.indexOf(',');
  const stripped = (comma >= 0 ? b64.slice(comma + 1) : b64).replace(/\s+/g, '');
  const normalized = stripped.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(normalized);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function headerLookup(headers: Record<string, string | string[] | undefined>, key: string): string {
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === lower) {
      return Array.isArray(v) ? v[0] || '' : v || '';
    }
  }
  return '';
}

function sanitizeNativeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || `morph-${Date.now()}.mp4`;
}

const nativeHttpFetcher: HttpJsonFetcher = {
  async fetchText(url: string, headers?: Record<string, string>) {
    const res = await CapacitorHttp.get({
      url,
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'text/html,application/json,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        ...(headers || {}),
      },
      connectTimeout: 20_000,
      readTimeout: 30_000,
      responseType: 'text',
    });
    const text =
      typeof res.data === 'string'
        ? res.data
        : res.data !== undefined && res.data !== null
          ? JSON.stringify(res.data)
          : '';
    return {
      status: res.status,
      text,
      finalUrl: res.url || url,
      contentType: headerLookup(res.headers, 'content-type').toLowerCase(),
    };
  },
  async postJson(url: string, body: unknown, headers?: Record<string, string>) {
    const res = await CapacitorHttp.post({
      url,
      data: body as Record<string, unknown>,
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {}),
      },
      connectTimeout: 20_000,
      readTimeout: 30_000,
      responseType: 'text',
    });
    const text =
      typeof res.data === 'string'
        ? res.data
        : res.data !== undefined && res.data !== null
          ? JSON.stringify(res.data)
          : '';
    return {status: res.status, text};
  },
};

function guessFilename(urlStr: string, mime: string, headerName?: string | null): string {
  if (headerName) {
    try {
      const decoded = decodeURIComponent(headerName).trim();
      if (decoded) {
        if (!decoded.includes('.')) {
          const ext = extFromMime(mime);
          return ext ? `${decoded}.${ext}` : decoded;
        }
        return decoded;
      }
    } catch {
      return headerName.trim();
    }
  }
  try {
    const u = new URL(urlStr);
    const base = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    if (base && base.includes('.') && !/\.(?:php|aspx|jsp|json)$/i.test(base)) {
      return base;
    }
  } catch {
    // Fallback below
  }
  const ext = extFromMime(mime) || 'mp4';
  return `morph-download.${ext}`;
}

async function streamNativeUrlToDisk(
  targetUrl: string,
  destFilename: string,
  extraHeaders: Record<string, string> | undefined,
  expectedBytes: number | undefined,
  onProgress: (ratio: number, step: string) => void,
  signal?: AbortSignal
): Promise<{directory: Directory; relPath: string; uri: string; size: number}> {
  await ensureStoragePermission(true);

  const safeName = sanitizeNativeFilename(destFilename);
  const targetCandidates: Array<{dir: Directory; path: string}> = [
    {dir: Directory.Documents, path: `Morph/${safeName}`},
    {dir: Directory.Documents, path: `Morph/${Date.now().toString(36).slice(-4)}-${safeName}`},
    {dir: Directory.External, path: `Morph/${safeName}`},
    {dir: Directory.Cache, path: safeName},
  ];

  let progressListener: PluginListenerHandle | null = null;
  try {
    progressListener = await Filesystem.addListener('progress', (ev) => {
      if (signal?.aborted) return;
      const total = ev.contentLength > 0 ? ev.contentLength : expectedBytes || 0;
      if (total > 0) {
        const ratio = Math.min(0.94, 0.25 + (ev.bytes / total) * 0.69);
        onProgress(ratio, `${formatBytes(ev.bytes)} / ${formatBytes(total)}`);
      } else if (ev.bytes > 0) {
        onProgress(0.6, `${formatBytes(ev.bytes)}`);
      }
    });
  } catch {
    // Listener optional
  }

  let lastErr: unknown = null;
  try {
    for (const candidate of targetCandidates) {
      if (signal?.aborted) throw new Error('Cancelled');
      try {
        if (candidate.path.includes('/')) {
          await Filesystem.mkdir({
            path: 'Morph',
            directory: candidate.dir,
            recursive: true,
          }).catch(() => {});
        }

        await Filesystem.downloadFile({
          url: targetUrl,
          path: candidate.path,
          directory: candidate.dir,
          recursive: true,
          progress: true,
          connectTimeout: 30_000,
          readTimeout: 180_000,
          headers: {
            'User-Agent': BROWSER_USER_AGENT,
            Accept: '*/*',
            'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
            ...(extraHeaders || {}),
          },
        });

        const stat = await Filesystem.stat({
          path: candidate.path,
          directory: candidate.dir,
        });
        const uriRes = await Filesystem.getUri({
          path: candidate.path,
          directory: candidate.dir,
        });
        if (stat.size > 0) {
          return {
            directory: candidate.dir,
            relPath: candidate.path,
            uri: uriRes.uri || stat.uri,
            size: stat.size,
          };
        }
      } catch (err) {
        lastErr = err;
      }
    }
  } finally {
    if (progressListener) {
      await progressListener.remove().catch(() => {});
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Bağlantı cihaza indirilemedi.');
}

async function sniffSmallHtmlOnDisk(directory: Directory, relPath: string, size: number): Promise<string | null> {
  if (size <= 0 || size > MAX_HTML_SNIFF_BYTES) return null;
  try {
    const read = await Filesystem.readFile({
      path: relPath,
      directory,
      encoding: Encoding.UTF8,
    });
    const text = typeof read.data === 'string' ? read.data : '';
    const head = text.slice(0, 512).trimStart().toLowerCase();
    if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<meta property="og:')) {
      return text;
    }
  } catch {
    // Binary file (invalid UTF-8) — definitely not HTML
  }
  return null;
}

async function convertVideoBlobToMp3IfRequested(
  blob: Blob,
  filename: string,
  mime: string,
  mode: string,
  onProgress: (ratio: number, step: string) => void,
  signal?: AbortSignal
): Promise<{blob: Blob; filename: string; mime: string}> {
  if (mode !== 'audio' || !mime.startsWith('video/')) {
    return {blob, filename, mime};
  }
  if (blob.size === 0 || blob.size > MAX_FFMPEG_WASM_INPUT_BYTES) {
    return {blob, filename, mime};
  }
  const base = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename;
  const picked = buildPickedFile(new File([blob], filename, {type: mime}));
  onProgress(0.84, `${base}.mp3`);
  const converted = await runLocalFfmpegTool(
    'audio_convert',
    [picked],
    {format: 'mp3'},
    (r) => onProgress(0.84 + r * 0.13, `${base}.mp3`),
    signal
  );
  if (converted[0]) {
    return {
      blob: converted[0].blob,
      filename: `${base}.mp3`,
      mime: 'audio/mpeg',
    };
  }
  return {blob, filename, mime};
}

async function readResponseWithProgress(
  res: Response,
  expectedBytes: number,
  fallbackStep: string,
  onProgress: (ratio: number, step: string) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  if (!res.body) {
    return await res.blob();
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        throw new Error('Cancelled');
      }
      const {done, value} = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value as Uint8Array<ArrayBuffer>);
        received += value.byteLength;
        if (expectedBytes > 0) {
          const ratio = Math.min(0.92, 0.25 + (received / expectedBytes) * 0.67);
          onProgress(ratio, `${formatBytes(received)} / ${formatBytes(expectedBytes)}`);
        } else {
          onProgress(0.62, `${formatBytes(received)} · ${fallbackStep}`);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return new Blob(chunks, {type: contentType.split(';')[0].trim() || 'application/octet-stream'});
}

async function finalizeNativeDiskDownload(
  resolved: ResolvedMediaTarget | null,
  fallbackUrl: string,
  mode: string,
  title: string,
  net: MorphNetworkStatus,
  prefs: Prefs,
  onProgress: (ratio: number, step: string) => void,
  signal?: AbortSignal
): Promise<ExportItem> {
  const lang = prefs.lang || 'tr';
  if (resolved?.expectedBytes) {
    checkNetworkPolicyAgainstStatus(net, prefs, resolved.expectedBytes, lang);
  }

  const targetUrl = resolved?.url || fallbackUrl;
  const initialGuessMime = mode === 'thumbnail' ? 'image/jpeg' : mode === 'audio' ? 'audio/mp4' : 'video/mp4';
  const initialName = guessFilename(targetUrl, initialGuessMime, resolved?.suggestedName);
  onProgress(0.24, initialName);

  let diskFile = await streamNativeUrlToDisk(
    targetUrl,
    initialName,
    resolved?.headers,
    resolved?.expectedBytes,
    onProgress,
    signal
  );

  if (signal?.aborted) {
    await Filesystem.deleteFile({path: diskFile.relPath, directory: diskFile.directory}).catch(() => {});
    throw new Error('Cancelled');
  }

  const htmlContent = await sniffSmallHtmlOnDisk(diskFile.directory, diskFile.relPath, diskFile.size);
  let finalName = initialName;
  if (htmlContent !== null) {
    await Filesystem.deleteFile({path: diskFile.relPath, directory: diskFile.directory}).catch(() => {});
    const extractedUrl = resolveMediaFromHtml(htmlContent, mode, targetUrl);
    if (!extractedUrl) {
      throw new Error(
        'Bu bağlantıdan doğrudan medya akışı çıkarılamadı. Farklı bir indirme motoru (NewPipe / yt-dlp) seçerek tekrar dene.'
      );
    }
    finalName = guessFilename(extractedUrl, initialGuessMime, resolved?.suggestedName);
    onProgress(0.35, finalName);
    diskFile = await streamNativeUrlToDisk(extractedUrl, finalName, undefined, undefined, onProgress, signal);
  }

  const finalExt = finalName.includes('.') ? finalName.split('.').pop()!.toLowerCase() : '';
  const finalMime = mimeFromExt(finalExt) || initialGuessMime;

  if (mode === 'audio' && finalMime.startsWith('video/') && diskFile.size <= MAX_FFMPEG_WASM_INPUT_BYTES) {
    try {
      const readBin = await Filesystem.readFile({path: diskFile.relPath, directory: diskFile.directory});
      if (typeof readBin.data === 'string' && readBin.data.length > 0) {
        const srcBlob = new Blob([base64ToUint8(readBin.data)], {type: finalMime});
        const mp3Media = await convertVideoBlobToMp3IfRequested(
          srcBlob,
          finalName,
          finalMime,
          mode,
          onProgress,
          signal
        );
        if (mp3Media.mime === 'audio/mpeg') {
          await Filesystem.deleteFile({path: diskFile.relPath, directory: diskFile.directory}).catch(() => {});
          const mp3Path = `Morph/${sanitizeNativeFilename(mp3Media.filename)}`;
          const mp3Uri = await writeBlobToNativeChunked(mp3Media.blob, mp3Path, diskFile.directory);
          onProgress(0.98, mp3Media.filename);
          return {
            id: createId(),
            name: mp3Media.filename,
            mime: mp3Media.mime,
            size: mp3Media.blob.size,
            createdAt: Date.now(),
            tool: title,
            blob: mp3Media.blob,
            nativeUri: mp3Uri,
            nativePath: mp3Path,
            nativeDirectory: diskFile.directory,
          };
        }
      }
    } catch {
      // Keep original file if transcode is skipped
    }
  }

  let previewBlob = new Blob([], {type: finalMime});
  let previewUrl: string | undefined;
  if (finalMime.startsWith('image/') && diskFile.size <= MAX_NATIVE_IMAGE_PREVIEW_BYTES) {
    try {
      const readImg = await Filesystem.readFile({path: diskFile.relPath, directory: diskFile.directory});
      if (typeof readImg.data === 'string' && readImg.data.length > 0) {
        previewBlob = new Blob([base64ToUint8(readImg.data)], {type: finalMime});
        previewUrl = URL.createObjectURL(previewBlob);
      }
    } catch {
      // Thumbnail optional
    }
  }

  onProgress(0.98, finalName);
  return {
    id: createId(),
    name: finalName,
    mime: finalMime,
    size: diskFile.size,
    createdAt: Date.now(),
    tool: title,
    blob: previewBlob,
    previewUrl,
    nativeUri: diskFile.uri,
    nativePath: diskFile.relPath,
    nativeDirectory: diskFile.directory,
  };
}

async function runSingleEngineAttempt(
  engineId: DownloadEngineId,
  normalized: string,
  mode: string,
  title: string,
  prefs: Prefs,
  net: MorphNetworkStatus,
  diag: DiagnosticSession,
  onProgress: (ratio: number, step: string) => void,
  signal?: AbortSignal
): Promise<ExportItem> {
  const quality: VideoQualityPref = prefs.preferredVideoQuality || '720p';
  const lang = prefs.lang || 'tr';
  const ytId = extractYouTubeId(normalized);

  // 1. Native Android yt-dlp engine (`youtubedl-android`)
  if (engineId === 'ytdlp_native') {
    if (!isNativeApp()) {
      throw new Error(
        lang === 'tr'
          ? 'yt-dlp Yerel Motor yalnızca Android APK sürümünde çalışır.'
          : 'Native yt-dlp engine requires the Android APK.'
      );
    }
    await ensureStoragePermission(true);
    const procId = `morph-ytdlp-${Date.now().toString(36)}`;
    diag.step('ytdlp_native', `Yerel Python/yt-dlp işlemi başlatılıyor (${quality}, ${prefs.concurrentFragments ?? 4}x parça)`);
    onProgress(0.18, 'yt-dlp hazırlanıyor…');

    let listener: PluginListenerHandle | null = null;
    const onAbort = () => {
      MorphEnginesNative.cancelYtDlp({processId: procId}).catch(() => {});
    };
    signal?.addEventListener('abort', onAbort, {once: true});

    try {
      listener = await MorphEnginesNative.addListener('ytdlpProgress', (ev) => {
        if (ev.processId !== procId || signal?.aborted) return;
        const pct = Math.max(0, Math.min(100, Number(ev.progress) || 0));
        const ratio = Math.min(0.96, 0.2 + (pct / 100) * 0.76);
        const etaLabel = ev.etaSec > 0 ? ` · ~${ev.etaSec} sn` : '';
        onProgress(ratio, `yt-dlp %${Math.round(pct)}${etaLabel}`);
      });

      const res = await MorphEnginesNative.downloadWithYtDlp({
        url: normalized,
        mode,
        quality,
        concurrentFragments: prefs.concurrentFragments ?? 4,
        processId: procId,
      });

      diag.setEffectiveEngine('ytdlp_native', res.ytdlpVersion || '0.18.1');
      diag.step('ytdlp_native', `İndirildi: ${res.fileName} (${formatBytes(res.size)})`);

      const finalMime = res.mimeType || mimeFromExt(res.fileName.split('.').pop() || 'mp4');
      onProgress(0.98, res.fileName);
      return {
        id: createId(),
        name: res.fileName,
        mime: finalMime,
        size: res.size,
        createdAt: Date.now(),
        tool: title,
        blob: new Blob([], {type: finalMime}),
        nativeUri: res.uri,
        nativePath: `Morph/${res.fileName}`,
        nativeDirectory: Directory.Documents,
      };
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (listener) await listener.remove().catch(() => {});
    }
  }

  // 2. Native Android NewPipe Extractor engine
  if (engineId === 'newpipe') {
    if (!isNativeApp()) {
      throw new Error(
        lang === 'tr'
          ? 'NewPipe Extractor yalnızca Android APK sürümünde çalışır.'
          : 'NewPipe Extractor requires the Android APK.'
      );
    }
    diag.step('newpipe', `NewPipe Extractor ile akış çözümleniyor (${quality})`);
    onProgress(0.18, 'NewPipe akış çözümlüyor…');
    const extracted = await MorphEnginesNative.extractWithNewPipe({
      url: normalized,
      mode,
      quality,
    });
    diag.setEffectiveEngine('newpipe', 'v0.27.1');
    diag.step('newpipe', `Akış bulundu: ${extracted.suggestedName}`);

    const targetUrl = mode === 'thumbnail' && extracted.thumbnailUrl ? extracted.thumbnailUrl : extracted.url;
    return finalizeNativeDiskDownload(
      {
        url: targetUrl,
        suggestedName: extracted.suggestedName,
        headers: {'User-Agent': BROWSER_USER_AGENT},
      },
      normalized,
      mode,
      title,
      net,
      prefs,
      onProgress,
      signal
    );
  }

  // 3. Cobalt API Engine (works on both Android APK & Web)
  if (engineId === 'cobalt') {
    diag.step('cobalt', 'Cobalt API üzerinden medya bağlantısı isteniyor');
    onProgress(0.18, 'Cobalt API çözümlüyor…');
    const cobaltTarget = await resolveViaCobaltEngine(
      normalized,
      mode,
      quality,
      prefs.cobaltUrl || '',
      prefs.cobaltApiKey,
      signal
    );
    diag.setEffectiveEngine('cobalt', 'API v10/v7');
    diag.step('cobalt', `Cobalt doğrudan akış döndürdü (${cobaltTarget.suggestedName || 'medya'})`);

    if (isNativeApp()) {
      return finalizeNativeDiskDownload(cobaltTarget, normalized, mode, title, net, prefs, onProgress, signal);
    }

    const r = await fetch(cobaltTarget.url, {signal});
    if (!r.ok) {
      throw new Error(`Cobalt medya akışı indirilemedi (HTTP ${r.status}).`);
    }
    const len = Number(r.headers.get('content-length') || 0) || 0;
    if (len > 0) checkNetworkPolicyAgainstStatus(net, prefs, len, lang);
    const ct = r.headers.get('content-type') || 'video/mp4';
    const fname = guessFilename(cobaltTarget.url, ct, cobaltTarget.suggestedName);
    const rawBlob = await readResponseWithProgress(r, len, fname, onProgress, signal);
    const finalMedia = await convertVideoBlobToMp3IfRequested(rawBlob, fname, ct, mode, onProgress, signal);
    onProgress(0.98, finalMedia.filename);
    return {
      id: createId(),
      name: finalMedia.filename,
      mime: finalMedia.mime,
      size: finalMedia.blob.size,
      createdAt: Date.now(),
      tool: title,
      blob: finalMedia.blob,
      previewUrl: finalMedia.mime.startsWith('image/') ? URL.createObjectURL(finalMedia.blob) : undefined,
    };
  }

  // 4. Morph Built-in Engine (`builtin` — Web & Android APK)
  diag.setEffectiveEngine('builtin', 'Morph Core');
  diag.step('builtin', `Dahili çözücü çalıştırılıyor (${quality})`);

  if (isNativeApp()) {
    if (signal?.aborted) throw new Error('Cancelled');
    const resolvedPlatform = await resolvePlatformMedia(normalized, mode, nativeHttpFetcher, quality);
    if (signal?.aborted) throw new Error('Cancelled');

    if (ytId && !resolvedPlatform) {
      throw new Error(
        'Dahili motor bu YouTube videosunda doğrulama engeline takıldı. Ayarlar veya üst çubuktan NewPipe ya da yt-dlp Yerel Motoru seçip tekrar deneyebilirsin.'
      );
    }

    diag.step(
      'builtin',
      resolvedPlatform
        ? `Platform akışı hazır (${resolvedPlatform.suggestedName || 'stream'}${resolvedPlatform.expectedBytes ? `, ~${formatBytes(resolvedPlatform.expectedBytes)}` : ''})`
        : 'Doğrudan bağlantı akışı başlatılıyor'
    );
    return finalizeNativeDiskDownload(resolvedPlatform, normalized, mode, title, net, prefs, onProgress, signal);
  }

  // Built-in Web mode via Express /api/download-link
  const res = await fetch('/api/download-link', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({url: normalized, format: mode, quality}),
    signal,
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.detail || `Bağlantı indirilemedi (${res.status}).`);
  }

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  if (contentType.includes('text/html')) {
    throw new Error(
      'Bu bağlantı doğrudan dosya yerine HTML sayfası döndürdü. Herkese açık bir medya/dosya bağlantısı yapıştır.'
    );
  }

  const totalHeader =
    Number(res.headers.get('content-length') || res.headers.get('x-morph-expected-bytes') || 0) || 0;
  if (totalHeader > 0) {
    checkNetworkPolicyAgainstStatus(net, prefs, totalHeader, lang);
  }

  const rawFilename = guessFilename(normalized, contentType, res.headers.get('x-morph-filename'));
  const blob = await readResponseWithProgress(res, totalHeader, rawFilename, onProgress, signal);

  const rawExt = rawFilename.includes('.') ? rawFilename.split('.').pop()! : '';
  const rawMime = contentType.split(';')[0].trim() || mimeFromExt(rawExt);
  const initialBlob = blob.type ? blob : new Blob([blob], {type: rawMime});

  const finalMedia = await convertVideoBlobToMp3IfRequested(
    initialBlob,
    rawFilename,
    rawMime,
    mode,
    onProgress,
    signal
  );

  onProgress(0.97, finalMedia.filename);
  return {
    id: createId(),
    name: finalMedia.filename,
    mime: finalMedia.mime,
    size: finalMedia.blob.size,
    createdAt: Date.now(),
    tool: title,
    blob: finalMedia.blob,
    previewUrl: finalMedia.mime.startsWith('image/') ? URL.createObjectURL(finalMedia.blob) : undefined,
  };
}

export async function downloadBuiltInLink(
  rawUrl: string,
  format: string,
  title: string,
  onProgress: (ratio: number, step: string) => void,
  signal?: AbortSignal,
  prefs?: Prefs
): Promise<ExportItem> {
  const effectivePrefs: Prefs = prefs ?? {
    theme: 'dark',
    preset: 'midnight',
    lang: 'tr',
    serverUrl: '',
    serverToken: '',
    downloadEngine: 'builtin',
    downloadWifiOnly: false,
    cellularLimitMb: 150,
    preferredVideoQuality: '720p',
    autoFallbackEngine: true,
    concurrentFragments: 4,
  };

  const lang = effectivePrefs.lang || 'tr';
  const selectedEngine: DownloadEngineId = effectivePrefs.downloadEngine || 'builtin';
  const quality: VideoQualityPref = effectivePrefs.preferredVideoQuality || '720p';
  const autoFallback = effectivePrefs.autoFallbackEngine !== false;
  const mode = (format || 'video').toLowerCase();

  const withProto = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  const normalized = rewriteCloudDirectUrl(withProto);

  const net = await getLiveNetworkStatus();
  const diag = new DiagnosticSession({
    networkType: net.connectionType,
    metered: net.metered,
    wifiOnly: Boolean(effectivePrefs.downloadWifiOnly),
    cellularLimitMb: effectivePrefs.cellularLimitMb ?? 150,
    selectedEngine,
    mode,
    quality,
    autoFallback,
    concurrentFragments: effectivePrefs.concurrentFragments ?? 4,
    rawUrl: normalized,
  });

  // 1. Enforce Wi-Fi-only / offline policy immediately before touching the network
  try {
    checkNetworkPolicyAgainstStatus(net, effectivePrefs, undefined, lang);
  } catch (policyErr) {
    const msg = policyErr instanceof Error ? policyErr.message : String(policyErr);
    diag.step(selectedEngine, `Ağ politikası engelledi: ${msg}`);
    diag.finish('blocked', {error: msg});
    throw policyErr;
  }

  onProgress(0.12, normalized);

  // Fast direct YouTube cover download works everywhere
  const ytId = extractYouTubeId(normalized);
  if (mode === 'thumbnail' && ytId) {
    try {
      const maxRes = `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`;
      const hqRes = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
      const r = await fetch(maxRes, {signal}).then((res) => (res.ok ? res : fetch(hqRes, {signal})));
      if (r.ok) {
        const blob = await r.blob();
        diag.step('builtin', `YouTube kapak görseli indirildi (${formatBytes(blob.size)})`);
        diag.finish('success', {outputBytes: blob.size});
        onProgress(0.96, `youtube-${ytId}-cover.jpg`);
        return {
          id: createId(),
          name: `youtube-${ytId}-cover.jpg`,
          mime: blob.type || 'image/jpeg',
          size: blob.size,
          createdAt: Date.now(),
          tool: title,
          blob,
          previewUrl: URL.createObjectURL(blob),
        };
      }
    } catch {
      // Continue into engine chain if direct fetch fails
    }
  }

  // Build ordered engine chain (primary engine first, then smart fallbacks if autoFallback is enabled)
  const chain: DownloadEngineId[] = [selectedEngine];
  if (autoFallback) {
    if (isNativeApp()) {
      for (const candidate of ['newpipe', 'builtin', 'ytdlp_native'] as DownloadEngineId[]) {
        if (!chain.includes(candidate)) chain.push(candidate);
      }
      if ((effectivePrefs.cobaltUrl || '').trim() && !chain.includes('cobalt')) {
        chain.push('cobalt');
      }
    } else {
      if ((effectivePrefs.cobaltUrl || '').trim() && !chain.includes('cobalt')) {
        chain.push('cobalt');
      }
      if (!chain.includes('builtin')) {
        chain.push('builtin');
      }
    }
  }

  let primaryError: string | null = null;
  let lastError: string | null = null;

  for (let i = 0; i < chain.length; i++) {
    const engine = chain[i];
    if (signal?.aborted) {
      diag.step(engine, 'Kullanıcı işlemi iptal etti');
      diag.finish('failed', {error: 'Cancelled'});
      throw new Error('Cancelled');
    }

    try {
      if (i > 0) {
        diag.step(engine, `Yedek motor devreye alındı (${engine})`);
        onProgress(0.16, `${engine} yedek motoru deneniyor…`);
      }
      const item = await runSingleEngineAttempt(
        engine,
        normalized,
        mode,
        title,
        effectivePrefs,
        net,
        diag,
        onProgress,
        signal
      );
      diag.finish('success', {outputBytes: item.size});
      return item;
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.message === 'Cancelled')) {
        diag.step(engine, 'İndirme iptal edildi');
        diag.finish('failed', {error: 'Cancelled'});
        throw new Error('Cancelled');
      }
      if (err instanceof NetworkPolicyBlockedError) {
        diag.step(engine, `Ağ sınırı nedeniyle durduruldu: ${err.message}`);
        diag.finish('blocked', {error: err.message});
        throw err;
      }

      const msg = err instanceof Error ? err.message : String(err);
      diag.step(engine, `Hata: ${msg}`);
      if (primaryError === null) primaryError = msg;
      lastError = msg;
    }
  }

  const finalError = primaryError || lastError || 'Bağlantı indirilemedi.';
  const rep = diag.finish('failed', {error: finalError});
  throw new Error(`${finalError} (Rapor Kodu: ${rep.id})`);
}
