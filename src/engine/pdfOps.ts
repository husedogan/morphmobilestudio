import {PDFDocument, StandardFonts, degrees, rgb} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {canvasToBlob, decodeImage, normalizeImageFormat} from './imaging';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function parsePageRanges(ranges: string): number[][] {
  if (!ranges.trim()) return [];
  return ranges
    .split(/[,;]+/)
    .map((part) => {
      const text = part.trim();
      if (!text) return [];
      if (text.includes('-')) {
        const [a, b] = text.split('-', 2);
        const start = parseInt(a.trim(), 10);
        const end = parseInt(b.trim(), 10);
        if (!Number.isFinite(start) || start <= 0) return [];
        const finalEnd = Number.isFinite(end) ? Math.max(start, end) : start;
        const arr: number[] = [];
        for (let p = start; p <= finalEnd; p++) arr.push(p);
        return arr;
      }
      const page = parseInt(text, 10);
      return Number.isFinite(page) && page > 0 ? [page] : [];
    })
    .filter((group) => group.length > 0);
}

export async function imagesToPdfBlob(
  files: Blob[],
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  if (files.length === 0) throw new Error('No images provided.');
  const doc = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    onProgress?.(i / files.length);
    const decoded = await decodeImage(files[i], 3200);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = decoded.width;
      canvas.height = decoded.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      let embedded;
      if (decoded.hasAlpha) {
        ctx.drawImage(decoded.bitmap, 0, 0);
        const pngBlob = await canvasToBlob(canvas, 'png', 100);
        embedded = await doc.embedPng(await pngBlob.arrayBuffer());
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(decoded.bitmap, 0, 0);
        const jpgBlob = await canvasToBlob(canvas, 'jpg', 88);
        embedded = await doc.embedJpg(await jpgBlob.arrayBuffer());
      }

      const page = doc.addPage([decoded.width, decoded.height]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: decoded.width,
        height: decoded.height,
      });
    } finally {
      decoded.bitmap.close();
    }
  }

  onProgress?.(0.95);
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
}

export async function mergePdfsBlob(
  files: Blob[],
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  if (files.length === 0) throw new Error('No PDFs provided.');
  const merged = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    onProgress?.(i / files.length);
    const srcBytes = await files[i].arrayBuffer();
    const src = await PDFDocument.load(srcBytes, {ignoreEncryption: true});
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
  }

  const outBytes = await merged.save();
  return new Blob([new Uint8Array(outBytes)], {type: 'application/pdf'});
}

export async function splitPdfBlobs(
  file: Blob,
  everyN: number,
  ranges: string,
  baseName: string,
  onProgress?: (ratio: number) => void
): Promise<Array<{name: string; blob: Blob}>> {
  const srcBytes = await file.arrayBuffer();
  const src = await PDFDocument.load(srcBytes, {ignoreEncryption: true});
  const total = src.getPageCount();
  if (total === 0) throw new Error('PDF has no pages.');

  const parsedGroups = parsePageRanges(ranges);
  let chunks: number[][];
  if (parsedGroups.length > 0) {
    chunks = parsedGroups;
  } else {
    const step = Math.min(500, Math.max(1, everyN || 1));
    chunks = [];
    for (let i = 0; i < total; i += step) {
      const group: number[] = [];
      for (let p = i + 1; p <= Math.min(total, i + step); p++) group.push(p);
      chunks.push(group);
    }
  }

  const outputs: Array<{name: string; blob: Blob}> = [];
  for (let idx = 0; idx < chunks.length; idx++) {
    const validIndices = chunks[idx].filter((p) => p >= 1 && p <= total).map((p) => p - 1);
    if (validIndices.length === 0) continue;
    const partDoc = await PDFDocument.create();
    const pages = await partDoc.copyPages(src, validIndices);
    pages.forEach((p) => partDoc.addPage(p));
    const bytes = await partDoc.save();
    const suffix = chunks.length === 1 ? 'part' : `part-${idx + 1}`;
    outputs.push({
      name: `${baseName}-${suffix}.pdf`,
      blob: new Blob([new Uint8Array(bytes)], {type: 'application/pdf'}),
    });
    onProgress?.((idx + 1) / chunks.length);
  }

  if (outputs.length === 0) throw new Error('No pages matched those ranges.');
  return outputs;
}

export async function rotatePdfBlob(file: Blob, deg: number): Promise<Blob> {
  const normalized = ((deg % 360) + 360) % 360;
  const doc = await PDFDocument.load(await file.arrayBuffer(), {ignoreEncryption: true});
  for (const page of doc.getPages()) {
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + normalized) % 360));
  }
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
}

export async function optimizeOrStripPdfBlob(file: Blob): Promise<Blob> {
  const src = await PDFDocument.load(await file.arrayBuffer(), {ignoreEncryption: true});
  const rebuilt = await PDFDocument.create();
  const pages = await rebuilt.copyPages(src, src.getPageIndices());
  pages.forEach((p) => rebuilt.addPage(p));
  rebuilt.setTitle('');
  rebuilt.setAuthor('');
  rebuilt.setSubject('');
  rebuilt.setKeywords([]);
  rebuilt.setCreator('');
  rebuilt.setProducer('');
  const bytes = await rebuilt.save({useObjectStreams: true});
  return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
}

export async function pdfToImagesBlobs(
  file: Blob,
  baseName: string,
  format: string,
  quality: number,
  maxDim?: number,
  onProgress?: (ratio: number, step: string) => void
): Promise<Array<{name: string; blob: Blob}>> {
  const fmt = normalizeImageFormat(format);
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({data});
  const pdf = await loadingTask.promise;
  const outputs: Array<{name: string; blob: Blob}> = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      onProgress?.((pageNum - 1) / pdf.numPages, `${baseName} · ${pageNum}/${pdf.numPages}`);
      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({scale: 1});
      const longest = Math.max(baseViewport.width, baseViewport.height, 1);
      const scale = maxDim && maxDim > 0 ? Math.min(maxDim / longest, 3) : 2;
      const viewport = page.getViewport({scale});

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({canvasContext: ctx, viewport, canvas}).promise;
      const blob = await canvasToBlob(canvas, fmt, quality);
      outputs.push({
        name: `${baseName}-${pageNum}.${fmt}`,
        blob,
      });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return outputs;
}

async function renderUnicodeStampPng(
  label: string,
  fontPt: number
): Promise<{bytes: ArrayBuffer; widthPt: number; heightPt: number}> {
  const dpr = 3;
  const fontPx = fontPt * dpr;
  const measure = document.createElement('canvas');
  const mCtx = measure.getContext('2d');
  if (!mCtx) throw new Error('Canvas unavailable');
  const fontSpec = `700 ${fontPx}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
  mCtx.font = fontSpec;
  const textW = Math.ceil(mCtx.measureText(label).width);
  const padX = Math.ceil(fontPx * 0.4);
  const canvasW = Math.max(8, textW + padX * 2);
  const canvasH = Math.ceil(fontPx * 1.6);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.font = fontSpec;
  ctx.fillStyle = '#475261';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvasW / 2, canvasH / 2);

  const pngBlob = await canvasToBlob(canvas, 'png', 100);
  return {
    bytes: await pngBlob.arrayBuffer(),
    widthPt: canvasW / dpr,
    heightPt: canvasH / dpr,
  };
}

export async function stampPdfBlob(
  file: Blob,
  opts: {text: string; pageNumbers: boolean; position: 'bottom' | 'top'}
): Promise<Blob> {
  const doc = await PDFDocument.load(await file.arrayBuffer(), {ignoreEncryption: true});
  const pages = doc.getPages();
  const total = pages.length;
  const custom = opts.text.trim();
  const needsUnicode = /[^\x20-\x7E]/.test(custom);
  const font = needsUnicode ? null : await doc.embedFont(StandardFonts.HelveticaBold);

  for (let idx = 0; idx < pages.length; idx++) {
    const page = pages[idx];
    const {width, height} = page.getSize();
    const parts: string[] = [];
    if (custom) parts.push(custom);
    if (opts.pageNumbers) parts.push(`${idx + 1} / ${total}`);
    const label = parts.join(needsUnicode ? '  ·  ' : '  -  ');
    if (!label) continue;

    const size = 10;
    if (font) {
      const textWidth = font.widthOfTextAtSize(label, size);
      const x = Math.max(18, (width - textWidth) / 2);
      const y = opts.position === 'top' ? height - 26 : 18;
      page.drawText(label, {
        x,
        y,
        size,
        font,
        color: rgb(0.28, 0.32, 0.38),
      });
    } else {
      const stamp = await renderUnicodeStampPng(label, size);
      const embedded = await doc.embedPng(stamp.bytes);
      const drawW = Math.min(width - 24, stamp.widthPt);
      const scale = drawW / Math.max(1, stamp.widthPt);
      const drawH = stamp.heightPt * scale;
      const x = Math.max(12, (width - drawW) / 2);
      const y = opts.position === 'top' ? height - 14 - drawH : 14;
      page.drawImage(embedded, {
        x,
        y,
        width: drawW,
        height: drawH,
      });
    }
  }

  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
}
