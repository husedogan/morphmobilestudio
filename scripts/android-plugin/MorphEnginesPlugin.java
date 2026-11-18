package com.morphstudio.app;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaMuxer;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Environment;
import android.webkit.MimeTypeMap;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.annotation.Nonnull;
import kotlin.Unit;
import org.schabi.newpipe.extractor.Image;
import org.schabi.newpipe.extractor.MediaFormat;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException;
import org.schabi.newpipe.extractor.localization.Localization;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.VideoStream;

@CapacitorPlugin(name = "MorphEngines")
public class MorphEnginesPlugin extends Plugin {

    private static final String USER_AGENT =
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
    private static final String PREFS_NAME = "morph_engines_native_prefs";
    private static final String KEY_YTDLP_READY = "ytdlp_ready";
    // 9 MB Range window avoids YouTube CDN bandwidth throttling on DASH streams
    private static final long RANGE_CHUNK_BYTES = 9L * 1024L * 1024L;

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final ConcurrentHashMap<String, AtomicBoolean> newPipeJobs = new ConcurrentHashMap<>();
    private volatile boolean newPipeInitialized = false;
    private volatile boolean ytDlpInitialized = false;

    private interface ByteProgressListener {
        void onProgress(long downloadedBytes, long totalBytes);
    }

    private static final class MorphHttpDownloader extends Downloader {
        @Override
        public Response execute(@Nonnull final Request request) throws IOException, ReCaptchaException {
            final String method = request.httpMethod();
            final String urlStr = request.url();
            final Map<String, List<String>> headers = request.headers();
            final byte[] body = request.dataToSend();

            HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setConnectTimeout(20_000);
            conn.setReadTimeout(30_000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestMethod(method);
            conn.setRequestProperty("User-Agent", USER_AGENT);

            if (headers != null) {
                for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
                    String key = entry.getKey();
                    List<String> vals = entry.getValue();
                    if (key == null || vals == null || vals.isEmpty()) continue;
                    conn.setRequestProperty(key, vals.get(0));
                    for (int i = 1; i < vals.size(); i++) {
                        conn.addRequestProperty(key, vals.get(i));
                    }
                }
            }

            if (body != null && body.length > 0) {
                conn.setDoOutput(true);
                conn.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body);
                }
            }

            final int code = conn.getResponseCode();
            final String message = conn.getResponseMessage() != null ? conn.getResponseMessage() : "";
            if (code == 429) {
                conn.disconnect();
                throw new ReCaptchaException("HTTP 429 Too Many Requests", urlStr);
            }

            final Map<String, List<String>> respHeaders = new LinkedHashMap<>();
            for (Map.Entry<String, List<String>> h : conn.getHeaderFields().entrySet()) {
                if (h.getKey() != null && h.getValue() != null) {
                    respHeaders.put(h.getKey(), h.getValue());
                }
            }

            String respBody = "";
            if (!"HEAD".equalsIgnoreCase(method)) {
                InputStream stream = null;
                try {
                    stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
                    if (stream != null) {
                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        byte[] buf = new byte[16 * 1024];
                        int r;
                        while ((r = stream.read(buf)) != -1) {
                            baos.write(buf, 0, r);
                        }
                        respBody = baos.toString(StandardCharsets.UTF_8.name());
                    }
                } finally {
                    if (stream != null) {
                        try {
                            stream.close();
                        } catch (IOException ignored) {}
                    }
                }
            }

            final String latestUrl = conn.getURL() != null ? conn.getURL().toString() : urlStr;
            return new Response(code, message, respHeaders, respBody, latestUrl);
        }
    }

    private synchronized void ensureNewPipeReady() {
        if (!newPipeInitialized) {
            NewPipe.init(new MorphHttpDownloader(), new Localization("tr", "TR"));
            newPipeInitialized = true;
        }
    }

    private synchronized void ensureYtDlpReady(Context appCtx) throws Exception {
        if (!ytDlpInitialized) {
            YoutubeDL.getInstance().init(appCtx);
            ytDlpInitialized = true;
            appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_YTDLP_READY, true)
                .apply();
        }
    }

    @PluginMethod
    public void getNetworkStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                ret.put("connected", true);
                ret.put("connectionType", "unknown");
                ret.put("metered", false);
                call.resolve(ret);
                return;
            }
            Network active = cm.getActiveNetwork();
            NetworkCapabilities caps = active != null ? cm.getNetworkCapabilities(active) : null;
            if (caps == null || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                ret.put("connected", false);
                ret.put("connectionType", "none");
                ret.put("metered", false);
                call.resolve(ret);
                return;
            }
            String type = "unknown";
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                type = "wifi";
            } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
                type = "ethernet";
            } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                type = "cellular";
            }
            boolean metered = cm.isActiveNetworkMetered() || "cellular".equals(type);
            ret.put("connected", true);
            ret.put("connectionType", type);
            ret.put("metered", metered);
            call.resolve(ret);
        } catch (Exception e) {
            ret.put("connected", true);
            ret.put("connectionType", "unknown");
            ret.put("metered", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void getEnginesStatus(PluginCall call) {
        executor.execute(() -> {
            Context appCtx = getContext().getApplicationContext();
            boolean wasReady = appCtx
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(KEY_YTDLP_READY, false);
            File ytdlpDir = new File(new File(appCtx.getNoBackupFilesDir(), YoutubeDL.baseName), YoutubeDL.ytdlpDirName);
            boolean binaryExists = new File(ytdlpDir, YoutubeDL.ytdlpBin).exists();
            String ver = null;
            try {
                ver = YoutubeDL.getInstance().version(appCtx);
            } catch (Exception ignored) {}

            JSObject ret = new JSObject();
            ret.put("ytdlpInstalled", wasReady || binaryExists);
            ret.put("ytdlpVersion", ver != null && !ver.isEmpty() ? ver : (binaryExists ? "bundled-0.18.1" : "0.18.1"));
            ret.put("newpipeReady", true);
            ret.put("newpipeVersion", "v0.27.1");
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void initNewPipe(PluginCall call) {
        executor.execute(() -> {
            try {
                ensureNewPipeReady();
                JSObject ret = new JSObject();
                ret.put("ready", true);
                ret.put("version", "v0.27.1");
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("NewPipe başlatılamadı: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void installOrUpdateYtDlp(PluginCall call) {
        final String channel = call.getString("channel", "stable");
        executor.execute(() -> {
            Context appCtx = getContext().getApplicationContext();
            try {
                ensureYtDlpReady(appCtx);
                YoutubeDL.UpdateChannel ch = "nightly".equalsIgnoreCase(channel)
                    ? YoutubeDL.UpdateChannel._NIGHTLY
                    : YoutubeDL.UpdateChannel._STABLE;
                String statusStr = "READY";
                try {
                    YoutubeDL.UpdateStatus st = YoutubeDL.getInstance().updateYoutubeDL(appCtx, ch);
                    if (st != null) statusStr = st.name();
                } catch (Exception updateErr) {
                    statusStr = "BUNDLED_READY (" + updateErr.getMessage() + ")";
                }
                String ver = YoutubeDL.getInstance().version(appCtx);
                JSObject ret = new JSObject();
                ret.put("installed", true);
                ret.put("status", statusStr);
                ret.put("version", ver != null && !ver.isEmpty() ? ver : "bundled-0.18.1");
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("yt-dlp kurulamadı: " + e.getMessage(), e);
            }
        });
    }

    private static AudioStream pickBestAudioStream(List<AudioStream> audios) {
        if (audios == null || audios.isEmpty()) return null;
        AudioStream bestAudio = null;
        for (AudioStream a : audios) {
            if (!a.isUrl() || a.getContent() == null || a.getContent().isEmpty()) continue;
            if (bestAudio == null) {
                bestAudio = a;
                continue;
            }
            boolean aM4a = a.getFormat() == MediaFormat.M4A;
            boolean bM4a = bestAudio.getFormat() == MediaFormat.M4A;
            if (aM4a && !bM4a) {
                bestAudio = a;
            } else if (aM4a == bM4a && a.getAverageBitrate() > bestAudio.getAverageBitrate()) {
                bestAudio = a;
            }
        }
        return bestAudio;
    }

    private static VideoStream pickMuxedVideoStream(List<VideoStream> videos, int targetHeight) {
        if (videos == null || videos.isEmpty()) return null;
        List<VideoStream> muxed = new ArrayList<>();
        for (VideoStream v : videos) {
            if (!v.isVideoOnly() && v.isUrl() && v.getContent() != null && !v.getContent().isEmpty()) {
                muxed.add(v);
            }
        }
        if (muxed.isEmpty()) return null;
        Collections.sort(muxed, Comparator.comparingInt(VideoStream::getHeight).reversed());
        for (VideoStream v : muxed) {
            if (targetHeight <= 0 || v.getHeight() <= targetHeight) {
                return v;
            }
        }
        return muxed.get(muxed.size() - 1);
    }

    private static VideoStream pickAdaptiveMp4VideoStream(List<VideoStream> videoOnlyList, int targetHeight) {
        if (videoOnlyList == null || videoOnlyList.isEmpty()) return null;
        List<VideoStream> mp4Candidates = new ArrayList<>();
        for (VideoStream v : videoOnlyList) {
            if (!v.isUrl() || v.getContent() == null || v.getContent().isEmpty()) continue;
            if (v.getFormat() != MediaFormat.MPEG_4) continue;
            String codec = v.getCodec() != null ? v.getCodec().toLowerCase(Locale.ROOT) : "";
            // Exclude AV1 so Android hardware MediaMuxer accepts H.264/HEVC tracks universally
            if (codec.startsWith("av01")) continue;
            mp4Candidates.add(v);
        }
        if (mp4Candidates.isEmpty()) return null;

        Collections.sort(mp4Candidates, (a, b) -> {
            int cmp = Integer.compare(b.getHeight(), a.getHeight());
            if (cmp != 0) return cmp;
            boolean aAvc = a.getCodec() != null && a.getCodec().startsWith("avc1");
            boolean bAvc = b.getCodec() != null && b.getCodec().startsWith("avc1");
            return Boolean.compare(bAvc, aAvc);
        });

        for (VideoStream v : mp4Candidates) {
            if (targetHeight <= 0 || v.getHeight() <= targetHeight) {
                return v;
            }
        }
        return mp4Candidates.get(mp4Candidates.size() - 1);
    }

    @PluginMethod
    public void extractWithNewPipe(PluginCall call) {
        final String url = call.getString("url", "");
        final String mode = call.getString("mode", "video");
        final String quality = call.getString("quality", "720p");
        if (url == null || url.trim().isEmpty()) {
            call.reject("Bağlantı adresi boş.");
            return;
        }

        executor.execute(() -> {
            try {
                ensureNewPipeReady();
                StreamInfo info = StreamInfo.getInfo(url.trim());
                String rawTitle = info.getName() != null ? info.getName().trim() : "morph-media";
                String safeBase = sanitizeBaseName(rawTitle);
                long durationSec = Math.max(0L, info.getDuration());

                String thumbUrl = null;
                List<Image> thumbs = info.getThumbnails();
                if (thumbs != null && !thumbs.isEmpty()) {
                    Image bestImg = thumbs.get(thumbs.size() - 1);
                    thumbUrl = bestImg.getUrl();
                }

                if ("thumbnail".equalsIgnoreCase(mode)) {
                    if (thumbUrl == null || thumbUrl.isEmpty()) {
                        call.reject("Bu içerikte kapak görseli bulunamadı.");
                        return;
                    }
                    JSObject ret = new JSObject();
                    ret.put("url", thumbUrl);
                    ret.put("title", rawTitle);
                    ret.put("suggestedName", safeBase + "-cover.jpg");
                    ret.put("mimeType", "image/jpeg");
                    ret.put("durationSec", durationSec);
                    ret.put("adaptiveMuxRequired", false);
                    ret.put("thumbnailUrl", thumbUrl);
                    call.resolve(ret);
                    return;
                }

                AudioStream bestAudio = pickBestAudioStream(info.getAudioStreams());

                if ("audio".equalsIgnoreCase(mode)) {
                    if (bestAudio != null) {
                        MediaFormat fmt = bestAudio.getFormat();
                        String ext = fmt != null && fmt.getSuffix() != null ? fmt.getSuffix() : "m4a";
                        String mime = fmt != null && fmt.getMimeType() != null ? fmt.getMimeType() : "audio/mp4";
                        JSObject ret = new JSObject();
                        ret.put("url", bestAudio.getContent());
                        ret.put("title", rawTitle);
                        ret.put("suggestedName", safeBase + "." + ext);
                        ret.put("mimeType", mime);
                        ret.put("durationSec", durationSec);
                        ret.put("adaptiveMuxRequired", false);
                        if (thumbUrl != null) ret.put("thumbnailUrl", thumbUrl);
                        call.resolve(ret);
                        return;
                    }
                    call.reject("Bu bağlantıda ses akışı bulunamadı.");
                    return;
                }

                int targetHeight = parseQualityHeight(quality);
                VideoStream muxedChosen = pickMuxedVideoStream(info.getVideoStreams(), targetHeight);

                if (muxedChosen != null) {
                    MediaFormat fmt = muxedChosen.getFormat();
                    String ext = fmt != null && fmt.getSuffix() != null ? fmt.getSuffix() : "mp4";
                    String mime = fmt != null && fmt.getMimeType() != null ? fmt.getMimeType() : "video/mp4";
                    JSObject ret = new JSObject();
                    ret.put("url", muxedChosen.getContent());
                    ret.put("title", rawTitle);
                    ret.put("suggestedName", safeBase + "." + ext);
                    ret.put("mimeType", mime);
                    ret.put("durationSec", durationSec);
                    ret.put("adaptiveMuxRequired", false);
                    ret.put("resolution", muxedChosen.getHeight() + "p");
                    if (thumbUrl != null) ret.put("thumbnailUrl", thumbUrl);
                    call.resolve(ret);
                    return;
                }

                // Modern YouTube DASH fallback: pair adaptive H.264/MP4 video stream + M4A audio stream
                VideoStream adaptiveVideo = pickAdaptiveMp4VideoStream(info.getVideoOnlyStreams(), targetHeight);
                if (adaptiveVideo != null && bestAudio != null && bestAudio.getFormat() == MediaFormat.M4A) {
                    JSObject ret = new JSObject();
                    ret.put("url", adaptiveVideo.getContent());
                    ret.put("audioUrl", bestAudio.getContent());
                    ret.put("title", rawTitle);
                    ret.put("suggestedName", safeBase + ".mp4");
                    ret.put("mimeType", "video/mp4");
                    ret.put("durationSec", durationSec);
                    ret.put("adaptiveMuxRequired", true);
                    ret.put("resolution", adaptiveVideo.getHeight() + "p");
                    if (thumbUrl != null) ret.put("thumbnailUrl", thumbUrl);
                    call.resolve(ret);
                    return;
                }

                if (adaptiveVideo != null) {
                    JSObject ret = new JSObject();
                    ret.put("url", adaptiveVideo.getContent());
                    ret.put("title", rawTitle);
                    ret.put("suggestedName", safeBase + ".mp4");
                    ret.put("mimeType", "video/mp4");
                    ret.put("durationSec", durationSec);
                    ret.put("adaptiveMuxRequired", false);
                    ret.put("resolution", adaptiveVideo.getHeight() + "p");
                    if (thumbUrl != null) ret.put("thumbnailUrl", thumbUrl);
                    call.resolve(ret);
                    return;
                }

                String hlsUrl = info.getHlsUrl();
                if (hlsUrl != null && !hlsUrl.isEmpty()) {
                    JSObject ret = new JSObject();
                    ret.put("url", hlsUrl);
                    ret.put("title", rawTitle);
                    ret.put("suggestedName", safeBase + ".mp4");
                    ret.put("mimeType", "application/vnd.apple.mpegurl");
                    ret.put("durationSec", durationSec);
                    ret.put("adaptiveMuxRequired", false);
                    if (thumbUrl != null) ret.put("thumbnailUrl", thumbUrl);
                    call.resolve(ret);
                    return;
                }

                call.reject("NewPipe bu bağlantı için indirilebilir akış bulamadı.");
            } catch (Exception e) {
                call.reject("NewPipe çözümleme hatası: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void downloadWithNewPipe(PluginCall call) {
        final String url = call.getString("url", "");
        final String mode = call.getString("mode", "video");
        final String quality = call.getString("quality", "720p");
        final String processId = call.getString("processId", "morph-np-" + System.currentTimeMillis());

        if (url == null || url.trim().isEmpty()) {
            call.reject("Bağlantı adresi boş.");
            return;
        }

        final AtomicBoolean cancelFlag = new AtomicBoolean(false);
        newPipeJobs.put(processId, cancelFlag);

        executor.execute(() -> {
            Context appCtx = getContext().getApplicationContext();
            File stageDir = new File(appCtx.getCacheDir(), "newpipe-" + processId.replaceAll("[^a-zA-Z0-9_-]", ""));
            if (!stageDir.exists()) stageDir.mkdirs();

            try {
                ensureNewPipeReady();
                emitNewPipeProgress(processId, 6f, "Akış çözümleniyor…");

                StreamInfo info = StreamInfo.getInfo(url.trim());
                if (cancelFlag.get()) throw new InterruptedException("Cancelled");

                String rawTitle = info.getName() != null ? info.getName().trim() : "morph-media";
                String safeBase = sanitizeBaseName(rawTitle);

                File docsMorph = getPublicMorphDir(appCtx);
                File producedFile;
                String finalMime;

                if ("thumbnail".equalsIgnoreCase(mode)) {
                    List<Image> thumbs = info.getThumbnails();
                    if (thumbs == null || thumbs.isEmpty()) {
                        throw new IOException("Bu içerikte kapak görseli bulunamadı.");
                    }
                    String thumbUrl = thumbs.get(thumbs.size() - 1).getUrl();
                    producedFile = new File(stageDir, safeBase + "-cover.jpg");
                    downloadStreamRangeChunked(thumbUrl, producedFile, cancelFlag, (dl, tot) -> {
                        float pct = tot > 0 ? (10f + (dl * 86f / tot)) : 55f;
                        emitNewPipeProgress(processId, pct, "Kapak indiriliyor…");
                    });
                    finalMime = "image/jpeg";
                } else if ("audio".equalsIgnoreCase(mode)) {
                    AudioStream bestAudio = pickBestAudioStream(info.getAudioStreams());
                    if (bestAudio == null) {
                        throw new IOException("NewPipe uygun ses akışı bulamadı.");
                    }
                    MediaFormat fmt = bestAudio.getFormat();
                    String ext = fmt != null && fmt.getSuffix() != null ? fmt.getSuffix() : "m4a";
                    finalMime = fmt != null && fmt.getMimeType() != null ? fmt.getMimeType() : "audio/mp4";
                    producedFile = new File(stageDir, safeBase + "." + ext);
                    downloadStreamRangeChunked(bestAudio.getContent(), producedFile, cancelFlag, (dl, tot) -> {
                        float pct = tot > 0 ? (12f + (dl * 84f / tot)) : 50f;
                        emitNewPipeProgress(processId, pct, "Ses indiriliyor…");
                    });
                } else {
                    int targetHeight = parseQualityHeight(quality);
                    VideoStream muxed = pickMuxedVideoStream(info.getVideoStreams(), targetHeight);

                    // Prefer adaptive DASH when targetHeight > muxed height (e.g. 720p/1080p) or when muxed is absent
                    VideoStream adaptiveVideo = pickAdaptiveMp4VideoStream(info.getVideoOnlyStreams(), targetHeight);
                    AudioStream bestAudio = pickBestAudioStream(info.getAudioStreams());
                    boolean canMuxAdaptive =
                        adaptiveVideo != null && bestAudio != null && bestAudio.getFormat() == MediaFormat.M4A;

                    if (canMuxAdaptive && (muxed == null || adaptiveVideo.getHeight() > muxed.getHeight())) {
                        File videoPart = new File(stageDir, "video_track.mp4");
                        File audioPart = new File(stageDir, "audio_track.m4a");
                        producedFile = new File(stageDir, safeBase + ".mp4");

                        downloadStreamRangeChunked(adaptiveVideo.getContent(), videoPart, cancelFlag, (dl, tot) -> {
                            float pct = tot > 0 ? (10f + (dl * 62f / tot)) : 40f;
                            emitNewPipeProgress(processId, pct, "Video akışı indiriliyor (" + adaptiveVideo.getHeight() + "p)…");
                        });

                        downloadStreamRangeChunked(bestAudio.getContent(), audioPart, cancelFlag, (dl, tot) -> {
                            float pct = tot > 0 ? (72f + (dl * 19f / tot)) : 82f;
                            emitNewPipeProgress(processId, pct, "Ses kanalı indiriliyor…");
                        });

                        emitNewPipeProgress(processId, 93f, "Ses ve video birleştiriliyor…");
                        muxMp4VideoAndAudio(videoPart, audioPart, producedFile, cancelFlag);
                        finalMime = "video/mp4";
                    } else if (muxed != null) {
                        MediaFormat fmt = muxed.getFormat();
                        String ext = fmt != null && fmt.getSuffix() != null ? fmt.getSuffix() : "mp4";
                        finalMime = fmt != null && fmt.getMimeType() != null ? fmt.getMimeType() : "video/mp4";
                        producedFile = new File(stageDir, safeBase + "." + ext);
                        downloadStreamRangeChunked(muxed.getContent(), producedFile, cancelFlag, (dl, tot) -> {
                            float pct = tot > 0 ? (10f + (dl * 86f / tot)) : 50f;
                            emitNewPipeProgress(processId, pct, "Video indiriliyor…");
                        });
                    } else {
                        throw new IOException("NewPipe bu video için uyumlu MP4 akışı bulamadı.");
                    }
                }

                if (cancelFlag.get()) throw new InterruptedException("Cancelled");
                if (!producedFile.exists() || producedFile.length() <= 0) {
                    throw new IOException("NewPipe çıktı dosyası oluşturulamadı.");
                }

                String cleanName = sanitizeFileName(producedFile.getName());
                File finalDest = uniqueDestinationFile(docsMorph, cleanName);
                moveOrCopyFile(producedFile, finalDest);

                JSObject ret = new JSObject();
                ret.put("filePath", finalDest.getAbsolutePath());
                ret.put("fileName", finalDest.getName());
                ret.put("mimeType", finalMime);
                ret.put("size", finalDest.length());
                ret.put("uri", Uri.fromFile(finalDest).toString());
                ret.put("title", rawTitle);
                call.resolve(ret);
            } catch (InterruptedException ie) {
                call.reject("Cancelled", ie);
            } catch (Exception e) {
                if (cancelFlag.get()) {
                    call.reject("Cancelled", e);
                } else {
                    call.reject("NewPipe indirme hatası: " + e.getMessage(), e);
                }
            } finally {
                newPipeJobs.remove(processId);
                deleteDirRecursive(stageDir);
            }
        });
    }

    @PluginMethod
    public void cancelNewPipe(PluginCall call) {
        final String processId = call.getString("processId", "");
        boolean cancelled = false;
        if (processId != null && !processId.isEmpty()) {
            AtomicBoolean flag = newPipeJobs.get(processId);
            if (flag != null) {
                flag.set(true);
                cancelled = true;
            }
        }
        JSObject ret = new JSObject();
        ret.put("cancelled", cancelled);
        call.resolve(ret);
    }

    private void emitNewPipeProgress(String processId, float progress, String line) {
        JSObject ev = new JSObject();
        ev.put("processId", processId);
        ev.put("progress", Math.max(0f, Math.min(100f, progress)));
        ev.put("line", line != null ? line : "");
        notifyListeners("newpipeProgress", ev);
    }

    private static void downloadStreamRangeChunked(
        String streamUrl,
        File destFile,
        AtomicBoolean cancelFlag,
        ByteProgressListener onProgress
    ) throws IOException, InterruptedException {
        long downloaded = 0L;
        long totalBytes = -1L;
        boolean append = false;

        while (true) {
            if (cancelFlag.get()) throw new InterruptedException("Cancelled");

            long rangeEnd = totalBytes > 0
                ? Math.min(totalBytes - 1, downloaded + RANGE_CHUNK_BYTES - 1)
                : (downloaded + RANGE_CHUNK_BYTES - 1);

            HttpURLConnection conn = (HttpURLConnection) new URL(streamUrl).openConnection();
            conn.setConnectTimeout(20_000);
            conn.setReadTimeout(30_000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", USER_AGENT);
            conn.setRequestProperty("Range", "bytes=" + downloaded + "-" + rangeEnd);

            int status = conn.getResponseCode();
            if (status < 200 || status >= 300) {
                conn.disconnect();
                throw new IOException("Medya akışı HTTP " + status + " döndürdü.");
            }

            boolean isPartial = (status == HttpURLConnection.HTTP_PARTIAL);
            if (isPartial && totalBytes <= 0) {
                String contentRange = conn.getHeaderField("Content-Range");
                if (contentRange != null) {
                    int slash = contentRange.lastIndexOf('/');
                    if (slash > 0 && slash + 1 < contentRange.length()) {
                        String totPart = contentRange.substring(slash + 1).trim();
                        if (!"*".equals(totPart)) {
                            try {
                                totalBytes = Long.parseLong(totPart);
                            } catch (NumberFormatException ignored) {}
                        }
                    }
                }
            } else if (!isPartial && totalBytes <= 0) {
                long cl = conn.getContentLengthLong();
                if (cl > 0) totalBytes = cl;
                downloaded = 0L;
                append = false;
            }

            try (
                InputStream in = conn.getInputStream();
                FileOutputStream out = new FileOutputStream(destFile, append)
            ) {
                byte[] buf = new byte[64 * 1024];
                int r;
                long lastEmit = 0L;
                while ((r = in.read(buf)) != -1) {
                    if (cancelFlag.get()) throw new InterruptedException("Cancelled");
                    out.write(buf, 0, r);
                    downloaded += r;
                    long now = System.currentTimeMillis();
                    if (onProgress != null && now - lastEmit >= 160L) {
                        lastEmit = now;
                        onProgress.onProgress(downloaded, totalBytes);
                    }
                }
            } finally {
                conn.disconnect();
            }

            if (onProgress != null) {
                onProgress.onProgress(downloaded, totalBytes);
            }

            append = true;
            if (!isPartial || totalBytes <= 0 || downloaded >= totalBytes) {
                break;
            }
        }
    }

    private static void muxMp4VideoAndAudio(
        File videoFile,
        File audioFile,
        File outputFile,
        AtomicBoolean cancelFlag
    ) throws IOException, InterruptedException {
        MediaExtractor videoExtractor = new MediaExtractor();
        MediaExtractor audioExtractor = new MediaExtractor();
        MediaMuxer muxer = null;

        try {
            videoExtractor.setDataSource(videoFile.getAbsolutePath());
            int srcVideoTrack = selectTrackByPrefix(videoExtractor, "video/");
            if (srcVideoTrack < 0) {
                throw new IOException("Video izi okunamadı.");
            }
            videoExtractor.selectTrack(srcVideoTrack);
            android.media.MediaFormat videoFormat = videoExtractor.getTrackFormat(srcVideoTrack);

            audioExtractor.setDataSource(audioFile.getAbsolutePath());
            int srcAudioTrack = selectTrackByPrefix(audioExtractor, "audio/");
            if (srcAudioTrack < 0) {
                throw new IOException("Ses izi okunamadı.");
            }
            audioExtractor.selectTrack(srcAudioTrack);
            android.media.MediaFormat audioFormat = audioExtractor.getTrackFormat(srcAudioTrack);

            muxer = new MediaMuxer(outputFile.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int dstVideoTrack = muxer.addTrack(videoFormat);
            int dstAudioTrack = muxer.addTrack(audioFormat);
            muxer.start();

            ByteBuffer buffer = ByteBuffer.allocate(1024 * 1024);
            MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();

            copyExtractorSamples(videoExtractor, muxer, dstVideoTrack, buffer, bufferInfo, cancelFlag);
            copyExtractorSamples(audioExtractor, muxer, dstAudioTrack, buffer, bufferInfo, cancelFlag);

            muxer.stop();
        } finally {
            if (muxer != null) {
                try {
                    muxer.release();
                } catch (Exception ignored) {}
            }
            try {
                videoExtractor.release();
            } catch (Exception ignored) {}
            try {
                audioExtractor.release();
            } catch (Exception ignored) {}
        }
    }

    private static int selectTrackByPrefix(MediaExtractor extractor, String mimePrefix) {
        int count = extractor.getTrackCount();
        for (int i = 0; i < count; i++) {
            android.media.MediaFormat fmt = extractor.getTrackFormat(i);
            String mime = fmt.getString(android.media.MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith(mimePrefix)) {
                return i;
            }
        }
        return -1;
    }

    private static void copyExtractorSamples(
        MediaExtractor extractor,
        MediaMuxer muxer,
        int muxerTrackIndex,
        ByteBuffer buffer,
        MediaCodec.BufferInfo info,
        AtomicBoolean cancelFlag
    ) throws InterruptedException {
        long lastPtsUs = -1L;
        while (true) {
            if (cancelFlag.get()) throw new InterruptedException("Cancelled");
            info.offset = 0;
            info.size = extractor.readSampleData(buffer, 0);
            if (info.size < 0) break;

            long pts = extractor.getSampleTime();
            if (pts < 0) break;
            if (pts <= lastPtsUs) {
                pts = lastPtsUs + 1L;
            }
            lastPtsUs = pts;
            info.presentationTimeUs = pts;

            int exFlags = extractor.getSampleFlags();
            int codecFlags = 0;
            if ((exFlags & MediaExtractor.SAMPLE_FLAG_SYNC) != 0) {
                codecFlags |= MediaCodec.BUFFER_FLAG_KEY_FRAME;
            }
            info.flags = codecFlags;

            muxer.writeSampleData(muxerTrackIndex, buffer, info);
            extractor.advance();
        }
    }

    @PluginMethod
    public void downloadWithYtDlp(PluginCall call) {
        final String url = call.getString("url", "");
        final String mode = call.getString("mode", "video");
        final String quality = call.getString("quality", "720p");
        final Integer fragsObj = call.getInt("concurrentFragments", 4);
        final int concurrentFragments = fragsObj != null ? Math.max(1, Math.min(16, fragsObj)) : 4;
        final String processId = call.getString("processId", "morph-" + System.currentTimeMillis());

        if (url == null || url.trim().isEmpty()) {
            call.reject("Bağlantı adresi boş.");
            return;
        }

        executor.execute(() -> {
            Context appCtx = getContext().getApplicationContext();
            File stageDir = new File(appCtx.getCacheDir(), "ytdlp-" + processId.replaceAll("[^a-zA-Z0-9_-]", ""));
            if (!stageDir.exists()) stageDir.mkdirs();

            try {
                ensureYtDlpReady(appCtx);

                YoutubeDLRequest req = new YoutubeDLRequest(url.trim());
                req.addOption("--no-playlist");
                req.addOption("--no-mtime");
                req.addOption("--windows-filenames");
                req.addOption("--concurrent-fragments", concurrentFragments);
                req.addOption("-o", new File(stageDir, "%(title).80B.%(ext)s").getAbsolutePath());

                if ("audio".equalsIgnoreCase(mode)) {
                    req.addOption("-f", "bestaudio[ext=m4a]/bestaudio/best");
                } else if ("thumbnail".equalsIgnoreCase(mode)) {
                    req.addOption("--write-thumbnail");
                    req.addOption("--skip-download");
                } else {
                    int h = parseQualityHeight(quality);
                    if (h > 0) {
                        req.addOption(
                            "-f",
                            "best[height<=" + h + "][ext=mp4]/best[height<=" + h + "]/best[ext=mp4]/best"
                        );
                    } else {
                        req.addOption("-f", "best[ext=mp4]/best");
                    }
                }

                YoutubeDLResponse response = YoutubeDL.getInstance().execute(
                    req,
                    processId,
                    false,
                    (Float progress, Long etaInSeconds, String line) -> {
                        JSObject ev = new JSObject();
                        ev.put("processId", processId);
                        ev.put("progress", progress != null ? progress : 0f);
                        ev.put("etaSec", etaInSeconds != null ? etaInSeconds : 0L);
                        ev.put("line", line != null ? line : "");
                        notifyListeners("ytdlpProgress", ev);
                        return Unit.INSTANCE;
                    }
                );

                File produced = findLargestOutputFile(stageDir);
                if (produced == null || !produced.exists() || produced.length() <= 0) {
                    throw new IOException(
                        "yt-dlp çıktı dosyası oluşturmadı (kod " + response.getExitCode() + ")."
                    );
                }

                File docsMorph = getPublicMorphDir(appCtx);
                String cleanName = sanitizeFileName(produced.getName());
                File finalDest = uniqueDestinationFile(docsMorph, cleanName);

                moveOrCopyFile(produced, finalDest);
                String mime = guessMimeFromFile(finalDest.getName());
                String ver = YoutubeDL.getInstance().version(appCtx);

                JSObject ret = new JSObject();
                ret.put("filePath", finalDest.getAbsolutePath());
                ret.put("fileName", finalDest.getName());
                ret.put("mimeType", mime);
                ret.put("size", finalDest.length());
                ret.put("uri", Uri.fromFile(finalDest).toString());
                ret.put("ytdlpVersion", ver != null && !ver.isEmpty() ? ver : "bundled-0.18.1");
                call.resolve(ret);
            } catch (YoutubeDL.CanceledException ce) {
                call.reject("Cancelled", ce);
            } catch (Exception e) {
                call.reject("yt-dlp indirme hatası: " + e.getMessage(), e);
            } finally {
                deleteDirRecursive(stageDir);
            }
        });
    }

    @PluginMethod
    public void cancelYtDlp(PluginCall call) {
        final String processId = call.getString("processId", "");
        boolean cancelled = false;
        if (processId != null && !processId.isEmpty()) {
            try {
                cancelled = YoutubeDL.getInstance().destroyProcessById(processId);
            } catch (Exception ignored) {}
        }
        JSObject ret = new JSObject();
        ret.put("cancelled", cancelled);
        call.resolve(ret);
    }

    private static File getPublicMorphDir(Context appCtx) {
        File docsMorph = new File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
            "Morph"
        );
        if (!docsMorph.exists() && !docsMorph.mkdirs()) {
            docsMorph = new File(appCtx.getExternalFilesDir(null), "Morph");
            if (!docsMorph.exists()) docsMorph.mkdirs();
        }
        return docsMorph;
    }

    private static File uniqueDestinationFile(File dir, String cleanName) {
        File dest = new File(dir, cleanName);
        if (dest.exists()) {
            int dot = cleanName.lastIndexOf('.');
            String base = dot > 0 ? cleanName.substring(0, dot) : cleanName;
            String ext = dot > 0 ? cleanName.substring(dot) : "";
            dest = new File(dir, base + "-" + (System.currentTimeMillis() % 10000) + ext);
        }
        return dest;
    }

    private static int parseQualityHeight(String q) {
        if (q == null || q.equalsIgnoreCase("best")) return 0;
        String digits = q.replaceAll("\\D+", "");
        if (digits.isEmpty()) return 720;
        try {
            return Integer.parseInt(digits);
        } catch (NumberFormatException e) {
            return 720;
        }
    }

    private static String sanitizeBaseName(String raw) {
        String cleaned = raw
            .replaceAll("[\\r\\n\\t]+", " ")
            .replaceAll("[<>:\"/\\\\|?*\\x00-\\x1F]", "")
            .trim();
        if (cleaned.length() > 64) cleaned = cleaned.substring(0, 64).trim();
        cleaned = cleaned.replaceAll("\\s+", "-");
        return cleaned.isEmpty() ? "morph-media" : cleaned;
    }

    private static String sanitizeFileName(String raw) {
        String cleaned = raw.replaceAll("[<>:\"/\\\\|?*\\x00-\\x1F]", "_").trim();
        return cleaned.isEmpty() ? ("morph-" + System.currentTimeMillis() + ".mp4") : cleaned;
    }

    private static File findLargestOutputFile(File dir) {
        File[] files = dir.listFiles();
        if (files == null || files.length == 0) return null;
        File best = null;
        for (File f : files) {
            if (f.isDirectory()) continue;
            String n = f.getName().toLowerCase(Locale.ROOT);
            if (n.endsWith(".part") || n.endsWith(".ytdl") || n.endsWith(".temp")) continue;
            if (best == null || f.length() > best.length()) {
                best = f;
            }
        }
        return best;
    }

    private static void moveOrCopyFile(File src, File dst) throws IOException {
        if (src.renameTo(dst)) return;
        try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[64 * 1024];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        src.delete();
    }

    private static String guessMimeFromFile(String name) {
        int dot = name.lastIndexOf('.');
        String ext = dot > 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        if (!ext.isEmpty()) {
            String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (m != null && !m.isEmpty()) return m;
        }
        if ("m4a".equals(ext)) return "audio/mp4";
        if ("mp3".equals(ext)) return "audio/mpeg";
        if ("webm".equals(ext)) return "video/webm";
        if ("jpg".equals(ext) || "jpeg".equals(ext)) return "image/jpeg";
        if ("webp".equals(ext)) return "image/webp";
        return "video/mp4";
    }

    private static void deleteDirRecursive(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File c : children) deleteDirRecursive(c);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
