import {PDFDocument, StandardFonts, degrees, rgb} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {canvasToBlob, decodeImage, normalizeImageFormat} from './imaging';

if (typeof pdfWorkerUrl === 'string' && pdfWorkerUrl) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

let pdfWorkerReadyPromise: Promise<void> | null = null;

export function ensurePdfWorker(): Promise<void> {
  if (!pdfWorkerReadyPromise) {
    pdfWorkerReadyPromise = (async () => {
      if (typeof pdfWorkerUrl !== 'string' || !pdfWorkerUrl) return;
      try {
        const res = await fetch(pdfWorkerUrl);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 1024) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
              new Blob([buf], {type: 'text/javascript'})
            );
          }
        }
      } catch {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      }
    })();
  }
  return pdfWorkerReadyPromise;
}

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
        const finalEnd = Number.isFinite(end) ? Math.max(1, end) : start;
        const arr: number[] = [];
        if (start <= finalEnd) {
          for (let p = start; p <= finalEnd; p++) arr.push(p);
        } else {
          for (let p = start; p >= finalEnd; p--) arr.push(p);
        }
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

export async function removePdfPagesBlob(
  file: Blob,
  rangesToDelete: string,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const srcBytes = await file.arrayBuffer();
  const src = await PDFDocument.load(srcBytes, {ignoreEncryption: true});
  const total = src.getPageCount();
  if (total === 0) throw new Error('PDF sayfası bulunamadı.');

  const toDelete = new Set<number>();
  for (const group of parsePageRanges(rangesToDelete)) {
    for (const p of group) {
      if (p >= 1 && p <= total) toDelete.add(p - 1);
    }
  }
  if (toDelete.size === 0) {
    throw new Error('Silinecek geçerli bir sayfa numarası girin (ör. 2, 4-6).');
  }

  const keepIndices: number[] = [];
  for (let idx = 0; idx < total; idx++) {
    if (!toDelete.has(idx)) keepIndices.push(idx);
  }
  if (keepIndices.length === 0) {
    throw new Error('Tüm sayfalar silinemez; en az 1 sayfa kalmalıdır.');
  }

  onProgress?.(0.5);
  const outDoc = await PDFDocument.create();
  const copied = await outDoc.copyPages(src, keepIndices);
  copied.forEach((p) => outDoc.addPage(p));
  const bytes = await outDoc.save();
  return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
}

export async function extractOrReversePdfBlob(
  file: Blob,
  mode: 'custom' | 'reverse',
  customRanges: string,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const srcBytes = await file.arrayBuffer();
  const src = await PDFDocument.load(srcBytes, {ignoreEncryption: true});
  const total = src.getPageCount();
  if (total === 0) throw new Error('PDF sayfası bulunamadı.');

  let targetIndices: number[] = [];
  if (mode === 'reverse') {
    for (let i = total - 1; i >= 0; i--) targetIndices.push(i);
  } else {
    const parsed = parsePageRanges(customRanges);
    for (const group of parsed) {
      for (const p of group) {
        if (p >= 1 && p <= total) targetIndices.push(p - 1);
      }
    }
    if (targetIndices.length === 0) {
      throw new Error('Ayıklanacak sayfa numaralarını girin (ör. 3, 1, 2, 5-8).');
    }
  }

  onProgress?.(0.5);
  const outDoc = await PDFDocument.create();
  const copied = await outDoc.copyPages(src, targetIndices);
  copied.forEach((p) => outDoc.addPage(p));
  const bytes = await outDoc.save();
  return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
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
  await ensurePdfWorker();
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

export async function grayscalePdfBlob(
  file: Blob,
  onProgress?: (ratio: number, step: string) => void
): Promise<Blob> {
  await ensurePdfWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({data});
  const pdf = await loadingTask.promise;
  const outDoc = await PDFDocument.create();

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      onProgress?.((pageNum - 1) / pdf.numPages, `Sayfa ${pageNum} / ${pdf.numPages}`);
      const page = await pdf.getPage(pageNum);
      const origVp = page.getViewport({scale: 1});
      const renderVp = page.getViewport({scale: 1.85});

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(renderVp.width));
      canvas.height = Math.max(1, Math.round(renderVp.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({canvasContext: ctx, viewport: renderVp, canvas}).promise;
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = imgData.data;
      for (let i = 0; i < px.length; i += 4) {
        const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
        px[i] = g;
        px[i + 1] = g;
        px[i + 2] = g;
      }
      ctx.putImageData(imgData, 0, 0);

      const jpgBlob = await canvasToBlob(canvas, 'jpg', 86);
      const embedded = await outDoc.embedJpg(await jpgBlob.arrayBuffer());
      const outPage = outDoc.addPage([origVp.width, origVp.height]);
      outPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: origVp.width,
        height: origVp.height,
      });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  const bytes = await outDoc.save();
  return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
}

export async function nUpPdfBlob(
  file: Blob,
  pagesPerSheet: 2 | 4,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const srcBytes = await file.arrayBuffer();
  const src = await PDFDocument.load(srcBytes, {ignoreEncryption: true});
  const total = src.getPageCount();
  if (total === 0) throw new Error('PDF sayfası bulunamadı.');

  const outDoc = await PDFDocument.create();
  const allIndices = Array.from({length: total}, (_, i) => i);
  const embeddedPages = await outDoc.embedPdf(srcBytes, allIndices);

  // For 2-up: use A4 Landscape (841.89 x 595.28) side-by-side; for 4-up: use A4 Portrait (595.28 x 841.89) 2x2 grid
  const sheetW = pagesPerSheet === 2 ? 841.89 : 595.28;
  const sheetH = pagesPerSheet === 2 ? 595.28 : 841.89;
  const cols = 2;
  const rows = pagesPerSheet === 2 ? 1 : 2;
  const margin = 24;
  const gap = 16;
  const cellW = (sheetW - margin * 2 - gap * (cols - 1)) / cols;
  const cellH = (sheetH - margin * 2 - gap * (rows - 1)) / rows;

  for (let i = 0; i < embeddedPages.length; i += pagesPerSheet) {
    onProgress?.(i / embeddedPages.length);
    const sheet = outDoc.addPage([sheetW, sheetH]);
    for (let slot = 0; slot < pagesPerSheet; slot++) {
      const emb = embeddedPages[i + slot];
      if (!emb) break;
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const cellX = margin + col * (cellW + gap);
      // PDF y-origin is bottom-left; top row comes first
      const cellY = sheetH - margin - (row + 1) * cellH - row * gap;

      const scale = Math.min(cellW / emb.width, cellH / emb.height);
      const dw = emb.width * scale;
      const dh = emb.height * scale;
      const dx = cellX + (cellW - dw) / 2;
      const dy = cellY + (cellH - dh) / 2;

      sheet.drawRectangle({
        x: dx,
        y: dy,
        width: dw,
        height: dh,
        borderColor: rgb(0.84, 0.87, 0.91),
        borderWidth: 0.6,
      });
      sheet.drawPage(emb, {x: dx, y: dy, width: dw, height: dh});
    }
  }

  const bytes = await outDoc.save();
  return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
}

function parseHexToRgb01(hex: string): {r: number; g: number; b: number} {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const n = parseInt(clean, 16);
    if (Number.isFinite(n)) {
      return {
        r: ((n >> 16) & 0xff) / 255,
        g: ((n >> 8) & 0xff) / 255,
        b: (n & 0xff) / 255,
      };
    }
  }
  return {r: 0.35, g: 0.4, b: 0.48};
}

export async function watermarkPdfBlob(
  file: Blob,
  opts: {text: string; opacity: number; color: string; position: 'diagonal' | 'center'}
): Promise<Blob> {
  const label = (opts.text || 'MORPH').trim();
  if (!label) throw new Error('Filigran metni boş olamaz.');

  const doc = await PDFDocument.load(await file.arrayBuffer(), {ignoreEncryption: true});
  const pages = doc.getPages();
  const alpha = Math.min(0.9, Math.max(0.08, opts.opacity / 100));
  const needsUnicode = /[^\x20-\x7E]/.test(label);

  if (typeof document !== 'undefined') {
    // Render crisp high-DPI transparent PNG overlay supporting full Turkish Unicode & smooth rotation
    const canvasW = 1200;
    const canvasH = 800;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(canvasW / 2, canvasH / 2);
      if (opts.position === 'diagonal') {
        ctx.rotate((-34 * Math.PI) / 180);
      }
      let fontPx = 112;
      ctx.font = `800 ${fontPx}px "Plus Jakarta Sans", -apple-system, Arial, sans-serif`;
      const measured = ctx.measureText(label).width;
      if (measured > canvasW * 0.82) {
        fontPx = Math.max(32, Math.floor((fontPx * (canvasW * 0.82)) / measured));
        ctx.font = `800 ${fontPx}px "Plus Jakarta Sans", -apple-system, Arial, sans-serif`;
      }
      ctx.fillStyle = opts.color || '#64748B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      ctx.restore();

      const pngBlob = await canvasToBlob(canvas, 'png', 100);
      const embedded = await doc.embedPng(await pngBlob.arrayBuffer());
      for (const page of pages) {
        const {width, height} = page.getSize();
        const drawW = width * 0.84;
        const drawH = (drawW * canvasH) / canvasW;
        page.drawImage(embedded, {
          x: (width - drawW) / 2,
          y: (height - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      }
      const bytes = await doc.save();
      return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
    }
  }

  // Fallback pure vector text for headless environments without HTMLCanvasElement
  const safeAscii = needsUnicode
    ? label
        .replace(/ğ/g, 'g')
        .replace(/Ğ/g, 'G')
        .replace(/ü/g, 'u')
        .replace(/Ü/g, 'U')
        .replace(/ş/g, 's')
        .replace(/Ş/g, 'S')
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'I')
        .replace(/ö/g, 'o')
        .replace(/Ö/g, 'O')
        .replace(/ç/g, 'c')
        .replace(/Ç/g, 'C')
        .replace(/[^\x20-\x7E]/g, '')
    : label;
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const {r, g, b} = parseHexToRgb01(opts.color || '#64748B');
  for (const page of pages) {
    const {width, height} = page.getSize();
    const size = Math.max(28, Math.min(64, Math.round(width * 0.09)));
    const tw = font.widthOfTextAtSize(safeAscii, size);
    page.drawText(safeAscii, {
      x: Math.max(24, (width - tw) / 2),
      y: height / 2,
      size,
      font,
      color: rgb(r, g, b),
      opacity: alpha,
      rotate: opts.position === 'diagonal' ? degrees(32) : degrees(0),
    });
  }
  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
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

export async function extractPdfTextPages(
  file: Blob,
  onProgress?: (ratio: number) => void
): Promise<string[]> {
  await ensurePdfWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({data});
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      onProgress?.((pageNum - 1) / pdf.numPages);
      const page = await pdf.getPage(pageNum);
      const tc = await page.getTextContent();
      const strings = tc.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter((s) => s.trim().length > 0);
      pages.push(strings.join(' ').trim());
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}

export async function pdfToTextBlob(
  file: Blob,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const pages = await extractPdfTextPages(file, onProgress);
  const blocks = pages.map((txt, idx) =>
    pages.length > 1
      ? `--- Sayfa ${idx + 1} / ${pages.length} ---\n${txt || '(Boş veya görsel tabanlı sayfa)'}`
      : txt || '(PDF metin katmanı içermiyor veya görsel tabanlı.)'
  );
  return new Blob([blocks.join('\n\n')], {type: 'text/plain;charset=utf-8'});
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function pdfToHtmlBlob(
  file: Blob,
  title: string,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const pages = await extractPdfTextPages(file, onProgress);
  const sections = pages
    .map(
      (txt, i) =>
        `<section class="page"><header>Sayfa ${i + 1} / ${pages.length}</header><p>${escapeHtmlText(
          txt || '(Metin katmanı bulunamadı)'
        )}</p></section>`
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtmlText(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1.25rem; background: #0f172a; color: #e2e8f0; line-height: 1.65; }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #f8fafc; }
    .page { background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 1.25rem 1.5rem; margin-bottom: 1rem; }
    .page header { font-size: 0.75rem; font-weight: 700; color: #94a3b8; margin-bottom: 0.6rem; }
    .page p { margin: 0; white-space: pre-wrap; }
    @media (prefers-color-scheme: light) {
      body { background: #f8fafc; color: #0f172a; }
      h1 { color: #0f172a; }
      .page { background: #ffffff; border-color: #e2e8f0; }
      .page header { color: #64748b; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtmlText(title)}</h1>
  ${sections}
</body>
</html>`;
  return new Blob([html], {type: 'text/html;charset=utf-8'});
}
