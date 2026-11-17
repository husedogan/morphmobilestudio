import {Capacitor} from '@capacitor/core';
import {Directory, Filesystem} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || `morph-${Date.now()}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to encode file'));
    reader.readAsDataURL(blob);
  });
}

export function triggerWebDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function saveOrDownloadBlob(
  blob: Blob,
  filename: string,
  allowShareFallback = true
): Promise<'saved' | 'downloaded'> {
  if (isNativeApp()) {
    const safeName = sanitizeFileName(filename);
    const uniquePath = `Morph/${Date.now().toString(36).slice(-4)}-${safeName}`;
    const data = await blobToBase64(blob);

    // 1. Try public Documents/Morph (works when newly created by this app install)
    try {
      await Filesystem.writeFile({
        path: `Morph/${safeName}`,
        data,
        directory: Directory.Documents,
        recursive: true,
      });
      return 'saved';
    } catch {
      // Retry with unique filename in case Scoped Storage blocked overwriting a file from an older install
      try {
        await Filesystem.writeFile({
          path: uniquePath,
          data,
          directory: Directory.Documents,
          recursive: true,
        });
        return 'saved';
      } catch {
        // Continue to app-accessible External storage fallback
      }
    }

    // 2. Fallback to Android app External folder (never requires permissions on Android 11-16)
    try {
      await Filesystem.writeFile({
        path: `Morph/${safeName}`,
        data,
        directory: Directory.External,
        recursive: true,
      });
      if (!allowShareFallback) {
        return 'saved';
      }
    } catch {
      // Continue to Cache + Share sheet if single-file save requested
    }

    if (allowShareFallback) {
      const cached = await Filesystem.writeFile({
        path: safeName,
        data,
        directory: Directory.Cache,
        recursive: true,
      });
      await Share.share({
        title: safeName,
        files: [cached.uri],
      });
    }
    return 'saved';
  }

  triggerWebDownload(blob, filename);
  return 'downloaded';
}

export async function shareNativeOrWebBlob(
  blob: Blob,
  filename: string,
  mime: string
): Promise<'shared' | 'saved' | 'downloaded'> {
  if (isNativeApp()) {
    const safeName = sanitizeFileName(filename);
    const data = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: safeName,
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({
      title: safeName,
      files: [written.uri],
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
