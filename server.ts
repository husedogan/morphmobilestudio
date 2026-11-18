import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {Readable} from 'stream';
import {fileURLToPath} from 'url';
import {
  BROWSER_USER_AGENT,
  HttpJsonFetcher,
  extractYouTubeId,
  resolveMediaFromHtml,
  resolvePlatformMedia,
  rewriteCloudDirectUrl,
} from './src/engine/mediaUrlResolver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  // Disable Node's default 5-minute requestTimeout so 2-hour video streams never get terminated mid-download
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 120_000;

  app.get('/api/ping', (_req, res) => {
    res.json({ok: true});
  });

  const ffmpegCoreDir = path.resolve(__dirname, 'node_modules/@ffmpeg/core/dist/esm');
  if (fs.existsSync(ffmpegCoreDir)) {
    app.use('/ffmpeg', express.static(ffmpegCoreDir, {maxAge: '7d'}));
  }

  const isBlockedHost = (hostname: string): boolean => {
    const h = hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      h === '0.0.0.0' ||
      h.endsWith('.local') ||
      h.endsWith('.internal') ||
      h === 'metadata.google.internal' ||
      h === '169.254.169.254'
    ) {
      return true;
    }
    const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
      if (a === 10 || a === 127 || a === 0) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
    }
    return false;
  };

  const serverHttpFetcher: HttpJsonFetcher = {
    async fetchText(url: string, headers?: Record<string, string>) {
      const target = new URL(url);
      if ((target.protocol !== 'http:' && target.protocol !== 'https:') || isBlockedHost(target.hostname)) {
        throw new Error('Blocked URL');
      }
      const r = await fetch(target.toString(), {
        redirect: 'follow',
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/json,*/*;q=0.8',
          ...(headers || {}),
        },
        signal: AbortSignal.timeout(12000),
      });
      return {
        status: r.status,
        text: await r.text(),
        finalUrl: r.url || url,
        contentType: (r.headers.get('content-type') || '').toLowerCase(),
      };
    },
    async postJson(url: string, body: unknown, headers?: Record<string, string>) {
      const target = new URL(url);
      if ((target.protocol !== 'http:' && target.protocol !== 'https:') || isBlockedHost(target.hostname)) {
        throw new Error('Blocked URL');
      }
      const r = await fetch(target.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(headers || {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      return {status: r.status, text: await r.text()};
    },
  };

  // Built-in social, cloud & direct media link downloader (no external Python server required)
  app.post('/api/download-link', express.json({limit: '32kb'}), async (req, res) => {
    req.setTimeout(0);
    res.setTimeout(0);
    const streamAbort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) streamAbort.abort();
    });

    const rawUrl = String(req.body?.url || '').trim();
    const mode = String(req.body?.format || 'video').toLowerCase();
    const preferredQuality = String(req.body?.quality || '').trim() || undefined;
    if (!rawUrl) {
      res.status(400).json({detail: 'Bağlantı adresi boş olamaz.'});
      return;
    }

    let parsed: URL;
    try {
      const withProto = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      parsed = new URL(rewriteCloudDirectUrl(withProto));
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || isBlockedHost(parsed.hostname)) {
        res.status(400).json({detail: 'Geçersiz veya desteklenmeyen bağlantı adresi.'});
        return;
      }
    } catch {
      res.status(400).json({detail: 'Geçersiz bağlantı biçimi.'});
      return;
    }

    const normalizedUrl = parsed.toString();
    const ytId = extractYouTubeId(normalizedUrl);
    if (mode === 'thumbnail' && ytId) {
      const maxRes = `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`;
      const hqRes = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
      const imgRes = await fetch(maxRes).then((r) => (r.ok ? r : fetch(hqRes)));
      if (imgRes.ok && imgRes.body) {
        res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
        res.setHeader('X-Morph-Filename', `youtube-${ytId}-cover.jpg`);
        Readable.fromWeb(imgRes.body as unknown as import('stream/web').ReadableStream).pipe(res);
        return;
      }
    }

    try {
      const resolvedPlatform = await resolvePlatformMedia(
        normalizedUrl,
        mode,
        serverHttpFetcher,
        preferredQuality
      );
      const initialFetchUrl = resolvedPlatform?.url || normalizedUrl;
      const initialUrlObj = new URL(initialFetchUrl);
      if (
        (initialUrlObj.protocol !== 'http:' && initialUrlObj.protocol !== 'https:') ||
        isBlockedHost(initialUrlObj.hostname)
      ) {
        res.status(400).json({detail: 'Çözümlenen bağlantı adresi geçersiz.'});
        return;
      }

      const upstream = await fetch(initialUrlObj.toString(), {
        redirect: 'follow',
        signal: streamAbort.signal,
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: '*/*',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          ...(resolvedPlatform?.headers || {}),
        },
      });
      if (!upstream.ok) {
        res.status(502).json({detail: `Uzak sunucu yanıt vermedi (HTTP ${upstream.status}).`});
        return;
      }
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/xhtml')) {
        const html = await upstream.text();
        const mediaUrl = resolveMediaFromHtml(html, mode, upstream.url || initialUrlObj.toString());

        if (!mediaUrl) {
          res.status(422).json({
            detail: ytId
              ? 'YouTube bu sunucu ağında doğrulama istedi. Android uygulamasında doğrudan deneyebilir, Kapak Görseli modunu seçebilir veya isteğe bağlı yt-dlp sunucusu bağlayabilirsin.'
              : 'Bu bağlantıdan doğrudan medya akışı çıkarılamadı. Herkese açık bir video/dosya bağlantısı yapıştır veya Kapak Görseli modunu dene.',
          });
          return;
        }
        const resolved = new URL(mediaUrl, upstream.url || initialUrlObj.toString());
        if ((resolved.protocol !== 'http:' && resolved.protocol !== 'https:') || isBlockedHost(resolved.hostname)) {
          res.status(400).json({detail: 'Çözümlenen medya adresi geçersiz.'});
          return;
        }
        const mediaRes = await fetch(resolved.toString(), {
          redirect: 'follow',
          headers: {
            'User-Agent': BROWSER_USER_AGENT,
            Accept: '*/*',
          },
        });
        if (!mediaRes.ok || !mediaRes.body) {
          res.status(502).json({detail: 'Medya akışı indirilemedi.'});
          return;
        }
        const mCt = mediaRes.headers.get('content-type') || 'application/octet-stream';
        if (mCt.toLowerCase().includes('text/html')) {
          res.status(422).json({detail: 'Bu sayfa gömülü oynatıcı kullanıyor; doğrudan medya akışı bulunamadı.'});
          return;
        }
        const mLen = mediaRes.headers.get('content-length');
        const urlName = resolvedPlatform?.suggestedName || path.basename(resolved.pathname) || 'morph-download';
        res.setHeader('Content-Type', mCt);
        if (mLen) res.setHeader('Content-Length', mLen);
        res.setHeader('X-Morph-Filename', encodeURIComponent(urlName));
        Readable.fromWeb(mediaRes.body as unknown as import('stream/web').ReadableStream).pipe(res);
        return;
      }

      const len = upstream.headers.get('content-length');
      const disp = upstream.headers.get('content-disposition');
      const urlName =
        resolvedPlatform?.suggestedName || path.basename(new URL(upstream.url).pathname) || 'morph-download';
      res.setHeader('Content-Type', ct || 'application/octet-stream');
      if (len) res.setHeader('Content-Length', len);
      if (resolvedPlatform?.expectedBytes) {
        res.setHeader('X-Morph-Expected-Bytes', String(resolvedPlatform.expectedBytes));
      }
      if (disp) res.setHeader('Content-Disposition', disp);
      res.setHeader('X-Morph-Filename', encodeURIComponent(urlName));
      if (!upstream.body) {
        res.end();
        return;
      }
      Readable.fromWeb(upstream.body as unknown as import('stream/web').ReadableStream).pipe(res);
    } catch (error) {
      if (streamAbort.signal.aborted) return;
      if (!res.headersSent) {
        res.status(502).json({detail: error instanceof Error ? error.message : 'Bağlantı indirilemedi.'});
      }
    }
  });

  // Safe proxy for user-configured Cobalt API instances (v10 POST / and v7 POST /api/json)
  app.post('/api/cobalt-proxy', express.json({limit: '32kb'}), async (req, res) => {
    const rawCobalt = String(req.body?.cobaltUrl || '').trim();
    const apiKey = String(req.body?.apiKey || '').trim();
    const v10Payload = req.body?.v10Payload;
    const v7Payload = req.body?.v7Payload;
    if (!rawCobalt || !v10Payload) {
      res.status(400).json({detail: 'Eksik Cobalt yapılandırması.'});
      return;
    }

    let cobaltBase: URL;
    try {
      const withProto = /^https?:\/\//i.test(rawCobalt) ? rawCobalt : `https://${rawCobalt}`;
      cobaltBase = new URL(withProto);
      if ((cobaltBase.protocol !== 'http:' && cobaltBase.protocol !== 'https:') || isBlockedHost(cobaltBase.hostname)) {
        res.status(400).json({detail: 'Geçersiz veya engellenen Cobalt sunucu adresi.'});
        return;
      }
    } catch {
      res.status(400).json({detail: 'Geçersiz Cobalt URL biçimi.'});
      return;
    }

    const reqHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': BROWSER_USER_AGENT,
    };
    if (apiKey) {
      reqHeaders.Authorization = apiKey.startsWith('Api-Key ') ? apiKey : `Api-Key ${apiKey}`;
    }

    try {
      const v10Url = new URL('/', cobaltBase.origin).toString();
      const r10 = await fetch(v10Url, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(v10Payload),
        signal: AbortSignal.timeout(20_000),
      });
      const t10 = await r10.text();
      if (r10.ok && t10.trim().startsWith('{')) {
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(t10);
        return;
      }

      if (v7Payload) {
        const v7Url = new URL('/api/json', cobaltBase.origin).toString();
        const r7 = await fetch(v7Url, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify(v7Payload),
          signal: AbortSignal.timeout(20_000),
        });
        const t7 = await r7.text();
        if (r7.ok && t7.trim().startsWith('{')) {
          res.setHeader('Content-Type', 'application/json');
          res.status(200).send(t7);
          return;
        }
        res.status(502).json({
          detail: `Cobalt sunucusu yanıt vermedi (HTTP ${r10.status} / ${r7.status}).`,
        });
        return;
      }

      res.status(502).json({detail: `Cobalt sunucusu hata döndürdü (HTTP ${r10.status}).`});
    } catch (err) {
      res.status(502).json({
        detail: err instanceof Error ? `Cobalt bağlantı hatası: ${err.message}` : 'Cobalt sunucusuna ulaşılamadı.',
      });
    }
  });

  // Safe proxy for user's optional external Morph Python server (avoids browser CORS / Mixed Content)
  app.all('/api/morph-proxy', async (req, res) => {
    req.setTimeout(0);
    res.setTimeout(0);
    const targetRaw = req.header('x-morph-target-url')?.trim();
    const apiPath = (req.query.path as string | undefined) || '/api/health';
    if (!targetRaw) {
      res.status(400).json({detail: 'Missing server URL.'});
      return;
    }

    let baseUrl: URL;
    try {
      const normalized = /^https?:\/\//i.test(targetRaw) ? targetRaw : `http://${targetRaw}`;
      baseUrl = new URL(normalized);
      if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
        res.status(400).json({detail: 'Invalid server protocol.'});
        return;
      }
      const hostLower = baseUrl.hostname.toLowerCase();
      const effectivePort = Number(baseUrl.port || (baseUrl.protocol === 'https:' ? 443 : 80));
      if (
        hostLower === '169.254.169.254' ||
        hostLower === 'metadata.google.internal' ||
        hostLower.endsWith('.internal') ||
        hostLower.startsWith('169.254.') ||
        ((hostLower === 'localhost' ||
          hostLower === '127.0.0.1' ||
          hostLower === '0.0.0.0' ||
          hostLower === '::1') &&
          effectivePort === PORT)
      ) {
        res.status(400).json({detail: 'Blocked proxy target.'});
        return;
      }
    } catch {
      res.status(400).json({detail: 'Invalid server URL.'});
      return;
    }

    const cleanPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    if (!cleanPath.startsWith('/api/')) {
      res.status(400).json({detail: 'Invalid Morph API path.'});
      return;
    }

    const targetUrl = new URL(cleanPath, baseUrl.origin).toString();
    const headers: Record<string, string> = {};
    const token = req.header('x-morph-token');
    if (token) headers['X-Morph-Token'] = token;
    const contentType = req.header('content-type');
    if (contentType) headers['Content-Type'] = contentType;

    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const init: RequestInit & {duplex?: 'half'} = {
        method: req.method,
        headers,
        signal: controller.signal,
      };
      if (hasBody) {
        init.body = Readable.toWeb(req) as unknown as BodyInit;
        init.duplex = 'half';
      }

      const upstream = await fetch(targetUrl, init);
      res.status(upstream.status);
      const upstreamCt = upstream.headers.get('content-type');
      if (upstreamCt) res.setHeader('Content-Type', upstreamCt);
      const upstreamLen = upstream.headers.get('content-length');
      if (upstreamLen) res.setHeader('Content-Length', upstreamLen);
      const disp = upstream.headers.get('content-disposition');
      if (disp) res.setHeader('Content-Disposition', disp);

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as unknown as import('stream/web').ReadableStream);
      nodeStream.pipe(res);
    } catch (error) {
      if (!res.headersSent) {
        const message = error instanceof Error ? error.message : 'Server unreachable.';
        res.status(502).json({detail: message});
      }
    }
  });

  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result) return next();
        const patched = result.code.replace(
          /createConnection:\s*\(\)\s*=>\s*new WebSocket\([^)]+\)/g,
          'createConnection: () => ({ readyState: 1, OPEN: 1, addEventListener() {}, send() {}, close() {} })'
        );
        res.setHeader('Content-Type', 'application/javascript');
        res.send(patched);
      } catch (err) {
        next(err);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build missing');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Morph listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
