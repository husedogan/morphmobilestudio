import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowLeftRight,
  ArrowUpDown,
  CheckCircle2,
  Cloud,
  Contact,
  Contrast,
  Crop,
  Download,
  Droplets,
  ExternalLink,
  EyeOff,
  FileArchive,
  FileCheck2,
  FileImage,
  FileMinus,
  FileOutput,
  FileText,
  Film,
  Grid,
  Hash,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Music,
  Package,
  PenLine,
  Plus,
  RefreshCw,
  RotateCw,
  ScanLine,
  Scissors,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {FileActionsModal} from './components/FileActionsModal';
import {JobOverlay} from './components/JobOverlay';
import {LibraryScreen} from './components/LibraryScreen';
import {OfflineBanner} from './components/PWAInstallButton';
import {ErrorView, ResultView} from './components/ResultView';
import {SettingsCategory, SettingsScreen} from './components/SettingsScreen';
import {StudioScreen} from './components/StudioScreen';
import {ToolFlow} from './components/ToolFlow';
import {CustomizeWheelTab, WheelCustomizeModal} from './components/WheelCustomizeModal';
import {WheelActionItem, WheelFab, WheelMenu} from './components/WheelMenu';
import {t} from './data/i18n';
import {
  ALL_CONVERT_FORMATS_CATALOG,
  ALL_TOOLS,
  ALL_WHEEL_ACTIONS_CATALOG,
  DEFAULT_WHEEL_CONFIG,
  ExportItem,
  JobState,
  PickedFile,
  Prefs,
  SERVER_TOOLS,
  ServerToolDef,
  ToolId,
  buildPickedFile,
  convertTargetsForSelection,
  serverToolsForSelection,
  shortWheelToolLabel,
  smartConvertTargetsForSelection,
  smartToolIdsForSelection,
  toolsForSelection,
} from './data/models';
import {applyThemeTokens} from './data/themes';
import {computeBatchRenamedNames} from './engine/fileInspector';
import {
  GITHUB_REPO,
  GithubUpdateInfo,
  applyPwaUpdateIfWaiting,
  checkGithubUpdates,
} from './engine/githubUpdater';
import {
  clearAllExports,
  deleteExportItem,
  loadLibraryItems,
  loadPrefs,
  saveExportItems,
  savePrefs,
} from './engine/libraryDb';
import {downloadBuiltInLink} from './engine/linkDownloader';
import {
  acquireJobWakeLock,
  ensureStoragePermission,
  isNativeApp,
  notifyJobCompleted,
  saveOrDownloadBlob,
  saveOrDownloadExportItem,
  shareExportItem,
  shareNativeOrWebBlob,
} from './engine/nativeBridge';
import {extractDocumentText} from './engine/officeOps';
import {ToolOptions, runEmbeddedMediaTool, runLocalTool} from './engine/processor';
import {
  cancelServerJob,
  checkServerHealth,
  downloadServerOutput,
  fetchServerJobStatus,
  submitServerJob,
  submitServerUrl,
} from './engine/serverApi';

type Tab = 'studio' | 'library' | 'settings';
type ToolMode = 'convert' | 'tools' | 'web' | null;
type WheelKind = 'main' | 'convert' | 'tools' | 'actions' | null;

function wheelIconForLocalTool(id: ToolId) {
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
      return SlidersHorizontal;
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

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [isDark, setIsDark] = useState(true);
  const [tab, setTab] = useState<Tab>('studio');
  const [toolMode, setToolMode] = useState<ToolMode>(null);
  const [directTool, setDirectTool] = useState<ToolId | null>(null);
  const [directFormat, setDirectFormat] = useState<string | null>(null);
  const [directServerTool, setDirectServerTool] = useState<ServerToolDef | null>(null);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [library, setLibrary] = useState<ExportItem[]>([]);
  const [job, setJob] = useState<JobState>({status: 'idle'});
  const [serverStatus, setServerStatus] = useState('');
  const [wheelKind, setWheelKind] = useState<WheelKind>(null);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('appearance');
  const [customizeModal, setCustomizeModal] = useState<{open: boolean; tab: CustomizeWheelTab}>({
    open: false,
    tab: 'tools',
  });
  const [showManageTools, setShowManageTools] = useState(false);
  const [showFileActions, setShowFileActions] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<PickedFile | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [sourcePreviewText, setSourcePreviewText] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showWheelCloud, setShowWheelCloud] = useState<boolean>(false);
  const [showGearCloud, setShowGearCloud] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<GithubUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const activeServerJobIdRef = useRef<string | null>(null);
  const wheelDocInputRef = useRef<HTMLInputElement>(null);
  const wheelPhotoInputRef = useRef<HTMLInputElement>(null);

  const lang = prefs.lang;
  const serverReady = prefs.serverUrl.trim().length > 0;

  useEffect(() => {
    const dark = applyThemeTokens(prefs.theme, prefs.preset);
    setIsDark(dark);
    savePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (prefs.theme === 'system') {
        setIsDark(applyThemeTokens('system', prefs.preset));
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [prefs.theme, prefs.preset]);

  useEffect(() => {
    loadLibraryItems().then(setLibrary);
    checkGithubUpdates().then(setUpdateInfo).catch(() => {});
    if (isNativeApp()) {
      ensureStoragePermission(true).catch(() => {});
    }
  }, []);

  // Keep screen awake during active encoding/downloading jobs and notify if completed in background
  useEffect(() => {
    if (job.status === 'running') {
      let active = true;
      let releaseFn: (() => void) | null = null;
      acquireJobWakeLock().then((fn) => {
        if (!active) {
          fn?.();
        } else {
          releaseFn = fn;
        }
      });
      return () => {
        active = false;
        releaseFn?.();
      };
    }
    if (job.status === 'done') {
      notifyJobCompleted('Morph', `${job.result.tool} · ${t('JobDoneTitle', lang)}`);
    }
  }, [job, lang]);

  // Safety 3-second auto-dismiss when clouds are revealed on touch/focus
  useEffect(() => {
    if (!showWheelCloud) return;
    const timer = setTimeout(() => setShowWheelCloud(false), 3000);
    return () => clearTimeout(timer);
  }, [showWheelCloud]);

  useEffect(() => {
    if (!showGearCloud) return;
    const timer = setTimeout(() => setShowGearCloud(false), 3000);
    return () => clearTimeout(timer);
  }, [showGearCloud]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2800);
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const info = await checkGithubUpdates();
      setUpdateInfo(info);
      if (info.error) {
        showToast(info.error);
      } else if (info.hasUpdate) {
        showToast(t('UpdateAvailable', lang));
      } else {
        showToast(t('UpToDate', lang));
      }
    } finally {
      setCheckingUpdate(false);
    }
  }, [lang, showToast]);

  const handleApplyUpdate = useCallback(async () => {
    const reloaded = await applyPwaUpdateIfWaiting();
    if (reloaded) return;
    if (isNativeApp()) {
      const targetUrl =
        updateInfo?.apkDownloadUrl ?? `https://github.com/${GITHUB_REPO}/releases/latest`;
      const a = document.createElement('a');
      a.href = targetUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    window.location.reload();
  }, [updateInfo]);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    setFiles((prev) => {
      const existingKeys = new Set(prev.map((p) => `${p.name}:${p.size}`));
      const next = [...prev];
      for (const f of arr) {
        const key = `${f.name}:${f.size}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          next.push(buildPickedFile(f));
        }
      }
      return next;
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const moveFile = useCallback((index: number, delta: -1 | 1) => {
    setFiles((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  }, []);

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
      return [];
    });
  }, []);

  const handleSortQueue = useCallback(
    (mode: 'az' | 'sizeAsc' | 'sizeDesc' | 'reverse') => {
      setFiles((prev) => {
        if (prev.length <= 1) return prev;
        const copy = [...prev];
        if (mode === 'reverse') {
          copy.reverse();
        } else if (mode === 'az') {
          copy.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
        } else if (mode === 'sizeAsc') {
          copy.sort((a, b) => a.size - b.size);
        } else if (mode === 'sizeDesc') {
          copy.sort((a, b) => b.size - a.size);
        }
        return copy;
      });
      showToast(t('QueueSortedToast', lang));
    },
    [lang, showToast]
  );

  const handleAutoNumberQueue = useCallback(() => {
    setFiles((prev) => {
      if (prev.length === 0) return prev;
      const renamed = computeBatchRenamedNames(prev, {
        baseName: '',
        prefix: '',
        suffix: '',
        findText: '',
        replaceText: '',
        numbering: true,
        startNumber: 1,
        letterCase: 'keep',
      });
      return prev.map((pf, idx) => {
        const newName = renamed[idx].newName;
        const dot = newName.lastIndexOf('.');
        const newBase = dot > 0 ? newName.slice(0, dot) : newName;
        const updatedFile = new File([pf.file], newName, {type: pf.mime});
        return {
          ...pf,
          name: newName,
          baseName: newBase,
          file: updatedFile,
        };
      });
    });
    showToast(t('QueueRenamedToast', lang));
  }, [lang, showToast]);

  const handleTestServer = useCallback(async () => {
    const url = prefs.serverUrl.trim();
    if (!url) {
      setServerStatus(t('NoServerUrl', lang));
      return;
    }
    setServerStatus(t('Checking', lang));
    try {
      const h = await checkServerHealth(url, prefs.serverToken);
      if (!h.ok) {
        setServerStatus(t('NotConnected', lang));
        return;
      }
      const caps = [
        h.ffmpeg ? 'FFmpeg' : null,
        h.libreoffice ? 'LibreOffice' : null,
        h.ytdlp ? 'yt-dlp' : null,
      ].filter(Boolean);
      setServerStatus(
        `${t('Connected', lang)}${caps.length > 0 ? ` · ${caps.join(', ')}` : ''}`
      );
    } catch {
      setServerStatus(t('NotConnected', lang));
    }
  }, [prefs.serverUrl, prefs.serverToken, lang]);

  const openToolMode = useCallback(
    (
      nextMode: ToolMode,
      opts?: {tool?: ToolId | null; format?: string | null; serverTool?: ServerToolDef | null}
    ) => {
      setDirectTool(opts?.tool ?? null);
      setDirectFormat(opts?.format ?? null);
      setDirectServerTool(opts?.serverTool ?? null);
      setToolMode(nextMode);
    },
    []
  );

  const handleRunLocal = useCallback(
    async (toolId: ToolId, title: string, options: ToolOptions) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setJob({status: 'running', title, progress: 0.05, step: '', canCancel: true});

      try {
        const result = await runLocalTool(
          toolId,
          title,
          files,
          options,
          (progress, step) => {
            if (!ctrl.signal.aborted) {
              setJob({status: 'running', title, progress, step, canCancel: true});
            }
          },
          ctrl.signal
        );
        await saveExportItems(result.items);
        setLibrary((prev) => [...result.items, ...prev].slice(0, 200));
        setJob({status: 'done', result});
      } catch (err) {
        if (ctrl.signal.aborted) {
          setJob({status: 'idle'});
          return;
        }
        const message = err instanceof Error ? err.message : t('ProcessFailed', lang);
        setJob({status: 'failed', message});
      }
    },
    [files, lang]
  );

  const pollAndFinishServerJob = useCallback(
    async (
      serverUrl: string,
      token: string | undefined,
      jobId: string,
      title: string,
      sourceBytes: number,
      ctrl: AbortController
    ) => {
      activeServerJobIdRef.current = jobId;
      while (!ctrl.signal.aborted) {
        const st = await fetchServerJobStatus(serverUrl, token, jobId, ctrl.signal);
        setJob({
          status: 'running',
          title,
          progress: 0.15 + Math.min(1, Math.max(0, st.progress)) * 0.7,
          step: st.message || t('Working', lang),
          canCancel: true,
        });
        if (st.state === 'done') {
          const items: ExportItem[] = [];
          for (let i = 0; i < st.outputs.length; i++) {
            setJob({
              status: 'running',
              title,
              progress: 0.85 + ((i + 1) / Math.max(1, st.outputs.length)) * 0.14,
              step: t('Saving', lang),
              canCancel: true,
            });
            items.push(
              await downloadServerOutput(
                serverUrl,
                token,
                jobId,
                i,
                st.outputs[i].name,
                title,
                ctrl.signal
              )
            );
          }
          if (items.length === 0) throw new Error('No output produced.');
          await saveExportItems(items);
          setLibrary((prev) => [...items, ...prev].slice(0, 200));
          activeServerJobIdRef.current = null;
          setJob({status: 'done', result: {items, tool: title, sourceBytes}});
          return;
        }
        if (st.state === 'error' || st.state === 'cancelled') {
          throw new Error(st.error || t('ProcessFailed', lang));
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    },
    [lang]
  );

  const handleRunServer = useCallback(
    async (tool: ServerToolDef, options: Record<string, string>) => {
      const title = lang === 'tr' ? tool.titleTr : tool.titleEn;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setJob({
        status: 'running',
        title,
        progress: 0.05,
        step: serverReady ? t('Uploading', lang) : t('Working', lang),
        canCancel: true,
      });

      try {
        if (serverReady) {
          const jobId = await submitServerJob(
            prefs.serverUrl,
            prefs.serverToken,
            tool.id,
            files,
            options,
            ctrl.signal
          );
          const sourceBytes = files.reduce((s, f) => s + f.size, 0);
          await pollAndFinishServerJob(prefs.serverUrl, prefs.serverToken, jobId, title, sourceBytes, ctrl);
          return;
        }

        const result = await runEmbeddedMediaTool(
          tool,
          title,
          files,
          options,
          (progress, step) => {
            if (!ctrl.signal.aborted) {
              setJob({status: 'running', title, progress, step, canCancel: true});
            }
          },
          ctrl.signal
        );
        await saveExportItems(result.items);
        setLibrary((prev) => [...result.items, ...prev].slice(0, 200));
        setJob({status: 'done', result});
      } catch (err) {
        activeServerJobIdRef.current = null;
        if (ctrl.signal.aborted) {
          setJob({status: 'idle'});
          return;
        }
        setJob({status: 'failed', message: err instanceof Error ? err.message : t('ProcessFailed', lang)});
      }
    },
    [files, lang, prefs.serverToken, prefs.serverUrl, pollAndFinishServerJob, serverReady]
  );

  const handleRunLink = useCallback(
    async (url: string, options: Record<string, string>) => {
      const title = t('DownloadLink', lang);
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setJob({status: 'running', title, progress: 0.08, step: t('Uploading', lang), canCancel: true});

      try {
        if (serverReady) {
          const jobId = await submitServerUrl(prefs.serverUrl, prefs.serverToken, url, options, ctrl.signal);
          await pollAndFinishServerJob(prefs.serverUrl, prefs.serverToken, jobId, title, 0, ctrl);
          return;
        }

        const item = await downloadBuiltInLink(
          url,
          options.format || 'video',
          title,
          (progress, step) => {
            if (!ctrl.signal.aborted) {
              setJob({status: 'running', title, progress, step, canCancel: true});
            }
          },
          ctrl.signal,
          options.engine
            ? {...prefs, downloadEngine: options.engine as Prefs['downloadEngine']}
            : prefs
        );
        await saveExportItems([item]);
        setLibrary((prev) => [item, ...prev].slice(0, 200));
        setJob({status: 'done', result: {items: [item], tool: title, sourceBytes: item.size}});
      } catch (err) {
        activeServerJobIdRef.current = null;
        if (ctrl.signal.aborted) {
          setJob({status: 'idle'});
          return;
        }
        setJob({status: 'failed', message: err instanceof Error ? err.message : t('ProcessFailed', lang)});
      }
    },
    [lang, prefs, pollAndFinishServerJob, serverReady]
  );

  const handleCancelJob = useCallback(() => {
    abortRef.current?.abort();
    const serverJobId = activeServerJobIdRef.current;
    if (serverJobId && prefs.serverUrl) {
      cancelServerJob(prefs.serverUrl, prefs.serverToken, serverJobId);
      activeServerJobIdRef.current = null;
    }
    setJob({status: 'idle'});
  }, [prefs.serverToken, prefs.serverUrl]);

  const handleSaveOrDownload = useCallback(
    async (item: ExportItem) => {
      try {
        const mode = await saveOrDownloadExportItem(item);
        showToast(
          mode === 'saved'
            ? `${item.name} · ${t('SavedToDocuments', lang)}`
            : `${item.name} — ${t('Download', lang)}`
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : t('ProcessFailed', lang));
      }
    },
    [lang, showToast]
  );

  const handleShareItem = useCallback(
    async (item: ExportItem) => {
      try {
        const result = await shareExportItem(item);
        if (result === 'downloaded') {
          showToast(`${item.name} — ${t('Download', lang)}`);
        }
      } catch {
        // User cancelled
      }
    },
    [lang, showToast]
  );

  const handleDownloadAll = useCallback(
    async (items: ExportItem[]) => {
      try {
        for (let i = 0; i < items.length; i++) {
          await saveOrDownloadExportItem(items[i], items.length === 1);
        }
        if (isNativeApp()) {
          showToast(`${items.length} ${t('FilesCount', lang)} · ${t('SavedToDocuments', lang)}`);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : t('ProcessFailed', lang));
      }
    },
    [lang, showToast]
  );

  const handleDeleteExport = useCallback(async (id: string) => {
    await deleteExportItem(id);
    setLibrary((prev) => {
      const found = prev.find((i) => i.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const handleClearLibrary = useCallback(async () => {
    await clearAllExports();
    setLibrary((prev) => {
      prev.forEach((i) => {
        if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
      });
      return [];
    });
  }, []);

  const handleSaveSources = useCallback(async () => {
    if (files.length === 0) return;
    try {
      for (const f of files) {
        await saveOrDownloadBlob(f.file, f.name, files.length === 1);
      }
      showToast(
        isNativeApp()
          ? `${files.length} ${t('FilesCount', lang)} · ${t('SavedToDocuments', lang)}`
          : `${files.length} ${t('FilesCount', lang)} — ${t('Download', lang)}`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('ProcessFailed', lang));
    }
  }, [files, lang, showToast]);

  const handleShareSources = useCallback(async () => {
    if (files.length === 0) return;
    if (files.length === 1) {
      await shareNativeOrWebBlob(files[0].file, files[0].name, files[0].mime);
      return;
    }
    const rawFiles = files.map((f) => f.file);
    if (!isNativeApp() && navigator.canShare && navigator.canShare({files: rawFiles})) {
      try {
        await navigator.share({files: rawFiles, title: `${files.length} files`});
        return;
      } catch {
        // Fallback to download
      }
    }
    await handleSaveSources();
  }, [files, handleSaveSources]);

  const closeSourcePreview = useCallback(() => {
    if (previewTarget && sourcePreviewUrl && !previewTarget.previewUrl) {
      URL.revokeObjectURL(sourcePreviewUrl);
    }
    setPreviewTarget(null);
    setSourcePreviewUrl(null);
    setSourcePreviewText(null);
  }, [previewTarget, sourcePreviewUrl]);

  const handleOpenSourcePreview = useCallback(
    async (explicitFile?: PickedFile) => {
      const target = explicitFile ?? files[0];
      if (!target) return;

      if (
        target.kind === 'image' ||
        target.kind === 'pdf' ||
        target.kind === 'video' ||
        target.kind === 'audio'
      ) {
        const url = target.previewUrl ?? URL.createObjectURL(target.file);
        setPreviewTarget(target);
        setSourcePreviewText(null);
        setSourcePreviewUrl(url);
        return;
      }

      if (target.kind === 'document') {
        try {
          const text = await extractDocumentText(target);
          setPreviewTarget(target);
          setSourcePreviewUrl(null);
          setSourcePreviewText(text.slice(0, 120000) || '(Boş belge)');
          return;
        } catch {
          // Fallback below
        }
      }

      setShowFileActions(true);
    },
    [files]
  );

  const wheelConfig = prefs.wheelConfig ?? DEFAULT_WHEEL_CONFIG;

  const {wheelTitle, wheelActions} = useMemo<{
    wheelTitle: string | undefined;
    wheelActions: WheelActionItem[];
  }>(() => {
    const mode = wheelConfig.mode;

    if (wheelKind === 'convert') {
      const compatible = convertTargetsForSelection(files);
      const compatibleSet = new Set(compatible);
      const smartTargets = smartConvertTargetsForSelection(files);

      const toFormatSlice = (fmt: string, isCompatible: boolean): WheelActionItem => ({
        id: `fmt:${fmt}`,
        label: fmt.toUpperCase(),
        icon: fmt === 'pdf' ? FileText : ArrowLeftRight,
        disabled: !isCompatible,
      });

      if (mode === 'all') {
        const inapplicable = ALL_CONVERT_FORMATS_CATALOG.filter((fmt) => !compatibleSet.has(fmt));
        const slices: WheelActionItem[] =
          compatible.length === 0
            ? [
                {id: 'local:ZIP_CREATE', label: t('WheelZip', lang), icon: FileArchive},
                {id: 'open:tools', label: t('AllToolsShort', lang), icon: SlidersHorizontal},
                ...inapplicable.map((fmt) => toFormatSlice(fmt, false)),
              ]
            : [
                ...smartTargets.map((fmt) => toFormatSlice(fmt, true)),
                ...inapplicable.map((fmt) => toFormatSlice(fmt, false)),
              ];
        return {
          wheelTitle: t('Convert', lang),
          wheelActions: slices,
        };
      }

      if (mode === 'pinned' && wheelConfig.pinnedConvert.length > 0) {
        const pinnedSlices = wheelConfig.pinnedConvert.map((fmt) =>
          toFormatSlice(fmt, compatibleSet.has(fmt))
        );
        const hasMoreCompatible = compatible.some((fmt) => !wheelConfig.pinnedConvert.includes(fmt));
        return {
          wheelTitle: t('Convert', lang),
          wheelActions: hasMoreCompatible
            ? [
                ...pinnedSlices,
                {id: 'open:convert', label: t('AllFormatsShort', lang), icon: ArrowLeftRight},
              ]
            : pinnedSlices,
        };
      }

      // Smart mode: rank formats by exact file extension and count
      if (compatible.length === 0) {
        return {
          wheelTitle: t('Convert', lang),
          wheelActions: [
            {id: 'local:ZIP_CREATE', label: t('WheelZip', lang), icon: FileArchive},
            {id: 'open:tools', label: t('AllToolsShort', lang), icon: SlidersHorizontal},
            ...['pdf', 'jpg', 'mp4', 'mp3'].map((fmt) => toFormatSlice(fmt, false)),
          ],
        };
      }
      if (smartTargets.length > 6) {
        return {
          wheelTitle: t('Convert', lang),
          wheelActions: [
            ...smartTargets.slice(0, 5).map((fmt) => toFormatSlice(fmt, true)),
            {id: 'open:convert', label: t('AllFormatsShort', lang), icon: ArrowLeftRight},
          ],
        };
      }
      return {
        wheelTitle: t('Convert', lang),
        wheelActions: smartTargets.map((fmt) => toFormatSlice(fmt, true)),
      };
    }

    if (wheelKind === 'tools') {
      const compatibleLocals = new Set(toolsForSelection(files).map((d) => `local:${d.id}`));
      const compatibleServers = new Set(serverToolsForSelection(files).map((d) => `server:${d.id}`));
      const compatibleSet = new Set<string>([...compatibleLocals, ...compatibleServers]);
      compatibleSet.delete('local:CONVERT');

      const allCatalogMap = new Map<string, WheelActionItem>();
      for (const toolId of Object.keys(ALL_TOOLS) as ToolId[]) {
        if (toolId === 'CONVERT') continue;
        const def = ALL_TOOLS[toolId];
        const key = `local:${toolId}`;
        allCatalogMap.set(key, {
          id: key,
          label: shortWheelToolLabel(toolId, lang, t(def.titleKey, lang)),
          icon: wheelIconForLocalTool(toolId),
          disabled: !compatibleSet.has(key),
        });
      }
      for (const srv of SERVER_TOOLS) {
        const key = `server:${srv.id}`;
        allCatalogMap.set(key, {
          id: key,
          label: shortWheelToolLabel(srv.id, lang, lang === 'tr' ? srv.titleTr : srv.titleEn),
          icon: srv.id.startsWith('video')
            ? Film
            : srv.id.startsWith('audio')
              ? Music
              : FileText,
          disabled: !compatibleSet.has(key),
        });
      }

      const smartIds = smartToolIdsForSelection(files).filter(
        (id) => id !== 'local:CONVERT' && allCatalogMap.has(id)
      );

      if (mode === 'all') {
        const seen = new Set(smartIds);
        const inapplicableIds = Array.from(allCatalogMap.keys()).filter((id) => !seen.has(id));
        return {
          wheelTitle: t('Tools', lang),
          wheelActions: [
            ...smartIds.map((id) => allCatalogMap.get(id)!),
            ...inapplicableIds.map((id) => allCatalogMap.get(id)!),
          ],
        };
      }

      if (mode === 'pinned' && wheelConfig.pinnedTools.length > 0) {
        const pinnedSlices = wheelConfig.pinnedTools
          .filter((id) => allCatalogMap.has(id))
          .map((id) => allCatalogMap.get(id)!);
        const hasMoreCompatible = Array.from(compatibleSet).some(
          (id) => !wheelConfig.pinnedTools.includes(id)
        );
        return {
          wheelTitle: t('Tools', lang),
          wheelActions: hasMoreCompatible
            ? [
                ...pinnedSlices,
                {id: 'open:tools', label: t('AllToolsShort', lang), icon: SlidersHorizontal},
              ]
            : pinnedSlices,
        };
      }

      // Smart mode: prioritize context-aware tools by file kind, count, size, and name
      if (smartIds.length > 6) {
        return {
          wheelTitle: t('Tools', lang),
          wheelActions: [
            ...smartIds.slice(0, 5).map((id) => allCatalogMap.get(id)!),
            {id: 'open:tools', label: t('AllToolsShort', lang), icon: SlidersHorizontal},
          ],
        };
      }
      return {
        wheelTitle: t('Tools', lang),
        wheelActions: smartIds.map((id) => allCatalogMap.get(id)!),
      };
    }

    if (wheelKind === 'actions') {
      const iconForAction = (actId: string) => {
        switch (actId) {
          case 'action:sheet':
            return SlidersHorizontal;
          case 'action:open':
            return ExternalLink;
          case 'action:share':
            return Share2;
          case 'action:save':
            return Download;
          case 'local:BATCH_RENAME':
            return PenLine;
          case 'action:reverse':
          case 'action:sortAz':
            return ArrowUpDown;
          case 'action:autoNum':
            return Hash;
          case 'local:FILE_HASH_INFO':
            return FileCheck2;
          case 'local:ZIP_CREATE':
            return FileArchive;
          case 'action:clear':
            return Trash2;
          default:
            return SlidersHorizontal;
        }
      };

      const labelForAction = (actId: string, labelKey: string) => {
        if (actId === 'local:FILE_HASH_INFO') {
          return shortWheelToolLabel('FILE_HASH_INFO', lang, t(ALL_TOOLS.FILE_HASH_INFO.titleKey, lang));
        }
        return t(labelKey, lang);
      };

      const fullActionMap = new Map<string, WheelActionItem>(
        ALL_WHEEL_ACTIONS_CATALOG.map((act) => {
          const isInapplicable = files.length === 0 || Boolean(act.multiOnly && files.length <= 1);
          return [
            act.id,
            {
              id: act.id,
              label: labelForAction(act.id, act.labelKey),
              icon: iconForAction(act.id),
              disabled: isInapplicable,
            },
          ];
        })
      );

      if (mode === 'all') {
        return {
          wheelTitle: t('FileActions', lang),
          wheelActions: Array.from(fullActionMap.values()),
        };
      }

      if (mode === 'pinned' && wheelConfig.pinnedActions.length > 0) {
        const chosen = wheelConfig.pinnedActions
          .filter((id) => fullActionMap.has(id))
          .map((id) => fullActionMap.get(id)!);
        const hasSheet = chosen.some((c) => c.id === 'action:sheet');
        const compatibleCount = Array.from(fullActionMap.values()).filter((a) => !a.disabled).length;
        const activeChosenCount = chosen.filter((a) => !a.disabled).length;
        return {
          wheelTitle: t('FileActions', lang),
          wheelActions:
            compatibleCount > activeChosenCount && !hasSheet && fullActionMap.has('action:sheet')
              ? [...chosen, fullActionMap.get('action:sheet')!]
              : chosen,
        };
      }

      // Smart mode: multi-file queue promotes sorting; single-file shows disabled Reverse slice alongside active single-file tools
      const smartActionIds =
        files.length > 1
          ? [
              'action:sheet',
              'action:reverse',
              'action:sortAz',
              'local:BATCH_RENAME',
              'action:share',
              'local:ZIP_CREATE',
            ]
          : [
              'action:sheet',
              'action:open',
              'action:share',
              'local:FILE_HASH_INFO',
              'local:BATCH_RENAME',
              'action:reverse',
            ];

      return {
        wheelTitle: t('FileActions', lang),
        wheelActions: smartActionIds
          .filter((id) => fullActionMap.has(id))
          .map((id) => fullActionMap.get(id)!),
      };
    }

    // Default main navigation wheel
    return {
      wheelTitle: undefined,
      wheelActions: [
        {id: 'nav:studio', label: t('Studio', lang), icon: Sparkles},
        {id: 'nav:library', label: t('Library', lang), icon: Grid},
        {id: 'nav:server', label: t('WheelCloud', lang), icon: Cloud},
        {id: 'open:web', label: t('WheelLink', lang), icon: Download},
        {id: 'pick:files', label: t('WheelPick', lang), icon: Plus},
        {id: 'pick:photos', label: t('WheelPhotos', lang), icon: ImageIcon},
      ],
    };
  }, [wheelKind, files, lang, wheelConfig]);

  const handleWheelSelect = (id: string) => {
    setWheelKind(null);
    if (id.startsWith('fmt:')) {
      const fmt = id.slice(4);
      openToolMode('convert', {format: fmt});
      return;
    }
    if (id.startsWith('local:')) {
      const toolId = id.slice(6) as ToolId;
      openToolMode('tools', {tool: toolId});
      return;
    }
    if (id.startsWith('server:')) {
      const serverId = id.slice(7);
      const found = serverToolsForSelection(files).find((s) => s.id === serverId) ?? null;
      openToolMode('tools', {serverTool: found});
      return;
    }
    switch (id) {
      case 'pick:files':
        setToolMode(null);
        setTab('studio');
        wheelDocInputRef.current?.click();
        break;
      case 'pick:photos':
        setToolMode(null);
        setTab('studio');
        wheelPhotoInputRef.current?.click();
        break;
      case 'open:convert':
        openToolMode('convert');
        break;
      case 'open:tools':
        openToolMode('tools');
        break;
      case 'open:web':
        openToolMode('web');
        break;
      case 'action:sheet':
        setShowFileActions(true);
        break;
      case 'action:reverse':
        handleSortQueue('reverse');
        break;
      case 'action:sortAz':
        handleSortQueue('az');
        break;
      case 'action:autoNum':
        handleAutoNumberQueue();
        break;
      case 'action:share':
        handleShareSources();
        break;
      case 'action:save':
        handleSaveSources();
        break;
      case 'action:open':
        handleOpenSourcePreview();
        break;
      case 'action:clear':
        clearFiles();
        break;
      case 'nav:studio':
        setToolMode(null);
        setTab('studio');
        break;
      case 'nav:library':
        setToolMode(null);
        setTab('library');
        break;
      case 'nav:server':
        setToolMode(null);
        setSettingsCategory('downloads');
        setTab('settings');
        break;
      case 'nav:settings':
        setToolMode(null);
        setSettingsCategory('appearance');
        setTab('settings');
        break;
    }
  };

  return (
    <div className="morph-bg min-h-screen text-[var(--ink)]">
      {/* Hidden inputs for WheelMenu */}
      <input
        ref={wheelDocInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={wheelPhotoInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Compact 3-Zone Top Bar with Android/iOS Safe-Area Top Inset */}
      <header className="sticky top-0 z-30 border-b border-[var(--line)]/70 bg-[var(--paper)]/92 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-13 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              setJob({status: 'idle'});
              setToolMode(null);
              setTab('studio');
            }}
            className="flex items-center gap-2 whitespace-nowrap shrink-0 text-left"
          >
            <img src="/morph-wordmark.png" alt="Morph" className="h-7 w-auto object-contain" />
          </button>

          {/* Zone 2: Desktop Single-Line Navigation Links */}
          <nav className="hidden items-center gap-6 md:flex">
            {(
              [
                ['studio', t('Studio', lang)],
                ['library', t('Library', lang)],
              ] as const
            ).map(([id, label]) => {
              const active = tab === id && !toolMode && job.status === 'idle';
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setJob({status: 'idle'});
                    setToolMode(null);
                    setTab(id);
                  }}
                  className={`whitespace-nowrap shrink-0 border-b-2 py-1 text-sm font-semibold transition-colors ${
                    active
                      ? 'border-[var(--accent)] text-[var(--ink)]'
                      : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Continuously Spinning Settings Gear + Hover Info Cloud */}
          <div
            className="relative flex items-center shrink-0"
            onMouseEnter={() => setShowGearCloud(true)}
            onMouseLeave={() => setShowGearCloud(false)}
          >
            <button
              type="button"
              onClick={() => {
                setShowGearCloud(false);
                setJob({status: 'idle'});
                setToolMode(null);
                setSettingsCategory('appearance');
                setTab('settings');
              }}
              onFocus={() => setShowGearCloud(true)}
              onBlur={() => setShowGearCloud(false)}
              aria-label={t('Settings', lang)}
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                tab === 'settings' && !toolMode
                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'border-[var(--line)] bg-[var(--inset)] text-[var(--ink)] hover:border-[var(--accent)]'
              }`}
            >
              <Settings className="morph-gear-spin h-5 w-5" />
            </button>

            {!toolMode && job.status === 'idle' && showGearCloud && (
              <div
                role="tooltip"
                className="pointer-events-none absolute right-0 top-[48px] z-40 rounded-2xl border border-[var(--accent)]/40 bg-[var(--surface)]/95 px-3 py-1.5 text-[11px] font-medium text-[var(--ink)] shadow-xl backdrop-blur-md whitespace-nowrap"
              >
                <span className="absolute -top-1.5 right-3.5 h-3 w-3 rotate-45 border-l border-t border-[var(--accent)]/40 bg-[var(--surface)]" />
                {t('GearCloudTip', lang)}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-safe">
        {job.status === 'done' ? (
          <ResultView
            result={job.result}
            lang={lang}
            onDownloadItem={handleSaveOrDownload}
            onShareItem={handleShareItem}
            onDownloadAll={() => handleDownloadAll(job.result.items)}
            onOpenLibrary={() => {
              setJob({status: 'idle'});
              setToolMode(null);
              setTab('library');
            }}
            onNewTask={() => {
              setJob({status: 'idle'});
              setToolMode(null);
              setTab('studio');
            }}
          />
        ) : job.status === 'failed' ? (
          <ErrorView
            message={job.message}
            lang={lang}
            onDismiss={() => setJob({status: 'idle'})}
            onShowToast={showToast}
          />
        ) : toolMode ? (
          <ToolFlow
            mode={toolMode}
            files={files}
            lang={lang}
            prefs={prefs}
            onChangePrefs={setPrefs}
            serverReady={serverReady}
            initialTool={directTool}
            initialConvertFormat={directFormat}
            initialServerTool={directServerTool}
            directEntry={Boolean(directTool || directFormat || directServerTool)}
            onBack={() => {
              setDirectTool(null);
              setDirectFormat(null);
              setDirectServerTool(null);
              setToolMode(null);
            }}
            onRunLocal={handleRunLocal}
            onRunServer={handleRunServer}
            onRunLink={handleRunLink}
            onOpenSettings={() => {
              setDirectTool(null);
              setDirectFormat(null);
              setDirectServerTool(null);
              setToolMode(null);
              setSettingsCategory('downloads');
              setTab('settings');
            }}
          />
        ) : tab === 'library' ? (
          <LibraryScreen
            items={library}
            lang={lang}
            onDownload={handleSaveOrDownload}
            onShare={handleShareItem}
            onDelete={handleDeleteExport}
            onClearAll={handleClearLibrary}
          />
        ) : tab === 'settings' ? (
          <SettingsScreen
            prefs={prefs}
            isDark={isDark}
            serverStatus={serverStatus}
            updateInfo={updateInfo}
            checkingUpdate={checkingUpdate}
            initialCategory={settingsCategory}
            onChangePrefs={setPrefs}
            onTestServer={handleTestServer}
            onCheckUpdate={handleCheckUpdate}
            onApplyUpdate={handleApplyUpdate}
            onOpenWheelCustomize={() => setCustomizeModal({open: true, tab: 'tools'})}
            onShowToast={showToast}
          />
        ) : (
          <StudioScreen
            files={files}
            exportCount={library.length}
            lang={lang}
            serverReady={serverReady}
            updateInfo={updateInfo}
            checkingUpdate={checkingUpdate}
            activeEngineAction={prefs.lastEngineAction ?? 'update'}
            activeEngineSegment={prefs.lastEngineSegment ?? null}
            onChangeEngineAction={(action) =>
              setPrefs((p) => (p.lastEngineAction === action ? p : {...p, lastEngineAction: action}))
            }
            onChangeEngineSegment={(seg) =>
              setPrefs((p) => (p.lastEngineSegment === seg ? p : {...p, lastEngineSegment: seg}))
            }
            onAddFiles={addFiles}
            onRemoveFile={removeFile}
            onMoveFile={moveFile}
            onClearFiles={clearFiles}
            onOpenConvert={() => setWheelKind('convert')}
            onOpenTools={() => setWheelKind('tools')}
            onOpenFileActions={() => setWheelKind('actions')}
            onOpenManageTools={() => setShowManageTools(true)}
            onCheckUpdate={handleCheckUpdate}
            onApplyUpdate={handleApplyUpdate}
            onOpenLinkDownload={() => openToolMode('web')}
            onOpenLibrary={() => setTab('library')}
          />
        )}
      </main>

      {/* Draggable Corner-Snapping Radial Wheel Menu FAB + Hover Info Cloud */}
      {!toolMode && job.status === 'idle' && tab !== 'settings' && (
        <WheelFab
          hidden={wheelKind !== null}
          side={prefs.wheelSide ?? 'right'}
          onChangeSide={(wheelSide) => setPrefs((p) => ({...p, wheelSide}))}
          onHoverChange={setShowWheelCloud}
          onClick={() => {
            setShowWheelCloud(false);
            setWheelKind('main');
          }}
          onFocus={() => setShowWheelCloud(true)}
          onBlur={() => setShowWheelCloud(false)}
          label={t('Tools', lang)}
          cloud={
            !wheelKind && showWheelCloud ? (
              <div
                role="tooltip"
                className={`pointer-events-none absolute bottom-[68px] w-max max-w-[230px] rounded-2xl border border-[var(--accent)]/45 bg-[var(--surface)]/95 px-3.5 py-2 text-xs font-medium leading-snug text-[var(--ink)] shadow-2xl backdrop-blur-md ${
                  (prefs.wheelSide ?? 'right') === 'left' ? 'left-0' : 'right-0'
                }`}
              >
                <span
                  className={`absolute -bottom-1.5 h-3 w-3 rotate-45 border-b border-r border-[var(--accent)]/45 bg-[var(--surface)] ${
                    (prefs.wheelSide ?? 'right') === 'left' ? 'left-5' : 'right-5'
                  }`}
                />
                {t('WheelCloudTip', lang)}
              </div>
            ) : null
          }
        />
      )}

      <WheelMenu
        open={wheelKind !== null}
        title={wheelTitle}
        actions={wheelActions}
        lang={lang}
        onDismiss={() => setWheelKind(null)}
        onSelect={handleWheelSelect}
        onDisabledSelect={() => showToast(t('SliceDisabledToast', lang))}
        onOpenCustomize={
          wheelKind === 'convert' || wheelKind === 'tools' || wheelKind === 'actions'
            ? () => {
                const initialTab: CustomizeWheelTab =
                  wheelKind === 'convert'
                    ? 'convert'
                    : wheelKind === 'actions'
                      ? 'actions'
                      : 'tools';
                setWheelKind(null);
                setCustomizeModal({open: true, tab: initialTab});
              }
            : undefined
        }
      />

      <WheelCustomizeModal
        open={customizeModal.open}
        initialTab={customizeModal.tab}
        config={wheelConfig}
        lang={lang}
        onChangeConfig={(updater) =>
          setPrefs((prev) => ({
            ...prev,
            wheelConfig: updater(prev.wheelConfig ?? DEFAULT_WHEEL_CONFIG),
          }))
        }
        onClose={() => setCustomizeModal((s) => ({...s, open: false}))}
      />

      <FileActionsModal
        open={showFileActions}
        files={files}
        lang={lang}
        onClose={() => setShowFileActions(false)}
        onPreviewFile={(f) => handleOpenSourcePreview(f)}
        onShareSources={handleShareSources}
        onSaveSources={handleSaveSources}
        onOpenBatchRename={() => openToolMode('tools', {tool: 'BATCH_RENAME'})}
        onCreateZip={() => openToolMode('tools', {tool: 'ZIP_CREATE'})}
        onOpenHashReport={() => openToolMode('tools', {tool: 'FILE_HASH_INFO'})}
        onClearFiles={clearFiles}
        onSortQueue={handleSortQueue}
        onAutoNumberQueue={handleAutoNumberQueue}
        onShowToast={showToast}
      />

      <JobOverlay job={job} lang={lang} onCancel={handleCancelJob} />
      <OfflineBanner lang={lang} />

      {/* Manage Tools / Morph Engine Modal */}
      {showManageTools && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setShowManageTools(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border border-[var(--line)] bg-[var(--surface)] p-5 pb-[calc(var(--morph-safe-bottom)+1.25rem)] shadow-2xl sm:rounded-3xl sm:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {t('MorphEngine', lang)}
                </p>
                <h3 className="mt-1 text-xl font-extrabold text-[var(--ink)]">{t('ManageTools', lang)}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManageTools(false)}
                aria-label={t('Close', lang)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--inset)] text-[var(--muted)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-[var(--muted)]">{t('EngineModalDesc', lang)}</p>

            <div className="mt-4 space-y-2.5">
              <div className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-3.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
                <div>
                  <p className="text-xs font-bold text-[var(--ink)]">{t('EngineOnDevice', lang)}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{t('EngineOnDeviceList', lang)}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-3.5">
                <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
                <div>
                  <p className="text-xs font-bold text-[var(--ink)]">{t('EngineServerTitle', lang)}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {serverReady ? t('EngineServerReady', lang) : t('EngineServerUnset', lang)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-stretch gap-2.5">
              {updateInfo?.hasUpdate ? (
                <button
                  type="button"
                  onClick={handleApplyUpdate}
                  className="flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/15 px-3.5 py-2 text-center text-xs font-semibold leading-tight text-[var(--ink)] hover:border-[var(--accent)]"
                >
                  <Download className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <span>{t('DownloadUpdate', lang)}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--inset)] px-3.5 py-2 text-center text-xs font-semibold leading-tight text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-70"
                >
                  <RefreshCw className={`h-4 w-4 shrink-0 text-[var(--accent)] ${checkingUpdate ? 'animate-spin' : ''}`} />
                  <span>{checkingUpdate ? t('CheckingUpdates', lang) : t('CheckUpdates', lang)}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowManageTools(false)}
                className="morph-accent-btn min-h-[44px] shrink-0 rounded-full px-6 text-xs font-semibold"
              >
                {t('Done', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Universal Source File Preview Modal (Image, PDF, Video, Audio, Document) */}
      {previewTarget && (sourcePreviewUrl || sourcePreviewText !== null) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pt-[calc(var(--morph-safe-top)+1rem)] pb-[calc(var(--morph-safe-bottom)+1rem)] backdrop-blur-sm"
          onClick={closeSourcePreview}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <p className="truncate text-sm font-bold text-[var(--ink)]">{previewTarget.name}</p>
              <button
                type="button"
                onClick={closeSourcePreview}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--inset)] text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-black/40 p-4">
              {sourcePreviewText !== null ? (
                <pre className="max-h-[72vh] w-full overflow-auto rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-4 text-xs leading-relaxed whitespace-pre-wrap text-[var(--ink)]">
                  {sourcePreviewText}
                </pre>
              ) : previewTarget.kind === 'pdf' && sourcePreviewUrl ? (
                <iframe
                  src={sourcePreviewUrl}
                  title={previewTarget.name}
                  className="h-[72vh] w-full rounded-xl bg-white"
                />
              ) : previewTarget.kind === 'video' && sourcePreviewUrl ? (
                <video
                  src={sourcePreviewUrl}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[72vh] max-w-full rounded-xl"
                />
              ) : previewTarget.kind === 'audio' && sourcePreviewUrl ? (
                <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
                  <p className="mb-4 truncate text-center text-sm font-semibold text-[var(--ink)]">
                    {previewTarget.name}
                  </p>
                  <audio src={sourcePreviewUrl} controls autoPlay className="w-full" />
                </div>
              ) : sourcePreviewUrl ? (
                <img
                  src={sourcePreviewUrl}
                  alt={previewTarget.name}
                  className="max-h-[75vh] max-w-full rounded-xl object-contain"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-[calc(var(--morph-safe-bottom)+5.5rem)] left-1/2 z-[70] max-w-[90vw] -translate-x-1/2 truncate rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--ink)] shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
