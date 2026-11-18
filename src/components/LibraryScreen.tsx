import React, {useMemo, useState} from 'react';
import {Download, Eye, FolderOpen, Share2, Trash2, X} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {ExportItem, detectFileKind, formatBytes, formatDate} from '../data/models';
import {FileThumb} from './FileThumb';

interface LibraryScreenProps {
  items: ExportItem[];
  lang: Lang;
  onDownload: (item: ExportItem) => void;
  onShare: (item: ExportItem) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

type FilterKind = 'all' | 'image' | 'pdf' | 'archive' | 'other';

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  items,
  lang,
  onDownload,
  onShare,
  onDelete,
  onClearAll,
}) => {
  const [filter, setFilter] = useState<FilterKind>('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const [previewItem, setPreviewItem] = useState<{item: ExportItem; url: string} | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => {
      const kind = detectFileKind(item.name, item.mime);
      if (filter === 'other') return kind !== 'image' && kind !== 'pdf' && kind !== 'archive';
      return kind === filter;
    });
  }, [items, filter]);

  const openPreview = (item: ExportItem) => {
    const url = item.previewUrl || URL.createObjectURL(item.blob);
    setPreviewItem({item, url});
  };

  const closePreview = () => {
    if (previewItem && previewItem.url !== previewItem.item.previewUrl) {
      URL.revokeObjectURL(previewItem.url);
    }
    setPreviewItem(null);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--ink)] sm:text-3xl">
            {t('Library', lang)}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {items.length === 0
              ? t('LibrarySubtitleEmpty', lang)
              : `${t('HistoryLabel', lang)} · ${items.length} ${t('HistoryRecords', lang)}`}
          </p>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="flex min-h-[42px] items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-xs font-semibold text-[var(--accent)] hover:border-[var(--accent)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{t('ClearLibrary', lang)}</span>
          </button>
        )}
      </div>

      {/* Interactive Filter Tabs */}
      {items.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1.5 sm:inline-flex">
          {(
            [
              ['all', t('FilterAll', lang)],
              ['image', t('FilterImages', lang)],
              ['pdf', t('FilterPdf', lang)],
              ['archive', t('FilterZip', lang)],
              ['other', t('FilterOther', lang)],
            ] as const
          ).map(([id, label]) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`min-h-[38px] rounded-xl px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Items List */}
      <div className="mt-5">
        {filtered.length === 0 ? (
          <div className="flex items-center gap-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--inset)] text-[var(--accent)]">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--ink)]">{t('NoExportsYet', lang)}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{t('LibrarySubtitleEmpty', lang)}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filtered.map((item) => {
              const kind = detectFileKind(item.name, item.mime);
              const canPreview = kind === 'image' || kind === 'pdf';
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3"
                >
                  <FileThumb previewUrl={item.previewUrl} kind={kind} alt={item.name} sizeClass="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{item.name}</p>
                    <p className="font-mono-num mt-0.5 text-xs text-[var(--muted)]">
                      {formatBytes(item.size)} · {formatDate(item.createdAt, lang)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {canPreview && (
                      <button
                        type="button"
                        onClick={() => openPreview(item)}
                        aria-label={t('Preview', lang)}
                        className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--inset)] hover:text-[var(--ink)]"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onShare(item)}
                      aria-label={t('Share', lang)}
                      className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--inset)] hover:text-[var(--ink)]"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownload(item)}
                      aria-label={t('Download', lang)}
                      className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full text-[var(--accent)] hover:bg-[var(--inset)]"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      aria-label={t('Remove', lang)}
                      className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--inset)] hover:text-[var(--ink)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-5 text-xs text-[var(--muted)]">{t('OriginalSafeNote', lang)}</p>

      {/* Confirm Clear Modal */}
      {confirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setConfirmClear(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">{t('ConfirmClearLibrary', lang)}</h3>
            <p className="mt-2 text-xs text-[var(--muted)]">{t('OriginalSafeNote', lang)}</p>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="min-h-[44px] flex-1 rounded-full border border-[var(--line)] bg-[var(--inset)] text-sm font-semibold text-[var(--ink)]"
              >
                {t('Cancel', lang)}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  setConfirmClear(false);
                }}
                className="morph-accent-btn min-h-[44px] flex-1 rounded-full text-sm font-semibold"
              >
                {t('Clear', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Preview Modal */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/85 px-4 pt-[calc(var(--morph-safe-top)+0.75rem)] pb-[calc(var(--morph-safe-bottom)+1rem)] backdrop-blur-sm"
          onClick={closePreview}
        >
          <div className="flex items-center justify-between pb-3 text-white" onClick={(e) => e.stopPropagation()}>
            <span className="truncate text-sm font-semibold">{previewItem.item.name}</span>
            <button
              type="button"
              onClick={closePreview}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white/10"
              aria-label={t('Close', lang)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className="flex flex-1 items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {previewItem.item.mime.startsWith('image/') ? (
              <img
                src={previewItem.url}
                alt={previewItem.item.name}
                className="max-h-full max-w-full rounded-xl object-contain"
              />
            ) : (
              <iframe
                src={previewItem.url}
                title={previewItem.item.name}
                className="h-full w-full max-w-3xl rounded-xl bg-white"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
