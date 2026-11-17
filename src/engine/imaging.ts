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

  const hasAlpha = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/svg+xml';
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
  return f === 'jpg' || f === 'bmp';
}

export async function convertImageBlob(
  file: Blob,
  format: string,
  quality: number,
  maxDim?: number
): Promise<Blob> {
  const decoded = await decodeImage(file, maxDim);
  try {
    const {canvas, ctx} = createCanvas(decoded.width, decoded.height, needsWhiteBackdrop(format));
    ctx.drawImage(decoded.bitmap, 0, 0);
    return await canvasToBlob(canvas, format, quality);
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
  const format = ENCODABLE_IMAGE_FORMATS.includes(ext.toLowerCase()) ? normalizeImageFormat(ext) : 'jpg';
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

    // Fast binary search on quality + gradual downscale if needed
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
  const format = ENCODABLE_IMAGE_FORMATS.includes(ext.toLowerCase()) ? normalizeImageFormat(ext) : 'jpg';
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
  const format = ENCODABLE_IMAGE_FORMATS.includes(ext.toLowerCase()) ? normalizeImageFormat(ext) : 'jpg';
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
