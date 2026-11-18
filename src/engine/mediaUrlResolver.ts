export interface ResolvedMediaTarget {
  url: string;
  suggestedName?: string;
  headers?: Record<string, string>;
  expectedBytes?: number;
  durationSec?: number;
}

export interface HttpJsonFetcher {
  fetchText(url: string, headers?: Record<string, string>): Promise<{status: number; text: string; finalUrl: string; contentType: string}>;
  postJson?(url: string, body: unknown, headers?: Record<string, string>): Promise<{status: number; text: string}>;
}

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

export function sanitizeSuggestedBase(raw: string, fallback = 'morph-media'): string {
  const cleaned = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim()
    .slice(0, 64)
    .replace(/\s+/g, '-');
  return cleaned || fallback;
}

export function rewriteCloudDirectUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');

    // Google Drive: /file/d/<ID>/view or /open?id=<ID> -> direct download
    if (host === 'drive.google.com') {
      const fileMatch = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = fileMatch?.[1] || u.searchParams.get('id');
      if (id) {
        return `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(id)}`;
      }
    }

    // Dropbox share link -> direct binary stream
    if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
      u.searchParams.set('dl', '1');
      return u.toString();
    }

    // GitHub file page -> raw.githubusercontent.com
    if (host === 'github.com') {
      const blobMatch = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
      if (blobMatch) {
        return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
      }
    }
  } catch {
    // Keep original URL
  }
  return rawUrl;
}

export function extractYouTubeId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^(?:www|m|music)\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      if (m?.[1]) return m[1];
    }
  } catch {
    return null;
  }
  return null;
}

export function isTikTokUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'tiktok.com' || host.endsWith('.tiktok.com');
  } catch {
    return false;
  }
}

export function extractTwitterStatusPath(rawUrl: string): {user: string; id: string} | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^(?:www|mobile)\./, '');
    if (host !== 'x.com' && host !== 'twitter.com' && host !== 'fxtwitter.com' && host !== 'vxtwitter.com') {
      return null;
    }
    const m = u.pathname.match(/^\/([^/]+)\/status(?:es)?\/(\d+)/i);
    if (m?.[1] && m?.[2]) {
      return {user: m[1] === 'i' ? 'Twitter' : m[1], id: m[2]};
    }
  } catch {
    return null;
  }
  return null;
}

export function isRedditUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
    return (
      host === 'reddit.com' ||
      host.endsWith('.reddit.com') ||
      host === 'redd.it' ||
      host === 'v.redd.it'
    );
  } catch {
    return false;
  }
}

export function extractInstagramShortcode(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'instagram.com' && host !== 'instagr.am' && !host.endsWith('.instagram.com')) {
      return null;
    }
    const m = u.pathname.match(/\/(?:reel|reels|p|tv)\/([^/?#]+)/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

function isLikelyHtmlEmbed(candidateUrl: string): boolean {
  try {
    const u = new URL(candidateUrl);
    const p = u.pathname.toLowerCase();
    const h = u.hostname.toLowerCase();
    if (p.includes('/embed/') || p.endsWith('/embed')) return true;
    if (h.includes('youtube.com') && (p === '/watch' || p.startsWith('/shorts/'))) return true;
    if (h === 'player.vimeo.com' && p.startsWith('/video/')) return true;
    if (/\.(?:html|htm|php|aspx)$/i.test(p)) return true;
  } catch {
    return true;
  }
  return false;
}

export function extractMetaTag(html: string, names: string[]): string | null {
  for (const key of names) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      'i'
    );
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      'i'
    );
    const m = html.match(re1) || html.match(re2);
    if (m?.[1]) {
      return m[1]
        .replace(/&amp;/g, '&')
        .replace(/&#x2F;/gi, '/')
        .replace(/&#38;/g, '&');
    }
  }
  return null;
}

function extractJsonLdMedia(html: string, mode: string): string | null {
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length > 0) {
        const cur = queue.shift();
        if (!cur || typeof cur !== 'object') continue;
        const obj = cur as Record<string, unknown>;
        if (mode === 'thumbnail') {
          const thumb = obj.thumbnailUrl;
          if (typeof thumb === 'string' && /^https?:\/\//i.test(thumb)) return thumb;
          if (Array.isArray(thumb) && typeof thumb[0] === 'string') return thumb[0];
        } else {
          const contentUrl = obj.contentUrl;
          if (typeof contentUrl === 'string' && /^https?:\/\//i.test(contentUrl) && !isLikelyHtmlEmbed(contentUrl)) {
            return contentUrl;
          }
        }
        for (const val of Object.values(obj)) {
          if (val && typeof val === 'object') queue.push(val);
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }
  return null;
}

export function resolveMediaFromHtml(html: string, mode: string, baseUrl: string): string | null {
  const candidates: Array<string | null> = [];

  if (mode === 'thumbnail') {
    candidates.push(
      extractMetaTag(html, ['og:image:secure_url', 'og:image', 'twitter:image:src', 'twitter:image']),
      extractJsonLdMedia(html, 'thumbnail')
    );
  } else if (mode === 'audio') {
    candidates.push(extractMetaTag(html, ['og:audio:secure_url', 'og:audio']));
    const audioMatch = html.match(/<(?:audio|source)[^>]+src=["']([^"']+)["']/i);
    if (audioMatch?.[1]) candidates.push(audioMatch[1].replace(/&amp;/g, '&'));
    candidates.push(
      extractJsonLdMedia(html, 'video'),
      extractMetaTag(html, ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream'])
    );
  } else {
    candidates.push(
      extractJsonLdMedia(html, 'video'),
      extractMetaTag(html, ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream'])
    );
    const vidMatch = html.match(/<(?:video|source)[^>]+src=["']([^"']+)["']/i);
    if (vidMatch?.[1]) candidates.push(vidMatch[1].replace(/&amp;/g, '&'));
  }

  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const resolved = new URL(raw, baseUrl).toString();
      if (mode !== 'thumbnail' && isLikelyHtmlEmbed(resolved)) continue;
      return resolved;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

function unescapeJsonString(raw: string): string {
  return raw
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}

export async function resolvePlatformMedia(
  normalizedUrl: string,
  mode: string,
  http: HttpJsonFetcher,
  preferredQuality?: string
): Promise<ResolvedMediaTarget | null> {
  // 1. TikTok (HD watermark-free MP4, MP3 music, or cover via TikWM API)
  if (isTikTokUrl(normalizedUrl)) {
    try {
      const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(normalizedUrl)}&hd=1`;
      const res = await http.fetchText(apiUrl, {Accept: 'application/json'});
      if (res.status >= 200 && res.status < 300) {
        const json = JSON.parse(res.text);
        const data = json?.data;
        if (json?.code === 0 && data) {
          const base = sanitizeSuggestedBase(data.title || `tiktok-${data.id || Date.now()}`, 'tiktok');
          if (mode === 'thumbnail') {
            const cover = data.origin_cover || data.ai_dynamic_cover || data.cover;
            if (cover) return {url: new URL(cover, 'https://www.tikwm.com').toString(), suggestedName: `${base}-cover.jpg`};
          } else if (mode === 'audio') {
            const music = data.music || data.play;
            if (music) {
              const isMp3 = String(music).includes('.mp3') || Boolean(data.music);
              return {
                url: new URL(music, 'https://www.tikwm.com').toString(),
                suggestedName: `${base}.${isMp3 ? 'mp3' : 'mp4'}`,
              };
            }
          } else {
            const video = data.hdplay || data.play || data.wmplay;
            if (video) {
              return {url: new URL(video, 'https://www.tikwm.com').toString(), suggestedName: `${base}.mp4`};
            }
            if (Array.isArray(data.images) && data.images[0]) {
              return {url: data.images[0], suggestedName: `${base}.jpg`};
            }
          }
        }
      }
    } catch {
      // Fall through to generic HTML resolver
    }
  }

  // 2. X / Twitter (via FxTwitter public JSON API)
  const tw = extractTwitterStatusPath(normalizedUrl);
  if (tw) {
    try {
      const res = await http.fetchText(`https://api.fxtwitter.com/${tw.user}/status/${tw.id}`, {
        Accept: 'application/json',
        'User-Agent': 'Morph/1.1.9',
      });
      if (res.status >= 200 && res.status < 300) {
        const json = JSON.parse(res.text);
        const tweet = json?.tweet;
        const media = tweet?.media;
        if (media) {
          const base = sanitizeSuggestedBase(`x-${tw.user}-${tw.id}`, `x-${tw.id}`);
          if (mode === 'thumbnail') {
            const thumb =
              media.videos?.[0]?.thumbnail_url ||
              media.photos?.[0]?.url ||
              media.all?.[0]?.thumbnail_url ||
              media.all?.[0]?.url;
            if (thumb) return {url: thumb, suggestedName: `${base}-cover.jpg`};
          } else {
            const vid = media.videos?.[0];
            if (vid) {
              const mp4Variants = Array.isArray(vid.variants)
                ? vid.variants
                    .filter((v: {content_type?: string; url?: string}) =>
                      String(v.content_type || '').includes('mp4') && Boolean(v.url)
                    )
                    .sort(
                      (a: {bitrate?: number}, b: {bitrate?: number}) =>
                        (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0)
                    )
                : [];
              const bestUrl = mp4Variants[0]?.url || vid.url;
              if (bestUrl) return {url: bestUrl, suggestedName: `${base}.mp4`};
            }
            if (media.photos?.[0]?.url) {
              return {url: media.photos[0].url, suggestedName: `${base}.jpg`};
            }
          }
        }
      }
    } catch {
      // Fall through
    }
  }

  // 3. Reddit (v.redd.it & post .json fallback_url)
  if (isRedditUrl(normalizedUrl)) {
    try {
      const parsed = new URL(normalizedUrl);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (host === 'v.redd.it') {
        const vidId = parsed.pathname.split('/').filter(Boolean)[0];
        if (vidId && mode !== 'thumbnail') {
          return {url: `https://v.redd.it/${vidId}/DASH_720.mp4`, suggestedName: `reddit-${vidId}.mp4`};
        }
      }
      // Follow shortlinks like redd.it or reddit.com/r/.../s/... first if needed
      let postUrl = normalizedUrl;
      if (host === 'redd.it' || parsed.pathname.includes('/s/')) {
        const redir = await http.fetchText(normalizedUrl, {'User-Agent': BROWSER_USER_AGENT});
        if (redir.finalUrl) postUrl = redir.finalUrl;
      }
      const cleanPost = new URL(postUrl);
      cleanPost.search = '';
      cleanPost.hash = '';
      const jsonUrl = `${cleanPost.toString().replace(/\/+$/, '')}.json?raw_json=1`;
      const res = await http.fetchText(jsonUrl, {
        Accept: 'application/json',
        'User-Agent': BROWSER_USER_AGENT,
      });
      if (res.status >= 200 && res.status < 300) {
        const data = JSON.parse(res.text);
        const post = Array.isArray(data) ? data[0]?.data?.children?.[0]?.data : data?.data?.children?.[0]?.data;
        if (post) {
          const base = sanitizeSuggestedBase(post.title || `reddit-${post.id || Date.now()}`, 'reddit');
          if (mode === 'thumbnail') {
            const previewImg = post.preview?.images?.[0]?.source?.url || post.thumbnail;
            if (previewImg && /^https?:\/\//i.test(previewImg)) {
              return {url: previewImg.replace(/&amp;/g, '&'), suggestedName: `${base}-cover.jpg`};
            }
          } else {
            const fallbackVideo =
              post.secure_media?.reddit_video?.fallback_url ||
              post.media?.reddit_video?.fallback_url ||
              post.preview?.reddit_video_preview?.fallback_url ||
              post.crosspost_parent_list?.[0]?.secure_media?.reddit_video?.fallback_url;
            if (fallbackVideo) {
              return {url: String(fallbackVideo).split('?')[0], suggestedName: `${base}.mp4`};
            }
            const dest = post.url_overridden_by_dest || post.url;
            if (typeof dest === 'string' && /\.(?:jpg|jpeg|png|webp|gif|mp4)(?:\?|$)/i.test(dest)) {
              const ext = dest.split('?')[0].split('.').pop() || 'jpg';
              return {url: dest, suggestedName: `${base}.${ext}`};
            }
          }
        }
      }
    } catch {
      // Fall through
    }
  }

  // 4. Instagram Reels / Posts (via public embed page parsing)
  const igCode = extractInstagramShortcode(normalizedUrl);
  if (igCode) {
    try {
      const embedUrl = `https://www.instagram.com/p/${igCode}/embed/captioned/`;
      const res = await http.fetchText(embedUrl, {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      });
      if (res.status >= 200 && res.status < 300 && res.text) {
        const base = `instagram-${igCode}`;
        if (mode !== 'thumbnail') {
          const videoMatch =
            res.text.match(/"video_url"\s*:\s*"([^"]+)"/) ||
            res.text.match(/\\"video_url\\"\s*:\s*\\"([^\\"]+)\\"/);
          if (videoMatch?.[1]) {
            return {url: unescapeJsonString(videoMatch[1]), suggestedName: `${base}.mp4`};
          }
        }
        const imgMatch =
          res.text.match(/class=["']EmbeddedMediaImage["'][^>]+src=["']([^"']+)["']/i) ||
          res.text.match(/"display_url"\s*:\s*"([^"]+)"/);
        if (imgMatch?.[1] && (mode === 'thumbnail' || !res.text.includes('video_url'))) {
          return {url: unescapeJsonString(imgMatch[1]), suggestedName: `${base}.jpg`};
        }
      }
    } catch {
      // Fall through
    }
  }

  // 5. YouTube (Cover art everywhere + Innertube direct stream on mobile/residential IPs)
  const ytId = extractYouTubeId(normalizedUrl);
  if (ytId) {
    if (mode === 'thumbnail') {
      return {
        url: `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`,
        suggestedName: `youtube-${ytId}-cover.jpg`,
      };
    }
    if (http.postJson) {
      let visitorData = '';
      try {
        const embedPage = await http.fetchText(`https://www.youtube.com/embed/${ytId}`, {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html',
        });
        if (embedPage.status >= 200 && embedPage.status < 300 && embedPage.text) {
          const vdMatch =
            embedPage.text.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/) ||
            embedPage.text.match(/"visitorData"\s*:\s*"([^"]+)"/);
          if (vdMatch?.[1]) visitorData = vdMatch[1];
        }
      } catch {
        // Proceed without visitorData if embed fetch fails
      }

      const clients: Array<{ua: string; ctx: Record<string, unknown>}> = [
        {
          ua: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
          ctx: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.62.27',
            deviceMake: 'Oculus',
            deviceModel: 'Quest 3',
            androidSdkVersion: 32,
            osName: 'Android',
            osVersion: '12L',
            hl: 'en',
            gl: 'US',
            ...(visitorData ? {visitorData} : {}),
          },
        },
        {
          ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
          ctx: {
            clientName: 'IOS',
            clientVersion: '20.10.4',
            deviceMake: 'Apple',
            deviceModel: 'iPhone16,2',
            osName: 'iPhone',
            osVersion: '18.3.2.22D82',
            hl: 'en',
            gl: 'US',
            ...(visitorData ? {visitorData} : {}),
          },
        },
        {
          ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
          ctx: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38',
            androidSdkVersion: 34,
            osName: 'Android',
            osVersion: '14',
            hl: 'en',
            gl: 'US',
            ...(visitorData ? {visitorData} : {}),
          },
        },
      ];

      for (const c of clients) {
        try {
          const reqHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': c.ua,
            Origin: 'https://www.youtube.com',
          };
          if (visitorData) reqHeaders['X-Goog-Visitor-Id'] = visitorData;

          const playerRes = await http.postJson(
            'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
            {
              videoId: ytId,
              contentCheckOk: true,
              racyCheckOk: true,
              context: {client: c.ctx},
            },
            reqHeaders
          );
          if (playerRes.status >= 200 && playerRes.status < 300) {
            const pJson = JSON.parse(playerRes.text);
            const title = sanitizeSuggestedBase(
              pJson?.videoDetails?.title || `youtube-${ytId}`,
              `youtube-${ytId}`
            );
            const durationSec = Number(pJson?.videoDetails?.lengthSeconds) || undefined;

            interface YtFormat {
              url?: string;
              mimeType?: string;
              height?: number;
              bitrate?: number;
              contentLength?: string | number;
            }

            const formats: YtFormat[] = pJson?.streamingData?.formats || [];
            const adaptive: YtFormat[] = pJson?.streamingData?.adaptiveFormats || [];

            if (mode === 'audio') {
              const audioCandidates = adaptive
                .filter((f) => Boolean(f.url) && String(f.mimeType || '').startsWith('audio/'))
                .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
              const bestAudio =
                audioCandidates.find((f) => String(f.mimeType || '').includes('mp4')) || audioCandidates[0];
              if (bestAudio?.url) {
                const ext = String(bestAudio.mimeType || '').includes('mp4') ? 'm4a' : 'webm';
                const expectedBytes = Number(bestAudio.contentLength) || undefined;
                return {
                  url: bestAudio.url,
                  suggestedName: `${title}.${ext}`,
                  headers: {'User-Agent': c.ua},
                  expectedBytes,
                  durationSec,
                };
              }
            }

            const muxed = formats
              .filter((f) => Boolean(f.url) && String(f.mimeType || '').includes('mp4'))
              .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));
            if (muxed.length > 0) {
              const targetH =
                preferredQuality && preferredQuality !== 'best'
                  ? parseInt(preferredQuality.replace(/\D+/g, ''), 10) || 0
                  : 0;
              const MAX_COMFORT_BYTES = 1_200_000_000;
              let pool = targetH > 0 ? muxed.filter((f) => (Number(f.height) || 0) <= targetH) : muxed;
              if (pool.length === 0) pool = [muxed[muxed.length - 1]];
              const chosen =
                durationSec && durationSec >= 2700
                  ? pool.find((f) => {
                      const len = Number(f.contentLength) || 0;
                      return len === 0 || len <= MAX_COMFORT_BYTES;
                    }) || pool[pool.length - 1]
                  : pool[0];
              if (chosen?.url) {
                const expectedBytes = Number(chosen.contentLength) || undefined;
                return {
                  url: chosen.url,
                  suggestedName: `${title}.mp4`,
                  headers: {'User-Agent': c.ua},
                  expectedBytes,
                  durationSec,
                };
              }
            }
          }
        } catch {
          // Try next client profile
        }
      }
    }
  }

  return null;
}
