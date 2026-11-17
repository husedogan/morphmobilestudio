import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, Check, RotateCcw} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {PickedFile} from '../data/models';
import {decodeImage} from '../engine/imaging';

interface CropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface CropEditorProps {
  file: PickedFile;
  lang: Lang;
  onBack: () => void;
  onApply: (rect: CropRect) => void;
}

const DEFAULT_RECT: CropRect = {left: 0.06, top: 0.06, right: 0.94, bottom: 0.94};

function rectForAspect(aspect: number | null, imgW: number, imgH: number): CropRect {
  if (!aspect || imgW <= 0 || imgH <= 0) return DEFAULT_RECT;
  const maxW = 0.9;
  const maxH = 0.9;
  const k = imgW / (aspect * imgH);
  let w = maxW;
  let h = w * k;
  if (h > maxH) {
    h = maxH;
    w = k > 0 ? h / k : maxW;
  }
  const left = 0.5 - w / 2;
  const top = 0.5 - h / 2;
  return {left, top, right: left + w, bottom: top + h};
}

export const CropEditor: React.FC<CropEditorProps> = ({file, lang, onBack, onApply}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState<{w: number; h: number} | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string>('');
  const [rect, setRect] = useState<CropRect>(DEFAULT_RECT);
  const [aspect, setAspect] = useState<number | null>(null);
  const [bounds, setBounds] = useState<{left: number; top: number; width: number; height: number}>({
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  });

  const dragRef = useRef<{
    mode: 0 | 1 | 2 | 3 | 4 | 5;
    startX: number;
    startY: number;
    startRect: CropRect;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let url = '';
    decodeImage(file.file, 2048).then((decoded) => {
      if (!active) {
        decoded.bitmap.close();
        return;
      }
      setImgSize({w: decoded.width, h: decoded.height});
      const canvas = document.createElement('canvas');
      canvas.width = decoded.width;
      canvas.height = decoded.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(decoded.bitmap, 0, 0);
      decoded.bitmap.close();
      canvas.toBlob((blob) => {
        if (!active || !blob) return;
        url = URL.createObjectURL(blob);
        setPreviewSrc(url);
      }, 'image/jpeg', 0.92);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  const recomputeBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el || !imgSize) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw <= 0 || ch <= 0) return;
    const scale = Math.min(cw / imgSize.w, ch / imgSize.h);
    const w = imgSize.w * scale;
    const h = imgSize.h * scale;
    setBounds({
      left: (cw - w) / 2,
      top: (ch - h) / 2,
      width: w,
      height: h,
    });
  }, [imgSize]);

  useEffect(() => {
    recomputeBounds();
    window.addEventListener('resize', recomputeBounds);
    return () => window.removeEventListener('resize', recomputeBounds);
  }, [recomputeBounds]);

  const aspectOptions = useMemo(
    () => [
      {value: null, label: t('Free', lang)},
      {value: 1, label: '1:1'},
      {value: 4 / 5, label: '4:5'},
      {value: 16 / 9, label: '16:9'},
      {value: 3 / 2, label: '3:2'},
      {value: 9 / 16, label: '9:16'},
    ],
    [lang]
  );

  const outPixels = imgSize
    ? {
        w: Math.max(1, Math.round((rect.right - rect.left) * imgSize.w)),
        h: Math.max(1, Math.round((rect.bottom - rect.top) * imgSize.h)),
      }
    : null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el || bounds.width <= 1) return;
    const box = el.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;

    const lPx = bounds.left + rect.left * bounds.width;
    const tPx = bounds.top + rect.top * bounds.height;
    const rPx = bounds.left + rect.right * bounds.width;
    const bPx = bounds.top + rect.bottom * bounds.height;
    const hitR = 28; // Generous 28px corner touch radius

    const near = (cx: number, cy: number) => Math.hypot(px - cx, py - cy) <= hitR;
    let mode: 0 | 1 | 2 | 3 | 4 | 5 = 0;
    if (near(lPx, tPx)) mode = 2;
    else if (near(rPx, tPx)) mode = 3;
    else if (near(rPx, bPx)) mode = 4;
    else if (near(lPx, bPx)) mode = 5;
    else if (px >= lPx && px <= rPx && py >= tPx && py <= bPx) mode = 1;

    if (mode === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {mode, startX: e.clientX, startY: e.clientY, startRect: {...rect}};
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !imgSize || bounds.width <= 1 || bounds.height <= 1) return;

    const dx = (e.clientX - drag.startX) / bounds.width;
    const dy = (e.clientY - drag.startY) / bounds.height;
    const sr = drag.startRect;
    const minSize = 0.08;

    if (drag.mode === 1) {
      const moveX = Math.max(-sr.left, Math.min(1 - sr.right, dx));
      const moveY = Math.max(-sr.top, Math.min(1 - sr.bottom, dy));
      setRect({
        left: sr.left + moveX,
        top: sr.top + moveY,
        right: sr.right + moveX,
        bottom: sr.bottom + moveY,
      });
      return;
    }

    const r = {...sr};
    if (aspect === null) {
      if (drag.mode === 2) {
        r.left = Math.max(0, Math.min(sr.right - minSize, sr.left + dx));
        r.top = Math.max(0, Math.min(sr.bottom - minSize, sr.top + dy));
      } else if (drag.mode === 3) {
        r.right = Math.min(1, Math.max(sr.left + minSize, sr.right + dx));
        r.top = Math.max(0, Math.min(sr.bottom - minSize, sr.top + dy));
      } else if (drag.mode === 4) {
        r.right = Math.min(1, Math.max(sr.left + minSize, sr.right + dx));
        r.bottom = Math.min(1, Math.max(sr.top + minSize, sr.bottom + dy));
      } else if (drag.mode === 5) {
        r.left = Math.max(0, Math.min(sr.right - minSize, sr.left + dx));
        r.bottom = Math.min(1, Math.max(sr.top + minSize, sr.bottom + dy));
      }
      setRect(r);
      return;
    }

    // Exact mathematical aspect-ratio clamping so corners never distort at edges
    const k = imgSize.w / (aspect * imgSize.h);
    const anchorX = drag.mode === 2 || drag.mode === 5 ? sr.right : sr.left;
    const anchorY = drag.mode === 2 || drag.mode === 3 ? sr.bottom : sr.top;
    const maxW = drag.mode === 2 || drag.mode === 5 ? anchorX : 1 - anchorX;
    const maxH = drag.mode === 2 || drag.mode === 3 ? anchorY : 1 - anchorY;
    const maxWAllowed = Math.min(maxW, k > 0 ? maxH / k : maxW);
    const minWAllowed = Math.min(maxWAllowed, Math.max(minSize, k > 0 ? minSize / k : minSize));

    const desiredW =
      drag.mode === 2 || drag.mode === 5 ? anchorX - (sr.left + dx) : sr.right + dx - anchorX;
    const nw = Math.max(minWAllowed, Math.min(maxWAllowed, desiredW));
    const nh = nw * k;

    if (drag.mode === 2 || drag.mode === 5) r.left = anchorX - nw;
    else r.right = anchorX + nw;

    if (drag.mode === 2 || drag.mode === 3) r.top = anchorY - nh;
    else r.bottom = anchorY + nh;

    setRect(r);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const lPx = bounds.left + rect.left * bounds.width;
  const tPx = bounds.top + rect.top * bounds.height;
  const wPx = Math.max(4, (rect.right - rect.left) * bounds.width);
  const hPx = Math.max(4, (rect.bottom - rect.top) * bounds.height);

  return (
    <div className="morph-bg fixed inset-0 z-40 flex flex-col text-[var(--ink)]">
      {/* Compact Top Bar with Safe-Area Top Inset */}
      <header className="shrink-0 border-b border-[var(--line)] bg-[var(--paper)]/92 pt-safe backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full hover:bg-[var(--inset)]"
              aria-label={t('Back', lang)}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold">{t('ToolCrop', lang)}</h2>
              <p className="font-mono-num truncate text-xs text-[var(--muted)]">
                {outPixels ? `${outPixels.w} × ${outPixels.h} px · ${file.name}` : file.name}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Interactive Crop Canvas */}
      <div
        ref={containerRef}
        className="relative m-3 flex-1 overflow-hidden rounded-2xl border border-[var(--line)] bg-black/40 touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {previewSrc ? (
          <>
            <img
              src={previewSrc}
              alt={file.name}
              draggable={false}
              className="pointer-events-none absolute object-contain"
              style={{
                left: bounds.left,
                top: bounds.top,
                width: bounds.width,
                height: bounds.height,
              }}
            />
            {/* Darkened outer overlay via box-shadow */}
            <div
              className="pointer-events-none absolute border-2"
              style={{
                left: lPx,
                top: tPx,
                width: wPx,
                height: hPx,
                borderColor: 'var(--accent)',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.56)',
              }}
            >
              {/* Rule of thirds */}
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/30" />

              {/* Corner handles */}
              {[
                '-left-2 -top-2',
                '-right-2 -top-2',
                '-right-2 -bottom-2',
                '-left-2 -bottom-2',
              ].map((pos, idx) => (
                <span
                  key={idx}
                  className={`absolute ${pos} h-4 w-4 rounded-full border-2 bg-white shadow`}
                  style={{borderColor: 'var(--accent)'}}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
            {t('Working', lang)}
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="shrink-0 border-t border-[var(--line)] bg-[var(--paper)] px-4 pb-safe pt-3">
        <div className="mx-auto max-w-xl">
          <div className="flex flex-wrap gap-2">
            {aspectOptions.map((opt) => {
              const active = aspect === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    setAspect(opt.value);
                    if (imgSize) {
                      setRect(rectForAspect(opt.value, imgSize.w, imgSize.h));
                    }
                  }}
                  className={`min-h-[38px] rounded-full border px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--ink)]'
                      : 'border-[var(--line)] bg-[var(--inset)] text-[var(--muted)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2.5 pb-2">
            <button
              type="button"
              onClick={() => {
                setAspect(null);
                setRect(DEFAULT_RECT);
              }}
              className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--inset)] text-sm font-semibold text-[var(--ink)]"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{t('Reset', lang)}</span>
            </button>
            <button
              type="button"
              disabled={!imgSize}
              onClick={() => onApply(rect)}
              className="morph-accent-btn flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              <span>{t('Apply', lang)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
