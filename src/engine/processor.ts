import {ENCODABLE_IMAGE_FORMATS, ExportItem, ExportResult, PickedFile, ServerToolDef, ToolId, mimeFromExt} from '../data/models';
import {createZipArchive, extractZipArchive} from './archiveOps';
import {runLocalFfmpegTool} from './ffmpegOps';
import {
  FilterPreset,
  WatermarkPosition,
  collageImagesBlob,
  compressImageBlob,
  convertImageBlob,
  cropImageBlob,
  editImageBlob,
  filterImageBlob,
  frameImageBlob,
  normalizeImageFormat,
  watermarkImageBlob,
} from './imaging';
import {documentToPdfBlob, documentToTextBlob, pdfToDocxBlob} from './officeOps';
import {
  imagesToPdfBlob,
  mergePdfsBlob,
  optimizeOrStripPdfBlob,
  pdfToImagesBlobs,
  rotatePdfBlob,
  splitPdfBlobs,
  stampPdfBlob,
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
  | {kind: 'pdfSplit'; everyN: number; ranges: string}
  | {kind: 'pdfRotate'; degrees: number}
  | {kind: 'pdfStamp'; text: string; pageNumbers: boolean; position: 'bottom' | 'top'}
  | {kind: 'pdfToImages'; format: string; quality: number; maxDim?: number};

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
      for (let i = 0; i < files.length; i++) {
        checkAbort();
        onProgress(i / files.length, files[i].name);
        const blob = await convertImageBlob(files[i].file, ext, opts.quality, opts.maxDim);
        outputs.push({name: `${files[i].baseName}.${ext}`, blob});
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
          const fmt = ENCODABLE_IMAGE_FORMATS.includes(files[i].ext) ? normalizeImageFormat(files[i].ext) : opts.format;
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

    case 'PDF_ROTATE': {
      const opts = options.kind === 'pdfRotate' ? options : {kind: 'pdfRotate' as const, degrees: 90};
      onProgress(0.35, files[0].name);
      const blob = await rotatePdfBlob(files[0].file, opts.degrees);
      outputs.push({name: `${files[0].baseName}-rotated.pdf`, blob});
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
  }

  checkAbort();
  onProgress(1, 'Done');
  const now = Date.now();
  const items: ExportItem[] = outputs.map((out) => {
    const ext = out.name.includes('.') ? out.name.split('.').pop()! : '';
    const mime = out.blob.type || mimeFromExt(ext);
    return {
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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
