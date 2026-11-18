import {DEFAULT_WHEEL_CONFIG, ExportItem, Prefs} from '../data/models';

const PREFS_KEY = 'morph_studio_prefs_v1';
const DB_NAME = 'morph_studio_db';
const DB_VERSION = 1;
const STORE_EXPORTS = 'exports';

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark',
  preset: 'midnight',
  lang: 'tr',
  serverUrl: '',
  serverToken: '',
  wheelSide: 'right',
  lastEngineAction: 'update',
  lastEngineSegment: null,
  downloadEngine: 'builtin',
  downloadWifiOnly: false,
  cellularLimitMb: 150,
  preferredVideoQuality: '720p',
  autoFallbackEngine: true,
  concurrentFragments: 4,
  cobaltUrl: '',
  cobaltApiKey: '',
  wheelConfig: DEFAULT_WHEEL_CONFIG,
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      wheelConfig: {
        ...DEFAULT_WHEEL_CONFIG,
        ...(parsed.wheelConfig ?? {}),
      },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore quota errors
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_EXPORTS)) {
        db.createObjectStore(STORE_EXPORTS, {keyPath: 'id'});
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const MAX_IDB_BLOB_BYTES = 100 * 1024 * 1024; // Avoid choking mobile WebView IndexedDB on multi-hour videos

interface StoredExportRecord {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
  tool: string;
  blob: Blob;
  nativeUri?: string;
  nativePath?: string;
  nativeDirectory?: string;
}

export async function loadLibraryItems(): Promise<ExportItem[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_EXPORTS, 'readonly');
      const store = tx.objectStore(STORE_EXPORTS);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredExportRecord[])
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 200);
        resolve(
          rows.map((r) => ({
            ...r,
            previewUrl:
              r.mime.startsWith('image/') && r.blob.size > 0 ? URL.createObjectURL(r.blob) : undefined,
          }))
        );
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveExportItems(items: ExportItem[]): Promise<void> {
  if (items.length === 0) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_EXPORTS, 'readwrite');
      const store = tx.objectStore(STORE_EXPORTS);
      for (const item of items) {
        const safeBlob =
          item.blob.size > MAX_IDB_BLOB_BYTES
            ? new Blob([], {type: item.mime || 'application/octet-stream'})
            : item.blob;
        store.put({
          id: item.id,
          name: item.name,
          mime: item.mime,
          size: item.size,
          createdAt: item.createdAt,
          tool: item.tool,
          blob: safeBlob,
          nativeUri: item.nativeUri,
          nativePath: item.nativePath,
          nativeDirectory: item.nativeDirectory,
        } satisfies StoredExportRecord);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage quota errors
  }
}

export async function deleteExportItem(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_EXPORTS, 'readwrite');
      tx.objectStore(STORE_EXPORTS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}

export async function clearAllExports(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_EXPORTS, 'readwrite');
      tx.objectStore(STORE_EXPORTS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore
  }
}
