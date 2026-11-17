import React from 'react';
import {
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  File as FileGeneric,
} from 'lucide-react';
import {FileKind} from '../data/models';

export const FileKindIcon: React.FC<{kind: FileKind; className?: string}> = ({kind, className = 'h-5 w-5'}) => {
  switch (kind) {
    case 'image':
      return <FileImage className={className} />;
    case 'pdf':
      return <FileText className={className} />;
    case 'archive':
      return <FileArchive className={className} />;
    case 'video':
      return <FileVideo className={className} />;
    case 'audio':
      return <FileAudio className={className} />;
    case 'document':
      return <FileSpreadsheet className={className} />;
    default:
      return <FileGeneric className={className} />;
  }
};

export const FileThumb: React.FC<{
  previewUrl?: string;
  kind: FileKind;
  alt: string;
  sizeClass?: string;
}> = ({previewUrl, kind, alt, sizeClass = 'h-11 w-11'}) => {
  return (
    <div
      className={`${sizeClass} relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--inset)] text-[var(--muted)]`}
    >
      {previewUrl ? (
        <img src={previewUrl} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <FileKindIcon kind={kind} className="h-5 w-5" />
      )}
    </div>
  );
};
