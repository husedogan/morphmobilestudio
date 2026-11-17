import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Bolt,
  Check,
  Crop,
  Droplets,
  FileArchive,
  FileImage,
  FileText,
  Film,
  FlipHorizontal,
  FlipVertical,
  Grid,
  Hash,
  Minimize2,
  Music,
  RotateCw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Tag,
} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {
  ENCODABLE_IMAGE_FORMATS,
  PickedFile,
  SERVER_TOOLS,
  ServerToolDef,
  ToolDef,
  ToolId,
  convertTargetsForSelection,
  formatBytes,
  serverToolsForSelection,
  toolsForSelection,
} from '../data/models';
import {
  DecodedImage,
  FilterPreset,
  WatermarkPosition,
  decodeImage,
  renderCollageToCanvas,
  renderEditedToCanvas,
  renderFilteredToCanvas,
  renderFrameToCanvas,
  renderWatermarkToCanvas,
} from '../engine/imaging';
import {ToolOptions} from '../engine/processor';
import {CropEditor} from './CropEditor';
import {FileThumb} from './FileThumb';

interface ToolFlowProps {
  mode: 'convert' | 'tools' | 'web';
  files: PickedFile[];
  lang: Lang;
  serverReady: boolean;
  initialTool?: ToolId | null;
  initialConvertFormat?: string | null;
  initialServerTool?: ServerToolDef | null;
  directEntry?: boolean;
  onBack: () => void;
  onRunLocal: (tool: ToolId, title: string, options: ToolOptions) => void;
  onRunServer: (tool: ServerToolDef, options: Record<string, string>) => void;
  onRunLink: (url: string, options: Record<string, string>) => void;
  onOpenSettings: () => void;
}

const FRAME_SWATCHES = [
  '#101D31',
  '#192B43',
  '#F5F2F5',
  '#F0788A',
  '#62B5FF',
  '#58D7B1',
  '#B8A1FF',
  '#FFC46B',
  '#000000',
];

function iconForTool(id: ToolId) {
  switch (id) {
    case 'CONVERT':
      return ArrowLeftRight;
    case 'COMPRESS':
      return Minimize2;
    case 'METADATA':
      return Tag;
    case 'EDIT':
      return SlidersHorizontal;
    case 'CROP':
      return Crop;
    case 'FILTERS':
      return Sparkles;
    case 'WATERMARK':
      return Droplets;
    case 'FRAME':
      return FileImage;
    case 'COLLAGE':
      return Grid;
    case 'PDF_CREATE':
    case 'PDF_MERGE':
    case 'PDF_TO_IMAGES':
      return FileText;
    case 'PDF_SPLIT':
      return Scissors;
    case 'PDF_ROTATE':
      return RotateCw;
    case 'PDF_OPTIMIZE':
      return Bolt;
    case 'PDF_STAMP':
      return Hash;
    case 'ZIP_CREATE':
    case 'ZIP_EXTRACT':
      return FileArchive;
  }
}

export const ToolFlow: React.FC<ToolFlowProps> = ({
  mode,
  files,
  lang,
  serverReady,
  initialTool = null,
  initialConvertFormat = null,
  initialServerTool = null,
  directEntry = false,
  onBack,
  onRunLocal,
  onRunServer,
  onRunLink,
  onOpenSettings,
}) => {
  const [selectedTool, setSelectedTool] = useState<ToolId | null>(initialTool);
  const [convertFormat, setConvertFormat] = useState<string | null>(initialConvertFormat);
  const [selectedServerTool, setSelectedServerTool] = useState<ServerToolDef | null>(initialServerTool);

  useEffect(() => {
    setSelectedTool(initialTool);
    setConvertFormat(initialConvertFormat);
    setSelectedServerTool(initialServerTool);
  }, [initialTool, initialConvertFormat, initialServerTool]);

  if (mode === 'web') {
    return (
      <WebLinkConfig
        lang={lang}
        onBack={onBack}
        onRun={onRunLink}
      />
    );
  }

  if (convertFormat) {
    return (
      <ConvertConfig
        files={files}
        format={convertFormat}
        lang={lang}
        onBack={() => (directEntry ? onBack() : setConvertFormat(null))}
        onExport={(opts) => {
          const firstKind = files[0]?.kind;
          if (firstKind === 'pdf' && convertFormat === 'docx') {
            const pdfDocx = SERVER_TOOLS.find((s) => s.id === 'pdf_to_docx');
            if (pdfDocx) onRunServer(pdfDocx, {});
            return;
          }
          if (firstKind === 'video') {
            const vidTool = SERVER_TOOLS.find((s) => s.id === 'video_convert');
            if (vidTool) onRunServer(vidTool, {format: convertFormat});
            return;
          }
          if (firstKind === 'audio') {
            const audTool = SERVER_TOOLS.find((s) => s.id === 'audio_convert');
            if (audTool) onRunServer(audTool, {format: convertFormat});
            return;
          }
          if (firstKind === 'document') {
            const docId = convertFormat === 'pdf' ? 'office_to_pdf' : 'office_to_text';
            const docTool = SERVER_TOOLS.find((s) => s.id === docId);
            if (docTool) onRunServer(docTool, {});
            return;
          }
          if (firstKind === 'pdf' && opts.kind === 'convert') {
            onRunLocal('PDF_TO_IMAGES', t('ToolPdfToImages', lang), {
              kind: 'pdfToImages',
              format: opts.format,
              quality: opts.quality,
              maxDim: opts.maxDim,
            });
          } else if (convertFormat === 'pdf') {
            onRunLocal('PDF_CREATE', t('ToolPdfCreate', lang), {kind: 'none'});
          } else {
            onRunLocal('CONVERT', `${t('Convert', lang)} · ${convertFormat.toUpperCase()}`, opts);
          }
        }}
      />
    );
  }

  if (selectedServerTool) {
    return (
      <ServerToolConfig
        tool={selectedServerTool}
        files={files}
        lang={lang}
        onBack={() => (directEntry ? onBack() : setSelectedServerTool(null))}
        onRun={(opts) => onRunServer(selectedServerTool, opts)}
      />
    );
  }

  if (selectedTool === 'CROP' && files[0]) {
    return (
      <CropEditor
        file={files[0]}
        lang={lang}
        onBack={() => (directEntry ? onBack() : setSelectedTool(null))}
        onApply={(rect) =>
          onRunLocal('CROP', t('ToolCrop', lang), {
            kind: 'crop',
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          })
        }
      />
    );
  }

  if (selectedTool) {
    return (
      <LocalToolConfig
        toolId={selectedTool}
        files={files}
        lang={lang}
        onBack={() => (directEntry ? onBack() : setSelectedTool(null))}
        onExport={(opts) => {
          const def = toolsForSelection(files).find((item) => item.id === selectedTool);
          const title = def ? t(def.titleKey, lang) : selectedTool;
          onRunLocal(selectedTool, title, opts);
        }}
      />
    );
  }

  const localTools = toolsForSelection(files);
  const serverTools = serverToolsForSelection(files);
  const targets = convertTargetsForSelection(files);
  void serverReady;
  void onOpenSettings;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-6">
      <TopSubBar
        title={mode === 'convert' ? t('Convert', lang) : t('Tools', lang)}
        subtitle={`${files.length} ${t('FilesCount', lang)}`}
        lang={lang}
        onBack={onBack}
      />

      {/* Preview Strip */}
      <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
        {files.slice(0, 6).map((f) => (
          <FileThumb key={f.id} previewUrl={f.previewUrl} kind={f.kind} alt={f.name} sizeClass="h-14 w-14" />
        ))}
        {files.length > 6 && (
          <div className="font-mono-num flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--inset)] text-xs font-bold text-[var(--muted)]">
            +{files.length - 6}
          </div>
        )}
      </div>

      {mode === 'convert' ? (
        <div className="mt-6">
          <p className="mb-2.5 text-xs font-semibold text-[var(--muted)]">{t('SelectTargetFormat', lang)}</p>
          {targets.length === 0 ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4 text-sm text-[var(--muted)]">
              {t('NoToolsForMix', lang)}
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)] rounded-3xl border border-[var(--line)] bg-[var(--surface)]">
              {targets.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setConvertFormat(fmt)}
                  className="flex min-h-[60px] w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-[var(--inset)]/60 first:rounded-t-3xl last:rounded-b-3xl"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)]">
                    <ArrowLeftRight className="h-4 w-4" />
                  </div>
                  <span className="flex-1 text-base font-bold text-[var(--ink)]">{fmt.toUpperCase()}</span>
                  <span className="text-xs font-medium text-[var(--muted)]">{t('Convert', lang)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div>
            <p className="mb-2.5 text-xs font-semibold text-[var(--muted)]">{t('ToolsForSelection', lang)}</p>
            <div className="divide-y divide-[var(--line)] rounded-3xl border border-[var(--line)] bg-[var(--surface)]">
              {localTools.map((tool: ToolDef) => {
                const Icon = iconForTool(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setSelectedTool(tool.id)}
                    className="flex min-h-[66px] w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-[var(--inset)]/60 first:rounded-t-3xl last:rounded-b-3xl"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[var(--ink)]">{t(tool.titleKey, lang)}</p>
                      <p className="truncate text-xs text-[var(--muted)]">{t(tool.descKey, lang)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {serverTools.length > 0 && (
            <div>
              <p className="mb-2.5 text-xs font-semibold text-[var(--muted)]">{t('ServerTools', lang)}</p>
              <div className="divide-y divide-[var(--line)] rounded-3xl border border-[var(--line)] bg-[var(--surface)]">
                {serverTools.map((tool) => {
                  const ToolIcon = tool.id.startsWith('video')
                    ? Film
                    : tool.id.startsWith('audio')
                      ? Music
                      : FileText;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => setSelectedServerTool(tool)}
                      className="flex min-h-[66px] w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-[var(--inset)]/60 first:rounded-t-3xl last:rounded-b-3xl"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)]">
                        <ToolIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[var(--ink)]">
                          {lang === 'tr' ? tool.titleTr : tool.titleEn}
                        </p>
                        <p className="truncate text-xs text-[var(--muted)]">
                          {lang === 'tr' ? tool.descTr : tool.descEn}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ---------- Sub-configurators with Live Canvas Previews ---------- */

const TopSubBar: React.FC<{title: string; subtitle: string; lang: Lang; onBack: () => void}> = ({
  title,
  subtitle,
  lang,
  onBack,
}) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={onBack}
      aria-label={t('Back', lang)}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--accent)]"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
    <div className="min-w-0 flex-1">
      <h2 className="truncate text-xl font-extrabold text-[var(--ink)]">{title}</h2>
      <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>
    </div>
  </div>
);

const ConfigShell: React.FC<{
  title: string;
  subtitle: string;
  lang: Lang;
  exportLabel?: string;
  onBack: () => void;
  onExport: () => void;
  children: React.ReactNode;
}> = ({title, subtitle, lang, exportLabel, onBack, onExport, children}) => (
  <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 sm:px-6">
    <TopSubBar title={title} subtitle={subtitle} lang={lang} onBack={onBack} />
    <div className="mt-5 space-y-5">{children}</div>
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--line)] bg-[var(--paper)]/95 px-4 py-3 pb-safe backdrop-blur-md lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={onExport}
          className="morph-accent-btn flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-sm font-semibold shadow-lg transition-transform active:scale-[0.98]"
        >
          <Check className="h-4 w-4" />
          <span>{exportLabel ?? t('Export', lang)}</span>
        </button>
      </div>
    </div>
  </div>
);

const OptionPills: React.FC<{
  options: Array<{value: string; label: string}>;
  selected: string;
  onSelect: (v: string) => void;
}> = ({options, selected, onSelect}) => (
  <div className="flex flex-wrap gap-2">
    {options.map((opt) => {
      const active = opt.value === selected;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={`min-h-[40px] max-w-full rounded-full border px-4 py-1.5 text-center text-xs font-semibold leading-tight transition-colors ${
            active
              ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--ink)]'
              : 'border-[var(--line)] bg-[var(--inset)] text-[var(--muted)] hover:text-[var(--ink)]'
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

const SliderField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}> = ({label, value, min, max, suffix = '%', onChange}) => (
  <div>
    <div className="mb-1.5 flex items-center justify-between text-xs">
      <span className="font-semibold text-[var(--muted)]">{label}</span>
      <span className="font-mono-num font-bold text-[var(--accent)]">
        {value}
        {suffix}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-2 w-full cursor-pointer accent-[var(--accent)]"
    />
  </div>
);

const ConvertConfig: React.FC<{
  files: PickedFile[];
  format: string;
  lang: Lang;
  onBack: () => void;
  onExport: (opts: ToolOptions) => void;
}> = ({files, format, lang, onBack, onExport}) => {
  const [quality, setQuality] = useState(90);
  const [maxDim, setMaxDim] = useState('0');
  const firstKind = files[0]?.kind;
  const isRasterConvert =
    (firstKind === 'image' && format !== 'pdf') || (firstKind === 'pdf' && format !== 'docx');
  const lossy = isRasterConvert && (format === 'jpg' || format === 'webp');

  return (
    <ConfigShell
      title={`${t('Convert', lang)} · ${format.toUpperCase()}`}
      subtitle={`${files.length} ${t('FilesCount', lang)}`}
      lang={lang}
      onBack={onBack}
      onExport={() =>
        onExport({
          kind: 'convert',
          format,
          quality,
          maxDim: Number(maxDim) > 0 ? Number(maxDim) : undefined,
        })
      }
    >
      {lossy && (
        <SliderField label={t('Quality', lang)} value={quality} min={40} max={100} onChange={setQuality} />
      )}
      {isRasterConvert ? (
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('MaxDimension', lang)}</p>
          <OptionPills
            selected={maxDim}
            onSelect={setMaxDim}
            options={[
              {value: '0', label: t('Original', lang)},
              {value: '3000', label: '3000'},
              {value: '2048', label: '2048'},
              {value: '1600', label: '1600'},
              {value: '1080', label: '1080'},
            ]}
          />
        </div>
      ) : (
        <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          {files.map((f, i) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="font-mono-num text-xs font-bold text-[var(--accent)]">{i + 1}.</span>
              <FileThumb previewUrl={f.previewUrl} kind={f.kind} alt={f.name} sizeClass="h-9 w-9" />
              <span className="flex-1 truncate text-sm text-[var(--ink)]">{f.name}</span>
              <span className="font-mono-num text-xs font-semibold text-[var(--accent)]">
                → {format.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}
    </ConfigShell>
  );
};

const LocalToolConfig: React.FC<{
  toolId: ToolId;
  files: PickedFile[];
  lang: Lang;
  onBack: () => void;
  onExport: (opts: ToolOptions) => void;
}> = ({toolId, files, lang, onBack, onExport}) => {
  // Compress
  const [quality, setQuality] = useState(82);
  const [maxDim, setMaxDim] = useState('0');
  const [reduction, setReduction] = useState('0');

  // Metadata
  const initialImgFmt = ENCODABLE_IMAGE_FORMATS.includes(files[0]?.ext) ? files[0].ext : 'jpg';
  const [format, setFormat] = useState(toolId === 'METADATA' ? initialImgFmt : 'jpg');

  // Edit
  const [rotate, setRotate] = useState('0');
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [scale, setScale] = useState('100');

  // Frame
  const [bgColor, setBgColor] = useState('#192B43');
  const [padding, setPadding] = useState(40);
  const [radius, setRadius] = useState(20);
  const [shadow, setShadow] = useState(true);

  // Collage
  const [columns, setColumns] = useState('2');
  const [gap, setGap] = useState(14);

  // PDF Split / Rotate / Images
  const [splitMode, setSplitMode] = useState<'every' | 'ranges'>('every');
  const [everyN, setEveryN] = useState(1);
  const [ranges, setRanges] = useState('');
  const [pdfDeg, setPdfDeg] = useState('90');

  // Filters
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('none');
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [blurPx, setBlurPx] = useState(0);

  // Watermark
  const [wmText, setWmText] = useState('Morph');
  const [wmPos, setWmPos] = useState<WatermarkPosition>('bottom-right');
  const [wmOpacity, setWmOpacity] = useState(75);
  const [wmScale, setWmScale] = useState('1');
  const [wmColor, setWmColor] = useState('#FFFFFF');

  // PDF Stamp
  const [stampText, setStampText] = useState('');
  const [stampPageNums, setStampPageNums] = useState(true);
  const [stampPos, setStampPos] = useState<'bottom' | 'top'>('bottom');

  // Live Canvas preview for EDIT, FILTERS, WATERMARK, FRAME, COLLAGE
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const decodedSingleRef = useRef<DecodedImage | null>(null);
  const decodedListRef = useRef<DecodedImage[]>([]);
  const [previewTick, setPreviewTick] = useState(0);

  useEffect(() => {
    let active = true;
    if (
      (toolId === 'EDIT' || toolId === 'FILTERS' || toolId === 'WATERMARK' || toolId === 'FRAME') &&
      files[0]
    ) {
      decodeImage(files[0].file, 900).then((d) => {
        if (!active) {
          d.bitmap.close();
          return;
        }
        decodedSingleRef.current?.bitmap.close();
        decodedSingleRef.current = d;
        setPreviewTick((n) => n + 1);
      });
    } else if (toolId === 'COLLAGE' && files.length > 0) {
      Promise.all(files.slice(0, 12).map((f) => decodeImage(f.file, 500))).then((list) => {
        if (!active) {
          list.forEach((d) => d.bitmap.close());
          return;
        }
        decodedListRef.current.forEach((d) => d.bitmap.close());
        decodedListRef.current = list;
        setPreviewTick((n) => n + 1);
      });
    }
    return () => {
      active = false;
      decodedSingleRef.current?.bitmap.close();
      decodedSingleRef.current = null;
      decodedListRef.current.forEach((d) => d.bitmap.close());
      decodedListRef.current = [];
    };
  }, [toolId, files]);

  useEffect(() => {
    const target = previewCanvasRef.current;
    if (!target) return;
    let source: HTMLCanvasElement | null = null;

    if (toolId === 'EDIT' && decodedSingleRef.current) {
      source = renderEditedToCanvas(decodedSingleRef.current.bitmap, {
        rotate: Number(rotate) || 0,
        flipH,
        flipV,
        scalePercent: Number(scale) || 100,
      });
    } else if (toolId === 'FILTERS' && decodedSingleRef.current) {
      source = renderFilteredToCanvas(decodedSingleRef.current.bitmap, {
        preset: filterPreset,
        brightness,
        contrast,
        saturation,
        blur: blurPx,
      });
    } else if (toolId === 'WATERMARK' && decodedSingleRef.current) {
      source = renderWatermarkToCanvas(decodedSingleRef.current.bitmap, {
        text: wmText,
        position: wmPos,
        opacity: wmOpacity,
        scale: Number(wmScale) || 1,
        color: wmColor,
      });
    } else if (toolId === 'FRAME' && decodedSingleRef.current) {
      const ratio = decodedSingleRef.current.width / 700;
      const scaledPad = ratio > 1 ? Math.round(padding * ratio) : padding;
      const scaledRad = ratio > 1 ? Math.round(radius * ratio) : radius;
      source = renderFrameToCanvas(decodedSingleRef.current.bitmap, {
        backgroundColor: bgColor,
        padding: scaledPad,
        radius: scaledRad,
        shadow,
      });
    } else if (toolId === 'COLLAGE' && decodedListRef.current.length > 0) {
      source = renderCollageToCanvas(
        decodedListRef.current.map((d) => d.bitmap),
        {
          columns: Number(columns) || 2,
          gap,
          backgroundColor: bgColor,
          targetWidth: 720,
        }
      );
    }

    if (!source) return;
    target.width = source.width;
    target.height = source.height;
    const ctx = target.getContext('2d');
    ctx?.drawImage(source, 0, 0);
  }, [
    toolId,
    previewTick,
    rotate,
    flipH,
    flipV,
    scale,
    filterPreset,
    brightness,
    contrast,
    saturation,
    blurPx,
    wmText,
    wmPos,
    wmOpacity,
    wmScale,
    wmColor,
    bgColor,
    padding,
    radius,
    shadow,
    columns,
    gap,
  ]);

  const firstIsPdf = files[0]?.kind === 'pdf';

  if (toolId === 'COMPRESS') {
    return (
      <ConfigShell
        title={t('ToolCompress', lang)}
        subtitle={firstIsPdf ? 'PDF' : `${files.length} ${t('FilesCount', lang)}`}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'compress',
            quality,
            maxDim: Number(maxDim) > 0 ? Number(maxDim) : undefined,
            targetPercent: Number(reduction) > 0 ? Number(reduction) : undefined,
          })
        }
      >
        {firstIsPdf ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
            {t('ToolPdfOptimizeDesc', lang)}
          </div>
        ) : (
          <>
            <SliderField label={t('Quality', lang)} value={quality} min={40} max={100} onChange={setQuality} />
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('MaxDimension', lang)}</p>
              <OptionPills
                selected={maxDim}
                onSelect={setMaxDim}
                options={[
                  {value: '0', label: t('Original', lang)},
                  {value: '3000', label: '3000'},
                  {value: '2048', label: '2048'},
                  {value: '1600', label: '1600'},
                  {value: '1080', label: '1080'},
                ]}
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('TargetReduction', lang)}</p>
              <OptionPills
                selected={reduction}
                onSelect={setReduction}
                options={[
                  {value: '0', label: t('None', lang)},
                  {value: '25', label: '%25'},
                  {value: '50', label: '%50'},
                  {value: '75', label: '%75'},
                ]}
              />
            </div>
          </>
        )}
      </ConfigShell>
    );
  }

  if (toolId === 'METADATA') {
    return (
      <ConfigShell
        title={t('ToolMetadata', lang)}
        subtitle={firstIsPdf ? 'PDF' : `${files.length} ${t('FilesCount', lang)}`}
        lang={lang}
        onBack={onBack}
        onExport={() => onExport({kind: 'strip', format: firstIsPdf ? 'pdf' : format, quality})}
      >
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4 text-xs text-[var(--muted)]">
          {t('ToolMetadataDesc', lang)}
        </div>
        {!firstIsPdf && (
          <>
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Format', lang)}</p>
              <OptionPills
                selected={format}
                onSelect={setFormat}
                options={[
                  {value: 'jpg', label: 'JPG'},
                  {value: 'png', label: 'PNG'},
                  {value: 'webp', label: 'WEBP'},
                ]}
              />
            </div>
            <SliderField label={t('Quality', lang)} value={quality} min={60} max={100} onChange={setQuality} />
          </>
        )}
      </ConfigShell>
    );
  }

  if (toolId === 'EDIT') {
    return (
      <ConfigShell
        title={t('ToolEdit', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'edit',
            rotate: Number(rotate) || 0,
            flipH,
            flipV,
            scalePercent: Number(scale) || 100,
            quality,
          })
        }
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-black/30 p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('LivePreview', lang)}</p>
          <canvas ref={previewCanvasRef} className="mx-auto max-h-60 max-w-full rounded-lg object-contain" />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Rotation', lang)}</p>
          <OptionPills
            selected={rotate}
            onSelect={setRotate}
            options={[
              {value: '0', label: '0°'},
              {value: '90', label: '90°'},
              {value: '180', label: '180°'},
              {value: '270', label: '270°'},
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setFlipH((v) => !v)}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-semibold ${
              flipH
                ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--ink)]'
                : 'border-[var(--line)] bg-[var(--inset)] text-[var(--muted)]'
            }`}
          >
            <FlipHorizontal className="h-4 w-4" />
            <span>{t('FlipHorizontal', lang)}</span>
          </button>
          <button
            type="button"
            onClick={() => setFlipV((v) => !v)}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-semibold ${
              flipV
                ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--ink)]'
                : 'border-[var(--line)] bg-[var(--inset)] text-[var(--muted)]'
            }`}
          >
            <FlipVertical className="h-4 w-4" />
            <span>{t('FlipVertical', lang)}</span>
          </button>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Scale', lang)}</p>
          <OptionPills
            selected={scale}
            onSelect={setScale}
            options={[
              {value: '100', label: '100%'},
              {value: '75', label: '75%'},
              {value: '50', label: '50%'},
              {value: '25', label: '25%'},
            ]}
          />
        </div>
        <SliderField label={t('Quality', lang)} value={quality} min={50} max={100} onChange={setQuality} />
      </ConfigShell>
    );
  }

  if (toolId === 'FRAME') {
    return (
      <ConfigShell
        title={t('ToolFrame', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'frame',
            color: bgColor,
            padding,
            radius,
            shadow,
            format,
            quality: 92,
          })
        }
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-black/30 p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('LivePreview', lang)}</p>
          <canvas ref={previewCanvasRef} className="mx-auto max-h-64 max-w-full rounded-lg object-contain" />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('BackgroundColor', lang)}</p>
          <div className="flex flex-wrap items-center gap-2.5">
            {FRAME_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                onClick={() => setBgColor(swatch)}
                className={`h-9 w-9 rounded-full border-2 transition-transform ${
                  bgColor === swatch ? 'scale-110 border-[var(--accent)]' : 'border-[var(--line)]'
                }`}
                style={{backgroundColor: swatch}}
              />
            ))}
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="h-9 w-11 cursor-pointer rounded-xl border border-[var(--line)] bg-transparent p-0.5"
            />
          </div>
        </div>
        <SliderField label={t('Padding', lang)} value={padding} min={0} max={160} suffix=" px" onChange={setPadding} />
        <SliderField label={t('CornerRadius', lang)} value={radius} min={0} max={96} suffix=" px" onChange={setRadius} />
        <button
          type="button"
          onClick={() => setShadow((s) => !s)}
          className="flex min-h-[46px] w-full items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4"
        >
          <span className="text-sm font-medium text-[var(--ink)]">{t('Shadow', lang)}</span>
          <span
            className={`h-6 w-11 rounded-full p-0.5 transition-colors ${
              shadow ? 'bg-[var(--accent)]' : 'bg-[var(--inset)]'
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                shadow ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Format', lang)}</p>
          <OptionPills
            selected={format}
            onSelect={setFormat}
            options={[
              {value: 'jpg', label: 'JPG'},
              {value: 'png', label: 'PNG'},
              {value: 'webp', label: 'WEBP'},
            ]}
          />
        </div>
      </ConfigShell>
    );
  }

  if (toolId === 'COLLAGE') {
    return (
      <ConfigShell
        title={t('ToolCollage', lang)}
        subtitle={`${files.length} ${t('FilesCount', lang)}`}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'collage',
            columns: Number(columns) || 2,
            gap,
            color: bgColor,
            format,
            quality: 92,
          })
        }
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-black/30 p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('LivePreview', lang)}</p>
          <canvas ref={previewCanvasRef} className="mx-auto max-h-64 max-w-full rounded-lg object-contain" />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Columns', lang)}</p>
          <OptionPills
            selected={columns}
            onSelect={setColumns}
            options={[
              {value: '1', label: '1'},
              {value: '2', label: '2'},
              {value: '3', label: '3'},
              {value: '4', label: '4'},
            ]}
          />
        </div>
        <SliderField label={t('Gap', lang)} value={gap} min={0} max={48} suffix=" px" onChange={setGap} />
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('BackgroundColor', lang)}</p>
          <div className="flex flex-wrap items-center gap-2.5">
            {FRAME_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                onClick={() => setBgColor(swatch)}
                className={`h-9 w-9 rounded-full border-2 transition-transform ${
                  bgColor === swatch ? 'scale-110 border-[var(--accent)]' : 'border-[var(--line)]'
                }`}
                style={{backgroundColor: swatch}}
              />
            ))}
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="h-9 w-11 cursor-pointer rounded-xl border border-[var(--line)] bg-transparent p-0.5"
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Format', lang)}</p>
          <OptionPills
            selected={format}
            onSelect={setFormat}
            options={[
              {value: 'jpg', label: 'JPG'},
              {value: 'png', label: 'PNG'},
              {value: 'webp', label: 'WEBP'},
            ]}
          />
        </div>
      </ConfigShell>
    );
  }

  if (toolId === 'PDF_SPLIT') {
    return (
      <ConfigShell
        title={t('ToolPdfSplit', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'pdfSplit',
            everyN,
            ranges: splitMode === 'ranges' ? ranges : '',
          })
        }
      >
        <OptionPills
          selected={splitMode}
          onSelect={(v) => setSplitMode(v as 'every' | 'ranges')}
          options={[
            {value: 'every', label: t('EveryNPages', lang)},
            {value: 'ranges', label: t('PageRanges', lang)},
          ]}
        />
        {splitMode === 'every' ? (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setEveryN((n) => Math.max(1, n - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--inset)] text-lg font-bold"
            >
              -
            </button>
            <span className="font-mono-num min-w-[3rem] text-center text-2xl font-bold">{everyN}</span>
            <button
              type="button"
              onClick={() => setEveryN((n) => Math.min(100, n + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--inset)] text-lg font-bold"
            >
              +
            </button>
          </div>
        ) : (
          <input
            type="text"
            value={ranges}
            onChange={(e) => setRanges(e.target.value)}
            placeholder={t('RangesPlaceholder', lang)}
            className="min-h-[46px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
        )}
      </ConfigShell>
    );
  }

  if (toolId === 'PDF_ROTATE') {
    return (
      <ConfigShell
        title={t('ToolPdfRotate', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() => onExport({kind: 'pdfRotate', degrees: Number(pdfDeg) || 90})}
      >
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Degrees', lang)}</p>
          <OptionPills
            selected={pdfDeg}
            onSelect={setPdfDeg}
            options={[
              {value: '90', label: '90°'},
              {value: '180', label: '180°'},
              {value: '270', label: '270°'},
            ]}
          />
        </div>
      </ConfigShell>
    );
  }

  if (toolId === 'PDF_TO_IMAGES') {
    return (
      <ConfigShell
        title={t('ToolPdfToImages', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'pdfToImages',
            format,
            quality,
            maxDim: Number(maxDim) > 0 ? Number(maxDim) : undefined,
          })
        }
      >
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Format', lang)}</p>
          <OptionPills
            selected={format}
            onSelect={setFormat}
            options={[
              {value: 'jpg', label: 'JPG'},
              {value: 'png', label: 'PNG'},
            ]}
          />
        </div>
        <SliderField label={t('Quality', lang)} value={quality} min={50} max={100} onChange={setQuality} />
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('MaxDimension', lang)}</p>
          <OptionPills
            selected={maxDim}
            onSelect={setMaxDim}
            options={[
              {value: '0', label: t('Original', lang)},
              {value: '2048', label: '2048'},
              {value: '1600', label: '1600'},
              {value: '1080', label: '1080'},
            ]}
          />
        </div>
      </ConfigShell>
    );
  }

  if (toolId === 'FILTERS') {
    return (
      <ConfigShell
        title={t('ToolFilters', lang)}
        subtitle={`${files.length} ${t('FilesCount', lang)}`}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'filters',
            preset: filterPreset,
            brightness,
            contrast,
            saturation,
            blur: blurPx,
            format,
            quality,
          })
        }
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-black/30 p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('LivePreview', lang)}</p>
          <canvas ref={previewCanvasRef} className="mx-auto max-h-60 max-w-full rounded-lg object-contain" />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('FilterPresetLabel', lang)}</p>
          <OptionPills
            selected={filterPreset}
            onSelect={(v) => setFilterPreset(v as FilterPreset)}
            options={[
              {value: 'none', label: t('FilterPresetNone', lang)},
              {value: 'vivid', label: t('FilterPresetVivid', lang)},
              {value: 'mono', label: t('FilterPresetMono', lang)},
              {value: 'sepia', label: t('FilterPresetSepia', lang)},
              {value: 'cool', label: t('FilterPresetCool', lang)},
              {value: 'warm', label: t('FilterPresetWarm', lang)},
            ]}
          />
        </div>
        <SliderField label={t('Brightness', lang)} value={brightness} min={50} max={150} onChange={setBrightness} />
        <SliderField label={t('Contrast', lang)} value={contrast} min={50} max={150} onChange={setContrast} />
        <SliderField label={t('Saturation', lang)} value={saturation} min={0} max={200} onChange={setSaturation} />
        <SliderField label={t('Blur', lang)} value={blurPx} min={0} max={10} suffix=" px" onChange={setBlurPx} />
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Format', lang)}</p>
          <OptionPills
            selected={format}
            onSelect={setFormat}
            options={[
              {value: 'jpg', label: 'JPG'},
              {value: 'png', label: 'PNG'},
              {value: 'webp', label: 'WEBP'},
            ]}
          />
        </div>
      </ConfigShell>
    );
  }

  if (toolId === 'WATERMARK') {
    const WM_COLORS = ['#FFFFFF', '#101D31', '#F0788A', '#F0B429'];
    return (
      <ConfigShell
        title={t('ToolWatermark', lang)}
        subtitle={`${files.length} ${t('FilesCount', lang)}`}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'watermark',
            text: wmText,
            position: wmPos,
            opacity: wmOpacity,
            scale: Number(wmScale) || 1,
            color: wmColor,
            format,
            quality: 92,
          })
        }
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-black/30 p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('LivePreview', lang)}</p>
          <canvas ref={previewCanvasRef} className="mx-auto max-h-60 max-w-full rounded-lg object-contain" />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('WatermarkText', lang)}</p>
          <input
            type="text"
            value={wmText}
            onChange={(e) => setWmText(e.target.value)}
            placeholder={t('WatermarkPlaceholder', lang)}
            className="min-h-[46px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Position', lang)}</p>
          <OptionPills
            selected={wmPos}
            onSelect={(v) => setWmPos(v as WatermarkPosition)}
            options={[
              {value: 'bottom-right', label: t('PosBottomRight', lang)},
              {value: 'bottom-left', label: t('PosBottomLeft', lang)},
              {value: 'top-right', label: t('PosTopRight', lang)},
              {value: 'top-left', label: t('PosTopLeft', lang)},
              {value: 'center', label: t('PosCenter', lang)},
              {value: 'tile', label: t('PosTile', lang)},
            ]}
          />
        </div>
        <SliderField label={t('Opacity', lang)} value={wmOpacity} min={15} max={100} onChange={setWmOpacity} />
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Scale', lang)}</p>
          <OptionPills
            selected={wmScale}
            onSelect={setWmScale}
            options={[
              {value: '1', label: '1×'},
              {value: '1.5', label: '1.5×'},
              {value: '2', label: '2×'},
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('TextColor', lang)}</p>
          <div className="flex items-center gap-2.5">
            {WM_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                onClick={() => setWmColor(swatch)}
                className={`h-9 w-9 rounded-full border-2 transition-transform ${
                  wmColor === swatch ? 'scale-110 border-[var(--accent)]' : 'border-[var(--line)]'
                }`}
                style={{backgroundColor: swatch}}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Format', lang)}</p>
          <OptionPills
            selected={format}
            onSelect={setFormat}
            options={[
              {value: 'jpg', label: 'JPG'},
              {value: 'png', label: 'PNG'},
              {value: 'webp', label: 'WEBP'},
            ]}
          />
        </div>
      </ConfigShell>
    );
  }

  if (toolId === 'PDF_STAMP') {
    return (
      <ConfigShell
        title={t('ToolPdfStamp', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'pdfStamp',
            text: stampText,
            pageNumbers: stampPageNums,
            position: stampPos,
          })
        }
      >
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('StampText', lang)}</p>
          <input
            type="text"
            value={stampText}
            onChange={(e) => setStampText(e.target.value)}
            placeholder={t('StampPlaceholder', lang)}
            className="min-h-[46px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setStampPageNums((v) => !v)}
          className="flex min-h-[46px] w-full items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4"
        >
          <span className="text-sm font-medium text-[var(--ink)]">{t('IncludePageNumbers', lang)}</span>
          <span
            className={`h-6 w-11 rounded-full p-0.5 transition-colors ${
              stampPageNums ? 'bg-[var(--accent)]' : 'bg-[var(--inset)]'
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                stampPageNums ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Position', lang)}</p>
          <OptionPills
            selected={stampPos}
            onSelect={(v) => setStampPos(v as 'bottom' | 'top')}
            options={[
              {value: 'bottom', label: t('PosBottom', lang)},
              {value: 'top', label: t('PosTop', lang)},
            ]}
          />
        </div>
      </ConfigShell>
    );
  }

  // Simple tools: PDF_CREATE, PDF_MERGE, PDF_OPTIMIZE, ZIP_CREATE, ZIP_EXTRACT
  const def = toolsForSelection(files).find((d) => d.id === toolId);
  return (
    <ConfigShell
      title={def ? t(def.titleKey, lang) : toolId}
      subtitle={`${files.length} ${t('FilesCount', lang)}`}
      lang={lang}
      onBack={onBack}
      onExport={() => onExport({kind: 'none'})}
    >
      {def && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4 text-xs text-[var(--muted)]">
          {t(def.descKey, lang)}
        </div>
      )}
      <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        {files.map((f, i) => (
          <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="font-mono-num text-xs font-bold text-[var(--accent)]">{i + 1}.</span>
            <FileThumb previewUrl={f.previewUrl} kind={f.kind} alt={f.name} sizeClass="h-9 w-9" />
            <span className="flex-1 truncate text-sm text-[var(--ink)]">{f.name}</span>
            <span className="font-mono-num text-xs text-[var(--muted)]">{formatBytes(f.size)}</span>
          </div>
        ))}
      </div>
    </ConfigShell>
  );
};

const ServerToolConfig: React.FC<{
  tool: ServerToolDef;
  files: PickedFile[];
  lang: Lang;
  onBack: () => void;
  onRun: (options: Record<string, string>) => void;
}> = ({tool, files, lang, onBack, onRun}) => {
  const [format, setFormat] = useState(tool.formats[0] ?? '');
  const [quality, setQuality] = useState('26');
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState('');
  const [speed, setSpeed] = useState('1.5');
  const [channels, setChannels] = useState('mono');
  const [aspect, setAspect] = useState('1:1');
  const [interval, setInterval] = useState('5');

  return (
    <ConfigShell
      title={lang === 'tr' ? tool.titleTr : tool.titleEn}
      subtitle={`${files.length} ${t('FilesCount', lang)}`}
      lang={lang}
      onBack={onBack}
      onExport={() => {
        const opts: Record<string, string> = {};
        if (tool.fields.includes('format')) opts.format = format;
        if (tool.fields.includes('quality')) opts.quality = quality;
        if (tool.fields.includes('time')) {
          opts.start = start;
          opts.end = end;
        }
        if (tool.fields.includes('speed')) opts.speed = speed;
        if (tool.fields.includes('channels')) opts.channels = channels;
        if (tool.fields.includes('aspect')) opts.aspect = aspect;
        if (tool.fields.includes('interval')) opts.interval = interval;
        onRun(opts);
      }}
    >
      <p className="text-xs text-[var(--muted)]">{lang === 'tr' ? tool.descTr : tool.descEn}</p>

      {tool.fields.includes('format') && tool.formats.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Format', lang)}</p>
          <OptionPills
            selected={format}
            onSelect={setFormat}
            options={tool.formats.map((f) => ({value: f, label: f.toUpperCase()}))}
          />
        </div>
      )}
      {tool.fields.includes('quality') && (
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Quality', lang)}</p>
          <OptionPills
            selected={quality}
            onSelect={setQuality}
            options={[
              {value: '20', label: t('High', lang)},
              {value: '26', label: t('Balanced', lang)},
              {value: '34', label: t('Small', lang)},
            ]}
          />
        </div>
      )}
      {tool.fields.includes('time') && (
        tool.id === 'video_split' ? (
          <input
            type="text"
            value={start === '0' ? '' : start}
            onChange={(e) => setStart(e.target.value)}
            placeholder={t('SplitAtTime', lang)}
            className="min-h-[46px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              placeholder={t('StartTime', lang)}
              className="min-h-[46px] rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
            <input
              type="text"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              placeholder={t('EndTime', lang)}
              className="min-h-[46px] rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
          </div>
        )
      )}
      {tool.fields.includes('speed') && (
        <OptionPills
          selected={speed}
          onSelect={setSpeed}
          options={[
            {value: '0.5', label: '0.5×'},
            {value: '0.75', label: '0.75×'},
            {value: '1.5', label: '1.5×'},
            {value: '2', label: '2×'},
          ]}
        />
      )}
      {tool.fields.includes('channels') && (
        <OptionPills
          selected={channels}
          onSelect={setChannels}
          options={[
            {value: 'mono', label: 'Mono'},
            {value: 'stereo', label: 'Stereo'},
          ]}
        />
      )}
      {tool.fields.includes('aspect') && (
        <OptionPills
          selected={aspect}
          onSelect={setAspect}
          options={[
            {value: '1:1', label: '1:1'},
            {value: '16:9', label: '16:9'},
            {value: '9:16', label: '9:16'},
            {value: '4:5', label: '4:5'},
          ]}
        />
      )}
      {tool.fields.includes('interval') && (
        <input
          type="number"
          min={1}
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          placeholder={t('Interval', lang)}
          className="min-h-[46px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />
      )}
      {files.length > 1 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('SourceOrder', lang)}</p>
          <div className="space-y-1">
            {files.map((f, idx) => (
              <p key={f.id} className="truncate text-xs text-[var(--ink)]">
                <span className="font-mono-num font-bold text-[var(--accent)]">{idx + 1}.</span> {f.name}
              </p>
            ))}
          </div>
        </div>
      )}
    </ConfigShell>
  );
};

const WebLinkConfig: React.FC<{
  lang: Lang;
  onBack: () => void;
  onRun: (url: string, options: Record<string, string>) => void;
}> = ({lang, onBack, onRun}) => {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('video');

  return (
    <ConfigShell
      title={t('DownloadLink', lang)}
      subtitle={t('WebLinkSubtitle', lang)}
      lang={lang}
      exportLabel={t('Download', lang)}
      onBack={onBack}
      onExport={() => {
        if (!url.trim()) return;
        onRun(url.trim(), {format});
      }}
    >
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4">
        <p className="text-xs leading-relaxed text-[var(--muted)]">{t('WebLinkDirectNote', lang)}</p>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('LinkUrl', lang)}</p>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="min-h-[48px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Format', lang)}</p>
        <OptionPills
          selected={format}
          onSelect={setFormat}
          options={[
            {value: 'video', label: lang === 'tr' ? 'Video / Dosya' : 'Video / File'},
            {value: 'audio', label: lang === 'tr' ? 'Ses' : 'Audio'},
            {value: 'thumbnail', label: lang === 'tr' ? 'Kapak Görseli' : 'Cover Image'},
          ]}
        />
      </div>
    </ConfigShell>
  );
};
