import React, {useEffect, useMemo, useState} from 'react';
import {
  ArrowLeftRight,
  ArrowUp,
  Check,
  Layers,
  MoreHorizontal,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {
  ALL_CONVERT_FORMATS_CATALOG,
  ALL_TOOLS,
  ALL_WHEEL_ACTIONS_CATALOG,
  DEFAULT_WHEEL_CONFIG,
  SERVER_TOOLS,
  ToolId,
  WheelConfigPrefs,
  WheelDisplayMode,
  shortWheelToolLabel,
} from '../data/models';

export type CustomizeWheelTab = 'convert' | 'tools' | 'actions';

interface WheelCustomizeModalProps {
  open: boolean;
  initialTab?: CustomizeWheelTab;
  config: WheelConfigPrefs;
  lang: Lang;
  onChangeConfig: (updater: (prev: WheelConfigPrefs) => WheelConfigPrefs) => void;
  onClose: () => void;
}

export const WheelCustomizeModal: React.FC<WheelCustomizeModalProps> = ({
  open,
  initialTab = 'tools',
  config,
  lang,
  onChangeConfig,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<CustomizeWheelTab>(initialTab);
  const [toolSearch, setToolSearch] = useState('');

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setToolSearch('');
    }
  }, [open, initialTab]);

  const allToolCatalog = useMemo(() => {
    const localIds = (Object.keys(ALL_TOOLS) as ToolId[]).filter((id) => id !== 'CONVERT');
    const localEntries = localIds.map((id) => {
      const def = ALL_TOOLS[id];
      const fullTitle = t(def.titleKey, lang);
      const shortLabel = shortWheelToolLabel(id, lang, fullTitle);
      return {
        id: `local:${id}`,
        shortLabel,
        fullTitle,
        desc: t(def.descKey, lang),
      };
    });

    const serverEntries = SERVER_TOOLS.map((srv) => {
      const fullTitle = lang === 'tr' ? srv.titleTr : srv.titleEn;
      const shortLabel = shortWheelToolLabel(srv.id, lang, fullTitle);
      return {
        id: `server:${srv.id}`,
        shortLabel,
        fullTitle,
        desc: lang === 'tr' ? srv.descTr : srv.descEn,
      };
    });

    return [...localEntries, ...serverEntries];
  }, [lang]);

  const filteredToolCatalog = useMemo(() => {
    const q = toolSearch.trim().toLowerCase();
    if (!q) return allToolCatalog;
    return allToolCatalog.filter(
      (item) =>
        item.fullTitle.toLowerCase().includes(q) ||
        item.shortLabel.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q)
    );
  }, [allToolCatalog, toolSearch]);

  if (!open) return null;

  const setMode = (mode: WheelDisplayMode) => {
    onChangeConfig((prev) => ({...prev, mode}));
  };

  const togglePinnedItem = (
    listKey: 'pinnedConvert' | 'pinnedTools' | 'pinnedActions',
    itemId: string
  ) => {
    onChangeConfig((prev) => {
      const current = prev[listKey] ?? [];
      const exists = current.includes(itemId);
      const nextList = exists ? current.filter((x) => x !== itemId) : [...current, itemId];
      return {
        ...prev,
        mode: 'pinned',
        [listKey]: nextList,
      };
    });
  };

  const moveItemEarlier = (
    listKey: 'pinnedConvert' | 'pinnedTools' | 'pinnedActions',
    itemId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    onChangeConfig((prev) => {
      const current = [...(prev[listKey] ?? [])];
      const idx = current.indexOf(itemId);
      if (idx <= 0) return prev;
      const [picked] = current.splice(idx, 1);
      current.splice(idx - 1, 0, picked);
      return {
        ...prev,
        mode: 'pinned',
        [listKey]: current,
      };
    });
  };

  const modeCards: Array<{
    id: WheelDisplayMode;
    title: string;
    desc: string;
    Icon: React.FC<{className?: string}>;
  }> = [
    {
      id: 'smart',
      title: t('WheelModeSmart', lang),
      desc: t('WheelModeSmartDesc', lang),
      Icon: Sparkles,
    },
    {
      id: 'pinned',
      title: t('WheelModePinned', lang),
      desc: t('WheelModePinnedDesc', lang),
      Icon: Star,
    },
    {
      id: 'all',
      title: t('WheelModeAll', lang),
      desc: t('WheelModeAllDesc', lang),
      Icon: Layers,
    },
  ];

  const activePinnedCount =
    activeTab === 'convert'
      ? config.pinnedConvert.length
      : activeTab === 'tools'
        ? config.pinnedTools.length
        : config.pinnedActions.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3.5 pt-[calc(var(--morph-safe-top)+0.75rem)] pb-[calc(var(--morph-safe-bottom)+0.75rem)] backdrop-blur-sm sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('WheelCustomizeTitle', lang)}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--accent)]/45 bg-[var(--accent)]/14 text-[var(--accent)]">
              <Settings className="morph-gear-spin h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-extrabold tracking-tight text-[var(--ink)] sm:text-lg">
                {t('WheelCustomizeTitle', lang)}
              </h2>
              <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">
                {t('WheelCustomizeSubtitle', lang)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close', lang)}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--inset)] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* 3 Display Modes */}
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
              {t('WheelModeLabel', lang)}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {modeCards.map(({id, title, desc, Icon}) => {
                const active = config.mode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className={`flex min-h-[84px] flex-col justify-between rounded-2xl border p-3.5 text-left transition-colors ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)]/14 text-[var(--ink)]'
                        : 'border-[var(--line)] bg-[var(--inset)] text-[var(--ink)] hover:border-[var(--accent)]/45'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                        <span>{title}</span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" />}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted)]">{desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3 Wheel Section Tabs + Pinned Favorites Selector */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--muted)]">
                {t('PinnedItemsHeader', lang)} ·{' '}
                <span className="font-mono-num text-[var(--ink)]">
                  {activePinnedCount} {t('PinnedCountSuffix', lang)}
                </span>
              </p>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--inset)] p-1.5">
              {(
                [
                  {id: 'convert' as const, label: t('TabConvertWheel', lang), Icon: ArrowLeftRight},
                  {id: 'tools' as const, label: t('TabToolsWheel', lang), Icon: SlidersHorizontal},
                  {id: 'actions' as const, label: t('TabActionsWheel', lang), Icon: MoreHorizontal},
                ] as const
              ).map(({id, label, Icon}) => {
                const selected = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      selected
                        ? 'bg-[var(--accent)] text-white shadow-sm'
                        : 'text-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Body: Convert Formats */}
            {activeTab === 'convert' && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {ALL_CONVERT_FORMATS_CATALOG.map((fmt) => {
                  const orderIdx = config.pinnedConvert.indexOf(fmt);
                  const pinned = orderIdx >= 0;
                  return (
                    <div
                      key={fmt}
                      onClick={() => togglePinnedItem('pinnedConvert', fmt)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          togglePinnedItem('pinnedConvert', fmt);
                        }
                      }}
                      className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                        pinned
                          ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--ink)]'
                          : 'border-[var(--line)] bg-[var(--inset)] text-[var(--muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      <span className="font-mono-num uppercase whitespace-nowrap">{fmt}</span>
                      <div className="flex items-center gap-1">
                        {pinned && orderIdx > 0 && (
                          <button
                            type="button"
                            onClick={(e) => moveItemEarlier('pinnedConvert', fmt, e)}
                            title={t('MoveLeftShort', lang)}
                            aria-label={t('MoveLeftShort', lang)}
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                        )}
                        {pinned && (
                          <span className="font-mono-num text-[11px] font-extrabold text-[var(--accent)]">
                            #{orderIdx + 1}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab Body: Tools */}
            {activeTab === 'tools' && (
              <div className="mt-3 space-y-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    type="search"
                    value={toolSearch}
                    onChange={(e) => setToolSearch(e.target.value)}
                    placeholder={t('SearchToolsPlaceholder', lang)}
                    className="min-h-[44px] w-full rounded-2xl border border-[var(--line)] bg-[var(--inset)] pl-10 pr-4 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {filteredToolCatalog.map((tool) => {
                    const orderIdx = config.pinnedTools.indexOf(tool.id);
                    const pinned = orderIdx >= 0;
                    return (
                      <div
                        key={tool.id}
                        onClick={() => togglePinnedItem('pinnedTools', tool.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            togglePinnedItem('pinnedTools', tool.id);
                          }
                        }}
                        className={`flex min-h-[52px] cursor-pointer items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                          pinned
                            ? 'border-[var(--accent)] bg-[var(--accent)]/14 text-[var(--ink)]'
                            : 'border-[var(--line)] bg-[var(--inset)] text-[var(--ink)] hover:border-[var(--accent)]/45'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-[var(--ink)]">
                            {tool.fullTitle}
                          </p>
                          <p className="truncate text-[11px] text-[var(--muted)]">
                            {tool.shortLabel}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {pinned && orderIdx > 0 && (
                            <button
                              type="button"
                              onClick={(e) => moveItemEarlier('pinnedTools', tool.id, e)}
                              title={t('MoveLeftShort', lang)}
                              aria-label={t('MoveLeftShort', lang)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--accent)]"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {pinned ? (
                            <span className="font-mono-num text-xs font-extrabold text-[var(--accent)]">
                              #{orderIdx + 1}
                            </span>
                          ) : (
                            <span className="h-4 w-4 rounded-full border border-[var(--line)]" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab Body: File Actions */}
            {activeTab === 'actions' && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ALL_WHEEL_ACTIONS_CATALOG.map((act) => {
                  const orderIdx = config.pinnedActions.indexOf(act.id);
                  const pinned = orderIdx >= 0;
                  return (
                    <div
                      key={act.id}
                      onClick={() => togglePinnedItem('pinnedActions', act.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          togglePinnedItem('pinnedActions', act.id);
                        }
                      }}
                      className={`flex min-h-[48px] cursor-pointer items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 transition-colors ${
                        pinned
                          ? 'border-[var(--accent)] bg-[var(--accent)]/14 text-[var(--ink)]'
                          : 'border-[var(--line)] bg-[var(--inset)] text-[var(--ink)] hover:border-[var(--accent)]/45'
                      }`}
                    >
                      <span className="truncate text-xs font-bold">{t(act.labelKey, lang)}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {pinned && orderIdx > 0 && (
                          <button
                            type="button"
                            onClick={(e) => moveItemEarlier('pinnedActions', act.id, e)}
                            title={t('MoveLeftShort', lang)}
                            aria-label={t('MoveLeftShort', lang)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--accent)]"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {pinned ? (
                          <span className="font-mono-num text-xs font-extrabold text-[var(--accent)]">
                            #{orderIdx + 1}
                          </span>
                        ) : (
                          <span className="h-4 w-4 rounded-full border border-[var(--line)]" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-[var(--muted)]">{t('WheelHoldHint', lang)}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2.5 border-t border-[var(--line)] px-5 py-3.5">
          <button
            type="button"
            onClick={() => onChangeConfig(() => DEFAULT_WHEEL_CONFIG)}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--inset)] px-4 text-xs font-semibold text-[var(--muted)] transition-colors hover:text-[var(--ink)] whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            <span>{t('ResetWheelDefaults', lang)}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="morph-accent-btn flex min-h-[44px] min-w-[116px] items-center justify-center rounded-full px-6 text-xs font-semibold text-white whitespace-nowrap shrink-0"
          >
            {t('Done', lang)}
          </button>
        </div>
      </div>
    </div>
  );
};
