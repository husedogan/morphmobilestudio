import React, {useRef, useState} from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ChevronRight,
  Cpu,
  Download,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  MoreHorizontal,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {PickedFile, formatBytes} from '../data/models';
import {GithubUpdateInfo} from '../engine/githubUpdater';
import {FileThumb} from './FileThumb';

interface StudioScreenProps {
  files: PickedFile[];
  exportCount: number;
  lang: Lang;
  serverReady: boolean;
  updateInfo?: GithubUpdateInfo | null;
  checkingUpdate?: boolean;
  activeEngineAction?: 'update' | 'manage';
  activeEngineSegment?: 'ffmpeg' | 'office' | 'link' | null;
  onChangeEngineAction?: (action: 'update' | 'manage') => void;
  onChangeEngineSegment?: (seg: 'ffmpeg' | 'office' | 'link' | null) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveFile: (id: string) => void;
  onMoveFile: (index: number, delta: -1 | 1) => void;
  onClearFiles: () => void;
  onOpenConvert: () => void;
  onOpenTools: () => void;
  onOpenFileActions: () => void;
  onOpenManageTools: () => void;
  onCheckUpdate?: () => void;
  onApplyUpdate?: () => void;
  onOpenLinkDownload: () => void;
  onOpenLibrary: () => void;
}

export const StudioScreen: React.FC<StudioScreenProps> = ({
  files,
  exportCount,
  lang,
  serverReady,
  updateInfo = null,
  checkingUpdate = false,
  activeEngineAction = 'update',
  activeEngineSegment = null,
  onChangeEngineAction,
  onChangeEngineSegment,
  onAddFiles,
  onRemoveFile,
  onMoveFile,
  onClearFiles,
  onOpenConvert,
  onOpenTools,
  onOpenFileActions,
  onOpenManageTools,
  onCheckUpdate,
  onApplyUpdate,
  onOpenLinkDownload,
  onOpenLibrary,
}) => {
  const docInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localAction, setLocalAction] = useState<'update' | 'manage'>(activeEngineAction);
  const [localSegment, setLocalSegment] = useState<'ffmpeg' | 'office' | 'link' | null>(
    activeEngineSegment
  );

  const activeAction = onChangeEngineAction ? activeEngineAction : localAction;
  const setLatchedAction = (next: 'update' | 'manage') => {
    setLocalAction(next);
    onChangeEngineAction?.(next);
  };

  const activeEngine = onChangeEngineSegment ? activeEngineSegment : localSegment;
  const setLatchedSegment = (next: 'ffmpeg' | 'office' | 'link' | null) => {
    setLocalSegment(next);
    onChangeEngineSegment?.(next);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) {
      onAddFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-5 sm:px-6 lg:pb-12 lg:pt-8">
      {/* Hidden file pickers */}
      <input
        ref={docInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAddFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAddFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Editorial Hero */}
      <div className="mb-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
          {t('Workspace', lang)}
        </p>
        <h1 className="mt-1 text-balance text-2xl font-extrabold tracking-tight text-[var(--ink)] sm:text-4xl">
          {files.length === 0 ? t('HeroTitleEmpty', lang) : t('HeroTitleReady', lang)}
        </h1>
        <p className="mt-1.5 text-sm leading-snug text-[var(--muted)] sm:text-[15px]">
          {t('HeroSubtitle', lang)}
        </p>
      </div>

      {/* Unified Equal-Width Outer Cards Stack */}
      <div className="space-y-4">
        {/* Card 1: KAYNAK DOSYALAR */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`w-full rounded-3xl border bg-[var(--surface)] p-5 transition-colors ${
            dragging ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30' : 'border-[var(--line)]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                {t('SourceFiles', lang)}
              </p>
              <h2 className="mt-1.5 text-xl font-extrabold text-[var(--ink)]">
                {files.length === 0
                  ? t('DropPrompt', lang)
                  : `${files.length} ${t('FilesReady', lang)}`}
              </h2>
            </div>
            {files.length > 0 && (
              <button
                type="button"
                onClick={onClearFiles}
                className="flex min-h-[38px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--inset)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t('Clear', lang)}</span>
              </button>
            )}
          </div>

          <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
            {files.length === 0 ? t('DropSub', lang) : t('PrivacyFootnote', lang)}
          </p>

          {/* Pickers */}
          <div className="mt-4 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              className="morph-accent-btn flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-md transition-transform active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              <span>{files.length === 0 ? t('ChooseFiles', lang) : t('AddFiles', lang)}</span>
            </button>
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              aria-label={t('Photos', lang)}
              title={t('Photos', lang)}
              className="flex min-h-[48px] min-w-[54px] items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--inset)] text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
            >
              <ImageIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Full File Queue with Reorder Arrows */}
          {files.length > 0 && (
            <div className="mt-5">
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {files.map((file, idx) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 py-2"
                  >
                    <FileThumb previewUrl={file.previewUrl} kind={file.kind} alt={file.name} sizeClass="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{file.name}</p>
                      <p className="font-mono-num text-xs text-[var(--muted)]">
                        {formatBytes(file.size)} · {file.ext ? file.ext.toUpperCase() : file.kind}
                      </p>
                    </div>
                    {files.length > 1 && (
                      <div className="flex items-center">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveFile(idx, -1)}
                          aria-label={t('MoveUp', lang)}
                          className="flex min-h-[40px] min-w-[34px] items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-25"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === files.length - 1}
                          onClick={() => onMoveFile(idx, 1)}
                          aria-label={t('MoveDown', lang)}
                          className="flex min-h-[40px] min-w-[34px] items-center justify-center rounded-lg text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-25"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveFile(file.id)}
                      aria-label={t('Remove', lang)}
                      className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              {files.length > 1 && (
                <p className="mt-2 text-xs text-[var(--muted)]">{t('ReorderHint', lang)}</p>
              )}
            </div>
          )}

          {/* 3 Primary Action Tiles: Dönüştür / Araçlar / İşlemler */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={files.length === 0}
              onClick={onOpenConvert}
              className="flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-1.5 py-2.5 text-center text-[var(--ink)] transition-colors hover:border-[var(--accent)] disabled:opacity-45"
            >
              <ArrowLeftRight className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span className="max-w-full text-[11px] font-semibold leading-tight">
                {t('Convert', lang)}
              </span>
            </button>
            <button
              type="button"
              disabled={files.length === 0}
              onClick={onOpenTools}
              className="flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-1.5 py-2.5 text-center text-[var(--ink)] transition-colors hover:border-[var(--accent)] disabled:opacity-45"
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span className="max-w-full text-[11px] font-semibold leading-tight">
                {t('Tools', lang)}
              </span>
            </button>
            <button
              type="button"
              disabled={files.length === 0}
              onClick={onOpenFileActions}
              className="flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-1.5 py-2.5 text-center text-[var(--ink)] transition-colors hover:border-[var(--accent)] disabled:opacity-45"
            >
              <MoreHorizontal className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span className="max-w-full text-[11px] font-semibold leading-tight">
                {t('FileActionsShort', lang)}
              </span>
            </button>
          </div>
        </section>

        {/* Card 2: WEB & MEDYA / Bağlantıdan indir */}
        <button
          type="button"
          onClick={onOpenLinkDownload}
          className="flex w-full items-center gap-3.5 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 text-left transition-colors hover:border-[var(--accent)]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)]">
            <Download className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              {t('ServerLabel', lang)}
            </p>
            <h3 className="mt-0.5 text-base font-bold text-[var(--ink)]">{t('DownloadLink', lang)}</h3>
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              {t('DownloadLinkDesc', lang)}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--muted)]" />
        </button>

        {/* Library & History Shortcut */}
        {exportCount > 0 && (
          <button
            type="button"
            onClick={onOpenLibrary}
            className="flex min-h-[56px] w-full items-center gap-3 rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4 text-left transition-colors hover:border-[var(--accent)]"
          >
            <FolderOpen className="h-5 w-5 shrink-0 text-[var(--accent)]" />
            <span className="flex-1 text-sm font-semibold text-[var(--ink)]">
              {t('Library', lang)} · {exportCount} {t('HistoryRecords', lang)}
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[var(--muted)]" />
          </button>
        )}

        {/* Card 3: Built-in Engines & Smart Update Control */}
        <section className="morph-engine-card w-full rounded-3xl border border-[var(--line)] p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)]">
              <Cpu className="h-4 w-4" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              {t('MorphEngine', lang)}
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/12 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              {updateInfo?.hasUpdate
                ? t('UpdateAvailable', lang)
                : serverReady
                  ? t('ServerConnectedBadge', lang)
                  : t('EmbeddedActiveBadge', lang)}
            </span>
          </div>
          <h3 className="mt-2.5 text-sm font-bold text-[var(--ink)]">{t('ReadyForFiles', lang)}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{t('EngineNote', lang)}</p>
        </div>

        {/* Coupled Fluid Latching Update & Manage Bar (Stays on Last Selected, Never Truncates) */}
        <div className="mt-4 flex w-full items-stretch gap-2">
          {(updateInfo?.hasUpdate || onCheckUpdate) && (() => {
            const isExpanded = activeAction === 'update';
            const hasUpdate = Boolean(updateInfo?.hasUpdate);
            const label = hasUpdate
              ? t('DownloadUpdate', lang)
              : checkingUpdate
                ? t('CheckingUpdates', lang)
                : t('CheckUpdates', lang);
            return (
              <button
                type="button"
                aria-label={label}
                aria-expanded={isExpanded}
                disabled={!hasUpdate && checkingUpdate}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setLatchedAction('update');
                }}
                onPointerDown={() => setLatchedAction('update')}
                onFocus={() => setLatchedAction('update')}
                onClick={() => {
                  setLatchedAction('update');
                  if (hasUpdate) {
                    onApplyUpdate?.();
                  } else {
                    onCheckUpdate?.();
                  }
                }}
                className={`flex min-h-[46px] min-w-[48px] items-center justify-center overflow-hidden rounded-full border transition-[flex-grow,padding,background-color,border-color,color,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] disabled:opacity-70 ${
                  hasUpdate
                    ? isExpanded
                      ? 'morph-accent-btn flex-[4.5] border-transparent px-3.5 shadow-sm sm:px-4'
                      : 'morph-accent-btn flex-[0.85] border-transparent px-0 opacity-90 hover:opacity-100'
                    : isExpanded
                      ? 'morph-tonal-btn flex-[4.5] px-3.5 shadow-sm sm:px-4'
                      : 'flex-[0.85] border-[var(--line)]/70 bg-[var(--inset)]/80 px-0 text-[var(--muted)] opacity-90 hover:border-[var(--accent)]/45 hover:text-[var(--ink)] hover:opacity-100'
                }`}
              >
                {hasUpdate ? (
                  <Download className="h-4 w-4 shrink-0" />
                ) : (
                  <RefreshCw
                    className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
                      isExpanded ? 'text-[var(--accent)]' : 'text-[var(--accent)]/85'
                    } ${checkingUpdate ? 'animate-spin' : ''}`}
                  />
                )}
                <span
                  className={`overflow-hidden whitespace-nowrap text-xs font-semibold leading-none transition-[max-width,margin,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isExpanded ? 'ml-2 max-w-[225px] opacity-100' : 'ml-0 max-w-0 opacity-0'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })()}

          {(() => {
            const isExpanded = activeAction === 'manage';
            const label = t('ManageShort', lang);
            return (
              <button
                type="button"
                aria-label={t('ManageTools', lang)}
                aria-expanded={isExpanded}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setLatchedAction('manage');
                }}
                onPointerDown={() => setLatchedAction('manage')}
                onFocus={() => setLatchedAction('manage')}
                onClick={() => {
                  setLatchedAction('manage');
                  onOpenManageTools();
                }}
                className={`flex min-h-[46px] min-w-[48px] items-center justify-center overflow-hidden rounded-full border transition-[flex-grow,padding,background-color,border-color,color,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${
                  isExpanded
                    ? 'flex-[4.5] border-[var(--accent-end)]/55 bg-[var(--accent-end)]/16 px-4 text-[var(--ink)] shadow-sm'
                    : 'flex-[0.85] border-[var(--line)]/70 bg-[var(--inset)]/80 px-0 text-[var(--muted)] opacity-90 hover:border-[var(--accent-end)]/45 hover:text-[var(--ink)] hover:opacity-100'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4 shrink-0 text-[var(--accent-end)] transition-colors duration-200" />
                <span
                  className={`overflow-hidden whitespace-nowrap text-xs font-semibold leading-none transition-[max-width,margin,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isExpanded ? 'ml-2 max-w-[180px] opacity-100' : 'ml-0 max-w-0 opacity-0'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })()}
        </div>

        {/* 3 Integrated Latching Squeezable Icon Segments */}
        <div className="mt-3.5 flex w-full items-stretch gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--inset)]/50 p-1.5">
          {(
            [
              {id: 'ffmpeg', label: t('PluginFfmpeg', lang), Icon: Film},
              {id: 'office', label: t('PluginOffice', lang), Icon: FileText},
              {id: 'link', label: t('PluginYtdlp', lang), Icon: Download},
            ] as const
          ).map(({id, label, Icon}) => {
            const isExpanded = activeEngine === id;
            const someoneElseExpanded = activeEngine !== null && !isExpanded;
            return (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-expanded={isExpanded}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setLatchedSegment(id);
                }}
                onFocus={() => setLatchedSegment(id)}
                onClick={() => setLatchedSegment(activeEngine === id ? null : id)}
                className={`flex min-h-[40px] min-w-0 items-center justify-center overflow-hidden rounded-xl border transition-[flex-grow,padding,background-color,border-color,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isExpanded
                    ? 'flex-[3.2] border-[var(--accent)]/50 bg-[var(--accent)]/15 px-3 text-[var(--ink)] shadow-sm'
                    : someoneElseExpanded
                      ? 'flex-[0.65] border-transparent bg-[var(--surface)]/70 px-1 text-[var(--muted)] hover:text-[var(--ink)]'
                      : 'flex-1 border-[var(--line)]/60 bg-[var(--surface)]/80 px-2 text-[var(--accent)] hover:border-[var(--accent)]/40'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 transition-colors duration-200 ${isExpanded ? 'text-[var(--accent)]' : ''}`} />
                <span
                  className={`overflow-hidden whitespace-nowrap text-[11px] font-semibold leading-none transition-[max-width,margin,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isExpanded ? 'ml-2 max-w-[150px] opacity-100' : 'ml-0 max-w-0 opacity-0'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      </div>

      {/* Clean Studio Footer Note */}
      <footer className="mt-4 text-center">
        <p className="text-[11px] font-medium text-[var(--muted)]">{t('StudioFooterNote', lang)}</p>
      </footer>
    </div>
  );
};
