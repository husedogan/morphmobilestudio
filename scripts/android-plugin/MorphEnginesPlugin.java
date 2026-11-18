package com.morphstudio.app;

import android.content.Context;
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
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
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

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private volatile boolean newPipeInitialized = false;
    private volatile boolean ytDlpInitialized = false;

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
                    // Bundled yt-dlp inside APK remains ready even if GitHub API rate-limits update check
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
                    ret.put("thumbnailUrl", thumbUrl);
                    call.resolve(ret);
                    return;
                }

                if ("audio".equalsIgnoreCase(mode)) {
                    List<AudioStream> audios = info.getAudioStreams();
                    if (audios != null && !audios.isEmpty()) {
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
                            if (thumbUrl != null) ret.put("thumbnailUrl", thumbUrl);
                            call.resolve(ret);
                            return;
                        }
                    }
                }

                int targetHeight = parseQualityHeight(quality);
                List<VideoStream> videos = info.getVideoStreams();
                VideoStream chosen = null;
                if (videos != null && !videos.isEmpty()) {
                    // Prefer muxed (non-video-only) MP4 streams matching targetHeight
                    List<VideoStream> muxed = new java.util.ArrayList<>();
                    for (VideoStream v : videos) {
                        if (!v.isVideoOnly() && v.isUrl() && v.getContent() != null && !v.getContent().isEmpty()) {
                            muxed.add(v);
                        }
                    }
                    Collections.sort(muxed, Comparator.comparingInt(VideoStream::getHeight).reversed());
                    for (VideoStream v : muxed) {
                        if (targetHeight <= 0 || v.getHeight() <= targetHeight) {
                            chosen = v;
                            break;
                        }
                    }
                    if (chosen == null && !muxed.isEmpty()) {
                        chosen = muxed.get(muxed.size() - 1);
                    }
                }

                if (chosen == null) {
                    call.reject("NewPipe birleşik (ses+video) doğrudan akış bulamadı; yt-dlp Yerel Motor denenebilir.");
                    return;
                }

                MediaFormat fmt = chosen.getFormat();
                String ext = fmt != null && fmt.getSuffix() != null ? fmt.getSuffix() : "mp4";
                String mime = fmt != null && fmt.getMimeType() != null ? fmt.getMimeType() : "video/mp4";
                JSObject ret = new JSObject();
                ret.put("url", chosen.getContent());
                ret.put("title", rawTitle);
                ret.put("suggestedName", safeBase + "." + ext);
                ret.put("mimeType", mime);
                ret.put("durationSec", durationSec);
                if (thumbUrl != null) ret.put("thumbnailUrl", thumbUrl);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("NewPipe çözümleme hatası: " + e.getMessage(), e);
            }
        });
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

                File docsMorph = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
                    "Morph"
                );
                if (!docsMorph.exists() && !docsMorph.mkdirs()) {
                    docsMorph = new File(appCtx.getExternalFilesDir(null), "Morph");
                    if (!docsMorph.exists()) docsMorph.mkdirs();
                }

                String cleanName = sanitizeFileName(produced.getName());
                File finalDest = new File(docsMorph, cleanName);
                if (finalDest.exists()) {
                    int dot = cleanName.lastIndexOf('.');
                    String base = dot > 0 ? cleanName.substring(0, dot) : cleanName;
                    String ext = dot > 0 ? cleanName.substring(dot) : "";
                    finalDest = new File(docsMorph, base + "-" + (System.currentTimeMillis() % 10000) + ext);
                }

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
