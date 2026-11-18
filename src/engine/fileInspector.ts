import JSZip from 'jszip';
import {PDFDocument} from 'pdf-lib';
import {PickedFile, formatBytes} from '../data/models';

export type RenameCaseMode = 'keep' | 'slug' | 'lower' | 'upper';

export interface BatchRenameRules {
  baseName: string;
  prefix: string;
  suffix: string;
  findText: string;
  replaceText: string;
  numbering: boolean;
  startNumber: number;
  letterCase: RenameCaseMode;
}

export interface InspectedFileInfo {
  name: string;
  sizeFormatted: string;
  exactBytes: number;
  mime: string;
  ext: string;
  kind: string;
  sha256: string;
  sha1: string;
  details: string;
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export async function computeFileHashes(blob: Blob): Promise<{sha256: string; sha1: string}> {
  const MAX_HASH_BYTES = 260 * 1024 * 1024;
  if (blob.size > MAX_HASH_BYTES) {
    return {sha256: 'Boyut > 250 MB (atlandı)', sha1: '—'};
  }
  const buf = await blob.arrayBuffer();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const [h256, h1] = await Promise.all([
      crypto.subtle.digest('SHA-256', buf),
      crypto.subtle.digest('SHA-1', buf),
    ]);
    return {
      sha256: bufferToHex(h256),
      sha1: bufferToHex(h1),
    };
  }
  return {sha256: '—', sha1: '—'};
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function sniffImageDimensionsFromBytes(bytes: Uint8Array): {width: number; height: number} | null {
  if (bytes.length < 24) return null;
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {width: view.getUint32(16, false), height: view.getUint32(20, false)};
  }
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {width: view.getUint16(6, true), height: view.getUint16(8, true)};
  }
  // BMP
  if (bytes[0] === 0x42 && bytes[1] === 0x4d && bytes.length >= 26) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true))};
  }
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 9);
        return {height: view.getUint16(5, false), width: view.getUint16(7, false)};
      }
      if (offset + 4 >= bytes.length) break;
      const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segLen < 2) break;
      offset += 2 + segLen;
    }
  }
  return null;
}

async function describeFileDetails(item: PickedFile): Promise<string> {
  try {
    if (item.kind === 'image') {
      let w = 0;
      let h = 0;
      if (typeof createImageBitmap === 'function') {
        try {
          const bmp = await createImageBitmap(item.file);
          w = bmp.width;
          h = bmp.height;
          bmp.close();
        } catch {
          // Fallback to binary sniffer
        }
      }
      if (!w || !h) {
        const head = new Uint8Array(await item.file.slice(0, 65536).arrayBuffer());
        const dim = sniffImageDimensionsFromBytes(head);
        if (dim) {
          w = dim.width;
          h = dim.height;
        }
      }
      if (w > 0 && h > 0) {
        const mp = ((w * h) / 1_000_000).toFixed(1);
        const d = gcd(w, h);
        const rw = Math.round(w / d);
        const rh = Math.round(h / d);
        const ratioText = rw <= 32 && rh <= 32 ? ` · ${rw}:${rh}` : '';
        return `${w} × ${h} px · ${mp} MP${ratioText}`;
      }
    }

    if (item.kind === 'pdf') {
      const pdf = await PDFDocument.load(await item.file.arrayBuffer(), {ignoreEncryption: true});
      return `${pdf.getPageCount()} sayfa (PDF)`;
    }

    if (item.kind === 'archive') {
      const zip = await JSZip.loadAsync(item.file);
      const count = Object.values(zip.files).filter((f) => !f.dir).length;
      return `${count} arşiv içi dosya (ZIP)`;
    }

    if (item.kind === 'document' && item.size < 8 * 1024 * 1024 && !['docx', 'xlsx', 'pptx', 'odt'].includes(item.ext)) {
      const txt = await item.file.text();
      const lines = txt.split(/\r?\n/).length;
      const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
      return `${lines} satır · ${words} kelime · ${txt.length} karakter`;
    }
  } catch {
    // Non-fatal detail probe failure
  }
  return item.mime || item.ext.toUpperCase() || item.kind;
}

export async function inspectPickedFile(item: PickedFile): Promise<InspectedFileInfo> {
  const [hashes, details] = await Promise.all([
    computeFileHashes(item.file),
    describeFileDetails(item),
  ]);
  return {
    name: item.name,
    sizeFormatted: formatBytes(item.size),
    exactBytes: item.size,
    mime: item.mime || 'application/octet-stream',
    ext: item.ext || '—',
    kind: item.kind,
    sha256: hashes.sha256,
    sha1: hashes.sha1,
    details,
  };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Data URL okunamadı.'));
      reader.readAsDataURL(blob);
      return;
    }
    blob
      .arrayBuffer()
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = typeof btoa === 'function' ? btoa(binary) : '';
        resolve(`data:${blob.type || 'application/octet-stream'};base64,${b64}`);
      })
      .catch(reject);
  });
}

function transformCase(stem: string, mode: RenameCaseMode): string {
  if (mode === 'lower') return stem.toLocaleLowerCase('tr-TR');
  if (mode === 'upper') return stem.toLocaleUpperCase('tr-TR');
  if (mode === 'slug') {
    const trMap: Record<string, string> = {
      ç: 'c',
      Ç: 'c',
      ğ: 'g',
      Ğ: 'g',
      ı: 'i',
      İ: 'i',
      ö: 'o',
      Ö: 'o',
      ş: 's',
      Ş: 's',
      ü: 'u',
      Ü: 'u',
    };
    return stem
      .replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => trMap[ch] || ch)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  return stem;
}

function sanitizeFileStem(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim();
  return cleaned || fallback;
}

export function computeBatchRenamedNames(
  files: PickedFile[],
  rules: BatchRenameRules
): Array<{id: string; oldName: string; newName: string; newBaseName: string}> {
  const padDigits = Math.max(2, String((rules.startNumber || 1) + files.length).length);
  const used = new Set<string>();

  return files.map((file, idx) => {
    let stem = rules.baseName.trim() ? rules.baseName.trim() : file.baseName;
    if (rules.findText) {
      stem = stem.split(rules.findText).join(rules.replaceText);
    }
    stem = `${rules.prefix}${stem}${rules.suffix}`;
    if (rules.numbering) {
      const numStr = String((rules.startNumber || 1) + idx).padStart(padDigits, '0');
      stem = stem ? `${stem}-${numStr}` : numStr;
    }
    stem = transformCase(stem, rules.letterCase);
    stem = sanitizeFileStem(stem, `dosya-${idx + 1}`);

    const extPart = file.ext ? `.${file.ext}` : '';
    let candidateBase = stem;
    let candidateName = `${candidateBase}${extPart}`;
    let collision = 2;
    while (used.has(candidateName.toLowerCase())) {
      candidateBase = `${stem}-${collision}`;
      candidateName = `${candidateBase}${extPart}`;
      collision++;
    }
    used.add(candidateName.toLowerCase());

    return {
      id: file.id,
      oldName: file.name,
      newName: candidateName,
      newBaseName: candidateBase,
    };
  });
}

export async function generateFileHashReportBlob(
  files: PickedFile[],
  format: 'txt' | 'json',
  onProgress?: (ratio: number, step: string) => void
): Promise<{name: string; blob: Blob}> {
  const records: InspectedFileInfo[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i / files.length, files[i].name);
    records.push(await inspectPickedFile(files[i]));
  }
  const base = files[0]?.baseName || 'morph';

  if (format === 'json') {
    const payload = {
      generatedBy: 'Morph',
      generatedAt: new Date().toISOString(),
      fileCount: records.length,
      totalBytes: records.reduce((s, r) => s + r.exactBytes, 0),
      files: records,
    };
    return {
      name: `${base}-sha256-report.json`,
      blob: new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json;charset=utf-8'}),
    };
  }

  const lines: string[] = [
    'MORPH · DOSYA KİMLİĞİ VE BÜTÜNLÜK DOĞRULAMA RAPORU (SHA-256)',
    `Tarih: ${new Date().toISOString()}`,
    `Toplam Dosya: ${records.length}`,
    '====================================================================',
    '',
  ];

  records.forEach((rec, idx) => {
    lines.push(`${idx + 1}. ${rec.name}`);
    lines.push(`   Boyut     : ${rec.sizeFormatted} (${rec.exactBytes.toLocaleString('en-US')} bayt)`);
    lines.push(`   Tür / MIME: ${rec.mime}`);
    lines.push(`   Detay     : ${rec.details}`);
    lines.push(`   SHA-256   : ${rec.sha256}`);
    lines.push(`   SHA-1     : ${rec.sha1}`);
    lines.push('');
  });

  return {
    name: `${base}-sha256-report.txt`,
    blob: new Blob([lines.join('\n')], {type: 'text/plain;charset=utf-8'}),
  };
}
