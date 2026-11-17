import {CapacitorHttp} from '@capacitor/core';
import {ExportItem, mimeFromExt} from '../data/models';
import {isNativeApp} from './nativeBridge';

function extractYouTubeId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host.endsWith('youtube.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(?:shorts|embed|live)\/([^/?#]+)/);
      if (m?.[1]) return m[1];
    }
  } catch {
    return null;
  }
  return null;
}

function extractMetaTag(html: string, names: string[]): string | null {
  for (const key of names) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i');
    const m = html.match(re1) || html.match(re2);
    if (m?.[1]) return m[1].replace(/&amp;/g, '&');
  }
  return null;
}

function resolveMediaFromHtml(html: string, mode: string, baseUrl: string): string | null {
  let mediaUrl: string | null = null;
  if (mode === 'thumbnail') {
    mediaUrl = extractMetaTag(html, ['og:image:secure_url', 'og:image', 'twitter:image']);
  } else if (mode === 'audio') {
    mediaUrl = extractMetaTag(html, ['og:audio:secure_url', 'og:audio']);
    if (!mediaUrl) {
      const audioMatch = html.match(/<audio[^>]+src=["']([^"']+)["']/i);
      if (audioMatch?.[1]) mediaUrl = audioMatch[1];
    }
  } else {
    mediaUrl = extractMetaTag(html, ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream']);
    if (!mediaUrl) {
      const vidMatch = html.match(/<(?:video|source)[^>]+src=["']([^"']+)["']/i);
      if (vidMatch?.[1]) mediaUrl = vidMatch[1];
    }
    if (!mediaUrl && mode !== 'video') {
      mediaUrl = extractMetaTag(html, ['og:image']);
    }
  }
  if (!mediaUrl) return null;
  try {
    return new URL(mediaUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

function base64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const clean = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const bin = atob(clean);
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

async function fetchNativeBinaryOrHtml(
  targetUrl: string
): Promise<{blob?: Blob; html?: string; contentType: string; finalUrl: string; filenameHeader?: string}> {
  const headRes = await CapacitorHttp.get({
    url: targetUrl,
    headers: {'User-Agent': 'Mozilla/5.0 Morph/1.1.6'},
    responseType: 'blob',
  });
  if (headRes.status < 200 || headRes.status >= 400) {
    throw new Error(`Bağlantı indirilemedi (${headRes.status}).`);
  }
  const ct = headerLookup(headRes.headers, 'content-type').toLowerCase();
  const finalUrl = headRes.url || targetUrl;

  if (ct.includes('text/html') || ct.includes('application/xhtml')) {
    const htmlText =
      typeof headRes.data === 'string'
        ? (() => {
            try {
              return new TextDecoder().decode(base64ToUint8(headRes.data));
            } catch {
              return headRes.data;
            }
          })()
        : '';
    return {html: htmlText, contentType: ct, finalUrl};
  }

  if (typeof headRes.data !== 'string') {
    throw new Error('Medya verisi okunamadı.');
  }
  const bytes = base64ToUint8(headRes.data);
  const cleanMime = ct.split(';')[0].trim() || 'application/octet-stream';
  return {
    blob: new Blob([bytes], {type: cleanMime}),
    contentType: ct || cleanMime,
    finalUrl,
  };
}

function guessFilename(urlStr: string, mime: string, headerName?: string | null): string {
  if (headerName) {
    try {
      const decoded = decodeURIComponent(headerName).trim();
      if (decoded) return decoded;
    } catch {
      return headerName.trim();
    }
  }
  try {
    const u = new URL(urlStr);
    const base = u.pathname.split('/').filter(Boolean).pop();
    if (base && base.includes('.')) return base;
  } catch {
    // Fallback
  }
  const extMap: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
  };
  const ext = extMap[mime.split(';')[0].trim().toLowerCase()] || 'bin';
  return `morph-download.${ext}`;
}

export async function downloadBuiltInLink(
  rawUrl: string,
  format: string,
  title: string,
  onProgress: (ratio: number, step: string) => void,
  signal?: AbortSignal
): Promise<ExportItem> {
  const normalized = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  const mode = (format || 'video').toLowerCase();
  onProgress(0.25, normalized);

  // Fast direct YouTube cover download works everywhere (Web & Android APK)
  const ytId = extractYouTubeId(normalized);
  if (mode === 'thumbnail' && ytId) {
    const maxRes = `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`;
    const hqRes = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    const r = await fetch(maxRes, {signal}).then((res) => (res.ok ? res : fetch(hqRes, {signal})));
    if (r.ok) {
      const blob = await r.blob();
      onProgress(0.95, `youtube-${ytId}-cover.jpg`);
      return {
        id: crypto.randomUUID(),
        name: `youtube-${ytId}-cover.jpg`,
        mime: blob.type || 'image/jpeg',
        size: blob.size,
        createdAt: Date.now(),
        tool: title,
        blob,
        previewUrl: URL.createObjectURL(blob),
      };
    }
  }

  if (isNativeApp()) {
    // Native Android APK: use CapacitorHttp to bypass WebView CORS and resolve OpenGraph/meta media tags
    if (signal?.aborted) throw new Error('Cancelled');
    const firstPass = await fetchNativeBinaryOrHtml(normalized);
    if (signal?.aborted) throw new Error('Cancelled');

    let finalBlob = firstPass.blob;
    let finalCt = firstPass.contentType;
    let sourceUrl = firstPass.finalUrl;

    if (!finalBlob && firstPass.html !== undefined) {
      const resolvedUrl = resolveMediaFromHtml(firstPass.html, mode, firstPass.finalUrl);
      if (!resolvedUrl) {
        throw new Error(
          'Bu sayfa doğrudan medya akışı sunmuyor. Doğrudan medya bağlantısı (.mp4, .mp3, .jpg, .pdf) yapıştır veya sosyal video kapak görseli için Kapak Görseli modunu seç.'
        );
      }
      onProgress(0.6, resolvedUrl);
      const secondPass = await fetchNativeBinaryOrHtml(resolvedUrl);
      if (!secondPass.blob) {
        throw new Error('Çözümlenen medya akışı indirilemedi.');
      }
      finalBlob = secondPass.blob;
      finalCt = secondPass.contentType;
      sourceUrl = secondPass.finalUrl;
    }

    if (!finalBlob) {
      throw new Error('Bağlantı indirilemedi.');
    }

    const filename = guessFilename(sourceUrl, finalCt);
    const ext = filename.includes('.') ? filename.split('.').pop()! : '';
    const mime = finalCt.split(';')[0].trim() || mimeFromExt(ext);
    const typedBlob = finalBlob.type ? finalBlob : new Blob([finalBlob], {type: mime});

    onProgress(0.95, filename);
    return {
      id: crypto.randomUUID(),
      name: filename,
      mime,
      size: typedBlob.size,
      createdAt: Date.now(),
      tool: title,
      blob: typedBlob,
      previewUrl: mime.startsWith('image/') ? URL.createObjectURL(typedBlob) : undefined,
    };
  }

  // Web mode uses Morph's built-in Express /api/download-link endpoint (no Python server needed, avoids CORS)
  const res = await fetch('/api/download-link', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({url: normalized, format: mode}),
    signal,
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.detail || `Bağlantı indirilemedi (${res.status}).`);
  }

  onProgress(0.7, normalized);
  const blob = await res.blob();
  const contentType = res.headers.get('content-type') || blob.type || 'application/octet-stream';
  if (contentType.includes('text/html')) {
    throw new Error(
      'Bu bağlantı doğrudan dosya yerine HTML sayfası döndürdü. Doğrudan medya bağlantısı (.mp4, .mp3, .jpg, .pdf) yapıştır.'
    );
  }
  const filename = guessFilename(normalized, contentType, res.headers.get('x-morph-filename'));
  const ext = filename.includes('.') ? filename.split('.').pop()! : '';
  const mime = contentType.split(';')[0].trim() || mimeFromExt(ext);
  const typedBlob = blob.type ? blob : new Blob([blob], {type: mime});

  onProgress(0.95, filename);
  return {
    id: crypto.randomUUID(),
    name: filename,
    mime,
    size: typedBlob.size,
    createdAt: Date.now(),
    tool: title,
    blob: typedBlob,
    previewUrl: mime.startsWith('image/') ? URL.createObjectURL(typedBlob) : undefined,
  };
}
