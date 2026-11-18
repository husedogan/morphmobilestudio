import {Capacitor} from '@capacitor/core';
import {Directory, Filesystem} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import type {ExportItem} from '../data/models';

export type AppPermissionState = 'granted' | 'prompt' | 'denied' | 'ready';

export interface AppPermissionsSummary {
  storage: AppPermissionState;
  media: AppPermissionState;
  notifications: AppPermissionState;
  clipboard: AppPermissionState;
}

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function normalizeCapPerm(state: string | undefined): AppPermissionState {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}

export async function ensureStoragePermission(interactive = true): Promise<AppPermissionState> {
  if (isNativeApp()) {
    try {
      const current = await Filesystem.checkPermissions();
      if (current.publicStorage === 'granted') {
        return 'granted';
      }
      if (!interactive) {
        return normalizeCapPerm(current.publicStorage);
      }
      const requested = await Filesystem.requestPermissions();
      return normalizeCapPerm(requested.publicStorage);
    } catch {
      return 'ready';
    }
  }

  if (typeof navigator !== 'undefined' && navigator.storage) {
    try {
      const persisted = await navigator.storage.persisted?.();
      if (persisted) return 'granted';
      if (interactive && navigator.storage.persist) {
        const ok = await navigator.storage.persist();
        return ok ? 'granted' : 'ready';
      }
      return 'ready';
    } catch {
      return 'ready';
    }
  }

  return 'ready';
}

export async function checkAppPermissions(): Promise<AppPermissionsSummary> {
  let storage: AppPermissionState = 'ready';
  if (isNativeApp()) {
    try {
      const st = await Filesystem.checkPermissions();
      storage = normalizeCapPerm(st.publicStorage);
    } catch {
      storage = 'ready';
    }
  } else if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
    try {
      storage = (await navigator.storage.persisted()) ? 'granted' : 'ready';
    } catch {
      storage = 'ready';
    }
  }

  const media: AppPermissionState = storage === 'granted' ? 'granted' : 'ready';

  let notifications: AppPermissionState = 'ready';
  if (typeof Notification !== 'undefined') {
    if (Notification.permission === 'granted') notifications = 'granted';
    else if (Notification.permission === 'denied') notifications = 'denied';
    else notifications = 'prompt';
  }

  let clipboard: AppPermissionState = 'prompt';
  if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    try {
      const res = await navigator.permissions.query({
        name: 'clipboard-read' as PermissionName,
      });
      if (res.state === 'granted') clipboard = 'granted';
      else if (res.state === 'denied') clipboard = 'denied';
      else clipboard = 'prompt';
    } catch {
      clipboard = 'ready';
    }
  } else {
    clipboard = 'ready';
  }

  return {storage, media, notifications, clipboard};
}

export async function requestAllAppPermissions(): Promise<AppPermissionsSummary> {
  await ensureStoragePermission(true);

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      // Ignore browser/webview blocks
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      // Triggers clipboard permission prompt if currently in 'prompt' state under user gesture
      const cur = await checkAppPermissions();
      if (cur.clipboard === 'prompt') {
        await navigator.clipboard.readText();
      }
    } catch {
      // User dismissed or browser requires explicit paste action
    }
  }

  return checkAppPermissions();
}

export async function acquireJobWakeLock(): Promise<(() => void) | null> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return null;
  }
  try {
    const sentinel = await (
      navigator as Navigator & {
        wakeLock?: {request: (type: 'screen') => Promise<{release: () => Promise<void>}>};
      }
    ).wakeLock?.request('screen');
    if (!sentinel) return null;
    return () => {
      sentinel.release().catch(() => {});
    };
  } catch {
    return null;
  }
}

export function notifyJobCompleted(title: string, body: string): void {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') {
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/pwa-192x192.png',
      });
    } catch {
      // Ignore if WebView requires ServiceWorker registration
    }
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || `morph-${Date.now()}`;
}

// ~2 MB chunk size divisible by 3 so Base64 chunks stay small and never trigger Android OOM on 1GB+ videos
const NATIVE_WRITE_CHUNK_BYTES = 2_097_150;

function blobChunkToBase64(chunk: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to encode file chunk'));
    reader.readAsDataURL(chunk);
  });
}

export async function writeBlobToNativeChunked(
  blob: Blob,
  path: string,
  directory: Directory
): Promise<string> {
  if (blob.size <= NATIVE_WRITE_CHUNK_BYTES) {
    const data = await blobChunkToBase64(blob);
    const res = await Filesystem.writeFile({
      path,
      data,
      directory,
      recursive: true,
    });
    return res.uri;
  }

  let uri = '';
  for (let offset = 0; offset < blob.size; offset += NATIVE_WRITE_CHUNK_BYTES) {
    const slice = blob.slice(offset, Math.min(blob.size, offset + NATIVE_WRITE_CHUNK_BYTES));
    const data = await blobChunkToBase64(slice);
    if (offset === 0) {
      const first = await Filesystem.writeFile({
        path,
        data,
        directory,
        recursive: true,
      });
      uri = first.uri;
    } else {
      await Filesystem.appendFile({
        path,
        data,
        directory,
      });
    }
  }
  return uri;
}

export function triggerWebDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Keep ObjectURL alive for 60s so browser download manager handles multi-hundred-MB streams cleanly
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function saveOrDownloadBlob(
  blob: Blob,
  filename: string,
  allowShareFallback = true
): Promise<'saved' | 'downloaded'> {
  if (isNativeApp()) {
    await ensureStoragePermission(true);

    const safeName = sanitizeFileName(filename);
    const uniquePath = `Morph/${Date.now().toString(36).slice(-4)}-${safeName}`;

    // 1. Try public Documents/Morph using chunked writer (prevents OOM on 2-hour videos)
    try {
      await writeBlobToNativeChunked(blob, `Morph/${safeName}`, Directory.Documents);
      return 'saved';
    } catch {
      try {
        await writeBlobToNativeChunked(blob, uniquePath, Directory.Documents);
        return 'saved';
      } catch {
        // Continue to app-accessible External storage fallback
      }
    }

    // 2. Fallback to Android app External folder (never requires permissions on Android 11-16)
    try {
      await writeBlobToNativeChunked(blob, `Morph/${safeName}`, Directory.External);
      if (!allowShareFallback) {
        return 'saved';
      }
    } catch {
      // Continue to Cache + Share sheet if single-file save requested
    }

    if (allowShareFallback) {
      const cachedUri = await writeBlobToNativeChunked(blob, safeName, Directory.Cache);
      await Share.share({
        title: safeName,
        files: [cachedUri],
      });
    }
    return 'saved';
  }

  triggerWebDownload(blob, filename);
  return 'downloaded';
}

export async function saveOrDownloadExportItem(
  item: ExportItem,
  allowShareFallback = true
): Promise<'saved' | 'downloaded'> {
  if (isNativeApp() && item.nativePath && item.nativeDirectory) {
    await ensureStoragePermission(true);
    const srcDir = item.nativeDirectory as Directory;
    const safeName = sanitizeFileName(item.name);

    // Already streamed directly into Documents/Morph — verify on disk with zero RAM usage
    if (srcDir === Directory.Documents) {
      try {
        await Filesystem.stat({path: item.nativePath, directory: Directory.Documents});
        return 'saved';
      } catch {
        // Fall through if user moved/deleted file manually
      }
    } else {
      try {
        await Filesystem.mkdir({path: 'Morph', directory: Directory.Documents, recursive: true}).catch(
          () => {}
        );
        await Filesystem.copy({
          from: item.nativePath,
          directory: srcDir,
          to: `Morph/${safeName}`,
          toDirectory: Directory.Documents,
        });
        return 'saved';
      } catch {
        try {
          const uniqueTo = `Morph/${Date.now().toString(36).slice(-4)}-${safeName}`;
          await Filesystem.copy({
            from: item.nativePath,
            directory: srcDir,
            to: uniqueTo,
            toDirectory: Directory.Documents,
          });
          return 'saved';
        } catch {
          if (allowShareFallback && item.nativeUri) {
            await Share.share({title: safeName, files: [item.nativeUri]});
            return 'saved';
          }
        }
      }
    }
  }

  if (item.blob.size === 0) {
    throw new Error(
      isNativeApp()
        ? 'Bu büyük video zaten cihazın Documents/Morph klasörüne kaydedildi.'
        : 'Büyük video oturumu kapandığı için tarayıcı önbelleğinde tutulamadı; bağlantıyı yeniden indirebilirsin.'
    );
  }

  return saveOrDownloadBlob(item.blob, item.name, allowShareFallback);
}

export async function shareNativeOrWebBlob(
  blob: Blob,
  filename: string,
  mime: string
): Promise<'shared' | 'saved' | 'downloaded'> {
  if (isNativeApp()) {
    const safeName = sanitizeFileName(filename);
    const writtenUri = await writeBlobToNativeChunked(blob, safeName, Directory.Cache);
    await Share.share({
      title: safeName,
      files: [writtenUri],
    });
    return 'shared';
  }

  const fileObj = new File([blob], filename, {type: mime});
  if (navigator.canShare && navigator.canShare({files: [fileObj]})) {
    try {
      await navigator.share({files: [fileObj], title: filename});
      return 'shared';
    } catch {
      // Fallback to download
    }
  }
  triggerWebDownload(blob, filename);
  return 'downloaded';
}

export async function shareExportItem(
  item: ExportItem
): Promise<'shared' | 'saved' | 'downloaded'> {
  if (isNativeApp() && item.nativeUri && item.nativePath && item.nativeDirectory) {
    try {
      await Filesystem.stat({
        path: item.nativePath,
        directory: item.nativeDirectory as Directory,
      });
      await Share.share({
        title: sanitizeFileName(item.name),
        files: [item.nativeUri],
      });
      return 'shared';
    } catch {
      // Fall through to blob share if native file was removed
    }
  }
  if (item.blob.size === 0) {
    throw new Error('Paylaşılacak dosya verisi bulunamadı.');
  }
  return shareNativeOrWebBlob(item.blob, item.name, item.mime);
}
