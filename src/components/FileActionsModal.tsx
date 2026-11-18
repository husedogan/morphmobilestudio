import React, {useEffect, useState} from 'react';
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
  ClipboardCopy,
  Code2,
  Download,
  ExternalLink,
  FileArchive,
  FileCheck2,
  Hash,
  PenLine,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {PickedFile} from '../data/models';
import {InspectedFileInfo, blobToDataUrl, inspectPickedFile} from '../engine/fileInspector';

interface FileActionsModalProps {
  open: boolean;
  files: PickedFile[];
  lang: Lang;
  onClose: () => void;
  onPreviewFile: (file: PickedFile) => void;
  onShareSources: () => void;
  onSaveSources: () => void;
  onOpenBatchRename: () => void;
  onCreateZip: () => void;
  onOpenHashReport: () => void;
  onClearFiles: () => void;
  onSortQueue: (mode: 'az' | 'sizeAsc' | 'sizeDesc' | 'reverse') => void;
  onAutoNumberQueue: () => void;
  onShowToast: (msg: string) => void;
}

export const FileActionsModal: React.FC<FileActionsModalProps> = ({
  open,
  files,
  lang,
  onClose,
  onPreviewFile,
  onShareSources,
  onSaveSources,
  onOpenBatchRename,
  onCreateZip,
  onOpenHashReport,
  onClearFiles,
  onSortQueue,
  onAutoNumberQueue,
  onShowToast,
}) => {
  const [inspectIdx, setInspectIdx] = useState(0);
  const [info, setInfo] = useState<InspectedFileInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  const activeFile = files[Math.min(inspectIdx, Math.max(0, files.length - 1))] ?? null;

  useEffect(() => {
    if (!open || !activeFile) {
      setInfo(null);
      return;
    }
    let alive = true;
    setLoadingInfo(true);
    inspectPickedFile(activeFile)
      .then((res) => {
        if (alive) setInfo(res);
      })
      .finally(() => {
        if (alive) setLoadingInfo(false);
      });
    return () => {
      alive = false;
    };
  }, [open, activeFile]);

  if (!open || files.length === 0) return null;

  const copyText = async (val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      onShowToast(t('CopiedToast', lang));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = val;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      onShowToast(t('CopiedToast', lang));
    }
  };

  const handleCopyDataUrl = async () => {
    if (!activeFile) return;
    if (activeFile.size > 10 * 1024 * 1024) {
      onShowToast(t('DataUrlTooLarge', lang));
      return;
    }
    try {
      const dataUrl = await blobToDataUrl(activeFile.file);
      await copyText(dataUrl);
    } catch {
      onShowToast(t('ProcessFailed', lang));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-[var(--line)] sm:hidden" />

        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-extrabold text-[var(--ink)]">{t('FileActionsTitle', lang)}</h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {files.length} {t('FilesCount', lang)} · {t('FileActionsSubtitle', lang)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close', lang)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--inset)] text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-5 pb-[calc(var(--morph-safe-bottom)+1.25rem)] sm:pb-5">
          {/* 1. Quick Actions */}
          <div>
            <p className="mb-2.5 text-xs font-semibold text-[var(--muted)]">{t('QuickActionsGroup', lang)}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {activeFile && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onPreviewFile(activeFile);
                  }}
                  className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 text-left text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                >
                  <ExternalLink className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">{t('OpenFile', lang)}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onShareSources();
                }}
                className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 text-left text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
              >
                <Share2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                <span className="truncate">{t('Share', lang)}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSaveSources();
                }}
                className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 text-left text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
              >
                <Download className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                <span className="truncate">{t('SaveAllSourcesBtn', lang)}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBatchRename();
                }}
                className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 text-left text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
              >
                <PenLine className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                <span className="truncate">{t('ToolBatchRename', lang)}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateZip();
                }}
                className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 text-left text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
              >
                <FileArchive className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                <span className="truncate">{t('WheelZip', lang)}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHashReport();
                }}
                className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 text-left text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
              >
                <FileCheck2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                <span className="truncate">SHA-256 Raporu</span>
              </button>
            </div>
          </div>

          {/* 2. Queue Sort & Reorder (when 2+ files selected) */}
          {files.length > 1 && (
            <div>
              <p className="mb-2.5 text-xs font-semibold text-[var(--muted)]">{t('SortOrderGroup', lang)}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSortQueue('reverse')}
                  className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                >
                  <ArrowUpDown className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">{t('ReverseOrderBtn', lang)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSortQueue('az')}
                  className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                >
                  <ArrowDownAZ className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">{t('SortAZ', lang)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSortQueue('sizeAsc')}
                  className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                >
                  <ArrowUpNarrowWide className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">{t('SortSizeAsc', lang)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSortQueue('sizeDesc')}
                  className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                >
                  <ArrowDownWideNarrow className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">{t('SortSizeDesc', lang)}</span>
                </button>
                <button
                  type="button"
                  onClick={onAutoNumberQueue}
                  className="col-span-2 flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--inset)] px-3 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                >
                  <Hash className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">{t('ApplyRenameToQueue', lang)}</span>
                </button>
              </div>
            </div>
          )}

          {/* 3. Live Cryptographic & Metadata Inspector */}
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{t('InspectorGroup', lang)}</p>
            {files.length > 1 && (
              <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-1">
                {files.map((f, idx) => {
                  const active = idx === inspectIdx;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setInspectIdx(idx)}
                      className={`min-h-[36px] max-w-[165px] shrink-0 truncate rounded-xl border px-3 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)]/18 text-[var(--ink)]'
                          : 'border-[var(--line)] bg-[var(--inset)] text-[var(--muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {idx + 1}. {f.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4">
              {loadingInfo || !info ? (
                <p className="text-xs text-[var(--muted)]">{t('Working', lang)}</p>
              ) : (
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--muted)]">{t('DimensionsLabel', lang)}</span>
                    <span className="font-mono-num truncate font-semibold text-[var(--ink)]">{info.details}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--muted)]">{t('ExactBytesLabel', lang)}</span>
                    <span className="font-mono-num font-semibold text-[var(--ink)]">
                      {info.sizeFormatted} · {info.exactBytes.toLocaleString('en-US')} B
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--muted)]">MIME</span>
                    <span className="font-mono-num truncate font-semibold text-[var(--ink)]">{info.mime}</span>
                  </div>
                  <div className="border-t border-[var(--line)] pt-2.5">
                    <p className="text-[11px] font-semibold text-[var(--muted)]">SHA-256</p>
                    <p className="font-mono-num mt-1 break-all text-[11px] leading-relaxed text-[var(--ink)]">
                      {info.sha256}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1.5">
                    <button
                      type="button"
                      onClick={() => copyText(info.sha256)}
                      className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] whitespace-nowrap transition-colors hover:border-[var(--accent)]"
                    >
                      <ClipboardCopy className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                      <span>{t('CopySha256', lang)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyDataUrl}
                      className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] whitespace-nowrap transition-colors hover:border-[var(--accent)]"
                    >
                      <Code2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                      <span>{t('CopyDataUrl', lang)}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Clear Selection Button */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onClearFiles();
            }}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--inset)] px-4 text-xs font-semibold text-[var(--accent)] transition-colors hover:border-[var(--accent)]"
          >
            <Trash2 className="h-4 w-4" />
            <span>{t('Clear', lang)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
