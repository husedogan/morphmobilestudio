import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {Readable} from 'stream';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

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

  const extractMetaTag = (html: string, names: string[]): string | null => {
    for (const key of names) {
      const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i');
      const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i');
      const m = html.match(re1) || html.match(re2);
      if (m?.[1]) return m[1].replace(/&amp;/g, '&');
    }
    return null;
  };

  const extractYouTubeId = (rawUrl: string): string | null => {
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
  };

  // Built-in direct & meta media link downloader (no external Python server required)
  app.post('/api/download-link', express.json({limit: '32kb'}), async (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    const mode = String(req.body?.format || 'video').toLowerCase();
    if (!rawUrl) {
      res.status(400).json({detail: 'Bağlantı adresi boş olamaz.'});
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || isBlockedHost(parsed.hostname)) {
        res.status(400).json({detail: 'Geçersiz veya desteklenmeyen bağlantı adresi.'});
        return;
      }
    } catch {
      res.status(400).json({detail: 'Geçersiz bağlantı biçimi.'});
      return;
    }

    const ytId = extractYouTubeId(parsed.toString());
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
      const upstream = await fetch(parsed.toString(), {
        redirect: 'follow',
        headers: {'User-Agent': 'Mozilla/5.0 Morph/1.1.6'},
      });
      if (!upstream.ok) {
        res.status(502).json({detail: `Uzak sunucu yanıt vermedi (${upstream.status}).`});
        return;
      }
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/xhtml')) {
        const html = await upstream.text();
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

        if (!mediaUrl) {
          res.status(422).json({
            detail:
              'Bu sayfa doğrudan medya akışı sunmuyor. Doğrudan medya bağlantısı (.mp4, .mp3, .jpg, .pdf) yapıştır veya sosyal video kapak görseli için Kapak Görseli modunu seç.',
          });
          return;
        }
        const resolved = new URL(mediaUrl, upstream.url);
        if ((resolved.protocol !== 'http:' && resolved.protocol !== 'https:') || isBlockedHost(resolved.hostname)) {
          res.status(400).json({detail: 'Çözümlenen medya adresi geçersiz.'});
          return;
        }
        const mediaRes = await fetch(resolved.toString(), {
          redirect: 'follow',
          headers: {'User-Agent': 'Mozilla/5.0 Morph/1.1.6'},
        });
        if (!mediaRes.ok || !mediaRes.body) {
          res.status(502).json({detail: 'Medya akışı indirilemedi.'});
          return;
        }
        const mCt = mediaRes.headers.get('content-type') || 'application/octet-stream';
        const mLen = mediaRes.headers.get('content-length');
        const urlName = path.basename(resolved.pathname) || `morph-download`;
        res.setHeader('Content-Type', mCt);
        if (mLen) res.setHeader('Content-Length', mLen);
        res.setHeader('X-Morph-Filename', encodeURIComponent(urlName));
        Readable.fromWeb(mediaRes.body as unknown as import('stream/web').ReadableStream).pipe(res);
        return;
      }

      const len = upstream.headers.get('content-length');
      const disp = upstream.headers.get('content-disposition');
      const urlName = path.basename(new URL(upstream.url).pathname) || 'morph-download';
      res.setHeader('Content-Type', ct || 'application/octet-stream');
      if (len) res.setHeader('Content-Length', len);
      if (disp) res.setHeader('Content-Disposition', disp);
      res.setHeader('X-Morph-Filename', encodeURIComponent(urlName));
      if (!upstream.body) {
        res.end();
        return;
      }
      Readable.fromWeb(upstream.body as unknown as import('stream/web').ReadableStream).pipe(res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(502).json({detail: error instanceof Error ? error.message : 'Bağlantı indirilemedi.'});
      }
    }
  });

  // Safe proxy for user's optional external Morph Python server (avoids browser CORS / Mixed Content)
  app.all('/api/morph-proxy', async (req, res) => {
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
    req.on('close', () => {
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
