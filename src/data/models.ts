export type FileKind = 'image' | 'pdf' | 'archive' | 'video' | 'audio' | 'document' | 'other';

export interface PickedFile {
  id: string;
  file: File;
  name: string;
  baseName: string;
  ext: string;
  size: number;
  mime: string;
  kind: FileKind;
  previewUrl?: string;
}

export type ToolId =
  | 'CONVERT'
  | 'COMPRESS'
  | 'METADATA'
  | 'EDIT'
  | 'CROP'
  | 'FILTERS'
  | 'WATERMARK'
  | 'FRAME'
  | 'COLLAGE'
  | 'PDF_CREATE'
  | 'PDF_MERGE'
  | 'PDF_SPLIT'
  | 'PDF_ROTATE'
  | 'PDF_OPTIMIZE'
  | 'PDF_STAMP'
  | 'PDF_TO_IMAGES'
  | 'ZIP_CREATE'
  | 'ZIP_EXTRACT';

export interface ToolDef {
  id: ToolId;
  titleKey: string;
  descKey: string;
}

export type ServerField = 'format' | 'quality' | 'time' | 'speed' | 'channels' | 'aspect' | 'interval';

export interface ServerToolDef {
  id: string;
  titleTr: string;
  titleEn: string;
  descTr: string;
  descEn: string;
  kinds: FileKind[];
  formats: string[];
  fields: ServerField[];
  minFiles?: number;
}

export interface ExportItem {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
  tool: string;
  blob: Blob;
  previewUrl?: string;
}

export interface ExportResult {
  items: ExportItem[];
  tool: string;
  sourceBytes: number;
  note?: string;
}

export type JobState =
  | {status: 'idle'}
  | {status: 'running'; title: string; progress: number; step: string; canCancel: boolean}
  | {status: 'done'; result: ExportResult}
  | {status: 'failed'; message: string};

export interface Prefs {
  theme: 'system' | 'dark' | 'light';
  preset: string;
  lang: 'tr' | 'en';
  serverUrl: string;
  serverToken: string;
  wheelSide?: 'left' | 'right';
}

export const ENCODABLE_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];

export const ALL_TOOLS: Record<ToolId, ToolDef> = {
  CONVERT: {id: 'CONVERT', titleKey: 'ToolConvert', descKey: 'ToolConvertDesc'},
  COMPRESS: {id: 'COMPRESS', titleKey: 'ToolCompress', descKey: 'ToolCompressDesc'},
  METADATA: {id: 'METADATA', titleKey: 'ToolMetadata', descKey: 'ToolMetadataDesc'},
  EDIT: {id: 'EDIT', titleKey: 'ToolEdit', descKey: 'ToolEditDesc'},
  CROP: {id: 'CROP', titleKey: 'ToolCrop', descKey: 'ToolCropDesc'},
  FILTERS: {id: 'FILTERS', titleKey: 'ToolFilters', descKey: 'ToolFiltersDesc'},
  WATERMARK: {id: 'WATERMARK', titleKey: 'ToolWatermark', descKey: 'ToolWatermarkDesc'},
  FRAME: {id: 'FRAME', titleKey: 'ToolFrame', descKey: 'ToolFrameDesc'},
  COLLAGE: {id: 'COLLAGE', titleKey: 'ToolCollage', descKey: 'ToolCollageDesc'},
  PDF_CREATE: {id: 'PDF_CREATE', titleKey: 'ToolPdfCreate', descKey: 'ToolPdfCreateDesc'},
  PDF_MERGE: {id: 'PDF_MERGE', titleKey: 'ToolPdfMerge', descKey: 'ToolPdfMergeDesc'},
  PDF_SPLIT: {id: 'PDF_SPLIT', titleKey: 'ToolPdfSplit', descKey: 'ToolPdfSplitDesc'},
  PDF_ROTATE: {id: 'PDF_ROTATE', titleKey: 'ToolPdfRotate', descKey: 'ToolPdfRotateDesc'},
  PDF_OPTIMIZE: {id: 'PDF_OPTIMIZE', titleKey: 'ToolPdfOptimize', descKey: 'ToolPdfOptimizeDesc'},
  PDF_STAMP: {id: 'PDF_STAMP', titleKey: 'ToolPdfStamp', descKey: 'ToolPdfStampDesc'},
  PDF_TO_IMAGES: {id: 'PDF_TO_IMAGES', titleKey: 'ToolPdfToImages', descKey: 'ToolPdfToImagesDesc'},
  ZIP_CREATE: {id: 'ZIP_CREATE', titleKey: 'ToolZipCreate', descKey: 'ToolZipCreateDesc'},
  ZIP_EXTRACT: {id: 'ZIP_EXTRACT', titleKey: 'ToolZipExtract', descKey: 'ToolZipExtractDesc'},
};

export const SERVER_TOOLS: ServerToolDef[] = [
  {
    id: 'video_convert',
    titleTr: 'Video Dönüştür',
    titleEn: 'Convert Video',
    descTr: 'MP4, WEBM, MOV, GIF veya MP3 formatına çevir.',
    descEn: 'Convert video to MP4, WEBM, MOV, GIF, or MP3.',
    kinds: ['video'],
    formats: ['mp4', 'webm', 'mov', 'gif', 'mp3'],
    fields: ['format'],
  },
  {
    id: 'video_compress',
    titleTr: 'Video Sıkıştır',
    titleEn: 'Compress Video',
    descTr: 'Kalite ön ayarıyla video dosya boyutunu düşür.',
    descEn: 'Reduce video file size using FFmpeg quality presets.',
    kinds: ['video'],
    formats: ['mp4'],
    fields: ['quality'],
  },
  {
    id: 'video_mute',
    titleTr: 'Sesi Kaldır',
    titleEn: 'Remove Audio',
    descTr: 'Videodaki ses kanalını tamamen sil.',
    descEn: 'Strip the audio track from a video.',
    kinds: ['video'],
    formats: [],
    fields: [],
  },
  {
    id: 'video_trim',
    titleTr: 'Video Kırp (Süre)',
    titleEn: 'Trim Video',
    descTr: 'Başlangıç ve bitiş zamanıyla videoyu kes.',
    descEn: 'Cut a video clip by start and end timestamps.',
    kinds: ['video'],
    formats: [],
    fields: ['time'],
  },
  {
    id: 'video_crop',
    titleTr: 'Oranla Kırp',
    titleEn: 'Crop Aspect Ratio',
    descTr: '1:1, 16:9, 9:16 veya 4:5 kadrajına uyarla.',
    descEn: 'Reframe video to 1:1, 16:9, 9:16, or 4:5.',
    kinds: ['video'],
    formats: [],
    fields: ['aspect'],
  },
  {
    id: 'video_speed',
    titleTr: 'Video Hızı',
    titleEn: 'Video Speed',
    descTr: 'Videoyu 0.5× ile 2× arasında hızlandır veya yavaşlat.',
    descEn: 'Speed up or slow down playback between 0.5× and 2×.',
    kinds: ['video'],
    formats: [],
    fields: ['speed'],
  },
  {
    id: 'video_snapshots',
    titleTr: 'Kareleri Çıkar',
    titleEn: 'Extract Frames',
    descTr: 'Belirli saniye aralıklarıyla videodan JPG/PNG kare al.',
    descEn: 'Capture JPG or PNG frames from a video at fixed intervals.',
    kinds: ['video'],
    formats: ['jpg', 'png'],
    fields: ['interval', 'format'],
  },
  {
    id: 'video_split',
    titleTr: 'Videoyu İkiye Böl',
    titleEn: 'Split Video',
    descTr: 'Videoyu belirlediğin saniyeden veya ortadan iki parçaya ayır.',
    descEn: 'Split a video into two clips at a timestamp or midpoint.',
    kinds: ['video'],
    formats: [],
    fields: ['time'],
  },
  {
    id: 'video_join',
    titleTr: 'Videoları Birleştir',
    titleEn: 'Join Videos',
    descTr: 'Seçili videoları yukarıdaki sırayla tek MP4 dosyasında birleştir.',
    descEn: 'Concatenate selected videos in order into a single MP4.',
    kinds: ['video'],
    formats: [],
    fields: [],
    minFiles: 2,
  },
  {
    id: 'audio_convert',
    titleTr: 'Ses Dönüştür',
    titleEn: 'Convert Audio',
    descTr: 'MP3, M4A, WAV, FLAC, OGG veya OPUS formatına çevir.',
    descEn: 'Convert audio to MP3, M4A, WAV, FLAC, OGG, or OPUS.',
    kinds: ['audio', 'video'],
    formats: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus'],
    fields: ['format'],
  },
  {
    id: 'audio_normalize',
    titleTr: 'Ses Normalize Et',
    titleEn: 'Normalize Audio',
    descTr: 'Ses seviyesini dengeli yüksekliğe getir.',
    descEn: 'Balance loudness levels cleanly.',
    kinds: ['audio'],
    formats: [],
    fields: [],
  },
  {
    id: 'audio_trim',
    titleTr: 'Ses Kırp',
    titleEn: 'Trim Audio',
    descTr: 'Başlangıç ve bitiş süresine göre sesi kes.',
    descEn: 'Trim an audio track by timestamps.',
    kinds: ['audio'],
    formats: [],
    fields: ['time'],
  },
  {
    id: 'audio_channels',
    titleTr: 'Mono / Stereo',
    titleEn: 'Mono / Stereo',
    descTr: 'Ses kanallarını tek veya çift kanala dönüştür.',
    descEn: 'Switch audio between mono and stereo channels.',
    kinds: ['audio'],
    formats: [],
    fields: ['channels'],
  },
  {
    id: 'audio_to_video',
    titleTr: 'Sesten Video Oluştur',
    titleEn: 'Audio to Video',
    descTr: 'Ses dosyasını dalga görselli 1280×720 MP4 videoya dönüştür.',
    descEn: 'Render an audio track into a 1280×720 waveform MP4 video.',
    kinds: ['audio'],
    formats: [],
    fields: [],
  },
  {
    id: 'audio_bleep',
    titleTr: 'Aralığı Sessize Al (Bleep)',
    titleEn: 'Mute Time Range',
    descTr: 'Belirtilen başlangıç ve bitiş aralığındaki sesi sustur.',
    descEn: 'Silence audio within a specific start and end range.',
    kinds: ['audio'],
    formats: [],
    fields: ['time'],
  },
  {
    id: 'office_to_pdf',
    titleTr: 'Belge → PDF',
    titleEn: 'Document to PDF',
    descTr: 'DOCX, ODT, XLSX, PPTX, RTF ve TXT belgelerini cihazda PDF’ye çevir.',
    descEn: 'Convert DOCX, ODT, XLSX, PPTX, RTF, and TXT documents to PDF on-device.',
    kinds: ['document'],
    formats: [],
    fields: [],
  },
  {
    id: 'office_to_text',
    titleTr: 'Belge → Metin (TXT)',
    titleEn: 'Document to Text',
    descTr: 'DOCX, ODT, XLSX, PPTX ve HTML belgelerinden düz metin çıkar.',
    descEn: 'Extract plain text from DOCX, ODT, XLSX, PPTX, and HTML documents.',
    kinds: ['document'],
    formats: [],
    fields: [],
  },
  {
    id: 'pdf_to_docx',
    titleTr: 'PDF → Word (DOCX)',
    titleEn: 'PDF to Word (DOCX)',
    descTr: 'PDF belgesini cihaz içinde düzenlenebilir DOCX dosyasına çevir.',
    descEn: 'Convert a PDF document into an editable DOCX file on-device.',
    kinds: ['pdf'],
    formats: [],
    fields: [],
  },
];

export function detectFileKind(name: string, mime: string): FileKind {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const m = mime.toLowerCase();
  if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'svg', 'avif', 'heic'].includes(ext)) {
    return 'image';
  }
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m === 'application/zip' || m === 'application/x-zip-compressed' || ext === 'zip') return 'archive';
  if (m.startsWith('video/') || ['mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v'].includes(ext)) return 'video';
  if (m.startsWith('audio/') || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'opus', 'aiff'].includes(ext)) return 'audio';
  if (
    ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'md', 'csv', 'json', 'html', 'htm'].includes(ext)
  ) {
    return 'document';
  }
  return 'other';
}

export function buildPickedFile(file: File): PickedFile {
  const name = file.name || 'file';
  const dot = name.lastIndexOf('.');
  const baseName = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const mime = file.type || mimeFromExt(ext);
  const kind = detectFileKind(name, mime);
  const previewUrl = kind === 'image' ? URL.createObjectURL(file) : undefined;
  return {
    id: crypto.randomUUID(),
    file,
    name,
    baseName,
    ext,
    size: file.size,
    mime,
    kind,
    previewUrl,
  };
}

export function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'pdf':
      return 'application/pdf';
    case 'zip':
      return 'application/zip';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'wav':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    case 'ogg':
      return 'audio/ogg';
    case 'opus':
      return 'audio/opus';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

export function convertTargetsForSelection(files: PickedFile[]): string[] {
  if (files.length === 0) return [];
  const kinds = Array.from(new Set(files.map((f) => f.kind)));
  if (kinds.length !== 1) return [];
  if (kinds[0] === 'image') return ['jpg', 'png', 'webp', 'bmp', 'pdf'];
  if (kinds[0] === 'pdf') return ['jpg', 'png', 'webp', 'docx'];
  if (kinds[0] === 'video') return ['mp4', 'webm', 'mov', 'gif', 'mp3'];
  if (kinds[0] === 'audio') return ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus'];
  if (kinds[0] === 'document') return ['pdf', 'txt'];
  return [];
}

export function toolsForSelection(files: PickedFile[]): ToolDef[] {
  if (files.length === 0) return [];
  const kinds = Array.from(new Set(files.map((f) => f.kind)));
  const result: ToolId[] = [];

  if (kinds.length === 1) {
    const k = kinds[0];
    if (k === 'image') {
      result.push('CONVERT', 'COMPRESS', 'FILTERS', 'WATERMARK', 'METADATA');
      if (files.length === 1) {
        result.push('EDIT', 'CROP', 'FRAME');
      } else {
        result.push('COLLAGE');
      }
      result.push('PDF_CREATE');
    } else if (k === 'pdf') {
      if (files.length > 1) result.push('PDF_MERGE');
      if (files.length === 1) result.push('PDF_SPLIT', 'PDF_ROTATE', 'PDF_STAMP', 'PDF_OPTIMIZE', 'METADATA');
      result.push('PDF_TO_IMAGES');
    } else if (k === 'archive' && files.length === 1) {
      result.push('ZIP_EXTRACT');
    }
  }

  result.push('ZIP_CREATE');
  return result.map((id) => ALL_TOOLS[id]);
}

export function serverToolsForSelection(files: PickedFile[]): ServerToolDef[] {
  if (files.length === 0) return [];
  const kinds = new Set(files.map((f) => f.kind));
  return SERVER_TOOLS.filter(
    (tool) =>
      tool.kinds.some((k) => kinds.has(k)) && (!tool.minFiles || files.length >= tool.minFiles)
  );
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function formatDate(ms: number, lang: 'tr' | 'en'): string {
  return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

const WHEEL_TOOL_LABELS: Record<string, {tr: string; en: string}> = {
  CONVERT: {tr: 'Dönüştür', en: 'Convert'},
  COMPRESS: {tr: 'Sıkıştır', en: 'Compress'},
  METADATA: {tr: 'Meta Veri', en: 'Metadata'},
  EDIT: {tr: 'Düzenle', en: 'Edit'},
  CROP: {tr: 'Kırp', en: 'Crop'},
  FILTERS: {tr: 'Filtre', en: 'Filters'},
  WATERMARK: {tr: 'Filigran', en: 'Watermark'},
  FRAME: {tr: 'Çerçeve', en: 'Frame'},
  COLLAGE: {tr: 'Kolaj', en: 'Collage'},
  PDF_CREATE: {tr: 'PDF Yap', en: 'Make PDF'},
  PDF_MERGE: {tr: 'Birleştir', en: 'Merge'},
  PDF_SPLIT: {tr: 'PDF Böl', en: 'Split'},
  PDF_ROTATE: {tr: 'Döndür', en: 'Rotate'},
  PDF_OPTIMIZE: {tr: 'Optimize', en: 'Optimize'},
  PDF_STAMP: {tr: 'Damga', en: 'Stamp'},
  PDF_TO_IMAGES: {tr: 'Görsel Yap', en: 'To Images'},
  ZIP_CREATE: {tr: 'ZIP Yap', en: 'Make ZIP'},
  ZIP_EXTRACT: {tr: 'ZIP Aç', en: 'Extract'},
  video_convert: {tr: 'Dönüştür', en: 'Convert'},
  video_compress: {tr: 'Sıkıştır', en: 'Compress'},
  video_mute: {tr: 'Sessiz', en: 'Mute'},
  video_trim: {tr: 'Kırp', en: 'Trim'},
  video_crop: {tr: 'Kadraj', en: 'Aspect'},
  video_speed: {tr: 'Hız', en: 'Speed'},
  video_snapshots: {tr: 'Kare Al', en: 'Frames'},
  video_split: {tr: 'İkiye Böl', en: 'Split'},
  video_join: {tr: 'Birleştir', en: 'Join'},
  audio_convert: {tr: 'Dönüştür', en: 'Convert'},
  audio_normalize: {tr: 'Dengele', en: 'Normalize'},
  audio_trim: {tr: 'Kes', en: 'Trim'},
  audio_channels: {tr: 'Kanal', en: 'Channels'},
  audio_to_video: {tr: 'Video Yap', en: 'To Video'},
  audio_bleep: {tr: 'Sessiz Al', en: 'Bleep'},
  office_to_pdf: {tr: 'PDF Yap', en: 'To PDF'},
  office_to_text: {tr: 'Metin Al', en: 'To Text'},
  pdf_to_docx: {tr: 'Word Yap', en: 'To Word'},
};

export function shortWheelToolLabel(id: string, lang: 'tr' | 'en', fallback: string): string {
  return WHEEL_TOOL_LABELS[id]?.[lang] ?? fallback;
}
