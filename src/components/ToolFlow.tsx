import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Bolt,
  Check,
  ClipboardPaste,
  Contact,
  Contrast,
  Crop,
  Droplets,
  EyeOff,
  FileArchive,
  FileCheck2,
  FileImage,
  FileMinus,
  FileOutput,
  FileText,
  Film,
  FlipHorizontal,
  FlipVertical,
  Grid,
  Hash,
  Layers,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Music,
  Package,
  PenLine,
  RotateCw,
  ScanLine,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {
  ALL_TOOLS,
  DownloadEngineId,
  ENCODABLE_IMAGE_FORMATS,
  PickedFile,
  Prefs,
  SERVER_TOOLS,
  ServerToolDef,
  ToolDef,
  ToolId,
  convertTargetsForSelection,
  formatBytes,
  serverToolsForSelection,
  toolsForSelection,
} from '../data/models';
import {BatchRenameRules, computeBatchRenamedNames} from '../engine/fileInspector';
import {
  DecodedImage,
  FilterPreset,
  RedactBox,
  RedactStyle,
  ScanMode,
  SocialAspect,
  SocialFillMode,
  WatermarkPosition,
  decodeImage,
  renderCollageToCanvas,
  renderEditedToCanvas,
  renderFilteredToCanvas,
  renderFrameToCanvas,
  renderPassportGridToCanvas,
  renderRedactToCanvas,
  renderScanDocToCanvas,
  renderSocialFitToCanvas,
  renderWatermarkToCanvas,
} from '../engine/imaging';
import {ToolOptions} from '../engine/processor';
import {CropEditor} from './CropEditor';
import {FileThumb} from './FileThumb';

interface ToolFlowProps {
  mode: 'convert' | 'tools' | 'web';
  files: PickedFile[];
  lang: Lang;
  prefs?: Prefs;
  onChangePrefs?: (updater: (prev: Prefs) => Prefs) => void;
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

type ToolCategory = 'all' | 'edit' | 'pdfdoc' | 'media' | 'batch';

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
    case 'PDF_WATERMARK':
      return Droplets;
    case 'FRAME':
      return FileImage;
    case 'COLLAGE':
      return Grid;
    case 'SCAN_DOC':
      return ScanLine;
    case 'SOCIAL_FIT':
      return Maximize2;
    case 'REDACT':
      return EyeOff;
    case 'IMAGE_GRID_SPLIT':
      return LayoutGrid;
    case 'GIF_MAKE':
      return Film;
    case 'PASSPORT_GRID':
      return Contact;
    case 'ICON_PACK':
      return Package;
    case 'PDF_CREATE':
    case 'PDF_MERGE':
    case 'PDF_TO_IMAGES':
      return FileText;
    case 'PDF_SPLIT':
      return Scissors;
    case 'PDF_REMOVE_PAGES':
      return FileMinus;
    case 'PDF_EXTRACT_PAGES':
      return FileOutput;
    case 'PDF_ROTATE':
      return RotateCw;
    case 'PDF_GRAYSCALE':
      return Contrast;
    case 'PDF_NUP':
      return Layers;
    case 'PDF_OPTIMIZE':
      return Bolt;
    case 'PDF_STAMP':
      return Hash;
    case 'ZIP_CREATE':
    case 'ZIP_EXTRACT':
      return FileArchive;
    case 'BATCH_RENAME':
      return PenLine;
    case 'FILE_HASH_INFO':
      return FileCheck2;
  }
}

function categoryForLocalTool(id: ToolId, firstKind?: string): ToolCategory {
  if (id === 'BATCH_RENAME' || id === 'FILE_HASH_INFO' || id === 'ZIP_CREATE' || id === 'ZIP_EXTRACT') {
    return 'batch';
  }
  if (id.startsWith('PDF_') || firstKind === 'pdf') {
    return 'pdfdoc';
  }
  return 'edit';
}

function categoryForServerTool(id: string): ToolCategory {
  if (id.startsWith('video_') || id.startsWith('audio_')) return 'media';
  return 'pdfdoc';
}

export const ToolFlow: React.FC<ToolFlowProps> = ({
  mode,
  files,
  lang,
  prefs,
  onChangePrefs,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ToolCategory>('all');

  useEffect(() => {
    setSelectedTool(initialTool);
    setConvertFormat(initialConvertFormat);
    setSelectedServerTool(initialServerTool);
  }, [initialTool, initialConvertFormat, initialServerTool]);

  const localTools = useMemo(() => toolsForSelection(files), [files]);
  const serverTools = useMemo(() => serverToolsForSelection(files), [files]);
  const targets = useMemo(() => convertTargetsForSelection(files), [files]);
  const firstKind = files[0]?.kind;

  const availableCategories = useMemo(() => {
    const present = new Set<ToolCategory>();
    localTools.forEach((tool) => present.add(categoryForLocalTool(tool.id, firstKind)));
    serverTools.forEach((tool) => present.add(categoryForServerTool(tool.id)));
    const ordered: ToolCategory[] = ['all'];
    (['edit', 'pdfdoc', 'media', 'batch'] as const).forEach((c) => {
      if (present.has(c)) ordered.push(c);
    });
    return ordered;
  }, [localTools, serverTools, firstKind]);

  const filteredLocalTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return localTools.filter((tool) => {
      if (activeCategory !== 'all' && categoryForLocalTool(tool.id, firstKind) !== activeCategory) {
        return false;
      }
      if (!q) return true;
      const title = t(tool.titleKey, lang).toLowerCase();
      const desc = t(tool.descKey, lang).toLowerCase();
      return title.includes(q) || desc.includes(q) || tool.id.toLowerCase().includes(q);
    });
  }, [localTools, activeCategory, searchQuery, lang, firstKind]);

  const filteredServerTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return serverTools.filter((tool) => {
      if (activeCategory !== 'all' && categoryForServerTool(tool.id) !== activeCategory) {
        return false;
      }
      if (!q) return true;
      const title = (lang === 'tr' ? tool.titleTr : tool.titleEn).toLowerCase();
      const desc = (lang === 'tr' ? tool.descTr : tool.descEn).toLowerCase();
      return title.includes(q) || desc.includes(q) || tool.id.toLowerCase().includes(q);
    });
  }, [serverTools, activeCategory, searchQuery, lang]);

  void serverReady;
  void onOpenSettings;

  if (mode === 'web') {
    return (
      <WebLinkConfig
        lang={lang}
        prefs={prefs}
        onChangePrefs={onChangePrefs}
        onOpenSettings={onOpenSettings}
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
          const kind = files[0]?.kind;
          if (kind === 'pdf' && (convertFormat === 'docx' || convertFormat === 'txt' || convertFormat === 'html')) {
            const toolId =
              convertFormat === 'docx'
                ? 'pdf_to_docx'
                : convertFormat === 'txt'
                  ? 'pdf_to_txt'
                  : 'pdf_to_html';
            const pdfTool = SERVER_TOOLS.find((s) => s.id === toolId);
            if (pdfTool) onRunServer(pdfTool, {});
            return;
          }
          if (kind === 'video') {
            const vidTool = SERVER_TOOLS.find((s) => s.id === 'video_convert');
            if (vidTool) onRunServer(vidTool, {format: convertFormat});
            return;
          }
          if (kind === 'audio') {
            const audTool = SERVER_TOOLS.find((s) => s.id === 'audio_convert');
            if (audTool) onRunServer(audTool, {format: convertFormat});
            return;
          }
          if (kind === 'document') {
            if (convertFormat === 'csv' || convertFormat === 'json') {
              const tblTool = SERVER_TOOLS.find((s) => s.id === 'table_convert');
              if (tblTool) onRunServer(tblTool, {format: convertFormat});
              return;
            }
            const docId =
              convertFormat === 'pdf'
                ? 'office_to_pdf'
                : convertFormat === 'docx'
                  ? 'doc_to_docx'
                  : convertFormat === 'html'
                    ? 'doc_to_html'
                    : 'office_to_text';
            const docTool = SERVER_TOOLS.find((s) => s.id === docId);
            if (docTool) onRunServer(docTool, {});
            return;
          }
          if (kind === 'pdf' && opts.kind === 'convert') {
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
          const def = ALL_TOOLS[selectedTool];
          const title = def ? t(def.titleKey, lang) : selectedTool;
          onRunLocal(selectedTool, title, opts);
        }}
      />
    );
  }

  const totalToolsCount = localTools.length + serverTools.length;
  const categoryLabel = (cat: ToolCategory): string => {
    switch (cat) {
      case 'all':
        return t('CatAll', lang);
      case 'edit':
        return t('CatEdit', lang);
      case 'pdfdoc':
        return t('CatPdfDoc', lang);
      case 'media':
        return t('CatMedia', lang);
      case 'batch':
        return t('CatBatch', lang);
    }
  };

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
        <div className="mt-5 space-y-5">
          {totalToolsCount >= 5 && (
            <div className="space-y-3">
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-[var(--muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('SearchToolsPlaceholder', lang)}
                  className="min-h-[44px] w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] pl-10 pr-10 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label={t('Clear', lang)}
                    className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-xl text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {availableCategories.length > 2 && (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {availableCategories.map((cat) => {
                    const active = activeCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`min-h-[36px] shrink-0 rounded-xl border px-3.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent)]/18 text-[var(--ink)]'
                            : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        {categoryLabel(cat)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {filteredLocalTools.length === 0 && filteredServerTools.length === 0 && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4 text-center text-xs text-[var(--muted)]">
              {t('NoMatchingTools', lang)}
            </div>
          )}

          {filteredLocalTools.length > 0 && (
            <div>
              <p className="mb-2.5 text-xs font-semibold text-[var(--muted)]">{t('ToolsForSelection', lang)}</p>
              <div className="divide-y divide-[var(--line)] rounded-3xl border border-[var(--line)] bg-[var(--surface)]">
                {filteredLocalTools.map((tool: ToolDef) => {
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
          )}

          {filteredServerTools.length > 0 && (
            <div>
              <p className="mb-2.5 text-xs font-semibold text-[var(--muted)]">{t('ServerTools', lang)}</p>
              <div className="divide-y divide-[var(--line)] rounded-3xl border border-[var(--line)] bg-[var(--surface)]">
                {filteredServerTools.map((tool) => {
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
          className={`min-h-[40px] max-w-full rounded-xl border px-3.5 py-1.5 text-center text-xs font-semibold leading-tight transition-colors ${
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
    (firstKind === 'image' && !['pdf', 'ico', 'svg'].includes(format)) ||
    (firstKind === 'pdf' && ['jpg', 'png', 'webp'].includes(format));
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

  // Shared image format
  const initialImgFmt = ENCODABLE_IMAGE_FORMATS.includes(files[0]?.ext)
    ? ['ico', 'svg', 'gif', 'bmp'].includes(files[0].ext)
      ? 'png'
      : files[0].ext === 'jpeg'
        ? 'jpg'
        : files[0].ext
    : 'jpg';
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

  // Scan Doc
  const [scanMode, setScanMode] = useState<ScanMode>('bw');
  const [scanStrength, setScanStrength] = useState(65);
  const [scanFormat, setScanFormat] = useState('pdf');

  // Social Fit
  const [socialAspect, setSocialAspect] = useState<SocialAspect>('4:5');
  const [socialFill, setSocialFill] = useState<SocialFillMode>('blur');

  // Redact
  const [redactBoxes, setRedactBoxes] = useState<RedactBox[]>([{x: 0.25, y: 0.36, w: 0.5, h: 0.22}]);
  const [redactStyle, setRedactStyle] = useState<RedactStyle>('pixelate');
  const [redactStrength, setRedactStrength] = useState(62);
  const [draftBox, setDraftBox] = useState<{x0: number; y0: number; x1: number; y1: number} | null>(null);
  const [hasCustomDrawn, setHasCustomDrawn] = useState(false);

  // Grid Split
  const [gridPreset, setGridPreset] = useState('3x1');

  // GIF Maker
  const [gifFps, setGifFps] = useState('4');
  const [gifMaxDim, setGifMaxDim] = useState('720');

  // Passport / ID Grid
  const [passportPaper, setPassportPaper] = useState<'10x15' | 'a4'>('10x15');
  const [passportCount, setPassportCount] = useState<'4' | '8' | '9'>('8');
  const [passportFormat, setPassportFormat] = useState('jpg');

  // PDF Split / Remove / Extract / Rotate / Watermark / N-Up
  const [splitMode, setSplitMode] = useState<'every' | 'ranges'>('every');
  const [everyN, setEveryN] = useState(1);
  const [ranges, setRanges] = useState('');
  const [pdfDeg, setPdfDeg] = useState('90');
  const [pdfDeleteRanges, setPdfDeleteRanges] = useState('1');
  const [pdfExtractMode, setPdfExtractMode] = useState<'reverse' | 'custom'>('reverse');
  const [pdfExtractOrder, setPdfExtractOrder] = useState('1-3');
  const [pdfWmText, setPdfWmText] = useState(lang === 'tr' ? 'ÖRNEK' : 'CONFIDENTIAL');
  const [pdfWmPos, setPdfWmPos] = useState<'diagonal' | 'center'>('diagonal');
  const [pdfWmOpacity, setPdfWmOpacity] = useState(28);
  const [pdfWmColor, setPdfWmColor] = useState('#64748B');
  const [pdfNupCount, setPdfNupCount] = useState<'2' | '4'>('2');

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

  // Batch Rename
  const [renameBase, setRenameBase] = useState('');
  const [renamePrefix, setRenamePrefix] = useState('');
  const [renameSuffix, setRenameSuffix] = useState('');
  const [renameFind, setRenameFind] = useState('');
  const [renameReplace, setRenameReplace] = useState('');
  const [renameNumbering, setRenameNumbering] = useState(files.length > 1);
  const [renameCase, setRenameCase] = useState<BatchRenameRules['letterCase']>('keep');

  // File Hash Report
  const [hashReportFmt, setHashReportFmt] = useState<'txt' | 'json'>('txt');

  // Live Canvas preview for image tools
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const decodedSingleRef = useRef<DecodedImage | null>(null);
  const decodedListRef = useRef<DecodedImage[]>([]);
  const [previewTick, setPreviewTick] = useState(0);

  const normalizedDraftBox: RedactBox | null = useMemo(() => {
    if (!draftBox) return null;
    const x = Math.min(draftBox.x0, draftBox.x1);
    const y = Math.min(draftBox.y0, draftBox.y1);
    const w = Math.abs(draftBox.x1 - draftBox.x0);
    const h = Math.abs(draftBox.y1 - draftBox.y0);
    if (w < 0.015 || h < 0.015) return null;
    return {x, y, w, h};
  }, [draftBox]);

  useEffect(() => {
    let active = true;
    const singlePreviewTools: ToolId[] = [
      'EDIT',
      'FILTERS',
      'WATERMARK',
      'FRAME',
      'SCAN_DOC',
      'SOCIAL_FIT',
      'REDACT',
      'IMAGE_GRID_SPLIT',
      'PASSPORT_GRID',
    ];
    if (singlePreviewTools.includes(toolId) && files[0]) {
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
    } else if (toolId === 'SCAN_DOC' && decodedSingleRef.current) {
      source = renderScanDocToCanvas(decodedSingleRef.current.bitmap, {
        mode: scanMode,
        strength: scanStrength,
      });
    } else if (toolId === 'SOCIAL_FIT' && decodedSingleRef.current) {
      source = renderSocialFitToCanvas(decodedSingleRef.current.bitmap, {
        aspect: socialAspect,
        fillMode: socialFill,
        color: bgColor,
        targetLongEdge: 720,
      });
    } else if (toolId === 'REDACT' && decodedSingleRef.current) {
      const activeBoxes = normalizedDraftBox ? [...redactBoxes, normalizedDraftBox] : redactBoxes;
      source = renderRedactToCanvas(decodedSingleRef.current.bitmap, {
        boxes: activeBoxes,
        style: redactStyle,
        strength: redactStrength,
      });
      const rCtx = source.getContext('2d');
      if (rCtx) {
        rCtx.save();
        rCtx.strokeStyle = 'rgba(240, 120, 138, 0.9)';
        rCtx.lineWidth = Math.max(2, Math.round(source.width * 0.004));
        rCtx.setLineDash([8, 6]);
        for (const b of activeBoxes) {
          rCtx.strokeRect(b.x * source.width, b.y * source.height, b.w * source.width, b.h * source.height);
        }
        rCtx.restore();
      }
    } else if (toolId === 'IMAGE_GRID_SPLIT' && decodedSingleRef.current) {
      const bmp = decodedSingleRef.current.bitmap;
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const gCtx = c.getContext('2d');
      if (gCtx) {
        gCtx.drawImage(bmp, 0, 0);
        const [colsN, rowsN] = gridPreset.split('x').map((n) => Number(n) || 1);
        gCtx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        gCtx.lineWidth = Math.max(2, Math.round(Math.min(c.width, c.height) * 0.006));
        gCtx.setLineDash([10, 8]);
        for (let i = 1; i < colsN; i++) {
          const x = Math.round((c.width * i) / colsN);
          gCtx.beginPath();
          gCtx.moveTo(x, 0);
          gCtx.lineTo(x, c.height);
          gCtx.stroke();
        }
        for (let j = 1; j < rowsN; j++) {
          const y = Math.round((c.height * j) / rowsN);
          gCtx.beginPath();
          gCtx.moveTo(0, y);
          gCtx.lineTo(c.width, y);
          gCtx.stroke();
        }
      }
      source = c;
    } else if (toolId === 'PASSPORT_GRID' && decodedSingleRef.current) {
      source = renderPassportGridToCanvas(decodedSingleRef.current.bitmap, {
        paper: passportPaper,
        count: Number(passportCount) as 4 | 8 | 9,
        targetScale: 0.36,
      });
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
    scanMode,
    scanStrength,
    socialAspect,
    socialFill,
    redactBoxes,
    normalizedDraftBox,
    redactStyle,
    redactStrength,
    gridPreset,
    passportPaper,
    passportCount,
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

  if (toolId === 'SCAN_DOC') {
    return (
      <ConfigShell
        title={t('ToolScanDoc', lang)}
        subtitle={`${files.length} ${t('FilesCount', lang)}`}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'scanDoc',
            mode: scanMode,
            strength: scanStrength,
            format: scanFormat,
            quality: 92,
          })
        }
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-black/30 p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('LivePreview', lang)}</p>
          <canvas ref={previewCanvasRef} className="mx-auto max-h-64 max-w-full rounded-lg object-contain" />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('ScanModeLabel', lang)}</p>
          <OptionPills
            selected={scanMode}
            onSelect={(v) => setScanMode(v as ScanMode)}
            options={[
              {value: 'bw', label: t('ScanModeBw', lang)},
              {value: 'gray', label: t('ScanModeGray', lang)},
              {value: 'color', label: t('ScanModeColor', lang)},
            ]}
          />
        </div>
        <SliderField
          label={t('ScanStrengthLabel', lang)}
          value={scanStrength}
          min={15}
          max={100}
          onChange={setScanStrength}
        />
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Format', lang)}</p>
          <OptionPills
            selected={scanFormat}
            onSelect={setScanFormat}
            options={[
              {value: 'pdf', label: 'PDF'},
              {value: 'jpg', label: 'JPG'},
              {value: 'png', label: 'PNG'},
            ]}
          />
        </div>
      </ConfigShell>
    );
  }

  if (toolId === 'SOCIAL_FIT') {
    return (
      <ConfigShell
        title={t('ToolSocialFit', lang)}
        subtitle={`${files.length} ${t('FilesCount', lang)}`}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'socialFit',
            aspect: socialAspect,
            fillMode: socialFill,
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
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Aspect', lang)}</p>
          <OptionPills
            selected={socialAspect}
            onSelect={(v) => setSocialAspect(v as SocialAspect)}
            options={[
              {value: '1:1', label: '1:1 Kare'},
              {value: '4:5', label: '4:5 Portre'},
              {value: '9:16', label: '9:16 Hikaye'},
              {value: '16:9', label: '16:9 Yatay'},
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('FillStyleLabel', lang)}</p>
          <OptionPills
            selected={socialFill}
            onSelect={(v) => setSocialFill(v as SocialFillMode)}
            options={[
              {value: 'blur', label: t('FillBlur', lang)},
              {value: 'color', label: t('FillColor', lang)},
            ]}
          />
        </div>
        {socialFill === 'color' && (
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
        )}
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

  if (toolId === 'REDACT') {
    const getRelCoords = (e: React.PointerEvent<HTMLCanvasElement>): {x: number; y: number} => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height)));
      return {x, y};
    };

    return (
      <ConfigShell
        title={t('ToolRedact', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'redact',
            boxes: redactBoxes,
            style: redactStyle,
            strength: redactStrength,
            format,
            quality: 92,
          })
        }
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-black/30 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--muted)]">{t('LivePreview', lang)}</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={redactBoxes.length === 0}
                onClick={() => setRedactBoxes((prev) => prev.slice(0, -1))}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[11px] font-semibold text-[var(--ink)] disabled:opacity-40"
              >
                <Undo2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>{t('UndoLastBox', lang)}</span>
              </button>
              <button
                type="button"
                disabled={redactBoxes.length === 0}
                onClick={() => {
                  setRedactBoxes([]);
                  setHasCustomDrawn(true);
                }}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[11px] font-semibold text-[var(--ink)] disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>{t('ClearBoxes', lang)}</span>
              </button>
            </div>
          </div>
          <canvas
            ref={previewCanvasRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const pt = getRelCoords(e);
              if (!hasCustomDrawn) {
                setRedactBoxes([]);
                setHasCustomDrawn(true);
              }
              setDraftBox({x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y});
            }}
            onPointerMove={(e) => {
              if (!draftBox) return;
              const pt = getRelCoords(e);
              setDraftBox((prev) => (prev ? {...prev, x1: pt.x, y1: pt.y} : null));
            }}
            onPointerUp={() => {
              if (normalizedDraftBox) {
                setRedactBoxes((prev) => [...prev, normalizedDraftBox]);
              }
              setDraftBox(null);
            }}
            onPointerCancel={() => setDraftBox(null)}
            className="mx-auto max-h-72 max-w-full cursor-crosshair touch-none rounded-lg object-contain select-none"
          />
          <p className="mt-2 text-center text-[11px] text-[var(--muted)]">{t('RedactHint', lang)}</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('RedactStyleLabel', lang)}</p>
          <OptionPills
            selected={redactStyle}
            onSelect={(v) => setRedactStyle(v as RedactStyle)}
            options={[
              {value: 'pixelate', label: t('RedactPixelate', lang)},
              {value: 'blur', label: t('RedactBlur', lang)},
              {value: 'black', label: t('RedactBlack', lang)},
            ]}
          />
        </div>

        {redactStyle !== 'black' && (
          <SliderField
            label={t('StrengthLabel', lang)}
            value={redactStrength}
            min={20}
            max={100}
            onChange={setRedactStrength}
          />
        )}

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

  if (toolId === 'IMAGE_GRID_SPLIT') {
    const [colsN, rowsN] = gridPreset.split('x').map((n) => Number(n) || 1);
    return (
      <ConfigShell
        title={t('ToolGridSplit', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'gridSplit',
            cols: colsN,
            rows: rowsN,
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
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('GridPresetLabel', lang)}</p>
          <OptionPills
            selected={gridPreset}
            onSelect={setGridPreset}
            options={[
              {value: '3x1', label: '3×1 Panorama'},
              {value: '3x2', label: '3×2 (6 Parça)'},
              {value: '3x3', label: '3×3 Profil (9 Parça)'},
              {value: '2x2', label: '2×2 (4 Parça)'},
              {value: '1x2', label: '1×2 Dikey'},
            ]}
          />
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

  if (toolId === 'GIF_MAKE') {
    return (
      <ConfigShell
        title={t('ToolGifMake', lang)}
        subtitle={`${files.length} ${t('FilesCount', lang)}`}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'gifMake',
            fps: Number(gifFps) || 4,
            maxDim: Number(gifMaxDim) || 720,
          })
        }
      >
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('GifFpsLabel', lang)}</p>
          <OptionPills
            selected={gifFps}
            onSelect={setGifFps}
            options={[
              {value: '1', label: '1 FPS'},
              {value: '2', label: '2 FPS'},
              {value: '4', label: '4 FPS'},
              {value: '8', label: '8 FPS'},
              {value: '12', label: '12 FPS'},
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('MaxDimension', lang)}</p>
          <OptionPills
            selected={gifMaxDim}
            onSelect={setGifMaxDim}
            options={[
              {value: '480', label: '480 px'},
              {value: '720', label: '720 px'},
              {value: '1080', label: '1080 px'},
            ]}
          />
        </div>
        <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          {files.map((f, i) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="font-mono-num text-xs font-bold text-[var(--accent)]">{i + 1}.</span>
              <FileThumb previewUrl={f.previewUrl} kind={f.kind} alt={f.name} sizeClass="h-9 w-9" />
              <span className="flex-1 truncate text-sm text-[var(--ink)]">{f.name}</span>
            </div>
          ))}
        </div>
      </ConfigShell>
    );
  }

  if (toolId === 'PASSPORT_GRID') {
    return (
      <ConfigShell
        title={t('ToolPassportGrid', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'passportGrid',
            paper: passportPaper,
            count: Number(passportCount) as 4 | 8 | 9,
            format: passportFormat,
            quality: 95,
          })
        }
      >
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-black/30 p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('LivePreview', lang)}</p>
          <canvas ref={previewCanvasRef} className="mx-auto max-h-64 max-w-full rounded-lg object-contain" />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('PaperSizeLabel', lang)}</p>
          <OptionPills
            selected={passportPaper}
            onSelect={(v) => setPassportPaper(v as '10x15' | 'a4')}
            options={[
              {value: '10x15', label: '10×15 cm Fotoğraf'},
              {value: 'a4', label: 'A4 Sayfa'},
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('PhotoCountLabel', lang)}</p>
          <OptionPills
            selected={passportCount}
            onSelect={(v) => setPassportCount(v as '4' | '8' | '9')}
            options={[
              {value: '4', label: '4 Adet (2×2)'},
              {value: '8', label: '8 Adet (4×2)'},
              {value: '9', label: '9 Adet (3×3)'},
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Format', lang)}</p>
          <OptionPills
            selected={passportFormat}
            onSelect={setPassportFormat}
            options={[
              {value: 'jpg', label: 'JPG'},
              {value: 'png', label: 'PNG'},
              {value: 'pdf', label: 'PDF'},
            ]}
          />
        </div>
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

  if (toolId === 'PDF_REMOVE_PAGES') {
    return (
      <ConfigShell
        title={t('ToolPdfRemovePages', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'pdfRemovePages',
            ranges: pdfDeleteRanges,
          })
        }
      >
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4 text-xs text-[var(--muted)]">
          {t('ToolPdfRemovePagesDesc', lang)}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('PagesToDeleteLabel', lang)}</p>
          <input
            type="text"
            value={pdfDeleteRanges}
            onChange={(e) => setPdfDeleteRanges(e.target.value)}
            placeholder={t('RangesPlaceholder', lang)}
            className="min-h-[46px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      </ConfigShell>
    );
  }

  if (toolId === 'PDF_EXTRACT_PAGES') {
    return (
      <ConfigShell
        title={t('ToolPdfExtractPages', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'pdfExtractPages',
            mode: pdfExtractMode,
            ranges: pdfExtractOrder,
          })
        }
      >
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('ExtractModeLabel', lang)}</p>
          <OptionPills
            selected={pdfExtractMode}
            onSelect={(v) => setPdfExtractMode(v as 'reverse' | 'custom')}
            options={[
              {value: 'reverse', label: t('ExtractReverseAll', lang)},
              {value: 'custom', label: t('ExtractCustomOrder', lang)},
            ]}
          />
        </div>
        {pdfExtractMode === 'custom' && (
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('PageRanges', lang)}</p>
            <input
              type="text"
              value={pdfExtractOrder}
              onChange={(e) => setPdfExtractOrder(e.target.value)}
              placeholder={t('CustomOrderPlaceholder', lang)}
              className="min-h-[46px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
          </div>
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

  if (toolId === 'PDF_WATERMARK') {
    const PDF_WM_COLORS = ['#64748B', '#DC2626', '#1E3A8A', '#0F172A'];
    return (
      <ConfigShell
        title={t('ToolPdfWatermark', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'pdfWatermark',
            text: pdfWmText,
            opacity: pdfWmOpacity,
            color: pdfWmColor,
            position: pdfWmPos,
          })
        }
      >
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('WatermarkText', lang)}</p>
          <input
            type="text"
            value={pdfWmText}
            onChange={(e) => setPdfWmText(e.target.value)}
            placeholder={t('WatermarkPlaceholder', lang)}
            className="min-h-[46px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Position', lang)}</p>
          <OptionPills
            selected={pdfWmPos}
            onSelect={(v) => setPdfWmPos(v as 'diagonal' | 'center')}
            options={[
              {value: 'diagonal', label: t('PosTile', lang)},
              {value: 'center', label: t('PosCenter', lang)},
            ]}
          />
        </div>
        <SliderField
          label={t('Opacity', lang)}
          value={pdfWmOpacity}
          min={10}
          max={75}
          onChange={setPdfWmOpacity}
        />
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('TextColor', lang)}</p>
          <div className="flex items-center gap-2.5">
            {PDF_WM_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                onClick={() => setPdfWmColor(swatch)}
                className={`h-9 w-9 rounded-full border-2 transition-transform ${
                  pdfWmColor === swatch ? 'scale-110 border-[var(--accent)]' : 'border-[var(--line)]'
                }`}
                style={{backgroundColor: swatch}}
              />
            ))}
          </div>
        </div>
      </ConfigShell>
    );
  }

  if (toolId === 'PDF_NUP') {
    return (
      <ConfigShell
        title={t('ToolPdfNup', lang)}
        subtitle={files[0]?.name ?? ''}
        lang={lang}
        onBack={onBack}
        onExport={() =>
          onExport({
            kind: 'pdfNup',
            pagesPerSheet: Number(pdfNupCount) as 2 | 4,
          })
        }
      >
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4 text-xs text-[var(--muted)]">
          {t('ToolPdfNupDesc', lang)}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('PagesPerSheetLabel', lang)}</p>
          <OptionPills
            selected={pdfNupCount}
            onSelect={(v) => setPdfNupCount(v as '2' | '4')}
            options={[
              {value: '2', label: '2 Sayfa / A4'},
              {value: '4', label: '4 Sayfa / A4 (2×2)'},
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
              {value: 'webp', label: 'WEBP'},
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

  if (toolId === 'BATCH_RENAME') {
    const rules: BatchRenameRules = {
      baseName: renameBase,
      prefix: renamePrefix,
      suffix: renameSuffix,
      findText: renameFind,
      replaceText: renameReplace,
      numbering: renameNumbering,
      startNumber: 1,
      letterCase: renameCase,
    };
    const previewList = computeBatchRenamedNames(files, rules);

    return (
      <ConfigShell
        title={t('ToolBatchRename', lang)}
        subtitle={`${files.length} ${t('FilesCount', lang)}`}
        lang={lang}
        onBack={onBack}
        onExport={() => onExport({kind: 'batchRename', rules})}
      >
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('RenameBaseLabel', lang)}</p>
          <input
            type="text"
            value={renameBase}
            onChange={(e) => setRenameBase(e.target.value)}
            placeholder="tatil-2026"
            className="min-h-[46px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">{t('RenamePrefixLabel', lang)}</p>
            <input
              type="text"
              value={renamePrefix}
              onChange={(e) => setRenamePrefix(e.target.value)}
              placeholder="morph-"
              className="min-h-[44px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">{t('RenameSuffixLabel', lang)}</p>
            <input
              type="text"
              value={renameSuffix}
              onChange={(e) => setRenameSuffix(e.target.value)}
              placeholder="-hd"
              className="min-h-[44px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">{t('RenameFindLabel', lang)}</p>
            <input
              type="text"
              value={renameFind}
              onChange={(e) => setRenameFind(e.target.value)}
              placeholder="IMG_"
              className="min-h-[44px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">{t('RenameReplaceLabel', lang)}</p>
            <input
              type="text"
              value={renameReplace}
              onChange={(e) => setRenameReplace(e.target.value)}
              placeholder="foto-"
              className="min-h-[44px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setRenameNumbering((v) => !v)}
          className="flex min-h-[46px] w-full items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4"
        >
          <span className="text-sm font-medium text-[var(--ink)]">{t('RenameNumberingLabel', lang)}</span>
          <span
            className={`h-6 w-11 rounded-full p-0.5 transition-colors ${
              renameNumbering ? 'bg-[var(--accent)]' : 'bg-[var(--inset)]'
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                renameNumbering ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('RenameCaseLabel', lang)}</p>
          <OptionPills
            selected={renameCase}
            onSelect={(v) => setRenameCase(v as BatchRenameRules['letterCase'])}
            options={[
              {value: 'keep', label: t('CaseKeep', lang)},
              {value: 'slug', label: t('CaseLowerSlug', lang)},
              {value: 'lower', label: t('CaseLower', lang)},
              {value: 'upper', label: t('CaseUpper', lang)},
            ]}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('PreviewNamesLabel', lang)}</p>
          <div className="max-h-52 divide-y divide-[var(--line)] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
            {previewList.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2 px-3.5 py-2 text-xs">
                <span className="font-mono-num font-bold text-[var(--accent)]">{idx + 1}.</span>
                <span className="truncate text-[var(--muted)]">{item.oldName}</span>
                <span className="text-[var(--accent)]">→</span>
                <span className="font-mono-num truncate font-semibold text-[var(--ink)]">{item.newName}</span>
              </div>
            ))}
          </div>
        </div>
      </ConfigShell>
    );
  }

  if (toolId === 'FILE_HASH_INFO') {
    return (
      <ConfigShell
        title={t('ToolFileHashInfo', lang)}
        subtitle={`${files.length} ${t('FilesCount', lang)}`}
        lang={lang}
        onBack={onBack}
        onExport={() => onExport({kind: 'fileHashInfo', format: hashReportFmt})}
      >
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4 text-xs text-[var(--muted)]">
          {t('ToolFileHashInfoDesc', lang)}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('ReportFormatLabel', lang)}</p>
          <OptionPills
            selected={hashReportFmt}
            onSelect={(v) => setHashReportFmt(v as 'txt' | 'json')}
            options={[
              {value: 'txt', label: 'TXT Rapor'},
              {value: 'json', label: 'JSON Veri'},
            ]}
          />
        </div>
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
  }

  // Simple one-tap tools: PDF_CREATE, PDF_MERGE, PDF_OPTIMIZE, PDF_GRAYSCALE, ICON_PACK, ZIP_CREATE, ZIP_EXTRACT
  const def = ALL_TOOLS[toolId];
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
  const [rotateMode, setRotateMode] = useState('90');
  const [loopCount, setLoopCount] = useState('2');
  const [fadeSec, setFadeSec] = useState('2');
  const [audioSpeedMode, setAudioSpeedMode] = useState('1.25');

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
        if (tool.fields.includes('rotateMode')) opts.rotateMode = rotateMode;
        if (tool.fields.includes('loopCount')) opts.loopCount = loopCount;
        if (tool.fields.includes('fadeSec')) opts.fadeSec = fadeSec;
        if (tool.fields.includes('audioSpeedMode')) opts.audioSpeedMode = audioSpeedMode;
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
      {tool.fields.includes('time') &&
        (tool.id === 'video_split' ? (
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
        ))}
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
      {tool.fields.includes('rotateMode') && (
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('RotateVideoLabel', lang)}</p>
          <OptionPills
            selected={rotateMode}
            onSelect={setRotateMode}
            options={[
              {value: '90', label: '90°'},
              {value: '180', label: '180°'},
              {value: '270', label: '270°'},
              {value: 'hflip', label: t('FlipHorizontal', lang)},
              {value: 'vflip', label: t('FlipVertical', lang)},
            ]}
          />
        </div>
      )}
      {tool.fields.includes('loopCount') && (
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('LoopCountLabel', lang)}</p>
          <OptionPills
            selected={loopCount}
            onSelect={setLoopCount}
            options={[
              {value: '2', label: '2×'},
              {value: '3', label: '3×'},
              {value: '4', label: '4×'},
            ]}
          />
        </div>
      )}
      {tool.fields.includes('audioSpeedMode') && (
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('Speed', lang)}</p>
          <OptionPills
            selected={audioSpeedMode}
            onSelect={setAudioSpeedMode}
            options={[
              {value: '0.75', label: '0.75×'},
              {value: 'slowed', label: 'Slowed (0.86×)'},
              {value: '1.25', label: '1.25×'},
              {value: '1.5', label: '1.5×'},
              {value: '2', label: '2×'},
              {value: 'nightcore', label: 'Nightcore'},
            ]}
          />
        </div>
      )}
      {tool.fields.includes('fadeSec') && (
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('FadeDurationLabel', lang)}</p>
          <OptionPills
            selected={fadeSec}
            onSelect={setFadeSec}
            options={[
              {value: '1', label: '1 sn'},
              {value: '2', label: '2 sn'},
              {value: '3', label: '3 sn'},
              {value: '5', label: '5 sn'},
            ]}
          />
        </div>
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
  prefs?: Prefs;
  onChangePrefs?: (updater: (prev: Prefs) => Prefs) => void;
  onOpenSettings: () => void;
  onBack: () => void;
  onRun: (url: string, options: Record<string, string>) => void;
}> = ({lang, prefs, onChangePrefs, onOpenSettings, onBack, onRun}) => {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('video');
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const activeEngine: DownloadEngineId = prefs?.downloadEngine || 'builtin';

  const handlePasteClipboard = async () => {
    setPasteHint(null);
    try {
      const text = (await navigator.clipboard?.readText?.())?.trim() ?? '';
      if (text && /^https?:\/\//i.test(text)) {
        setUrl(text);
      } else if (text) {
        const match = text.match(/https?:\/\/[^\s"'<>]+/i);
        if (match) {
          setUrl(match[0]);
        } else {
          setPasteHint(t('ClipboardEmpty', lang));
        }
      } else {
        setPasteHint(t('ClipboardEmpty', lang));
      }
    } catch {
      setPasteHint(t('PermDenied', lang));
    }
  };

  return (
    <ConfigShell
      title={t('DownloadLink', lang)}
      subtitle={t('WebLinkSubtitle', lang)}
      lang={lang}
      exportLabel={t('Download', lang)}
      onBack={onBack}
      onExport={() => {
        if (!url.trim()) return;
        onRun(url.trim(), {format, engine: activeEngine});
      }}
    >
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4">
        <p className="text-xs leading-relaxed text-[var(--muted)]">{t('WebLinkDirectNote', lang)}</p>
        {prefs?.downloadWifiOnly && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--ink)]">
            <span>• {t('DownloadWifiOnly', lang)}</span>
          </p>
        )}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[var(--muted)]">{t('LinkUrl', lang)}</p>
          <button
            type="button"
            onClick={handlePasteClipboard}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>{t('PasteLink', lang)}</span>
          </button>
        </div>
        <div className="relative flex items-center">
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (pasteHint) setPasteHint(null);
            }}
            placeholder="https://..."
            className="min-h-[48px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] pl-4 pr-11 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
          {url && (
            <button
              type="button"
              onClick={() => setUrl('')}
              aria-label={t('Clear', lang)}
              className="absolute right-1.5 flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {pasteHint && <p className="mt-1.5 text-xs text-[var(--accent)]">{pasteHint}</p>}
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
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[var(--muted)]">{t('ActiveEngineLabel', lang)}</p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            {t('Settings', lang)} →
          </button>
        </div>
        <OptionPills
          selected={activeEngine}
          onSelect={(val) =>
            onChangePrefs?.((p) => ({...p, downloadEngine: val as DownloadEngineId}))
          }
          options={[
            {value: 'builtin', label: lang === 'tr' ? 'Dahili' : 'Built-in'},
            {value: 'newpipe', label: 'NewPipe'},
            {value: 'ytdlp_native', label: 'yt-dlp'},
            {value: 'cobalt', label: 'Cobalt'},
          ]}
        />
      </div>
    </ConfigShell>
  );
};
