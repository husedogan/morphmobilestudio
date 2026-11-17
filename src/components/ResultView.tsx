import React from 'react';
import {AlertTriangle, Check, Download, Grid, Share2} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {ExportItem, ExportResult, detectFileKind, formatBytes} from '../data/models';
import {FileThumb} from './FileThumb';

interface ResultViewProps {
  result: ExportResult;
  lang: Lang;
  onDownloadItem: (item: ExportItem) => void;
  onShareItem: (item: ExportItem) => void;
  onDownloadAll: () => void;
  onOpenLibrary: () => void;
  onNewTask: () => void;
}

export const ResultView: React.FC<ResultViewProps> = ({
  result,
  lang,
  onDownloadItem,
  onShareItem,
  onDownloadAll,
  onOpenLibrary,
  onNewTask,
}) => {
  const outputBytes = result.items.reduce((sum, i) => sum + i.size, 0);
  const sourceBytes = result.sourceBytes;
  const pct = sourceBytes > 0 && outputBytes > 0 ? Math.round((outputBytes / sourceBytes) * 100) : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
      <div className="morph-accent-btn flex h-14 w-14 items-center justify-center rounded-full shadow-lg">
        <Check className="h-7 w-7" />
      </div>

      <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-[var(--ink)] sm:text-3xl">
        {t('JobDoneTitle', lang)}
      </h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {result.items.length} {t('FilesCount', lang)} · {result.tool}
      </p>

      {/* Tabular Summary Strip */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--muted)]">{t('ResultSize', lang)}</p>
          <p className="font-mono-num mt-1 text-base font-bold text-[var(--ink)]">
            {formatBytes(outputBytes)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--muted)]">{t('SourceSize', lang)}</p>
          <p className="font-mono-num mt-1 text-base font-bold text-[var(--ink)]">
            {formatBytes(sourceBytes)}
          </p>
        </div>
        {pct !== null && (
          <div className="col-span-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:col-span-1">
            <p className="text-xs font-medium text-[var(--muted)]">{t('Savings', lang)}</p>
            <p className="font-mono-num mt-1 text-base font-bold text-[var(--accent)]">
              {pct <= 100
                ? `%${100 - pct} ${t('Smaller', lang)}`
                : `%${pct - 100} ${t('Larger', lang)}`}
            </p>
          </div>
        )}
      </div>

      {/* Output Files List */}
      <div className="mt-5 space-y-2.5">
        {result.items.slice(0, 24).map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3"
          >
            <FileThumb
              previewUrl={item.previewUrl}
              kind={detectFileKind(item.name, item.mime)}
              alt={item.name}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--ink)]">{item.name}</p>
              <p className="font-mono-num text-xs text-[var(--muted)]">{formatBytes(item.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => onShareItem(item)}
              aria-label={t('Share', lang)}
              className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--inset)] text-[var(--ink)] hover:border-[var(--accent)]"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDownloadItem(item)}
              aria-label={t('Download', lang)}
              className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)] hover:border-[var(--accent)]"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        ))}
        {result.items.length > 24 && (
          <p className="text-xs text-[var(--muted)]">
            +{result.items.length - 24} {t('FilesCount', lang)}
          </p>
        )}
      </div>

      <div className="mt-6 space-y-2.5">
        <button
          type="button"
          onClick={onDownloadAll}
          className="morph-accent-btn flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition-transform active:scale-[0.98]"
        >
          <Download className="h-4 w-4" />
          <span>{t('Download', lang)}</span>
        </button>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--inset)] text-sm font-semibold text-[var(--ink)]"
        >
          <Grid className="h-4 w-4" />
          <span>{t('OpenLibrary', lang)}</span>
        </button>
        <button
          type="button"
          onClick={onNewTask}
          className="flex min-h-[44px] w-full items-center justify-center text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
        >
          {t('NewTask', lang)}
        </button>
      </div>
    </div>
  );
};

export const ErrorView: React.FC<{message: string; lang: Lang; onDismiss: () => void}> = ({
  message,
  lang,
  onDismiss,
}) => {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)]">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-xl font-bold text-[var(--ink)]">{t('ProcessFailed', lang)}</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="morph-accent-btn mt-6 min-h-[46px] rounded-full px-8 text-sm font-semibold"
      >
        {t('Done', lang)}
      </button>
    </div>
  );
};
