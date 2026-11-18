import {
  ENCODABLE_IMAGE_FORMATS,
  ExportItem,
  ExportResult,
  PickedFile,
  ServerToolDef,
  ToolId,
  createId,
  mimeFromExt,
} from '../data/models';
import {createZipArchive, extractZipArchive} from './archiveOps';
import {runLocalFfmpegTool} from './ffmpegOps';
import {BatchRenameRules, computeBatchRenamedNames, generateFileHashReportBlob} from './fileInspector';
import {
  FilterPreset,
  RedactBox,
  RedactStyle,
  ScanMode,
  SocialAspect,
  SocialFillMode,
  WatermarkPosition,
  collageImagesBlob,
  compressImageBlob,
  convertImageBlob,
  createAnimatedGifBlob,
  cropImageBlob,
  editImageBlob,
  filterImageBlob,
  frameImageBlob,
  generateIconPackZipBlob,
  normalizeImageFormat,
  passportGridImageBlob,
  redactImageBlob,
  scanDocImageBlob,
  socialFitImageBlob,
  splitImageGridBlobs,
  watermarkImageBlob,
} from './imaging';
import {
  convertTableDataBlob,
  documentToDocxBlob,
  documentToHtmlBlob,
  documentToPdfBlob,
  documentToTextBlob,
  pdfToDocxBlob,
} from './officeOps';
import {
  extractOrReversePdfBlob,
  grayscalePdfBlob,
  imagesToPdfBlob,
  mergePdfsBlob,
  nUpPdfBlob,
  optimizeOrStripPdfBlob,
  pdfToHtmlBlob,
  pdfToImagesBlobs,
  pdfToTextBlob,
  removePdfPagesBlob,
  rotatePdfBlob,
  splitPdfBlobs,
  stampPdfBlob,
  watermarkPdfBlob,
} from './pdfOps';

export type ToolOptions =
  | {kind: 'none'}
  | {kind: 'convert'; format: string; quality: number; maxDim?: number}
  | {kind: 'compress'; quality: number; maxDim?: number; targetPercent?: number}
  | {kind: 'strip'; format: string; quality: number}
  | {kind: 'edit'; rotate: number; flipH: boolean; flipV: boolean; scalePercent: number; quality: number}
  | {kind: 'crop'; left: number; top: number; right: number; bottom: number; quality?: number}
  | {
      kind: 'filters';
      preset: FilterPreset;
      brightness: number;
      contrast: number;
      saturation: number;
      blur: number;
      format: string;
      quality: number;
    }
  | {
      kind: 'watermark';
      text: string;
      position: WatermarkPosition;
      opacity: number;
      scale: number;
      color: string;
      format: string;
      quality: number;
    }
  | {kind: 'frame'; color: string; padding: number; radius: number; shadow: boolean; format: string; quality?: number}
  | {kind: 'collage'; columns: number; gap: number; color: string; format: string; quality?: number}
  | {kind: 'scanDoc'; mode: ScanMode; strength: number; format: string; quality: number}
  | {
      kind: 'socialFit';
      aspect: SocialAspect;
      fillMode: SocialFillMode;
      color: string;
      format: string;
      quality: number;
    }
  | {
      kind: 'redact';
      boxes: RedactBox[];
      style: RedactStyle;
      strength: number;
      format: string;
      quality: number;
    }
  | {kind: 'gridSplit'; cols: number; rows: number; format: string; quality: number}
  | {kind: 'gifMake'; fps: number; maxDim: number}
  | {kind: 'passportGrid'; paper: '10x15' | 'a4'; count: 4 | 8 | 9; format: string; quality: number}
  | {kind: 'pdfSplit'; everyN: number; ranges: string}
  | {kind: 'pdfRemovePages'; ranges: string}
  | {kind: 'pdfExtractPages'; mode: 'custom' | 'reverse'; ranges: string}
  | {kind: 'pdfRotate'; degrees: number}
  | {kind: 'pdfWatermark'; text: string; opacity: number; color: string; position: 'diagonal' | 'center'}
  | {kind: 'pdfNup'; pagesPerSheet: 2 | 4}
  | {kind: 'pdfStamp'; text: string; pageNumbers: boolean; position: 'bottom' | 'top'}
  | {kind: 'pdfToImages'; format: string; quality: number; maxDim?: number}
  | {kind: 'batchRename'; rules: BatchRenameRules}
  | {kind: 'fileHashInfo'; format: 'txt' | 'json'};

interface RawOutput {
  name: string;
  blob: Blob;
}

export async function runLocalTool(
  tool: ToolId,
  toolTitle: string,
  files: PickedFile[],
  options: ToolOptions,
  onProgress: (progress: number, step: string) => void,
  signal?: AbortSignal
): Promise<ExportResult> {
  if (files.length === 0) throw new Error('Nothing to export.');
  const checkAbort = () => {
    if (signal?.aborted) throw new Error('Cancelled');
  };

  const sourceBytes = files.reduce((sum, f) => sum + f.size, 0);
  const outputs: RawOutput[] = [];

  switch (tool) {
    case 'CONVERT': {
      const opts = options.kind === 'convert' ? options : {kind: 'convert' as const, format: 'jpg', quality: 90};
      const ext = normalizeImageFormat(opts.format);
      if (ext === 'gif' && files.length > 1) {
        const gifBlob = await createAnimatedGifBlob(
          files.map((f) => f.file),
          {fps: 4, maxDim: opts.maxDim || 720},
          (r, step) => onProgress(r, step)
        );
        outputs.push({name: `${files[0].baseName}-animated.gif`, blob: gifBlob});
      } else {
        for (let i = 0; i < files.length; i++) {
          checkAbort();
          onProgress(i / files.length, files[i].name);
          const blob = await convertImageBlob(files[i].file, ext, opts.quality, opts.maxDim);
          outputs.push({name: `${files[i].baseName}.${ext}`, blob});
        }
      }
      break;
    }

    case 'COMPRESS': {
      if (files[0].kind === 'pdf') {
        for (let i = 0; i < files.length; i++) {
          checkAbort();
          onProgress(i / files.length, files[i].name);
          const blob = await optimizeOrStripPdfBlob(files[i].file);
          outputs.push({name: `${files[i].baseName}-optimized.pdf`, blob});
        }
      } else {
        const opts = options.kind === 'compress' ? options : {kind: 'compress' as const, quality: 82};
        for (let i = 0; i < files.length; i++) {
          checkAbort();
          onProgress(i / files.length, files[i].name);
          const {blob, format} = await compressImageBlob(
            files[i].file,
            files[i].ext,
            opts.quality,
            opts.maxDim,
            opts.targetPercent
          );
          outputs.push({name: `${files[i].baseName}-compressed.${format}`, blob});
        }
      }
      break;
    }

    case 'METADATA': {
      const opts = options.kind === 'strip' ? options : {kind: 'strip' as const, format: 'jpg', quality: 95};
      for (let i = 0; i < files.length; i++) {
        checkAbort();
        onProgress(i / files.length, files[i].name);
        if (files[i].kind === 'pdf') {
          const blob = await optimizeOrStripPdfBlob(files[i].file);
          outputs.push({name: `${files[i].baseName}-clean.pdf`, blob});
        } else {
          const candidateFmt = ENCODABLE_IMAGE_FORMATS.includes(files[i].ext)
            ? normalizeImageFormat(files[i].ext)
            : opts.format;
          const fmt = ['ico', 'svg'].includes(candidateFmt) ? 'png' : candidateFmt;
          const blob = await convertImageBlob(files[i].file, fmt, opts.quality);
          outputs.push({name: `${files[i].baseName}-clean.${fmt}`, blob});
        }
      }
      break;
    }

    case 'EDIT': {
      const opts =
        options.kind === 'edit'
          ? options
          : {kind: 'edit' as const, rotate: 0, flipH: false, flipV: false, scalePercent: 100, quality: 92};
      onProgress(0.3, files[0].name);
      const {blob, format} = await editImageBlob(files[0].file, files[0].ext, opts);
      outputs.push({name: `${files[0].baseName}-edited.${format}`, blob});
      break;
    }

    case 'CROP': {
      if (options.kind !== 'crop') throw new Error('Invalid crop options.');
      onProgress(0.35, files[0].name);
      const {blob, format} = await cropImageBlob(files[0].file, files[0].ext, options, options.quality ?? 92);
      outputs.push({name: `${files[0].baseName}-cropped.${format}`, blob});
      break;
    }

    case 'FILTERS': {
      const opts =
        options.kind === 'filters'
          ? options
          : {
              kind: 'filters' as const,
              preset: 'none' as const,
              brightness: 100,
              contrast: 100,
              saturation: 100,
              blur: 0,
              format: 'jpg',
              quality: 92,
            };
      const fmt = normalizeImageFormat(opts.format);
      for (let i = 0; i < files.length; i++) {
        checkAbort();
        onProgress(i / files.length, files[i].name);
        const blob = await filterImageBlob(files[i].file, {...opts, format: fmt});
        outputs.push({name: `${files[i].baseName}-filtered.${fmt}`, blob});
      }
      break;
    }

    case 'WATERMARK': {
      const opts =
        options.kind === 'watermark'
          ? options
          : {
              kind: 'watermark' as const,
              text: 'Morph',
              position: 'bottom-right' as const,
              opacity: 75,
              scale: 1,
              color: '#FFFFFF',
              format: 'jpg',
              quality: 92,
            };
      const fmt = normalizeImageFormat(opts.format);
      for (let i = 0; i < files.length; i++) {
        checkAbort();
        onProgress(i / files.length, files[i].name);
        const blob = await watermarkImageBlob(files[i].file, {...opts, format: fmt});
        outputs.push({name: `${files[i].baseName}-marked.${fmt}`, blob});
      }
      break;
    }

    case 'FRAME': {
      const opts =
        options.kind === 'frame'
          ? options
          : {kind: 'frame' as const, color: '#192B43', padding: 48, radius: 24, shadow: true, format: 'jpg'};
      onProgress(0.35, files[0].name);
      const fmt = normalizeImageFormat(opts.format);
      const blob = await frameImageBlob(files[0].file, {
        backgroundColor: opts.color,
        padding: opts.padding,
        radius: opts.radius,
        shadow: opts.shadow,
        format: fmt,
        quality: opts.quality ?? 92,
      });
      outputs.push({name: `${files[0].baseName}-framed.${fmt}`, blob});
      break;
    }

    case 'COLLAGE': {
      const opts =
        options.kind === 'collage'
          ? options
          : {kind: 'collage' as const, columns: 2, gap: 16, color: '#101D31', format: 'jpg'};
      const fmt = normalizeImageFormat(opts.format);
      const blob = await collageImagesBlob(
        files.map((f) => f.file),
        {
          columns: opts.columns,
          gap: opts.gap,
          backgroundColor: opts.color,
          format: fmt,
          quality: opts.quality ?? 92,
        },
        (r) => onProgress(r, files[0].name)
      );
      outputs.push({name: `${files[0].baseName}-collage.${fmt}`, blob});
      break;
    }

    case 'SCAN_DOC': {
      const opts =
        options.kind === 'scanDoc'
          ? options
          : {kind: 'scanDoc' as const, mode: 'bw' as const, strength: 65, format: 'jpg', quality: 92};
      if (opts.format.toLowerCase() === 'pdf') {
        const scannedPages: Blob[] = [];
        for (let i = 0; i < files.length; i++) {
          checkAbort();
          onProgress((i / files.length) * 0.75, files[i].name);
          scannedPages.push(
            await scanDocImageBlob(files[i].file, {
              mode: opts.mode,
              strength: opts.strength,
              format: 'jpg',
              quality: opts.quality,
            })
          );
        }
        const pdfBlob = await imagesToPdfBlob(scannedPages, (r) => onProgress(0.75 + r * 0.2, 'PDF'));
        outputs.push({name: `${files[0].baseName}-scanned.pdf`, blob: pdfBlob});
      } else {
        const fmt = normalizeImageFormat(opts.format);
        for (let i = 0; i < files.length; i++) {
          checkAbort();
          onProgress(i / files.length, files[i].name);
          const blob = await scanDocImageBlob(files[i].file, {
            mode: opts.mode,
            strength: opts.strength,
            format: fmt,
            quality: opts.quality,
          });
          outputs.push({name: `${files[i].baseName}-scan.${fmt}`, blob});
        }
      }
      break;
    }

    case 'SOCIAL_FIT': {
      const opts =
        options.kind === 'socialFit'
          ? options
          : {
              kind: 'socialFit' as const,
              aspect: '4:5' as const,
              fillMode: 'blur' as const,
              color: '#101D31',
              format: 'jpg',
              quality: 92,
            };
      const fmt = normalizeImageFormat(opts.format);
      const ratioSlug = opts.aspect.replace(':', 'x');
      for (let i = 0; i < files.length; i++) {
        checkAbort();
        onProgress(i / files.length, files[i].name);
        const blob = await socialFitImageBlob(files[i].file, {...opts, format: fmt});
        outputs.push({name: `${files[i].baseName}-${ratioSlug}.${fmt}`, blob});
      }
      break;
    }

    case 'REDACT': {
      const opts =
        options.kind === 'redact'
          ? options
          : {
              kind: 'redact' as const,
              boxes: [{x: 0.25, y: 0.35, w: 0.5, h: 0.25}],
              style: 'pixelate' as const,
              strength: 60,
              format: 'jpg',
              quality: 92,
            };
      onProgress(0.4, files[0].name);
      const fmt = normalizeImageFormat(opts.format);
      const blob = await redactImageBlob(files[0].file, {...opts, format: fmt});
      outputs.push({name: `${files[0].baseName}-redacted.${fmt}`, blob});
      break;
    }

    case 'IMAGE_GRID_SPLIT': {
      const opts =
        options.kind === 'gridSplit'
          ? options
          : {kind: 'gridSplit' as const, cols: 3, rows: 1, format: 'jpg', quality: 92};
      const tiles = await splitImageGridBlobs(
        files[0].file,
        files[0].baseName,
        opts.cols,
        opts.rows,
        opts.format,
        opts.quality,
        (r, step) => onProgress(r, step)
      );
      outputs.push(...tiles);
      break;
    }

    case 'GIF_MAKE': {
      const opts =
        options.kind === 'gifMake' ? options : {kind: 'gifMake' as const, fps: 4, maxDim: 720};
      const blob = await createAnimatedGifBlob(
        files.map((f) => f.file),
        {fps: opts.fps, maxDim: opts.maxDim},
        (r, step) => onProgress(r, step)
      );
      outputs.push({name: `${files[0].baseName}-anim.gif`, blob});
      break;
    }

    case 'PASSPORT_GRID': {
      const opts =
        options.kind === 'passportGrid'
          ? options
          : {kind: 'passportGrid' as const, paper: '10x15' as const, count: 8 as const, format: 'jpg', quality: 95};
      onProgress(0.45, files[0].name);
      if (opts.format.toLowerCase() === 'pdf') {
        const sheetJpg = await passportGridImageBlob(files[0].file, {
          paper: opts.paper,
          count: opts.count,
          format: 'jpg',
          quality: 95,
        });
        const pdfBlob = await imagesToPdfBlob([sheetJpg]);
        outputs.push({name: `${files[0].baseName}-id-print-${opts.paper}.pdf`, blob: pdfBlob});
      } else {
        const fmt = normalizeImageFormat(opts.format);
        const blob = await passportGridImageBlob(files[0].file, {...opts, format: fmt});
        outputs.push({name: `${files[0].baseName}-id-print-${opts.paper}.${fmt}`, blob});
      }
      break;
    }

    case 'ICON_PACK': {
      const zipBlob = await generateIconPackZipBlob(files[0].file, files[0].baseName, (r, step) =>
        onProgress(r, step)
      );
      outputs.push({name: `${files[0].baseName}-icon-pack.zip`, blob: zipBlob});
      break;
    }

    case 'PDF_CREATE': {
      const blob = await imagesToPdfBlob(
        files.map((f) => f.file),
        (r) => onProgress(r, files[0].name)
      );
      outputs.push({name: `${files[0].baseName}.pdf`, blob});
      break;
    }

    case 'PDF_MERGE': {
      const blob = await mergePdfsBlob(
        files.map((f) => f.file),
        (r) => onProgress(r, files[0].name)
      );
      outputs.push({name: `${files[0].baseName}-merged.pdf`, blob});
      break;
    }

    case 'PDF_SPLIT': {
      const opts = options.kind === 'pdfSplit' ? options : {kind: 'pdfSplit' as const, everyN: 1, ranges: ''};
      const parts = await splitPdfBlobs(files[0].file, opts.everyN, opts.ranges, files[0].baseName, (r) =>
        onProgress(r, files[0].name)
      );
      outputs.push(...parts);
      break;
    }

    case 'PDF_REMOVE_PAGES': {
      const opts =
        options.kind === 'pdfRemovePages' ? options : {kind: 'pdfRemovePages' as const, ranges: '1'};
      const blob = await removePdfPagesBlob(files[0].file, opts.ranges, (r) => onProgress(r, files[0].name));
      outputs.push({name: `${files[0].baseName}-trimmed.pdf`, blob});
      break;
    }

    case 'PDF_EXTRACT_PAGES': {
      const opts =
        options.kind === 'pdfExtractPages'
          ? options
          : {kind: 'pdfExtractPages' as const, mode: 'reverse' as const, ranges: ''};
      const blob = await extractOrReversePdfBlob(files[0].file, opts.mode, opts.ranges, (r) =>
        onProgress(r, files[0].name)
      );
      const suffix = opts.mode === 'reverse' ? 'reversed' : 'extracted';
      outputs.push({name: `${files[0].baseName}-${suffix}.pdf`, blob});
      break;
    }

    case 'PDF_ROTATE': {
      const opts = options.kind === 'pdfRotate' ? options : {kind: 'pdfRotate' as const, degrees: 90};
      onProgress(0.35, files[0].name);
      const blob = await rotatePdfBlob(files[0].file, opts.degrees);
      outputs.push({name: `${files[0].baseName}-rotated.pdf`, blob});
      break;
    }

    case 'PDF_WATERMARK': {
      const opts =
        options.kind === 'pdfWatermark'
          ? options
          : {
              kind: 'pdfWatermark' as const,
              text: 'ÖRNEK',
              opacity: 28,
              color: '#64748B',
              position: 'diagonal' as const,
            };
      onProgress(0.4, files[0].name);
      const blob = await watermarkPdfBlob(files[0].file, opts);
      outputs.push({name: `${files[0].baseName}-watermarked.pdf`, blob});
      break;
    }

    case 'PDF_GRAYSCALE': {
      const blob = await grayscalePdfBlob(files[0].file, (r, step) => onProgress(r, step));
      outputs.push({name: `${files[0].baseName}-grayscale.pdf`, blob});
      break;
    }

    case 'PDF_NUP': {
      const opts = options.kind === 'pdfNup' ? options : {kind: 'pdfNup' as const, pagesPerSheet: 2 as const};
      const blob = await nUpPdfBlob(files[0].file, opts.pagesPerSheet, (r) => onProgress(r, files[0].name));
      outputs.push({name: `${files[0].baseName}-${opts.pagesPerSheet}up.pdf`, blob});
      break;
    }

    case 'PDF_OPTIMIZE': {
      onProgress(0.35, files[0].name);
      const blob = await optimizeOrStripPdfBlob(files[0].file);
      outputs.push({name: `${files[0].baseName}-optimized.pdf`, blob});
      break;
    }

    case 'PDF_STAMP': {
      const opts =
        options.kind === 'pdfStamp'
          ? options
          : {kind: 'pdfStamp' as const, text: '', pageNumbers: true, position: 'bottom' as const};
      onProgress(0.4, files[0].name);
      const blob = await stampPdfBlob(files[0].file, opts);
      outputs.push({name: `${files[0].baseName}-stamped.pdf`, blob});
      break;
    }

    case 'PDF_TO_IMAGES': {
      const opts =
        options.kind === 'pdfToImages'
          ? options
          : {kind: 'pdfToImages' as const, format: 'jpg', quality: 92};
      for (let i = 0; i < files.length; i++) {
        checkAbort();
        const pages = await pdfToImagesBlobs(
          files[i].file,
          files[i].baseName,
          opts.format,
          opts.quality,
          opts.maxDim,
          (r, step) => onProgress((i + r) / files.length, step)
        );
        outputs.push(...pages);
      }
      break;
    }

    case 'ZIP_CREATE': {
      const blob = await createZipArchive(files, (r, step) => onProgress(r, step));
      outputs.push({name: `${files[0].baseName}-archive.zip`, blob});
      break;
    }

    case 'ZIP_EXTRACT': {
      const extracted = await extractZipArchive(files[0].file, (r, step) => onProgress(r, step));
      outputs.push(...extracted);
      break;
    }

    case 'BATCH_RENAME': {
      const rules: BatchRenameRules =
        options.kind === 'batchRename'
          ? options.rules
          : {
              baseName: '',
              prefix: '',
              suffix: '',
              findText: '',
              replaceText: '',
              numbering: true,
              startNumber: 1,
              letterCase: 'keep',
            };
      const renamed = computeBatchRenamedNames(files, rules);
      for (let i = 0; i < files.length; i++) {
        checkAbort();
        onProgress(i / files.length, renamed[i].newName);
        outputs.push({
          name: renamed[i].newName,
          blob: new Blob([files[i].file], {type: files[i].mime || mimeFromExt(files[i].ext)}),
        });
      }
      break;
    }

    case 'FILE_HASH_INFO': {
      const fmt = options.kind === 'fileHashInfo' ? options.format : 'txt';
      const report = await generateFileHashReportBlob(files, fmt, (r, step) => onProgress(r, step));
      outputs.push(report);
      break;
    }
  }

  checkAbort();
  onProgress(1, 'Done');
  const now = Date.now();
  const items: ExportItem[] = outputs.map((out) => {
    const ext = out.name.includes('.') ? out.name.split('.').pop()! : '';
    const mime = out.blob.type || mimeFromExt(ext);
    return {
      id: createId(),
      name: out.name,
      mime,
      size: out.blob.size,
      createdAt: now,
      tool: toolTitle,
      blob: out.blob,
      previewUrl: mime.startsWith('image/') ? URL.createObjectURL(out.blob) : undefined,
    };
  });

  return {
    items,
    tool: toolTitle,
    sourceBytes,
  };
}

export async function runEmbeddedMediaTool(
  tool: ServerToolDef,
  toolTitle: string,
  files: PickedFile[],
  options: Record<string, string>,
  onProgress: (progress: number, step: string) => void,
  signal?: AbortSignal
): Promise<ExportResult> {
  if (files.length === 0) throw new Error('Nothing to export.');
  const checkAbort = () => {
    if (signal?.aborted) throw new Error('Cancelled');
  };

  const sourceBytes = files.reduce((sum, f) => sum + f.size, 0);
  let outputs: RawOutput[] = [];

  if (tool.id === 'office_to_pdf') {
    for (let i = 0; i < files.length; i++) {
      checkAbort();
      const blob = await documentToPdfBlob(files[i], (r) =>
        onProgress((i + r) / files.length, files[i].name)
      );
      outputs.push({name: `${files[i].baseName}.pdf`, blob});
    }
  } else if (tool.id === 'doc_to_docx') {
    for (let i = 0; i < files.length; i++) {
      checkAbort();
      const blob = await documentToDocxBlob(files[i], (r) =>
        onProgress((i + r) / files.length, files[i].name)
      );
      outputs.push({name: `${files[i].baseName}.docx`, blob});
    }
  } else if (tool.id === 'doc_to_html') {
    for (let i = 0; i < files.length; i++) {
      checkAbort();
      onProgress((i + 0.5) / files.length, files[i].name);
      const blob = await documentToHtmlBlob(files[i]);
      outputs.push({name: `${files[i].baseName}.html`, blob});
    }
  } else if (tool.id === 'table_convert') {
    const fmt = (options.format === 'json' || options.format === 'html' ? options.format : 'csv') as
      | 'csv'
      | 'json'
      | 'html';
    for (let i = 0; i < files.length; i++) {
      checkAbort();
      onProgress((i + 0.5) / files.length, files[i].name);
      const blob = await convertTableDataBlob(files[i], fmt);
      outputs.push({name: `${files[i].baseName}.${fmt}`, blob});
    }
  } else if (tool.id === 'office_to_text') {
    for (let i = 0; i < files.length; i++) {
      checkAbort();
      onProgress((i + 0.5) / files.length, files[i].name);
      const blob = await documentToTextBlob(files[i]);
      outputs.push({name: `${files[i].baseName}.txt`, blob});
    }
  } else if (tool.id === 'pdf_to_docx') {
    for (let i = 0; i < files.length; i++) {
      checkAbort();
      const blob = await pdfToDocxBlob(files[i].file, (r) =>
        onProgress((i + r) / files.length, files[i].name)
      );
      outputs.push({name: `${files[i].baseName}.docx`, blob});
    }
  } else if (tool.id === 'pdf_to_txt') {
    for (let i = 0; i < files.length; i++) {
      checkAbort();
      const blob = await pdfToTextBlob(files[i].file, (r) =>
        onProgress((i + r) / files.length, files[i].name)
      );
      outputs.push({name: `${files[i].baseName}.txt`, blob});
    }
  } else if (tool.id === 'pdf_to_html') {
    for (let i = 0; i < files.length; i++) {
      checkAbort();
      const blob = await pdfToHtmlBlob(files[i].file, files[i].baseName, (r) =>
        onProgress((i + r) / files.length, files[i].name)
      );
      outputs.push({name: `${files[i].baseName}.html`, blob});
    }
  } else {
    outputs = await runLocalFfmpegTool(tool.id, files, options, onProgress, signal);
  }

  checkAbort();
  onProgress(1, 'Done');
  const now = Date.now();
  const items: ExportItem[] = outputs.map((out) => {
    const ext = out.name.includes('.') ? out.name.split('.').pop()! : '';
    const mime = out.blob.type || mimeFromExt(ext);
    return {
      id: createId(),
      name: out.name,
      mime,
      size: out.blob.size,
      createdAt: now,
      tool: toolTitle,
      blob: out.blob,
      previewUrl: mime.startsWith('image/') ? URL.createObjectURL(out.blob) : undefined,
    };
  });

  return {
    items,
    tool: toolTitle,
    sourceBytes,
  };
}
