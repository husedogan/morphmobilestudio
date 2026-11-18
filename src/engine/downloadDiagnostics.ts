import {Share} from '@capacitor/share';
import {DownloadEngineId, formatBytes} from '../data/models';
import {APP_VERSION, getVersionChannel} from './githubUpdater';
import {isNativeApp} from './nativeBridge';

const DIAGNOSTICS_STORAGE_KEY = 'morph_dl_diagnostics_v1';
const MAX_STORED_REPORTS = 15;
export const DIAGNOSTICS_UPDATED_EVENT = 'morph-diagnostics-updated';

export type DiagnosticStatus = 'success' | 'failed' | 'blocked';

export interface DownloadDiagnosticReport {
  id: string;
  createdAt: number;
  appVersion: string;
  channel: string;
  platform: 'android-apk' | 'web';
  networkType: string;
  metered: boolean;
  wifiOnly: boolean;
  cellularLimitMb: number;
  selectedEngine: DownloadEngineId;
  effectiveEngine: string;
  engineVersion: string;
  mode: string;
  quality: string;
  autoFallback: boolean;
  concurrentFragments: number;
  urlHost: string;
  urlSample: string;
  status: DiagnosticStatus;
  elapsedMs: number;
  outputBytes: number;
  error?: string;
  steps: string[];
}

export interface DiagnosticSessionInit {
  networkType: string;
  metered: boolean;
  wifiOnly: boolean;
  cellularLimitMb: number;
  selectedEngine: DownloadEngineId;
  engineVersion?: string;
  mode: string;
  quality: string;
  autoFallback: boolean;
  concurrentFragments: number;
  rawUrl: string;
}

function sanitizeDiagnosticUrl(rawUrl: string): {host: string; sample: string} {
  const trimmed = rawUrl.trim();
  if (!trimmed) return {host: '-', sample: '-'};
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    const safeParams = new URLSearchParams();
    for (const [k, v] of u.searchParams.entries()) {
      const lower = k.toLowerCase();
      if (lower === 'v' || lower === 'list' || lower === 'id' || lower === 't') {
        safeParams.set(k, v.slice(0, 32));
      } else {
        safeParams.set(k, '***');
      }
    }
    const qs = safeParams.toString();
    return {
      host: u.hostname,
      sample: `${u.origin}${u.pathname.slice(0, 80)}${qs ? `?${qs}` : ''}`,
    };
  } catch {
    return {host: 'invalid-url', sample: trimmed.slice(0, 80)};
  }
}

function makeShortReportCode(): string {
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DL-${rnd}`;
}

export class DiagnosticSession {
  private readonly startedAt = Date.now();
  private readonly id = makeShortReportCode();
  private readonly steps: string[] = [];
  private effectiveEngine: string;
  private engineVersion: string;
  private readonly init: DiagnosticSessionInit;

  constructor(init: DiagnosticSessionInit) {
    this.init = init;
    this.effectiveEngine = init.selectedEngine;
    this.engineVersion = init.engineVersion || 'built-in';
  }

  get code(): string {
    return this.id;
  }

  step(engineTag: string, message: string): void {
    const delta = Date.now() - this.startedAt;
    this.steps.push(`+${delta}ms [${engineTag}] ${message}`);
  }

  setEffectiveEngine(engine: string, version?: string): void {
    this.effectiveEngine = engine;
    if (version) this.engineVersion = version;
  }

  finish(status: DiagnosticStatus, opts?: {outputBytes?: number; error?: string}): DownloadDiagnosticReport {
    const {host, sample} = sanitizeDiagnosticUrl(this.init.rawUrl);
    const report: DownloadDiagnosticReport = {
      id: this.id,
      createdAt: Date.now(),
      appVersion: APP_VERSION,
      channel: getVersionChannel(APP_VERSION),
      platform: isNativeApp() ? 'android-apk' : 'web',
      networkType: this.init.networkType,
      metered: this.init.metered,
      wifiOnly: this.init.wifiOnly,
      cellularLimitMb: this.init.cellularLimitMb,
      selectedEngine: this.init.selectedEngine,
      effectiveEngine: this.effectiveEngine,
      engineVersion: this.engineVersion,
      mode: this.init.mode,
      quality: this.init.quality,
      autoFallback: this.init.autoFallback,
      concurrentFragments: this.init.concurrentFragments,
      urlHost: host,
      urlSample: sample,
      status,
      elapsedMs: Date.now() - this.startedAt,
      outputBytes: opts?.outputBytes ?? 0,
      error: opts?.error,
      steps: [...this.steps],
    };
    saveDiagnosticReport(report);
    return report;
  }
}

export function loadDiagnosticReports(): DownloadDiagnosticReport[] {
  try {
    const raw = localStorage.getItem(DIAGNOSTICS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDiagnosticReport(report: DownloadDiagnosticReport): void {
  try {
    const prev = loadDiagnosticReports().filter((r) => r.id !== report.id);
    const next = [report, ...prev].slice(0, MAX_STORED_REPORTS);
    localStorage.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(DIAGNOSTICS_UPDATED_EVENT, {detail: report}));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function clearDiagnosticReports(): void {
  try {
    localStorage.removeItem(DIAGNOSTICS_STORAGE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(DIAGNOSTICS_UPDATED_EVENT));
    }
  } catch {
    // Ignore
  }
}

export function formatSingleReportText(r: DownloadDiagnosticReport): string {
  const dateIso = new Date(r.createdAt).toISOString();
  const limitLabel = r.cellularLimitMb > 0 ? `${r.cellularLimitMb} MB` : 'Sınırsız';
  const lines = [
    `=== MORPH TEST TANILAMA RAPORU (${r.id}) ===`,
    `Sürüm       : Morph ${r.appVersion} (${r.channel}) · ${r.platform}`,
    `Tarih       : ${dateIso}`,
    `Ağ Durumu   : ${r.networkType} (tarifeli: ${r.metered ? 'evet' : 'hayır'}, sadece-wifi: ${r.wifiOnly ? 'açık' : 'kapalı'}, mobil-sınır: ${limitLabel})`,
    `Motor       : seçili=${r.selectedEngine} -> aktif=${r.effectiveEngine} (${r.engineVersion})`,
    `Mod/Kalite  : ${r.mode} / ${r.quality} (oto-yedek: ${r.autoFallback ? 'açık' : 'kapalı'}, parça: ${r.concurrentFragments}x)`,
    `Hedef       : ${r.urlHost} (${r.urlSample})`,
    `Sonuç       : ${r.status.toUpperCase()} · ${r.elapsedMs} ms${r.outputBytes > 0 ? ` · ${formatBytes(r.outputBytes)}` : ''}`,
  ];
  if (r.error) {
    lines.push(`Hata Özeti  : ${r.error}`);
  }
  if (r.steps.length > 0) {
    lines.push('Adım İzleri :');
    for (const s of r.steps) {
      lines.push(`  • ${s}`);
    }
  }
  lines.push('==========================================');
  return lines.join('\n');
}

export function formatDiagnosticSummaryBundle(limit = 3): string {
  const list = loadDiagnosticReports().slice(0, limit);
  if (list.length === 0) {
    return [
      `=== MORPH TEST DURUM ÖZETİ ===`,
      `Sürüm    : Morph ${APP_VERSION} (${getVersionChannel(APP_VERSION)}) · ${isNativeApp() ? 'android-apk' : 'web'}`,
      `Tarih    : ${new Date().toISOString()}`,
      `Kayıtlar : Henüz tanılama kaydı oluşmadı.`,
      `==============================`,
    ].join('\n');
  }
  return list.map(formatSingleReportText).join('\n\n');
}

export async function copyDiagnosticText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function shareDiagnosticText(text: string, title = 'Morph Tanılama Raporu'): Promise<boolean> {
  if (isNativeApp()) {
    try {
      await Share.share({title, text, dialogTitle: title});
      return true;
    } catch {
      return copyDiagnosticText(text);
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({title, text});
      return true;
    } catch {
      return copyDiagnosticText(text);
    }
  }
  return copyDiagnosticText(text);
}
