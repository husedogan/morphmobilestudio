import JSZip from 'jszip';
import {PickedFile} from '../data/models';

const MAX_ENTRIES = 4_000;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GB safety cap in browser

function uniqueEntryName(name: string, used: Set<string>): string {
  const clean = (name || 'file').replace(/[/\\]/g, '-');
  if (!used.has(clean)) {
    used.add(clean);
    return clean;
  }
  const dot = clean.lastIndexOf('.');
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  let index = 2;
  while (true) {
    const candidate = `${base}-${index}${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    index++;
  }
}

export async function createZipArchive(
  files: PickedFile[],
  onProgress?: (ratio: number, step: string) => void
): Promise<Blob> {
  if (files.length === 0) throw new Error('Nothing to export.');
  const zip = new JSZip();
  const used = new Set<string>();

  files.forEach((picked, index) => {
    const entryName = uniqueEntryName(picked.name, used);
    zip.file(entryName, picked.file);
    onProgress?.(((index + 1) / files.length) * 0.4, picked.name);
  });

  return await zip.generateAsync(
    {type: 'blob', compression: 'DEFLATE', compressionOptions: {level: 6}},
    (meta) => {
      onProgress?.(0.4 + (meta.percent / 100) * 0.6, meta.currentFile || 'ZIP');
    }
  );
}

export interface ExtractedEntry {
  name: string;
  blob: Blob;
}

export async function extractZipArchive(
  archive: File,
  onProgress?: (ratio: number, step: string) => void
): Promise<ExtractedEntry[]> {
  const zip = await JSZip.loadAsync(archive);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  if (entries.length === 0) throw new Error('Archive is empty.');
  if (entries.length > MAX_ENTRIES) throw new Error('Archive exceeds maximum entry limit.');

  const outputs: ExtractedEntry[] = [];
  let totalBytes = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const normalized = entry.name.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.includes('..')) continue;

    const blob = await entry.async('blob');
    totalBytes += blob.size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Archive exceeds maximum size limit.');

    const cleanName = normalized.split('/').filter(Boolean).join('_') || `file-${i + 1}`;
    outputs.push({name: cleanName, blob});
    onProgress?.((i + 1) / entries.length, cleanName);
  }

  if (outputs.length === 0) throw new Error('No valid files found in archive.');
  return outputs;
}
