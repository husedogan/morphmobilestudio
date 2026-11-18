import React, {useCallback, useEffect, useRef, useState} from 'react';
import {LucideIcon, Settings} from 'lucide-react';
import {Lang, t} from '../data/i18n';

export interface WheelActionItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface WheelMenuProps {
  open: boolean;
  title?: string;
  actions: WheelActionItem[];
  lang: Lang;
  onDismiss: () => void;
  onSelect: (id: string) => void;
  onOpenCustomize?: () => void;
}

const CENTER_HOLD_MS = 3000;
const CENTER_TAP_MAX_MS = 320;

interface WheelGeometry {
  size: number;
  cx: number;
  cy: number;
  centerR: number;
  dualRing: boolean;
  outerCount: number;
  innerCount: number;
  outerRingIn: number;
  outerRingOut: number;
  outerLabelR: number;
  innerRingIn: number;
  innerRingOut: number;
  innerLabelR: number;
  containerWidthClass: string;
}

function getWheelGeometry(count: number): WheelGeometry {
  if (count > 10) {
    const size = 388;
    const outerCount = Math.ceil(count * 0.58);
    const innerCount = count - outerCount;
    return {
      size,
      cx: size / 2,
      cy: size / 2,
      centerR: 50,
      dualRing: true,
      outerCount,
      innerCount,
      innerRingIn: 52,
      innerRingOut: 118,
      innerLabelR: 85,
      outerRingIn: 120,
      outerRingOut: 188,
      outerLabelR: 154,
      containerWidthClass: 'w-[min(388px,95vw)]',
    };
  }

  if (count >= 8) {
    const size = 368;
    return {
      size,
      cx: size / 2,
      cy: size / 2,
      centerR: 52,
      dualRing: false,
      outerCount: count,
      innerCount: 0,
      innerRingIn: 0,
      innerRingOut: 0,
      innerLabelR: 0,
      outerRingIn: 54,
      outerRingOut: 178,
      outerLabelR: 118,
      containerWidthClass: 'w-[min(368px,94vw)]',
    };
  }

  const size = 340;
  return {
    size,
    cx: size / 2,
    cy: size / 2,
    centerR: 56,
    dualRing: false,
    outerCount: count,
    innerCount: 0,
    innerRingIn: 0,
    innerRingOut: 0,
    innerLabelR: 0,
    outerRingIn: 56,
    outerRingOut: 164,
    outerLabelR: 112,
    containerWidthClass: 'w-[min(340px,92vw)]',
  };
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeRingSlice(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerR, startDeg);
  const outerEnd = polarToCartesian(cx, cy, outerR, endDeg);
  const innerEnd = polarToCartesian(cx, cy, innerR, endDeg);
  const innerStart = polarToCartesian(cx, cy, innerR, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function angleToRingIndex(angleDeg: number, ringCount: number): number {
  if (ringCount <= 0) return -1;
  const step = 360 / ringCount;
  const start = -90 - step / 2;
  const delta = (((angleDeg - start) % 360) + 360) % 360;
  return Math.min(ringCount - 1, Math.max(0, Math.floor(delta / step)));
}

function hitWheelTarget(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  geo: WheelGeometry
): {zone: 'center' | 'slice' | 'outside'; sliceIndex: number} {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const dx = x - rect.width / 2;
  const dy = y - rect.height / 2;
  const dist = Math.hypot(dx, dy);
  const scale = rect.width / geo.size;

  if (dist <= geo.centerR * scale) {
    return {zone: 'center', sliceIndex: -1};
  }

  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  if (geo.dualRing) {
    if (dist >= geo.innerRingIn * scale && dist <= geo.innerRingOut * scale) {
      const idx = angleToRingIndex(angle, geo.innerCount);
      return idx >= 0 ? {zone: 'slice', sliceIndex: geo.outerCount + idx} : {zone: 'outside', sliceIndex: -1};
    }
    if (dist > geo.innerRingOut * scale && dist <= geo.outerRingOut * scale) {
      const idx = angleToRingIndex(angle, geo.outerCount);
      return idx >= 0 ? {zone: 'slice', sliceIndex: idx} : {zone: 'outside', sliceIndex: -1};
    }
    return {zone: 'outside', sliceIndex: -1};
  }

  if (dist >= geo.outerRingIn * scale && dist <= geo.outerRingOut * scale) {
    const idx = angleToRingIndex(angle, geo.outerCount);
    return idx >= 0 ? {zone: 'slice', sliceIndex: idx} : {zone: 'outside', sliceIndex: -1};
  }

  return {zone: 'outside', sliceIndex: -1};
}

export const WheelMenu: React.FC<WheelMenuProps> = ({
  open,
  title,
  actions,
  lang,
  onDismiss,
  onSelect,
  onOpenCustomize,
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [gearSpinDeg, setGearSpinDeg] = useState<number>(0);
  const wheelRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<number>(-1);
  const holdRafRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const centerHoldStateRef = useRef<{
    active: boolean;
    startAt: number;
    triggered: boolean;
    pointerId: number;
  }>({
    active: false,
    startAt: 0,
    triggered: false,
    pointerId: -1,
  });

  const stopCenterHoldLoop = useCallback((resetVisual = true) => {
    if (holdRafRef.current !== null) {
      window.cancelAnimationFrame(holdRafRef.current);
      holdRafRef.current = null;
    }
    centerHoldStateRef.current.active = false;
    if (resetVisual) {
      setHoldProgress(0);
      setGearSpinDeg(0);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      activeRef.current = -1;
      stopCenterHoldLoop(true);
      centerHoldStateRef.current.triggered = false;
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
    }
  }, [open, stopCenterHoldLoop]);

  useEffect(() => {
    return () => {
      stopCenterHoldLoop(false);
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
      }
    };
  }, [stopCenterHoldLoop]);

  const count = actions.length;
  const geo = getWheelGeometry(Math.max(1, count));

  const startCenterHold = useCallback(
    (pointerId: number) => {
      stopCenterHoldLoop(false);
      const startAt = performance.now();
      let lastNow = startAt;
      let spin = 0;
      centerHoldStateRef.current = {
        active: true,
        startAt,
        triggered: false,
        pointerId,
      };
      setHoldProgress(0.01);

      const tick = (now: number) => {
        if (!centerHoldStateRef.current.active) return;
        const dtSec = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
        lastNow = now;
        const elapsed = now - startAt;
        const p = Math.min(1, elapsed / CENTER_HOLD_MS);

        const speedDegPerSec = 50 + Math.pow(p, 1.8) * 420;
        spin = (spin + speedDegPerSec * dtSec) % 360;
        setHoldProgress(p);
        setGearSpinDeg(spin);

        if (p >= 1) {
          centerHoldStateRef.current.active = false;
          centerHoldStateRef.current.triggered = true;
          holdRafRef.current = null;
          if ('vibrate' in navigator) {
            navigator.vibrate([20, 35, 20]);
          }
          openTimerRef.current = window.setTimeout(() => {
            openTimerRef.current = null;
            onOpenCustomize?.();
          }, 160);
          return;
        }

        holdRafRef.current = window.requestAnimationFrame(tick);
      };

      holdRafRef.current = window.requestAnimationFrame(tick);
    },
    [onOpenCustomize, stopCenterHoldLoop]
  );

  const updatePointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = wheelRef.current;
      if (!el) return {zone: 'outside' as const, sliceIndex: -1};
      const hit = hitWheelTarget(clientX, clientY, el.getBoundingClientRect(), geo);
      const idx = hit.zone === 'slice' ? hit.sliceIndex : -1;
      if (idx !== activeRef.current) {
        activeRef.current = idx;
        setActiveIndex(idx);
        if (idx >= 0 && 'vibrate' in navigator) {
          navigator.vibrate(8);
        }
      }
      return hit;
    },
    [geo]
  );

  if (!open || count === 0) return null;

  const progressCircumference = 2 * Math.PI * (geo.centerR - 3);
  const progressOffset = progressCircumference * (1 - holdProgress);
  const gearOpacity = Math.min(1, Math.max(0, (holdProgress - 0.22) / 0.5));
  const markOpacity = Math.max(0, 1 - Math.max(0, (holdProgress - 0.28) / 0.45));

  const renderRingSlicesAndLabels = (
    ringItems: WheelActionItem[],
    indexOffset: number,
    ringIn: number,
    ringOut: number,
    labelR: number,
    isInnerRing: boolean
  ) => {
    const rCount = ringItems.length;
    if (rCount === 0) return {paths: null, labels: null};
    const step = 360 / rCount;
    const startBase = -90 - step / 2;
    const gapDeg = rCount >= 9 ? 0.8 : 1.1;

    const labelWidthPct = geo.dualRing
      ? isInnerRing
        ? rCount <= 5
          ? 16.5
          : 14
        : rCount <= 8
          ? 17
          : 14.5
      : rCount <= 4
        ? 25
        : rCount <= 6
          ? 20
          : rCount <= 8
            ? 16.5
            : 14;

    const iconSizeClass = geo.dualRing || rCount >= 8 ? 'h-[14px] w-[14px]' : 'h-[17px] w-[17px]';
    const labelTextClass =
      geo.dualRing || rCount >= 9 ? 'text-[8.5px]' : rCount >= 7 ? 'text-[9px]' : 'text-[10px]';

    const paths = ringItems.map((action, localIdx) => {
      const globalIdx = indexOffset + localIdx;
      const sAngle = startBase + localIdx * step + gapDeg;
      const eAngle = startBase + (localIdx + 1) * step - gapDeg;
      const isActive = globalIdx === activeIndex;
      return (
        <path
          key={action.id}
          d={describeRingSlice(geo.cx, geo.cy, ringIn, ringOut, sAngle, eAngle)}
          fill={isActive ? 'var(--accent)' : 'var(--surface)'}
          fillOpacity={isActive ? 0.96 : 0.97}
          stroke="var(--line)"
          strokeWidth="1.25"
          className="transition-colors duration-100"
        />
      );
    });

    const labels = ringItems.map((action, localIdx) => {
      const globalIdx = indexOffset + localIdx;
      const midAngle = -90 + localIdx * step;
      const pos = polarToCartesian(geo.cx, geo.cy, labelR, midAngle);
      const Icon = action.icon;
      const isActive = globalIdx === activeIndex;
      return (
        <div
          key={action.id}
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center overflow-hidden px-0.5 text-center"
          style={{
            left: `${(pos.x / geo.size) * 100}%`,
            top: `${(pos.y / geo.size) * 100}%`,
            width: `${labelWidthPct}%`,
          }}
        >
          <Icon
            className={`${iconSizeClass} shrink-0 transition-colors duration-100`}
            style={{color: isActive ? '#FFFFFF' : 'var(--ink)'}}
          />
          <span
            className={`mt-0.5 line-clamp-2 w-full overflow-hidden text-ellipsis break-words font-semibold leading-[1.08] tracking-tight ${labelTextClass}`}
            style={{color: isActive ? '#FFFFFF' : 'var(--ink)'}}
          >
            {action.label}
          </span>
        </div>
      );
    });

    return {paths, labels};
  };

  const outerSliceGroup = renderRingSlicesAndLabels(
    geo.dualRing ? actions.slice(0, geo.outerCount) : actions,
    0,
    geo.outerRingIn,
    geo.outerRingOut,
    geo.outerLabelR,
    false
  );

  const innerSliceGroup = geo.dualRing
    ? renderRingSlicesAndLabels(
        actions.slice(geo.outerCount),
        geo.outerCount,
        geo.innerRingIn,
        geo.innerRingOut,
        geo.innerLabelR,
        true
      )
    : {paths: null, labels: null};

  return (
    <div
      className="no-touch-callout fixed inset-0 z-50 flex flex-col items-center justify-end gap-3.5 bg-black/60 pb-10 backdrop-blur-sm sm:justify-center sm:pb-0"
      onClick={onDismiss}
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
    >
      {holdProgress > 0.08 ? (
        <div
          className="max-w-[90vw] truncate rounded-full border border-[var(--accent)]/60 bg-[var(--surface)]/95 px-4 py-1.5 text-xs font-semibold text-[var(--ink)] shadow-lg whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          {t('HoldingCenterGearHint', lang)} · {Math.max(0, (3 - holdProgress * 3)).toFixed(1)}s
        </div>
      ) : title ? (
        <div
          className="max-w-[90vw] truncate rounded-full border border-[var(--line)] bg-[var(--surface)]/95 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[var(--ink)] shadow-lg whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          {title}
        </div>
      ) : null}

      {/* Responsive square wheel container with single or dual concentric rings */}
      <div
        ref={wheelRef}
        className={`no-touch-callout relative aspect-square ${geo.containerWidthClass} select-none touch-none`}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.pointerType === 'touch') {
            e.preventDefault();
          }
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Ignore capture errors
          }
          const hit = updatePointer(e.clientX, e.clientY);
          if (hit.zone === 'center' && onOpenCustomize) {
            startCenterHold(e.pointerId);
          } else {
            stopCenterHoldLoop(true);
          }
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === 'touch') {
            const hit = updatePointer(e.clientX, e.clientY);
            if (centerHoldStateRef.current.active && hit.zone !== 'center') {
              stopCenterHoldLoop(true);
            }
          }
        }}
        onPointerUp={(e) => {
          if (centerHoldStateRef.current.triggered) {
            centerHoldStateRef.current.triggered = false;
            return;
          }
          const wasHoldingCenter = centerHoldStateRef.current.active;
          const heldMs = wasHoldingCenter ? performance.now() - centerHoldStateRef.current.startAt : 0;
          stopCenterHoldLoop(true);

          const hit = updatePointer(e.clientX, e.clientY);
          if (hit.zone === 'slice' && hit.sliceIndex >= 0 && hit.sliceIndex < count) {
            if ('vibrate' in navigator) navigator.vibrate(14);
            onSelect(actions[hit.sliceIndex].id);
            return;
          }

          if (wasHoldingCenter && heldMs >= CENTER_TAP_MAX_MS) {
            // Released center m hold before 3 seconds — keep wheel open so user can retry cleanly
            return;
          }

          onDismiss();
        }}
        onPointerCancel={() => {
          stopCenterHoldLoop(true);
          setActiveIndex(-1);
          activeRef.current = -1;
        }}
      >
        <svg viewBox={`0 0 ${geo.size} ${geo.size}`} className="h-full w-full drop-shadow-2xl">
          {outerSliceGroup.paths}
          {innerSliceGroup.paths}
          <circle
            cx={geo.cx}
            cy={geo.cy}
            r={geo.centerR}
            fill="var(--paper)"
            stroke={holdProgress > 0.05 ? 'var(--accent)' : 'var(--line)'}
            strokeWidth={holdProgress > 0.05 ? '1.75' : '1.25'}
          />
          {holdProgress > 0.02 && (
            <circle
              cx={geo.cx}
              cy={geo.cy}
              r={geo.centerR - 3}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={progressCircumference}
              strokeDashoffset={progressOffset}
              transform={`rotate(-90 ${geo.cx} ${geo.cy})`}
            />
          )}
        </svg>

        {/* Non-interactive overflow-safe radial labels */}
        {outerSliceGroup.labels}
        {innerSliceGroup.labels}

        {/* Center m mark -> 3s hold morphs into spinning Gear */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{
            width: `${((geo.centerR * 1.65) / geo.size) * 100}%`,
            height: `${((geo.centerR * 1.65) / geo.size) * 100}%`,
          }}
        >
          {markOpacity > 0.01 && (
            <img
              src="/morph-mark.png"
              alt="morph"
              draggable={false}
              className="absolute h-9 w-auto object-contain"
              style={{
                opacity: markOpacity,
                transform: `scale(${(1 - holdProgress * 0.25).toFixed(3)}) rotate(${(
                  holdProgress * 90
                ).toFixed(1)}deg)`,
              }}
            />
          )}
          {gearOpacity > 0.01 && (
            <Settings
              className="absolute h-8 w-8 text-[var(--accent)]"
              style={{
                opacity: gearOpacity,
                transform: `scale(${(0.72 + gearOpacity * 0.36).toFixed(3)}) rotate(${gearSpinDeg.toFixed(
                  1
                )}deg)`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

type WheelPhase = 'idle' | 'ash';

interface BurnEmber {
  id: number;
  x: number;
  y: number;
  vy: number;
  vx: number;
  life: number;
  maxLife: number;
  size: number;
  ash?: boolean;
}

interface AshFlake {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  w: number;
  h: number;
  delay: number;
  life: number;
  maxLife: number;
  shade: string;
  swayPhase: number;
}

function createAshBurst(cx: number, cy: number, startId: number): AshFlake[] {
  const shades = ['#D4D4D8', '#A1A1AA', '#71717A', '#52525B', '#3F3F46', '#FB923C'];
  const flakes: AshFlake[] = [];
  for (let i = 0; i < 46; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * 28;
    const isEmberTip = i < 6;
    flakes.push({
      id: startId + i,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: -14 + Math.random() * 48,
      vy: -(34 + Math.random() * 68),
      rot: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 240,
      w: isEmberTip ? 2.8 + Math.random() * 2.2 : 3.2 + Math.random() * 5.2,
      h: isEmberTip ? 2.8 + Math.random() * 2.2 : 2.2 + Math.random() * 3.8,
      delay: Math.random() * 260,
      life: 0,
      maxLife: 1000 + Math.random() * 700,
      shade: isEmberTip ? '#FB923C' : shades[Math.floor(Math.random() * (shades.length - 1))],
      swayPhase: Math.random() * Math.PI * 2,
    });
  }
  return flakes;
}

// Minimum movement distance to start dragging the FAB to left/right corners at ANY point
// during a press-and-hold while keeping the spin -> fire gear -> ash sequence running live.
const DRAG_DISTANCE_PX = 18;
const TAP_MAX_MS = 320;

export const WheelFab: React.FC<{
  onClick: () => void;
  label: string;
  side?: 'left' | 'right';
  onChangeSide?: (side: 'left' | 'right') => void;
  onHoverChange?: (hover: boolean) => void;
  cloud?: React.ReactNode;
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}> = ({
  onClick,
  label,
  side = 'right',
  onChangeSide,
  onHoverChange,
  cloud,
  className,
  onFocus,
  onBlur,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const snapTimerRef = useRef<number | null>(null);
  const [dragPos, setDragPos] = useState<{x: number; y: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [previewSide, setPreviewSide] = useState<'left' | 'right'>(side);

  // Overheat sequence on press-and-hold (mobile & desktop) OR mouse hover:
  // 0-15s fire gear -> 15-30s burning & charring -> 30s turn into ash
  const [isHovering, setIsHovering] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [phase, setPhase] = useState<WheelPhase>('idle');
  const [heat, setHeat] = useState(0);
  const [burnLevel, setBurnLevel] = useState(0);
  const [spinDeg, setSpinDeg] = useState(0);
  const [embers, setEmbers] = useState<BurnEmber[]>([]);
  const [ashFlakes, setAshFlakes] = useState<AshFlake[]>([]);
  const [ashProgress, setAshProgress] = useState(0);

  const hoverMsRef = useRef(0);
  const spinDegRef = useRef(0);
  const heatingActiveRef = useRef(false);
  const phaseRef = useRef<WheelPhase>('idle');
  const vibrated15Ref = useRef(false);
  const onHoverChangeRef = useRef(onHoverChange);
  const fxRef = useRef({
    elapsed: 0,
    emberSpawnAcc: 0,
    particleId: 1,
    activeEmbers: [] as BurnEmber[],
    activeAsh: [] as AshFlake[],
  });

  useEffect(() => {
    onHoverChangeRef.current = onHoverChange;
  }, [onHoverChange]);

  useEffect(() => {
    setPreviewSide(side);
  }, [side]);

  const isHeating = isPressing || isHovering;

  useEffect(() => {
    heatingActiveRef.current = isHeating && phaseRef.current === 'idle';
  }, [isHeating]);

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase === 'idle' && !isHeating && hoverMsRef.current <= 0) return;

    const HEAT_MS = 15000;
    const ASH_TRIGGER_MS = 30000;
    const COOL_RATE = 30000 / 2400;
    const ASH_DURATION_MS = 2300;

    let rafId = 0;
    let lastTime = performance.now();
    const fx = fxRef.current;

    const tick = (now: number) => {
      const dt = Math.min(48, Math.max(1, now - lastTime));
      const dtSec = dt / 1000;
      lastTime = now;

      if (phaseRef.current === 'idle') {
        if (heatingActiveRef.current) {
          hoverMsRef.current = Math.min(ASH_TRIGGER_MS, hoverMsRef.current + dt);
        } else {
          hoverMsRef.current = Math.max(0, hoverMsRef.current - dt * COOL_RATE);
          if (hoverMsRef.current < HEAT_MS * 0.85) {
            vibrated15Ref.current = false;
          }
        }

        const ms = hoverMsRef.current;
        const nextHeat = Math.min(1, ms / HEAT_MS);
        const nextBurn = ms > HEAT_MS ? Math.min(1, (ms - HEAT_MS) / (ASH_TRIGGER_MS - HEAT_MS)) : 0;
        const nextChar = Math.max(0, Math.min(1, (nextBurn - 0.42) / 0.58));

        if (ms >= HEAT_MS && !vibrated15Ref.current) {
          vibrated15Ref.current = true;
          if ('vibrate' in navigator) navigator.vibrate(18);
        }

        setHeat(nextHeat);
        setBurnLevel(nextBurn);

        if (ms > 0) {
          const speedDegPerSec =
            (36 + Math.pow(nextHeat, 2.15) * 1600 + Math.pow(nextBurn, 1.3) * 900) *
            (1 - nextChar * 0.48);
          spinDegRef.current = (spinDegRef.current + speedDegPerSec * dtSec) % 360;
          setSpinDeg(spinDegRef.current);

          // Spawn rising sparks cleanly visible above fingertip, intensifying after 15s into ash flakes
          if ((nextHeat > 0.35 || nextBurn > 0.02) && heatingActiveRef.current) {
            const rect = wrapperRef.current?.getBoundingClientRect();
            const cx = rect ? rect.left + rect.width / 2 : window.innerWidth - 48;
            const cy = rect ? rect.top + rect.height / 2 : window.innerHeight - 48;
            const spawnRate =
              nextBurn > 0
                ? 0.015 + nextBurn * 0.045
                : (nextHeat - 0.35) * 0.012;
            fx.emberSpawnAcc += dt * spawnRate;
            while (fx.emberSpawnAcc >= 1) {
              fx.emberSpawnAcc -= 1;
              const spawnAsAsh = nextBurn > 0 && Math.random() < nextChar * 0.9;
              fx.activeEmbers.push({
                id: fx.particleId++,
                x: cx + (Math.random() - 0.5) * 42,
                y: cy - 8 + (Math.random() - 0.5) * 28,
                vx: (Math.random() - 0.5) * 30 + (spawnAsAsh ? 8 : 0),
                vy: -(spawnAsAsh ? 36 + Math.random() * 52 : 52 + Math.random() * 68),
                life: 0,
                maxLife: spawnAsAsh ? 750 + Math.random() * 500 : 580 + Math.random() * 440,
                size: spawnAsAsh ? 2.8 + Math.random() * 3.2 : 2.4 + Math.random() * 3,
                ash: spawnAsAsh,
              });
            }
          }

          if (fx.activeEmbers.length > 0) {
            fx.activeEmbers = fx.activeEmbers
              .map((em) => ({
                ...em,
                x: em.x + em.vx * dtSec,
                y: em.y + em.vy * dtSec,
                life: em.life + dt,
              }))
              .filter((em) => em.life < em.maxLife);
            setEmbers([...fx.activeEmbers]);
          }

          if (ms >= ASH_TRIGGER_MS) {
            const rect = wrapperRef.current?.getBoundingClientRect();
            const cx = rect ? rect.left + rect.width / 2 : window.innerWidth - 48;
            const cy = rect ? rect.top + rect.height / 2 : window.innerHeight - 48;
            if ('vibrate' in navigator) navigator.vibrate([22, 35, 16]);
            if (rect) {
              const dropSide: 'left' | 'right' = cx < window.innerWidth / 2 ? 'left' : 'right';
              onChangeSide?.(dropSide);
            }
            fx.elapsed = 0;
            fx.activeEmbers = [];
            fx.activeAsh = createAshBurst(cx, cy, fx.particleId);
            fx.particleId += fx.activeAsh.length + 1;
            setEmbers([]);
            setAshFlakes([...fx.activeAsh]);
            setAshProgress(0);
            setIsDragging(false);
            setIsSnapping(false);
            setDragPos(null);
            setIsHovering(false);
            setIsPressing(false);
            heatingActiveRef.current = false;
            vibrated15Ref.current = false;
            onHoverChangeRef.current?.(false);
            phaseRef.current = 'ash';
            setPhase('ash');
            return;
          }

          rafId = window.requestAnimationFrame(tick);
        } else {
          spinDegRef.current = 0;
          setSpinDeg(0);
          if (fx.activeEmbers.length > 0) {
            fx.activeEmbers = [];
            setEmbers([]);
          }
        }
        return;
      }

      if (phaseRef.current === 'ash') {
        fx.elapsed += dt;
        const t = Math.min(1, fx.elapsed / ASH_DURATION_MS);

        if (t < 0.45) {
          const decel = Math.pow(1 - t / 0.45, 2);
          spinDegRef.current = (spinDegRef.current + 1200 * decel * dtSec) % 360;
          setSpinDeg(spinDegRef.current);
        } else if (t >= 0.7) {
          spinDegRef.current = 0;
          setSpinDeg(0);
          setHeat(0);
          setBurnLevel(0);
        }

        fx.activeAsh = fx.activeAsh
          .map((f) => {
            if (fx.elapsed < f.delay) return f;
            const nextLife = f.life + dt;
            const sway = Math.sin(nextLife * 0.008 + f.swayPhase) * 14;
            return {
              ...f,
              x: f.x + (f.vx + sway) * dtSec,
              y: f.y + f.vy * dtSec,
              vy: f.vy * 0.992,
              rot: f.rot + f.vRot * dtSec,
              life: nextLife,
            };
          })
          .filter((f) => f.life < f.maxLife);

        setAshFlakes([...fx.activeAsh]);
        setAshProgress(t);

        if (t >= 1) {
          fx.activeAsh = [];
          setAshFlakes([]);
          setAshProgress(0);
          hoverMsRef.current = 0;
          setHeat(0);
          setBurnLevel(0);
          spinDegRef.current = 0;
          setSpinDeg(0);
          phaseRef.current = 'idle';
          setPhase('idle');
          return;
        }

        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [isHeating, phase]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (phaseRef.current !== 'idle') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Prevent Android WebView text selection / context callouts on long press
    if (e.pointerType === 'touch') {
      e.preventDefault();
    }

    if (snapTimerRef.current) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
      setIsSnapping(false);
    }

    const downAt = performance.now();
    const pointerId = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(pointerId);
    } catch {
      // Ignore pointer capture errors
    }

    setIsPressing(true);
    onHoverChange?.(false);

    const rect = wrapper.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = rect.left;
    const originY = rect.top;
    const btnW = rect.width;
    const btnH = rect.height;
    let dragged = false;
    let latestX = originX;
    let latestY = originY;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (phaseRef.current !== 'idle') return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const dist = Math.hypot(dx, dy);

      // Enter corner-drag mode whenever the pointer moves beyond threshold — at ANY point
      // during the spin/heat/burn hold — without interrupting acceleration or flames!
      if (!dragged && dist > DRAG_DISTANCE_PX) {
        dragged = true;
        setIsDragging(true);
        onHoverChange?.(false);
      }
      if (!dragged) return;

      latestX = Math.max(12, Math.min(window.innerWidth - btnW - 12, originX + dx));
      latestY = Math.max(12, Math.min(window.innerHeight - btnH - 12, originY + dy));
      setDragPos({x: latestX, y: latestY});
      setPreviewSide(latestX + btnW / 2 < window.innerWidth / 2 ? 'left' : 'right');
    };

    const cleanup = (ev: PointerEvent, cancelled: boolean) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);

      setIsPressing(false);
      const heldFor = performance.now() - downAt;

      if (dragged) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 160);

        if (phaseRef.current !== 'idle') {
          setIsDragging(false);
          setIsSnapping(false);
          setDragPos(null);
          return;
        }

        const targetSide: 'left' | 'right' =
          latestX + btnW / 2 < window.innerWidth / 2 ? 'left' : 'right';
        const edge = window.innerWidth >= 1024 ? 32 : 20;
        const targetX = targetSide === 'left' ? edge : window.innerWidth - btnW - edge;
        const targetY = window.innerHeight - btnH - edge;

        setIsDragging(false);
        setIsSnapping(true);
        setDragPos({x: targetX, y: targetY});
        onChangeSide?.(targetSide);

        snapTimerRef.current = window.setTimeout(() => {
          setIsSnapping(false);
          setDragPos(null);
          snapTimerRef.current = null;
        }, 260);
        return;
      }

      if (cancelled) return;

      // Quick tap opens the radial WheelMenu; long press-and-hold cools down smoothly without opening menu
      if (heldFor < TAP_MAX_MS && phaseRef.current === 'idle') {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 160);
        setIsHovering(false);
        hoverMsRef.current = 0;
        setHeat(0);
        setBurnLevel(0);
        onClick();
      } else {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 160);
      }
    };

    const onUp = (ev: PointerEvent) => cleanup(ev, false);
    const onCancel = (ev: PointerEvent) => cleanup(ev, true);

    window.addEventListener('pointermove', onMove, {passive: true});
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  const cornerClass =
    side === 'left'
      ? 'morph-fab-bottom left-5 lg:left-8'
      : 'morph-fab-bottom right-5 lg:right-8';

  const charLevel = Math.max(0, Math.min(1, (burnLevel - 0.42) / 0.58));
  const flameFade = Math.max(0, 1 - charLevel * 1.25);
  const isBlazing = heat >= 0.92 && phase === 'idle' && flameFade > 0.05;
  const toothReveal = Math.max(0, Math.min(1, (heat - 0.18) / 0.72));
  const emberRatio = Math.max(0, Math.min(1, (heat - 0.12) / 0.88));
  const glowFade = 1 - charLevel * 0.86;
  const wheelTone =
    charLevel > 0.65
      ? '#71717A'
      : charLevel > 0.3
        ? '#A1A1AA'
        : isBlazing
          ? '#FFF3C4'
          : '#FFFFFF';

  let ashBtnOpacity = 1;
  let ashBtnScale = 1;
  let ashCharFilter =
    phase === 'idle' && charLevel > 0.01
      ? `grayscale(${(charLevel * 0.92).toFixed(2)}) brightness(${(1 - charLevel * 0.56).toFixed(2)})`
      : '';
  if (phase === 'ash') {
    if (ashProgress < 0.28) {
      const ct = ashProgress / 0.28;
      ashBtnOpacity = Math.max(0, 1 - Math.pow(ct, 1.3));
      ashBtnScale = 1 - ct * 0.16;
      ashCharFilter = `grayscale(${(0.92 + ct * 0.08).toFixed(2)}) brightness(${(
        0.44 - ct * 0.22
      ).toFixed(2)})`;
    } else if (ashProgress < 0.72) {
      ashBtnOpacity = 0;
      ashBtnScale = 0.84;
    } else {
      const rt = (ashProgress - 0.72) / 0.28;
      const easeOut = 1 - Math.pow(1 - rt, 2);
      ashBtnOpacity = easeOut;
      ashBtnScale = 0.9 + easeOut * 0.1;
    }
  }

  const baseGradStart = `color-mix(in srgb, ${
    heat > 0.62 ? '#DC2626' : '#EA580C'
  } ${Math.round(emberRatio * 100)}%, var(--accent))`;
  const baseGradEnd = `color-mix(in srgb, ${
    heat > 0.72 ? '#991B1B' : '#FF3D00'
  } ${Math.round(emberRatio * 100)}%, var(--accent-end))`;

  const fireStyle: React.CSSProperties | undefined =
    heat > 0.04 && (phase === 'idle' || ashProgress < 0.7)
      ? {
          backgroundImage: `linear-gradient(135deg, color-mix(in srgb, #27272A ${Math.round(
            charLevel * 92
          )}%, ${baseGradStart}) 0%, color-mix(in srgb, #18181B ${Math.round(
            charLevel * 94
          )}%, ${baseGradEnd}) 100%)`,
          borderColor:
            charLevel > 0.25
              ? `rgba(161, 161, 170, ${(0.45 - charLevel * 0.2).toFixed(2)})`
              : `rgba(255, ${Math.round(255 - emberRatio * 145)}, ${Math.round(
                  255 - emberRatio * 210
                )}, ${0.24 + emberRatio * 0.65})`,
          boxShadow:
            phase === 'ash'
              ? 'none'
              : `0 0 ${Math.round((14 + emberRatio * 28 + burnLevel * 14) * glowFade)}px rgba(239, 68, 68, ${(
                  (emberRatio * 0.85 + burnLevel * 0.12) *
                  glowFade
                ).toFixed(2)}), 0 0 ${Math.round((6 + emberRatio * 16 + burnLevel * 10) * glowFade)}px rgba(251, 146, 60, ${(
                  emberRatio *
                  0.75 *
                  glowFade
                ).toFixed(2)})`,
        }
      : undefined;

  return (
    <>
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-20">
          <div
            className={`morph-fab-bottom fixed left-5 flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed transition-all duration-150 lg:left-8 ${
              previewSide === 'left'
                ? 'scale-105 border-[var(--accent)] bg-[var(--accent)]/15'
                : 'border-[var(--line)] bg-[var(--surface)]/30 opacity-60'
            }`}
          />
          <div
            className={`morph-fab-bottom fixed right-5 flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed transition-all duration-150 lg:right-8 ${
              previewSide === 'right'
                ? 'scale-105 border-[var(--accent)] bg-[var(--accent)]/15'
                : 'border-[var(--line)] bg-[var(--surface)]/30 opacity-60'
            }`}
          />
        </div>
      )}

      {/* Rising ember sparks transitioning to early ash flakes as 30s approaches */}
      {phase === 'idle' && embers.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
          {embers.map((em) => {
            const p = em.life / em.maxLife;
            return (
              <span
                key={em.id}
                className={`fixed -translate-x-1/2 -translate-y-1/2 ${
                  em.ash ? 'rounded-[2px]' : 'rounded-full'
                }`}
                style={{
                  left: `${em.x}px`,
                  top: `${em.y}px`,
                  width: `${em.size}px`,
                  height: `${em.ash ? em.size * 0.72 : em.size}px`,
                  opacity: Math.max(0, (1 - p) * 0.9),
                  backgroundColor: em.ash
                    ? p < 0.4
                      ? '#A1A1AA'
                      : '#52525B'
                    : p < 0.35
                      ? '#FFF3C4'
                      : p < 0.7
                        ? '#FF5722'
                        : '#DC2626',
                  boxShadow: em.ash ? undefined : '0 0 8px rgba(255, 61, 0, 0.9)',
                }}
              />
            );
          })}
        </div>
      )}

      {/* 30s Ash flakes drifting upward and fading */}
      {phase === 'ash' && ashFlakes.length > 0 && (
        <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
          {ashFlakes.map((f) => {
            const p = f.life / f.maxLife;
            const fadeIn = Math.min(1, f.life / 120);
            const fadeOut = Math.max(0, 1 - Math.pow(p, 1.35));
            const isOrange = f.shade === '#FB923C';
            const color = isOrange && p > 0.35 ? '#52525B' : f.shade;
            return (
              <span
                key={f.id}
                className="fixed rounded-[2px]"
                style={{
                  left: `${f.x}px`,
                  top: `${f.y}px`,
                  width: `${f.w}px`,
                  height: `${f.h}px`,
                  opacity: fadeIn * fadeOut * 0.92,
                  backgroundColor: color,
                  transform: `translate(-50%, -50%) rotate(${f.rot.toFixed(1)}deg) scale(${(
                    1 - p * 0.35
                  ).toFixed(2)})`,
                  boxShadow: isOrange && p <= 0.35 ? '0 0 6px rgba(251, 146, 60, 0.75)' : undefined,
                }}
              />
            );
          })}
        </div>
      )}

      <div
        ref={wrapperRef}
        onContextMenu={(e) => e.preventDefault()}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'touch' && !isDragging && phase === 'idle') {
            setIsHovering(true);
            if (!isPressing) onHoverChange?.(true);
          }
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'touch') {
            setIsHovering(false);
            onHoverChange?.(false);
          }
        }}
        style={
          dragPos
            ? {
                left: `${dragPos.x}px`,
                top: `${dragPos.y}px`,
                transition: isSnapping
                  ? 'left 260ms cubic-bezier(0.22, 1, 0.36, 1), top 260ms cubic-bezier(0.22, 1, 0.36, 1)'
                  : 'none',
              }
            : undefined
        }
        className={`no-touch-callout fixed z-30 select-none ${dragPos ? '' : cornerClass}`}
      >
        {!isDragging && !isPressing && heat < 0.08 && phase === 'idle' && cloud}
        {heat > 0.32 && phase === 'idle' && flameFade > 0.05 && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-3.5 rounded-full blur-md transition-opacity duration-200 ${
              isBlazing ? 'morph-flame-flicker' : ''
            }`}
            style={{
              opacity: Math.min(1, (heat - 0.32) * 1.55 + burnLevel * 0.22) * flameFade,
              background:
                'radial-gradient(circle, rgba(255,95,31,0.82) 0%, rgba(220,38,38,0.62) 55%, rgba(185,28,28,0) 78%)',
            }}
          />
        )}
        <button
          type="button"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={handlePointerDown}
          onClick={() => {
            if (suppressClickRef.current || phase !== 'idle') return;
            setIsHovering(false);
            setIsPressing(false);
            hoverMsRef.current = 0;
            setHeat(0);
            setBurnLevel(0);
            onClick();
          }}
          onFocus={onFocus}
          onBlur={() => {
            setIsHovering(false);
            onBlur?.();
          }}
          aria-label={label}
          style={{
            ...fireStyle,
            opacity: phase === 'ash' ? ashBtnOpacity : undefined,
            filter: ashCharFilter || undefined,
            transform: phase === 'ash' ? `scale(${ashBtnScale.toFixed(3)})` : undefined,
            pointerEvents: phase === 'ash' ? 'none' : undefined,
          }}
          className={
            className ??
            `morph-accent-btn no-touch-callout relative flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border border-white/20 text-white shadow-xl transition-transform duration-150 ${
              isDragging
                ? 'scale-110 cursor-grabbing shadow-2xl'
                : isBlazing || isPressing
                  ? 'scale-105 cursor-grab'
                  : 'cursor-grab'
            }`
          }
        >
          {isBlazing && (
            <svg
              aria-hidden="true"
              className="morph-flame-flicker pointer-events-none absolute -inset-2.5 h-[76px] w-[76px]"
              viewBox="0 0 72 72"
              fill="none"
              style={{opacity: flameFade}}
            >
              {Array.from({length: 12}).map((_, idx) => {
                const baseAngle = idx * 30;
                const rad1 = ((baseAngle - 10) * Math.PI) / 180;
                const radTip = (baseAngle * Math.PI) / 180;
                const rad2 = ((baseAngle + 10) * Math.PI) / 180;
                const rBase = 27.5;
                const rTip = idx % 2 === 0 ? 35.8 : 33.2;
                const x1 = 36 + rBase * Math.cos(rad1);
                const y1 = 36 + rBase * Math.sin(rad1);
                const xt = 36 + rTip * Math.cos(radTip);
                const yt = 36 + rTip * Math.sin(radTip);
                const x2 = 36 + rBase * Math.cos(rad2);
                const y2 = 36 + rBase * Math.sin(rad2);
                return (
                  <path
                    key={idx}
                    d={`M ${x1} ${y1} Q ${xt} ${yt} ${x2} ${y2} Z`}
                    fill={idx % 2 === 0 ? '#FF3D00' : '#FF1744'}
                    fillOpacity="0.92"
                  />
                );
              })}
            </svg>
          )}
          <svg
            className="pointer-events-none relative z-10 h-7 w-7"
            viewBox="0 0 28 28"
            fill="none"
            style={{
              transform: `rotate(${spinDeg.toFixed(1)}deg) scale(${(1 + toothReveal * 0.08).toFixed(3)})`,
            }}
          >
            {toothReveal > 0.02 &&
              Array.from({length: 12}).map((_, idx) => {
                const deg = idx * 30;
                const radA = ((deg - 7) * Math.PI) / 180;
                const radTip = (deg * Math.PI) / 180;
                const radB = ((deg + 7) * Math.PI) / 180;
                const rInner = 9.2;
                const rOuter = 9.6 + toothReveal * 3.9;
                const x1 = 14 + rInner * Math.cos(radA);
                const y1 = 14 + rInner * Math.sin(radA);
                const xt = 14 + rOuter * Math.cos(radTip);
                const yt = 14 + rOuter * Math.sin(radTip);
                const x2 = 14 + rInner * Math.cos(radB);
                const y2 = 14 + rInner * Math.sin(radB);
                return (
                  <path
                    key={idx}
                    d={`M ${x1} ${y1} L ${xt} ${yt} L ${x2} ${y2} Z`}
                    fill={wheelTone}
                    fillOpacity={Math.min(1, toothReveal * 1.15)}
                  />
                );
              })}
            {[0, 60, 120, 180, 240, 300].map((deg) => {
              const a1 = ((deg - 82) * Math.PI) / 180;
              const a2 = ((deg - 38) * Math.PI) / 180;
              const r = 10.5;
              const x1 = 14 + r * Math.cos(a1);
              const y1 = 14 + r * Math.sin(a1);
              const x2 = 14 + r * Math.cos(a2);
              const y2 = 14 + r * Math.sin(a2);
              return (
                <path
                  key={deg}
                  d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                  stroke={wheelTone}
                  strokeWidth="2.3"
                  strokeLinecap="round"
                />
              );
            })}
            <circle cx="14" cy="14" r={2.3 + toothReveal * 0.6} fill={wheelTone} />
          </svg>
        </button>
      </div>
    </>
  );
};
