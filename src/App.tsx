import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  Cloud,
  Crop,
  Download,
  Droplets,
  ExternalLink,
  FileArchive,
  FileImage,
  FileText,
  Film,
  Grid,
  Hash,
  Image as ImageIcon,
  Minimize2,
  Plus,
  RefreshCw,
  RotateCw,
  Scissors,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {JobOverlay} from './components/JobOverlay';
import {LibraryScreen} from './components/LibraryScreen';
import {OfflineBanner} from './components/PWAInstallButton';
import {ErrorView, ResultView} from './components/ResultView';
import {SettingsScreen} from './components/SettingsScreen';
import {StudioScreen} from './components/StudioScreen';
import {ToolFlow} from './components/ToolFlow';
import {WheelActionItem, WheelFab, WheelMenu} from './components/WheelMenu';
import {t} from './data/i18n';
import {
  ExportItem,
  JobState,
  PickedFile,
  Prefs,
  ServerToolDef,
  ToolId,
  buildPickedFile,
  convertTargetsForSelection,
  serverToolsForSelection,
  shortWheelToolLabel,
  toolsForSelection,
} from './data/models';
import {applyThemeTokens} from './data/themes';
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
import {isNativeApp, saveOrDownloadBlob, shareNativeOrWebBlob} from './engine/nativeBridge';
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
      return SlidersHorizontal;
    case 'PDF_STAMP':
      return Hash;
    case 'ZIP_CREATE':
    case 'ZIP_EXTRACT':
      return FileArchive;
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
  const [showManageTools, setShowManageTools] = useState(false);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
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
  }, []);

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
          ctrl.signal
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
    [lang, prefs.serverToken, prefs.serverUrl, pollAndFinishServerJob, serverReady]
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
    async (blob: Blob, filename: string) => {
      try {
        const mode = await saveOrDownloadBlob(blob, filename);
        showToast(
          mode === 'saved'
            ? `${filename} · ${t('SavedToDocuments', lang)}`
            : `${filename} — ${t('Download', lang)}`
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
        const result = await shareNativeOrWebBlob(item.blob, item.name, item.mime);
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
      for (let i = 0; i < items.length; i++) {
        await saveOrDownloadBlob(items[i].blob, items[i].name, items.length === 1);
      }
      if (isNativeApp()) {
        showToast(`${items.length} ${t('FilesCount', lang)} · ${t('SavedToDocuments', lang)}`);
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
    for (const f of files) {
      await saveOrDownloadBlob(f.file, f.name, false);
    }
    showToast(
      isNativeApp()
        ? `${files.length} ${t('FilesCount', lang)} · ${t('SavedToDocuments', lang)}`
        : `${files.length} ${t('FilesCount', lang)} — ${t('Download', lang)}`
    );
  }, [files, lang, showToast]);

  const handleOpenSourcePreview = useCallback(() => {
    const first = files[0];
    if (!first) return;
    if (first.kind === 'image' || first.kind === 'pdf') {
      const url = first.previewUrl ?? URL.createObjectURL(first.file);
      setSourcePreviewUrl(url);
    } else {
      handleSaveOrDownload(first.file, first.name);
    }
  }, [files, handleSaveOrDownload]);

  const {wheelTitle, wheelActions} = useMemo<{
    wheelTitle: string | undefined;
    wheelActions: WheelActionItem[];
  }>(() => {
    if (wheelKind === 'convert') {
      const targets = convertTargetsForSelection(files);
      if (targets.length > 0) {
        return {
          wheelTitle: t('Convert', lang),
          wheelActions: targets.map((fmt) => ({
            id: `fmt:${fmt}`,
            label: fmt.toUpperCase(),
            icon: fmt === 'pdf' ? FileText : ArrowLeftRight,
          })),
        };
      }
      return {
        wheelTitle: t('Convert', lang),
        wheelActions: [
          {id: 'local:ZIP_CREATE', label: t('WheelZip', lang), icon: FileArchive},
          {id: 'open:tools', label: t('AllToolsShort', lang), icon: SlidersHorizontal},
          {id: 'nav:studio', label: t('Studio', lang), icon: Sparkles},
        ],
      };
    }

    if (wheelKind === 'tools') {
      const locals = toolsForSelection(files).map((tool) => ({
        id: `local:${tool.id}`,
        label: shortWheelToolLabel(tool.id, lang, t(tool.titleKey, lang)),
        icon: wheelIconForLocalTool(tool.id),
      }));
      const servers = serverToolsForSelection(files).map((tool) => ({
        id: `server:${tool.id}`,
        label: shortWheelToolLabel(tool.id, lang, lang === 'tr' ? tool.titleTr : tool.titleEn),
        icon: tool.id.startsWith('video') || tool.id.startsWith('audio') ? Film : FileText,
      }));
      const combined = [...locals, ...servers];
      if (combined.length > 6) {
        return {
          wheelTitle: t('Tools', lang),
          wheelActions: [
            ...combined.slice(0, 5),
            {id: 'open:tools', label: t('AllToolsShort', lang), icon: SlidersHorizontal},
          ],
        };
      }
      return {
        wheelTitle: t('Tools', lang),
        wheelActions: combined,
      };
    }

    if (wheelKind === 'actions') {
      const items: WheelActionItem[] = [
        {id: 'action:share', label: t('Share', lang), icon: Share2},
      ];
      if (files.length === 1) {
        items.push({id: 'action:open', label: t('WheelOpen', lang), icon: ExternalLink});
      }
      items.push(
        {id: 'local:ZIP_CREATE', label: t('WheelZip', lang), icon: FileArchive},
        {id: 'action:clear', label: t('Clear', lang), icon: Trash2},
        {id: 'nav:library', label: t('Library', lang), icon: Grid},
        {id: 'nav:studio', label: t('Studio', lang), icon: Sparkles}
      );
      return {
        wheelTitle: t('FileActions', lang),
        wheelActions: items,
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
  }, [wheelKind, files, lang, serverReady]);

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
      case 'open:tools':
        openToolMode('tools');
        break;
      case 'open:web':
        openToolMode('web');
        break;
      case 'action:share':
        handleShareSources();
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
      case 'nav:settings':
        setToolMode(null);
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
            onDownloadItem={(item) => handleSaveOrDownload(item.blob, item.name)}
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
          />
        ) : toolMode ? (
          <ToolFlow
            mode={toolMode}
            files={files}
            lang={lang}
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
              setTab('settings');
            }}
          />
        ) : tab === 'library' ? (
          <LibraryScreen
            items={library}
            lang={lang}
            onDownload={(item) => handleSaveOrDownload(item.blob, item.name)}
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
            onChangePrefs={setPrefs}
            onTestServer={handleTestServer}
            onCheckUpdate={handleCheckUpdate}
            onApplyUpdate={handleApplyUpdate}
          />
        ) : (
          <StudioScreen
            files={files}
            exportCount={library.length}
            lang={lang}
            serverReady={serverReady}
            updateInfo={updateInfo}
            checkingUpdate={checkingUpdate}
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

      {/* Source File Preview Modal */}
      {sourcePreviewUrl && files[0] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pt-[calc(var(--morph-safe-top)+1rem)] pb-[calc(var(--morph-safe-bottom)+1rem)] backdrop-blur-sm"
          onClick={() => {
            if (files[0] && !files[0].previewUrl) URL.revokeObjectURL(sourcePreviewUrl);
            setSourcePreviewUrl(null);
          }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <p className="truncate text-sm font-bold text-[var(--ink)]">{files[0].name}</p>
              <button
                type="button"
                onClick={() => {
                  if (files[0] && !files[0].previewUrl) URL.revokeObjectURL(sourcePreviewUrl);
                  setSourcePreviewUrl(null);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--inset)] text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-black/40 p-4">
              {files[0].kind === 'pdf' ? (
                <iframe src={sourcePreviewUrl} title={files[0].name} className="h-[72vh] w-full rounded-xl bg-white" />
              ) : (
                <img src={sourcePreviewUrl} alt={files[0].name} className="max-h-[75vh] max-w-full rounded-xl object-contain" />
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-[calc(var(--morph-safe-bottom)+5.5rem)] left-1/2 z-50 max-w-[90vw] -translate-x-1/2 truncate rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--ink)] shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
