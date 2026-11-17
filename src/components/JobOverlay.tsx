import React from 'react';
import {X} from 'lucide-react';
import {Lang, t} from '../data/i18n';
import {JobState} from '../data/models';

interface JobOverlayProps {
  job: JobState;
  lang: Lang;
  onCancel: () => void;
}

export const JobOverlay: React.FC<JobOverlayProps> = ({job, lang, onCancel}) => {
  if (job.status !== 'running') return null;

  const pct = Math.min(100, Math.max(0, Math.round(job.progress * 100)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-2xl">
        <p className="text-xs font-semibold text-[var(--muted)]">{t('Working', lang)}</p>
        <h3 className="mt-1.5 text-xl font-bold">{job.title}</h3>
        <p className="mt-1 truncate text-xs text-[var(--muted)]">
          {job.step || t('PrivacyFootnote', lang)}
        </p>

        <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-[var(--inset)]">
          <div
            className="morph-accent-btn h-full rounded-full transition-[width] duration-150"
            style={{width: `${pct}%`}}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono-num text-xs font-semibold text-[var(--accent)]">{pct}%</span>
          {job.canCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex min-h-[36px] items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--inset)] px-3.5 text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)]"
            >
              <X className="h-3.5 w-3.5" />
              <span>{t('Cancel', lang)}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
