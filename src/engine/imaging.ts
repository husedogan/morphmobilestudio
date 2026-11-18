import JSZip from 'jszip';
import {ENCODABLE_IMAGE_FORMATS, mimeFromExt} from '../data/models';

export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  hasAlpha: boolean;
}

export function normalizeImageFormat(format: string): string {
  const lower = format.toLowerCase();
  if (lower === 'jpeg' || lower === 'jpg') return 'jpg';
  if (lower === 'png') return 'png';
  if (lower === 'webp') return 'webp';
  if (lower === 'bmp') return 'bmp';
  if (lower === 'ico') return 'ico';
  if (lower === 'gif') return 'gif';
  if (lower === 'svg') return 'svg';
  return 'jpg';
}

export async function decodeImage(file: Blob, maxDim?: number): Promise<DecodedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
  } catch {
    bitmap = await createImageBitmap(file);
  }

  let target = bitmap;
  const longest = Math.max(bitmap.width, bitmap.height);
  if (maxDim && maxDim > 0 && longest > maxDim) {
    const ratio = maxDim / longest;
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, w, h);
      target = await createImageBitmap(canvas);
      bitmap.close();
    }
  }

  const hasAlpha =
    file.type === 'image/png' ||
    file.type === 'image/webp' ||
    file.type === 'image/svg+xml' ||
    file.type === 'image/x-icon' ||
    file.type === 'image/gif';
  return {
    bitmap: target,
    width: target.width,
    height: target.height,
    hasAlpha,
  };
}

export async function canvasToBlob(canvas: HTMLCanvasElement, format: string, quality: number): Promise<Blob> {
  const fmt = normalizeImageFormat(format);
  if (fmt === 'bmp') {
    return encodeBmp24(canvas);
  }
  if (fmt === 'ico') {
    return encodeMultiSizeIcoFromCanvas(canvas);
  }
  if (fmt === 'gif') {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return encodeGif89a([imgData], 10, 0);
  }
  if (fmt === 'svg') {
    return encodeSvgFromCanvas(canvas);
  }
  const mime = mimeFromExt(fmt);
  const q = Math.min(1, Math.max(0.05, quality / 100));
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Encoding failed'));
        else resolve(blob);
      },
      mime,
      fmt === 'png' ? undefined : q
    );
  });
}

function createCanvas(width: number, height: number, fillWhite = false): {canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D} {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (fillWhite) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return {canvas, ctx};
}

function needsWhiteBackdrop(format: string): boolean {
  const f = normalizeImageFormat(format);
  return f === 'jpg' || f === 'bmp' || f === 'gif';
}

export async function convertImageBlob(
  file: Blob,
  format: string,
  quality: number,
  maxDim?: number
): Promise<Blob> {
  const fmt = normalizeImageFormat(format);
  const effectiveMax = fmt === 'ico' ? 512 : fmt === 'gif' && !maxDim ? 1280 : maxDim;
  const decoded = await decodeImage(file, effectiveMax);
  try {
    const {canvas, ctx} = createCanvas(decoded.width, decoded.height, needsWhiteBackdrop(fmt));
    ctx.drawImage(decoded.bitmap, 0, 0);
    return await canvasToBlob(canvas, fmt, quality);
  } finally {
    decoded.bitmap.close();
  }
}

export async function compressImageBlob(
  file: Blob,
  ext: string,
  quality: number,
  maxDim?: number,
  targetReductionPercent?: number
): Promise<{blob: Blob; format: string}> {
  const rawFmt = ENCODABLE_IMAGE_FORMATS.includes(ext.toLowerCase()) ? normalizeImageFormat(ext) : 'jpg';
  const format = ['ico', 'gif', 'svg'].includes(rawFmt) ? 'webp' : rawFmt;
  const decoded = await decodeImage(file, maxDim);
  try {
    const targetBytes =
      targetReductionPercent && targetReductionPercent > 0 && file.size > 0
        ? Math.max(10_000, Math.round((file.size * Math.min(95, Math.max(5, 100 - targetReductionPercent))) / 100))
        : null;

    if (!targetBytes) {
      const {canvas, ctx} = createCanvas(decoded.width, decoded.height, needsWhiteBackdrop(format));
      ctx.drawImage(decoded.bitmap, 0, 0);
      const blob = await canvasToBlob(canvas, format, quality);
      return {blob, format};
    }

    let workingW = decoded.width;
    let workingH = decoded.height;
    let bestBlob: Blob | null = null;
    const encodeFmt = format === 'png' ? 'webp' : format;

    for (let scaleStep = 0; scaleStep < 4; scaleStep++) {
      const {canvas, ctx} = createCanvas(workingW, workingH, needsWhiteBackdrop(encodeFmt));
      ctx.drawImage(decoded.bitmap, 0, 0, workingW, workingH);

      let low = 38;
      let high = 94;
      for (let iter = 0; iter < 5; iter++) {
        const mid = Math.round((low + high) / 2);
        const candidate = await canvasToBlob(canvas, encodeFmt, mid);
        bestBlob = candidate;
        if (candidate.size <= targetBytes) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
        if (candidate.size <= targetBytes && candidate.size >= targetBytes * 0.78) {
          return {blob: candidate, format: encodeFmt};
        }
      }
      if (bestBlob && bestBlob.size <= targetBytes) {
        return {blob: bestBlob, format: encodeFmt};
      }
      workingW = Math.max(32, Math.round(workingW * 0.78));
      workingH = Math.max(32, Math.round(workingH * 0.78));
    }

    if (!bestBlob) {
      const {canvas, ctx} = createCanvas(decoded.width, decoded.height, needsWhiteBackdrop(encodeFmt));
      ctx.drawImage(decoded.bitmap, 0, 0);
      bestBlob = await canvasToBlob(canvas, encodeFmt, quality);
    }
    return {blob: bestBlob, format: encodeFmt};
  } finally {
    decoded.bitmap.close();
  }
}

export function renderEditedToCanvas(
  bitmap: ImageBitmap,
  opts: {rotate: number; flipH: boolean; flipV: boolean; scalePercent: number}
): HTMLCanvasElement {
  const deg = ((opts.rotate % 360) + 360) % 360;
  const swap = deg === 90 || deg === 270;
  const scale = Math.min(4, Math.max(0.05, opts.scalePercent / 100));
  const srcW = Math.max(1, Math.round(bitmap.width * scale));
  const srcH = Math.max(1, Math.round(bitmap.height * scale));
  const outW = swap ? srcH : srcW;
  const outH = swap ? srcW : srcH;

  const {canvas, ctx} = createCanvas(outW, outH, false);
  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.scale(opts.flipH ? -1 : 1, opts.flipV ? -1 : 1);
  ctx.drawImage(bitmap, -srcW / 2, -srcH / 2, srcW, srcH);
  ctx.restore();
  return canvas;
}

export async function editImageBlob(
  file: Blob,
  ext: string,
  opts: {rotate: number; flipH: boolean; flipV: boolean; scalePercent: number; quality: number}
): Promise<{blob: Blob; format: string}> {
  const rawFmt = ENCODABLE_IMAGE_FORMATS.includes(ext.toLowerCase()) ? normalizeImageFormat(ext) : 'jpg';
  const format = ['ico', 'svg'].includes(rawFmt) ? 'png' : rawFmt;
  const decoded = await decodeImage(file);
  try {
    const edited = renderEditedToCanvas(decoded.bitmap, opts);
    if (needsWhiteBackdrop(format)) {
      const {canvas, ctx} = createCanvas(edited.width, edited.height, true);
      ctx.drawImage(edited, 0, 0);
      return {blob: await canvasToBlob(canvas, format, opts.quality), format};
    }
    return {blob: await canvasToBlob(edited, format, opts.quality), format};
  } finally {
    decoded.bitmap.close();
  }
}

export async function cropImageBlob(
  file: Blob,
  ext: string,
  rect: {left: number; top: number; right: number; bottom: number},
  quality = 92
): Promise<{blob: Blob; format: string}> {
  const rawFmt = ENCODABLE_IMAGE_FORMATS.includes(ext.toLowerCase()) ? normalizeImageFormat(ext) : 'jpg';
  const format = ['ico', 'svg'].includes(rawFmt) ? 'png' : rawFmt;
  const decoded = await decodeImage(file);
  try {
    const sx = Math.max(0, Math.min(decoded.width - 1, Math.round(rect.left * decoded.width)));
    const sy = Math.max(0, Math.min(decoded.height - 1, Math.round(rect.top * decoded.height)));
    const ex = Math.max(sx + 1, Math.min(decoded.width, Math.round(rect.right * decoded.width)));
    const ey = Math.max(sy + 1, Math.min(decoded.height, Math.round(rect.bottom * decoded.height)));
    const sw = ex - sx;
    const sh = ey - sy;

    const {canvas, ctx} = createCanvas(sw, sh, needsWhiteBackdrop(format));
    ctx.drawImage(decoded.bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    return {blob: await canvasToBlob(canvas, format, quality), format};
  } finally {
    decoded.bitmap.close();
  }
}

export function renderFrameToCanvas(
  bitmap: ImageBitmap,
  opts: {backgroundColor: string; padding: number; radius: number; shadow: boolean}
): HTMLCanvasElement {
  const pad = Math.max(0, opts.padding);
  const shadowPad = opts.shadow ? Math.max(12, Math.round(pad * 0.4)) : 0;
  const extra = pad + shadowPad;
  const outW = bitmap.width + extra * 2;
  const outH = bitmap.height + extra * 2;
  const {canvas, ctx} = createCanvas(outW, outH, false);

  ctx.fillStyle = opts.backgroundColor;
  ctx.fillRect(0, 0, outW, outH);

  const x = extra;
  const y = extra;
  const w = bitmap.width;
  const h = bitmap.height;
  const r = Math.min(opts.radius, Math.min(w, h) / 2);

  if (opts.shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.36)';
    ctx.shadowBlur = Math.max(14, pad * 0.55);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(4, pad * 0.18);
    ctx.fillStyle = opts.backgroundColor;
    roundRectPath(ctx, x + 2, y + 2, Math.max(1, w - 4), Math.max(1, h - 4), Math.max(0, r - 1));
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(bitmap, x, y, w, h);
  ctx.restore();
  return canvas;
}

export async function frameImageBlob(
  file: Blob,
  opts: {backgroundColor: string; padding: number; radius: number; shadow: boolean; format: string; quality: number}
): Promise<Blob> {
  const decoded = await decodeImage(file, 3200);
  try {
    const canvas = renderFrameToCanvas(decoded.bitmap, opts);
    return await canvasToBlob(canvas, opts.format, opts.quality);
  } finally {
    decoded.bitmap.close();
  }
}

export type FilterPreset = 'none' | 'vivid' | 'mono' | 'sepia' | 'cool' | 'warm';

export interface FilterOptions {
  preset: FilterPreset;
  brightness: number; // 50..150
  contrast: number; // 50..150
  saturation: number; // 0..200
  blur: number; // 0..10
}

export function renderFilteredToCanvas(
  bitmap: ImageBitmap,
  opts: FilterOptions,
  fillWhite = false
): HTMLCanvasElement {
  const {canvas, ctx} = createCanvas(bitmap.width, bitmap.height, fillWhite);
  const parts: string[] = [
    `brightness(${opts.brightness}%)`,
    `contrast(${opts.contrast}%)`,
    `saturate(${opts.saturation}%)`,
  ];
  if (opts.blur > 0) parts.push(`blur(${opts.blur}px)`);
  if (opts.preset === 'vivid') parts.push('contrast(112%) saturate(132%)');
  if (opts.preset === 'mono') parts.push('grayscale(100%) contrast(108%)');
  if (opts.preset === 'sepia') parts.push('sepia(78%) contrast(104%)');
  if (opts.preset === 'cool') parts.push('hue-rotate(12deg) saturate(108%)');
  if (opts.preset === 'warm') parts.push('sepia(22%) saturate(118%)');
  ctx.filter = parts.join(' ');
  ctx.drawImage(bitmap, 0, 0);
  ctx.filter = 'none';
  return canvas;
}

export async function filterImageBlob(
  file: Blob,
  opts: FilterOptions & {format: string; quality: number}
): Promise<Blob> {
  const decoded = await decodeImage(file, 3200);
  try {
    const canvas = renderFilteredToCanvas(decoded.bitmap, opts, needsWhiteBackdrop(opts.format));
    return await canvasToBlob(canvas, opts.format, opts.quality);
  } finally {
    decoded.bitmap.close();
  }
}

export type WatermarkPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' | 'tile';

export interface WatermarkOptions {
  text: string;
  position: WatermarkPosition;
  opacity: number; // 15..100
  scale: number; // 1..3
  color: string;
}

export function renderWatermarkToCanvas(
  bitmap: ImageBitmap,
  opts: WatermarkOptions,
  fillWhite = false
): HTMLCanvasElement {
  const {canvas, ctx} = createCanvas(bitmap.width, bitmap.height, fillWhite);
  ctx.drawImage(bitmap, 0, 0);

  const label = opts.text.trim();
  if (!label) return canvas;

  const base = Math.max(16, Math.round(Math.min(bitmap.width, bitmap.height) * 0.038 * opts.scale));
  const pad = Math.max(18, Math.round(base * 0.9));

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0.1, opts.opacity / 100));
  ctx.font = `700 ${base}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillStyle = opts.color;
  ctx.shadowColor = opts.color === '#000000' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = Math.max(4, Math.round(base * 0.25));

  if (opts.position === 'tile') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textW = ctx.measureText(label).width;
    const stepX = Math.max(base * 4, textW + base * 2.2);
    const stepY = Math.max(base * 3.2, base * 4);
    ctx.translate(bitmap.width / 2, bitmap.height / 2);
    ctx.rotate(-Math.PI / 6);
    const span = Math.hypot(bitmap.width, bitmap.height);
    for (let y = -span; y <= span; y += stepY) {
      for (let x = -span; x <= span; x += stepX) {
        ctx.fillText(label, x, y);
      }
    }
  } else if (opts.position === 'center') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bitmap.width / 2, bitmap.height / 2);
  } else {
    const isRight = opts.position.endsWith('right');
    const isBottom = opts.position.startsWith('bottom');
    ctx.textAlign = isRight ? 'right' : 'left';
    ctx.textBaseline = isBottom ? 'bottom' : 'top';
    const x = isRight ? bitmap.width - pad : pad;
    const y = isBottom ? bitmap.height - pad : pad;
    ctx.fillText(label, x, y);
  }
  ctx.restore();
  return canvas;
}

export async function watermarkImageBlob(
  file: Blob,
  opts: WatermarkOptions & {format: string; quality: number}
): Promise<Blob> {
  const decoded = await decodeImage(file, 3200);
  try {
    const canvas = renderWatermarkToCanvas(decoded.bitmap, opts, needsWhiteBackdrop(opts.format));
    return await canvasToBlob(canvas, opts.format, opts.quality);
  } finally {
    decoded.bitmap.close();
  }
}

export function renderCollageToCanvas(
  bitmaps: ImageBitmap[],
  opts: {columns: number; gap: number; backgroundColor: string; targetWidth?: number}
): HTMLCanvasElement {
  const cols = Math.min(6, Math.max(1, opts.columns));
  const rows = Math.max(1, Math.ceil(bitmaps.length / cols));
  const totalWidth = opts.targetWidth ?? 1440;
  const gap = Math.max(0, opts.gap);
  const cellW = Math.max(40, Math.round((totalWidth - gap * (cols + 1)) / cols));
  const avgAspect = Math.min(
    1.85,
    Math.max(
      0.55,
      bitmaps.reduce((sum, b) => sum + b.width / Math.max(1, b.height), 0) / Math.max(1, bitmaps.length)
    )
  );
  const cellH = Math.max(40, Math.round(cellW / avgAspect));
  const width = cellW * cols + gap * (cols + 1);
  const height = cellH * rows + gap * (rows + 1);
  const radius = Math.max(6, Math.round(gap * 0.9));

  const {canvas, ctx} = createCanvas(width, height, false);
  ctx.fillStyle = opts.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  bitmaps.forEach((bmp, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = gap + col * (cellW + gap);
    const y = gap + row * (cellH + gap);

    const scale = Math.max(cellW / bmp.width, cellH / bmp.height);
    const dw = bmp.width * scale;
    const dh = bmp.height * scale;
    const dx = x + (cellW - dw) / 2;
    const dy = y + (cellH - dh) / 2;

    ctx.save();
    roundRectPath(ctx, x, y, cellW, cellH, radius);
    ctx.clip();
    ctx.drawImage(bmp, dx, dy, dw, dh);
    ctx.restore();
  });

  return canvas;
}

export async function collageImagesBlob(
  files: Blob[],
  opts: {columns: number; gap: number; backgroundColor: string; format: string; quality: number},
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const decoded: DecodedImage[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      onProgress?.((i / files.length) * 0.7);
      decoded.push(await decodeImage(files[i], 1800));
    }
    onProgress?.(0.85);
    const canvas = renderCollageToCanvas(
      decoded.map((d) => d.bitmap),
      {columns: opts.columns, gap: opts.gap, backgroundColor: opts.backgroundColor}
    );
    return await canvasToBlob(canvas, opts.format, opts.quality);
  } finally {
    decoded.forEach((d) => d.bitmap.close());
  }
}

/* ---------- 1. Document Scanner (SCAN_DOC) with Uneven Shadow Normalization ---------- */

export type ScanMode = 'bw' | 'gray' | 'color';

export function renderScanDocToCanvas(
  bitmap: ImageBitmap,
  opts: {mode: ScanMode; strength: number}
): HTMLCanvasElement {
  const w = bitmap.width;
  const h = bitmap.height;
  const {canvas, ctx} = createCanvas(w, h, true);
  ctx.drawImage(bitmap, 0, 0);

  // Build low-frequency illumination background map (downscaled 32x + blur) to remove room/phone shadows
  const bgW = Math.max(8, Math.round(w / 24));
  const bgH = Math.max(8, Math.round(h / 24));
  const {canvas: bgSmall, ctx: bgSmallCtx} = createCanvas(bgW, bgH, true);
  bgSmallCtx.filter = 'blur(2px)';
  bgSmallCtx.drawImage(bitmap, 0, 0, bgW, bgH);
  bgSmallCtx.filter = 'none';

  const {canvas: bgFull, ctx: bgFullCtx} = createCanvas(w, h, true);
  bgFullCtx.imageSmoothingEnabled = true;
  bgFullCtx.imageSmoothingQuality = 'high';
  bgFullCtx.drawImage(bgSmall, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const bgData = bgFullCtx.getImageData(0, 0, w, h).data;
  const px = imgData.data;
  const strength = Math.min(100, Math.max(10, opts.strength));

  if (opts.mode === 'bw') {
    const thresh = 238 - Math.round((strength / 100) * 58); // ~180..232
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const bgLum = Math.max(48, 0.299 * bgData[i] + 0.587 * bgData[i + 1] + 0.114 * bgData[i + 2]);
      const normalized = Math.min(255, (lum / bgLum) * 250);
      // Smooth anti-aliased threshold around `thresh` so text edges stay razor-sharp without jagged stair-stepping
      const delta = (normalized - thresh) * (2.6 + (strength / 100) * 3.5);
      const val = Math.max(0, Math.min(255, Math.round(128 + delta)));
      px[i] = val;
      px[i + 1] = val;
      px[i + 2] = val;
      px[i + 3] = 255;
    }
  } else if (opts.mode === 'gray') {
    const gain = 1 + (strength / 100) * 0.9;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const bgLum = Math.max(56, 0.299 * bgData[i] + 0.587 * bgData[i + 1] + 0.114 * bgData[i + 2]);
      const norm = Math.min(255, (lum / bgLum) * 246);
      const val = Math.max(0, Math.min(255, Math.round((norm - 160) * gain + 178)));
      px[i] = val;
      px[i + 1] = val;
      px[i + 2] = val;
      px[i + 3] = 255;
    }
  } else {
    const gain = 1 + (strength / 100) * 0.75;
    for (let i = 0; i < px.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const bgCh = Math.max(56, bgData[i + c]);
        const norm = Math.min(255, (px[i + c] / bgCh) * 246);
        px[i + c] = Math.max(0, Math.min(255, Math.round((norm - 150) * gain + 168)));
      }
      px[i + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export async function scanDocImageBlob(
  file: Blob,
  opts: {mode: ScanMode; strength: number; format: string; quality: number}
): Promise<Blob> {
  const decoded = await decodeImage(file, 2600);
  try {
    const canvas = renderScanDocToCanvas(decoded.bitmap, {mode: opts.mode, strength: opts.strength});
    return await canvasToBlob(canvas, opts.format, opts.quality);
  } finally {
    decoded.bitmap.close();
  }
}

/* ---------- 2. Social Media No-Crop Fit (SOCIAL_FIT) ---------- */

export type SocialAspect = '1:1' | '4:5' | '9:16' | '16:9';
export type SocialFillMode = 'blur' | 'color';

function getSocialCanvasDimensions(aspect: SocialAspect, baseLong = 1440): {width: number; height: number} {
  switch (aspect) {
    case '1:1':
      return {width: baseLong, height: baseLong};
    case '4:5':
      return {width: Math.round(baseLong * 0.8), height: baseLong};
    case '9:16':
      return {width: Math.round((baseLong * 9) / 16), height: baseLong};
    case '16:9':
      return {width: baseLong, height: Math.round((baseLong * 9) / 16)};
  }
}

export function renderSocialFitToCanvas(
  bitmap: ImageBitmap,
  opts: {aspect: SocialAspect; fillMode: SocialFillMode; color: string; targetLongEdge?: number}
): HTMLCanvasElement {
  const {width: outW, height: outH} = getSocialCanvasDimensions(opts.aspect, opts.targetLongEdge ?? 1440);
  const {canvas, ctx} = createCanvas(outW, outH, false);

  if (opts.fillMode === 'blur') {
    const coverScale = Math.max(outW / bitmap.width, outH / bitmap.height) * 1.12;
    const cw = bitmap.width * coverScale;
    const ch = bitmap.height * coverScale;
    ctx.save();
    ctx.filter = `blur(${Math.max(14, Math.round(outW * 0.026))}px) brightness(78%) saturate(118%)`;
    ctx.drawImage(bitmap, (outW - cw) / 2, (outH - ch) / 2, cw, ch);
    ctx.restore();
  } else {
    ctx.fillStyle = opts.color || '#101D31';
    ctx.fillRect(0, 0, outW, outH);
  }

  const fitScale = Math.min(outW / bitmap.width, outH / bitmap.height);
  const dw = Math.round(bitmap.width * fitScale);
  const dh = Math.round(bitmap.height * fitScale);
  const dx = Math.round((outW - dw) / 2);
  const dy = Math.round((outH - dh) / 2);

  if (opts.fillMode === 'blur' && (dw < outW - 4 || dh < outH - 4)) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    ctx.shadowBlur = Math.max(18, Math.round(outW * 0.025));
    ctx.shadowOffsetY = Math.max(4, Math.round(outW * 0.006));
    ctx.drawImage(bitmap, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(bitmap, dx, dy, dw, dh);
  }

  return canvas;
}

export async function socialFitImageBlob(
  file: Blob,
  opts: {aspect: SocialAspect; fillMode: SocialFillMode; color: string; format: string; quality: number}
): Promise<Blob> {
  const decoded = await decodeImage(file, 2400);
  try {
    const longest = Math.min(2160, Math.max(1080, Math.max(decoded.width, decoded.height)));
    const canvas = renderSocialFitToCanvas(decoded.bitmap, {
      aspect: opts.aspect,
      fillMode: opts.fillMode,
      color: opts.color,
      targetLongEdge: longest,
    });
    return await canvasToBlob(canvas, opts.format, opts.quality);
  } finally {
    decoded.bitmap.close();
  }
}

/* ---------- 3. Privacy Redact / Pixelate / Blur (REDACT) ---------- */

export type RedactStyle = 'pixelate' | 'blur' | 'black';

export interface RedactBox {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
}

export function renderRedactToCanvas(
  bitmap: ImageBitmap,
  opts: {boxes: RedactBox[]; style: RedactStyle; strength: number},
  fillWhite = false
): HTMLCanvasElement {
  const W = bitmap.width;
  const H = bitmap.height;
  const {canvas, ctx} = createCanvas(W, H, fillWhite);
  ctx.drawImage(bitmap, 0, 0);

  const strength = Math.min(100, Math.max(10, opts.strength));

  for (const box of opts.boxes) {
    const rx = Math.max(0, Math.min(W - 1, Math.round(box.x * W)));
    const ry = Math.max(0, Math.min(H - 1, Math.round(box.y * H)));
    const rw = Math.max(2, Math.min(W - rx, Math.round(box.w * W)));
    const rh = Math.max(2, Math.min(H - ry, Math.round(box.h * H)));

    if (opts.style === 'black') {
      ctx.save();
      ctx.fillStyle = '#0B0F17';
      roundRectPath(ctx, rx, ry, rw, rh, Math.min(8, Math.min(rw, rh) * 0.15));
      ctx.fill();
      ctx.restore();
    } else if (opts.style === 'pixelate') {
      const blockPx = Math.max(6, Math.round((Math.min(W, H) * (0.008 + (strength / 100) * 0.032))));
      const tinyW = Math.max(1, Math.round(rw / blockPx));
      const tinyH = Math.max(1, Math.round(rh / blockPx));
      const {canvas: tiny, ctx: tCtx} = createCanvas(tinyW, tinyH, false);
      tCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, tinyW, tinyH);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tiny, 0, 0, tinyW, tinyH, rx, ry, rw, rh);
      ctx.restore();
    } else {
      const blurRadius = Math.max(8, Math.round((Math.min(W, H) * (0.012 + (strength / 100) * 0.04))));
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();
      ctx.filter = `blur(${blurRadius}px)`;
      // Draw slightly expanded source to avoid edge bleed
      ctx.drawImage(canvas, rx, ry, rw, rh, rx - 4, ry - 4, rw + 8, rh + 8);
      ctx.restore();
    }
  }

  return canvas;
}

export async function redactImageBlob(
  file: Blob,
  opts: {boxes: RedactBox[]; style: RedactStyle; strength: number; format: string; quality: number}
): Promise<Blob> {
  const decoded = await decodeImage(file, 3200);
  try {
    const canvas = renderRedactToCanvas(decoded.bitmap, opts, needsWhiteBackdrop(opts.format));
    return await canvasToBlob(canvas, opts.format, opts.quality);
  } finally {
    decoded.bitmap.close();
  }
}

/* ---------- 4. Grid & Carousel Splitter (IMAGE_GRID_SPLIT) ---------- */

export async function splitImageGridBlobs(
  file: Blob,
  baseName: string,
  cols: number,
  rows: number,
  format: string,
  quality: number,
  onProgress?: (ratio: number, step: string) => void
): Promise<Array<{name: string; blob: Blob}>> {
  const fmt = normalizeImageFormat(format);
  const c = Math.min(6, Math.max(1, Math.round(cols)));
  const r = Math.min(6, Math.max(1, Math.round(rows)));
  const decoded = await decodeImage(file, 3600);
  const outputs: Array<{name: string; blob: Blob}> = [];

  try {
    const tileW = Math.max(1, Math.floor(decoded.width / c));
    const tileH = Math.max(1, Math.floor(decoded.height / r));
    const total = c * r;
    let index = 0;

    for (let row = 0; row < r; row++) {
      for (let col = 0; col < c; col++) {
        index++;
        onProgress?.((index - 1) / total, `${index} / ${total}`);
        const sx = col * tileW;
        const sy = row * tileH;
        const {canvas, ctx} = createCanvas(tileW, tileH, needsWhiteBackdrop(fmt));
        ctx.drawImage(decoded.bitmap, sx, sy, tileW, tileH, 0, 0, tileW, tileH);
        const blob = await canvasToBlob(canvas, fmt, quality);
        outputs.push({
          name: `${baseName}-grid-${String(index).padStart(2, '0')}.${fmt}`,
          blob,
        });
      }
    }
  } finally {
    decoded.bitmap.close();
  }
  return outputs;
}

/* ---------- 5. ID / Passport Photo Print Sheet (PASSPORT_GRID) ---------- */

export function renderPassportGridToCanvas(
  bitmap: ImageBitmap,
  opts: {paper: '10x15' | 'a4'; count: 4 | 8 | 9; targetScale?: number}
): HTMLCanvasElement {
  const s = opts.targetScale ?? 1;
  // 10x15 cm landscape at 300 DPI = 1772 x 1181; A4 portrait at ~250 DPI = 2067 x 2923
  const sheetW = Math.round((opts.paper === 'a4' ? 2067 : 1772) * s);
  const sheetH = Math.round((opts.paper === 'a4' ? 2923 : 1181) * s);
  const {canvas, ctx} = createCanvas(sheetW, sheetH, true);

  const cols = opts.count === 4 ? 2 : opts.count === 8 ? 4 : 3;
  const rows = opts.count === 4 ? 2 : opts.count === 8 ? 2 : 3;

  // Standard 35x45mm biometric aspect ratio
  const photoAspect = 35 / 45;
  const margin = Math.round(Math.min(sheetW, sheetH) * 0.055);
  const gap = Math.round(Math.min(sheetW, sheetH) * 0.025);
  const availW = sheetW - margin * 2 - gap * (cols - 1);
  const availH = sheetH - margin * 2 - gap * (rows - 1);

  let cellW = Math.floor(availW / cols);
  let cellH = Math.floor(cellW / photoAspect);
  if (cellH * rows > availH) {
    cellH = Math.floor(availH / rows);
    cellW = Math.floor(cellH * photoAspect);
  }

  const gridW = cellW * cols + gap * (cols - 1);
  const gridH = cellH * rows + gap * (rows - 1);
  const startX = Math.round((sheetW - gridW) / 2);
  const startY = Math.round((sheetH - gridH) / 2);

  // Center-crop source image to 35:45
  const srcAspect = bitmap.width / Math.max(1, bitmap.height);
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (srcAspect > photoAspect) {
    sw = Math.round(bitmap.height * photoAspect);
    sx = Math.round((bitmap.width - sw) / 2);
  } else {
    sh = Math.round(bitmap.width / photoAspect);
    sy = Math.round((bitmap.height - sh) / 2);
  }

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = Math.max(1, Math.round(1.5 * s));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (cellW + gap);
      const y = startY + r * (cellH + gap);
      ctx.drawImage(bitmap, sx, sy, sw, sh, x, y, cellW, cellH);
      ctx.strokeRect(x, y, cellW, cellH);
    }
  }

  return canvas;
}

export async function passportGridImageBlob(
  file: Blob,
  opts: {paper: '10x15' | 'a4'; count: 4 | 8 | 9; format: string; quality: number}
): Promise<Blob> {
  const decoded = await decodeImage(file, 2400);
  try {
    const canvas = renderPassportGridToCanvas(decoded.bitmap, {paper: opts.paper, count: opts.count});
    return await canvasToBlob(canvas, opts.format, opts.quality);
  } finally {
    decoded.bitmap.close();
  }
}

/* ---------- 6. Animated GIF Maker (GIF_MAKE & Convert -> GIF) ---------- */

export async function createAnimatedGifBlob(
  files: Blob[],
  opts: {fps: number; maxDim: number},
  onProgress?: (ratio: number, step: string) => void
): Promise<Blob> {
  if (files.length === 0) throw new Error('No images provided.');
  const targetMax = Math.min(1080, Math.max(160, opts.maxDim || 600));
  const decoded: DecodedImage[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      onProgress?.((i / files.length) * 0.5, `Kare ${i + 1} / ${files.length}`);
      decoded.push(await decodeImage(files[i], targetMax));
    }

    const baseW = decoded[0].width;
    const baseH = decoded[0].height;
    const frames: ImageData[] = [];

    for (let i = 0; i < decoded.length; i++) {
      const {canvas, ctx} = createCanvas(baseW, baseH, true);
      const bmp = decoded[i].bitmap;
      const scale = Math.min(baseW / bmp.width, baseH / bmp.height);
      const dw = Math.round(bmp.width * scale);
      const dh = Math.round(bmp.height * scale);
      ctx.drawImage(bmp, Math.round((baseW - dw) / 2), Math.round((baseH - dh) / 2), dw, dh);
      frames.push(ctx.getImageData(0, 0, baseW, baseH));
    }

    onProgress?.(0.75, 'GIF kodlanıyor…');
    const delayCs = Math.max(4, Math.round(100 / Math.max(0.5, opts.fps || 4)));
    return encodeGif89a(frames, delayCs, 0);
  } finally {
    decoded.forEach((d) => d.bitmap.close());
  }
}

/* ---------- 7. App & Web Favicon Pack ZIP (ICON_PACK) ---------- */

export async function generateIconPackZipBlob(
  file: Blob,
  baseName: string,
  onProgress?: (ratio: number, step: string) => void
): Promise<Blob> {
  const decoded = await decodeImage(file, 1024);
  try {
    const renderSquare = (size: number): HTMLCanvasElement => {
      const {canvas, ctx} = createCanvas(size, size, false);
      const scale = Math.max(size / decoded.width, size / decoded.height);
      const dw = decoded.width * scale;
      const dh = decoded.height * scale;
      ctx.drawImage(decoded.bitmap, (size - dw) / 2, (size - dh) / 2, dw, dh);
      return canvas;
    };

    onProgress?.(0.2, 'favicon.ico');
    const zip = new JSZip();
    const base512 = renderSquare(512);
    const icoBlob = await encodeMultiSizeIcoFromCanvas(base512, [16, 32, 48, 256]);
    zip.file('favicon.ico', icoBlob);

    const pngSizes: Array<{size: number; name: string}> = [
      {size: 16, name: 'favicon-16x16.png'},
      {size: 32, name: 'favicon-32x32.png'},
      {size: 180, name: 'apple-touch-icon.png'},
      {size: 192, name: 'icon-192x192.png'},
      {size: 512, name: 'icon-512x512.png'},
    ];

    for (let i = 0; i < pngSizes.length; i++) {
      onProgress?.(0.3 + (i / pngSizes.length) * 0.5, pngSizes[i].name);
      const sq = pngSizes[i].size === 512 ? base512 : renderSquare(pngSizes[i].size);
      const png = await canvasToBlob(sq, 'png', 100);
      zip.file(pngSizes[i].name, png);
    }

    const manifest = {
      name: baseName || 'App',
      short_name: baseName || 'App',
      icons: [
        {src: '/icon-192x192.png', sizes: '192x192', type: 'image/png'},
        {src: '/icon-512x512.png', sizes: '512x512', type: 'image/png'},
      ],
      display: 'standalone',
    };
    zip.file('site.webmanifest', JSON.stringify(manifest, null, 2));

    const htmlSnippet = [
      '<link rel="icon" href="/favicon.ico" sizes="any">',
      '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
      '<link rel="manifest" href="/site.webmanifest">',
    ].join('\n');
    zip.file('head-tags.html', htmlSnippet);

    onProgress?.(0.9, 'ZIP');
    return await zip.generateAsync({type: 'blob', compression: 'DEFLATE'});
  } finally {
    decoded.bitmap.close();
  }
}

/* ---------- Binary Encoders: Multi-Size ICO, Standalone SVG, GIF89a LZW, BMP24 ---------- */

async function encodeMultiSizeIcoFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  sizes: number[] = [16, 32, 48, 256]
): Promise<Blob> {
  const pngBuffers: Array<{size: number; bytes: Uint8Array}> = [];
  for (const sz of sizes) {
    const {canvas, ctx} = createCanvas(sz, sz, false);
    const scale = Math.min(sz / sourceCanvas.width, sz / sourceCanvas.height);
    const dw = sourceCanvas.width * scale;
    const dh = sourceCanvas.height * scale;
    ctx.drawImage(sourceCanvas, (sz - dw) / 2, (sz - dh) / 2, dw, dh);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png');
    });
    pngBuffers.push({size: sz, bytes: new Uint8Array(await pngBlob.arrayBuffer())});
  }

  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  const totalSize = headerSize + pngBuffers.reduce((s, p) => s + p.bytes.length, 0);
  const out = new ArrayBuffer(totalSize);
  const view = new DataView(out);
  const outBytes = new Uint8Array(out);

  // ICONDIR header
  view.setUint16(0, 0, true); // Reserved
  view.setUint16(2, 1, true); // Type 1 = ICO
  view.setUint16(4, count, true);

  let dataOffset = headerSize;
  pngBuffers.forEach((entry, idx) => {
    const dirPos = 6 + idx * 16;
    const dimByte = entry.size >= 256 ? 0 : entry.size;
    view.setUint8(dirPos, dimByte);
    view.setUint8(dirPos + 1, dimByte);
    view.setUint8(dirPos + 2, 0); // Palette count
    view.setUint8(dirPos + 3, 0); // Reserved
    view.setUint16(dirPos + 4, 1, true); // Color planes
    view.setUint16(dirPos + 6, 32, true); // Bits per pixel
    view.setUint32(dirPos + 8, entry.bytes.length, true);
    view.setUint32(dirPos + 12, dataOffset, true);
    outBytes.set(entry.bytes, dataOffset);
    dataOffset += entry.bytes.length;
  });

  return new Blob([out], {type: 'image/x-icon'});
}

async function encodeSvgFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png');
  });
  const bytes = new Uint8Array(await pngBlob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  const w = canvas.width;
  const h = canvas.height;
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `  <image width="${w}" height="${h}" href="data:image/png;base64,${b64}" />`,
    '</svg>',
  ].join('\n');
  return new Blob([svg], {type: 'image/svg+xml'});
}

function buildGifGlobalPalette(): Uint8Array {
  // 216 web-safe 6x6x6 RGB cube + 40 fine grayscale steps = 256 colors
  const pal = new Uint8Array(256 * 3);
  let idx = 0;
  const levels = [0, 51, 102, 153, 204, 255];
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        pal[idx * 3] = levels[r];
        pal[idx * 3 + 1] = levels[g];
        pal[idx * 3 + 2] = levels[b];
        idx++;
      }
    }
  }
  for (let i = 0; i < 40; i++) {
    const v = Math.round((i / 39) * 255);
    pal[idx * 3] = v;
    pal[idx * 3 + 1] = v;
    pal[idx * 3 + 2] = v;
    idx++;
  }
  return pal;
}

function quantizeFrameToPalette(frame: ImageData): Uint8Array {
  const {data, width, height} = frame;
  const total = width * height;
  const indices = new Uint8Array(total);
  for (let p = 0; p < total; p++) {
    const r = data[p * 4];
    const g = data[p * 4 + 1];
    const b = data[p * 4 + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    if (maxC - minC <= 10) {
      // Near-neutral -> map to 40-step grayscale ramp (indices 216..255) for ultra-smooth grays
      const lum = Math.round((0.299 * r + 0.587 * g + 0.114 * b) * (39 / 255));
      indices[p] = 216 + Math.min(39, Math.max(0, lum));
    } else {
      const ri = Math.round((r * 5) / 255);
      const gi = Math.round((g * 5) / 255);
      const bi = Math.round((b * 5) / 255);
      indices[p] = ri * 36 + gi * 6 + bi;
    }
  }
  return indices;
}

function lzwEncodeIndices(indices: Uint8Array): Uint8Array {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize; // 256
  const eoiCode = clearCode + 1; // 257

  const bytes: number[] = [minCodeSize];
  let subBlock: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const flushSubBlock = () => {
    if (subBlock.length > 0) {
      bytes.push(subBlock.length, ...subBlock);
      subBlock = [];
    }
  };

  const writeCode = (code: number, size: number) => {
    bitBuffer |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      subBlock.push(bitBuffer & 0xff);
      if (subBlock.length === 255) flushSubBlock();
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  // Flat typed-array trie (4096 states * 256 children) -> O(1) lookup, zero string allocation
  const table = new Int16Array(4096 * 256);
  table.fill(-1);
  let nextCode = eoiCode + 1;
  let codeSize = minCodeSize + 1;

  writeCode(clearCode, codeSize);
  if (indices.length === 0) {
    writeCode(eoiCode, codeSize);
  } else {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      const hit = table[key];
      if (hit !== -1) {
        prefix = hit;
      } else {
        writeCode(prefix, codeSize);
        if (nextCode < 4096) {
          table[key] = nextCode;
          if (nextCode === 1 << codeSize && codeSize < 12) {
            codeSize++;
          }
          nextCode++;
        } else {
          writeCode(clearCode, codeSize);
          table.fill(-1);
          nextCode = eoiCode + 1;
          codeSize = minCodeSize + 1;
        }
        prefix = k;
      }
    }
    writeCode(prefix, codeSize);
    writeCode(eoiCode, codeSize);
  }

  if (bitCount > 0) {
    subBlock.push(bitBuffer & 0xff);
  }
  flushSubBlock();
  bytes.push(0x00); // Block terminator
  return new Uint8Array(bytes);
}

export function encodeGif89a(frames: ImageData[], delayCs = 20, loop = 0): Blob {
  if (frames.length === 0) throw new Error('No GIF frames');
  const width = frames[0].width;
  const height = frames[0].height;
  const palette = buildGifGlobalPalette();
  const chunks: Uint8Array[] = [];

  // Header + Logical Screen Descriptor (Global Color Table flag = 1, 256 colors -> 0xF7)
  const header = new Uint8Array(13);
  header.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // "GIF89a"
  header[6] = width & 0xff;
  header[7] = (width >> 8) & 0xff;
  header[8] = height & 0xff;
  header[9] = (height >> 8) & 0xff;
  header[10] = 0xf7;
  header[11] = 0;
  header[12] = 0;
  chunks.push(header, palette);

  if (frames.length > 1) {
    // NETSCAPE2.0 looping application extension
    chunks.push(
      new Uint8Array([
        0x21, 0xff, 0x0b,
        0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
        0x03, 0x01,
        loop & 0xff,
        (loop >> 8) & 0xff,
        0x00,
      ])
    );
  }

  for (const frame of frames) {
    // Graphic Control Extension + Image Descriptor
    const gceAndDesc = new Uint8Array([
      0x21, 0xf9, 0x04, 0x04,
      delayCs & 0xff,
      (delayCs >> 8) & 0xff,
      0x00, 0x00,
      0x2c,
      0x00, 0x00, 0x00, 0x00,
      width & 0xff, (width >> 8) & 0xff,
      height & 0xff, (height >> 8) & 0xff,
      0x00,
    ]);
    const indices = quantizeFrameToPalette(frame);
    const lzw = lzwEncodeIndices(indices);
    chunks.push(gceAndDesc, lzw);
  }

  chunks.push(new Uint8Array([0x3b])); // Trailer
  return new Blob(chunks as BlobPart[], {type: 'image/gif'});
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function encodeBmp24(canvas: HTMLCanvasElement): Blob {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const {width, height} = canvas;
  const imgData = ctx.getImageData(0, 0, width, height).data;
  const rowSize = (width * 3 + 3) & ~3;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // BITMAPFILEHEADER
  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4d);
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);

  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelDataSize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);

  const bytes = new Uint8Array(buffer);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const si = srcRow + x * 4;
      const di = dstRow + x * 3;
      bytes[di] = imgData[si + 2];
      bytes[di + 1] = imgData[si + 1];
      bytes[di + 2] = imgData[si];
    }
  }
  return new Blob([buffer], {type: 'image/bmp'});
}
