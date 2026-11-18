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
  | 'SCAN_DOC'
  | 'SOCIAL_FIT'
  | 'REDACT'
  | 'IMAGE_GRID_SPLIT'
  | 'GIF_MAKE'
  | 'PASSPORT_GRID'
  | 'ICON_PACK'
  | 'PDF_CREATE'
  | 'PDF_MERGE'
  | 'PDF_SPLIT'
  | 'PDF_REMOVE_PAGES'
  | 'PDF_EXTRACT_PAGES'
  | 'PDF_ROTATE'
  | 'PDF_WATERMARK'
  | 'PDF_GRAYSCALE'
  | 'PDF_NUP'
  | 'PDF_OPTIMIZE'
  | 'PDF_STAMP'
  | 'PDF_TO_IMAGES'
  | 'ZIP_CREATE'
  | 'ZIP_EXTRACT'
  | 'BATCH_RENAME'
  | 'FILE_HASH_INFO';

export interface ToolDef {
  id: ToolId;
  titleKey: string;
  descKey: string;
}

export type ServerField =
  | 'format'
  | 'quality'
  | 'time'
  | 'speed'
  | 'channels'
  | 'aspect'
  | 'interval'
  | 'rotateMode'
  | 'loopCount'
  | 'fadeSec'
  | 'audioSpeedMode';

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
  nativeUri?: string;
  nativePath?: string;
  nativeDirectory?: string;
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

export type DownloadEngineId = 'builtin' | 'newpipe' | 'ytdlp_native' | 'cobalt';
export type VideoQualityPref = 'best' | '1080p' | '720p' | '480p' | '360p';

export type WheelDisplayMode = 'smart' | 'pinned' | 'all';

export interface WheelConfigPrefs {
  mode: WheelDisplayMode;
  pinnedConvert: string[];
  pinnedTools: string[];
  pinnedActions: string[];
}

export const DEFAULT_WHEEL_CONFIG: WheelConfigPrefs = {
  mode: 'smart',
  pinnedConvert: ['pdf', 'jpg', 'png', 'webp', 'mp3', 'mp4', 'docx', 'gif'],
  pinnedTools: [
    'local:COMPRESS',
    'local:SCAN_DOC',
    'local:CROP',
    'local:PDF_CREATE',
    'local:PDF_MERGE',
    'local:PDF_SPLIT',
    'local:PDF_REMOVE_PAGES',
    'server:video_compress',
    'server:video_extract_audio',
    'server:audio_trim',
    'server:office_to_pdf',
  ],
  pinnedActions: [
    'action:sheet',
    'action:open',
    'action:share',
    'local:BATCH_RENAME',
    'action:reverse',
    'local:ZIP_CREATE',
  ],
};

export interface Prefs {
  theme: 'system' | 'dark' | 'light';
  preset: string;
  lang: 'tr' | 'en';
  serverUrl: string;
  serverToken: string;
  wheelSide?: 'left' | 'right';
  lastEngineAction?: 'update' | 'manage';
  lastEngineSegment?: 'ffmpeg' | 'office' | 'link' | null;
  downloadEngine?: DownloadEngineId;
  downloadWifiOnly?: boolean;
  cellularLimitMb?: number;
  preferredVideoQuality?: VideoQualityPref;
  autoFallbackEngine?: boolean;
  concurrentFragments?: number;
  cobaltUrl?: string;
  cobaltApiKey?: string;
  wheelConfig?: WheelConfigPrefs;
}

export const ENCODABLE_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'ico', 'gif', 'svg'];

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
  SCAN_DOC: {id: 'SCAN_DOC', titleKey: 'ToolScanDoc', descKey: 'ToolScanDocDesc'},
  SOCIAL_FIT: {id: 'SOCIAL_FIT', titleKey: 'ToolSocialFit', descKey: 'ToolSocialFitDesc'},
  REDACT: {id: 'REDACT', titleKey: 'ToolRedact', descKey: 'ToolRedactDesc'},
  IMAGE_GRID_SPLIT: {id: 'IMAGE_GRID_SPLIT', titleKey: 'ToolGridSplit', descKey: 'ToolGridSplitDesc'},
  GIF_MAKE: {id: 'GIF_MAKE', titleKey: 'ToolGifMake', descKey: 'ToolGifMakeDesc'},
  PASSPORT_GRID: {id: 'PASSPORT_GRID', titleKey: 'ToolPassportGrid', descKey: 'ToolPassportGridDesc'},
  ICON_PACK: {id: 'ICON_PACK', titleKey: 'ToolIconPack', descKey: 'ToolIconPackDesc'},
  PDF_CREATE: {id: 'PDF_CREATE', titleKey: 'ToolPdfCreate', descKey: 'ToolPdfCreateDesc'},
  PDF_MERGE: {id: 'PDF_MERGE', titleKey: 'ToolPdfMerge', descKey: 'ToolPdfMergeDesc'},
  PDF_SPLIT: {id: 'PDF_SPLIT', titleKey: 'ToolPdfSplit', descKey: 'ToolPdfSplitDesc'},
  PDF_REMOVE_PAGES: {id: 'PDF_REMOVE_PAGES', titleKey: 'ToolPdfRemovePages', descKey: 'ToolPdfRemovePagesDesc'},
  PDF_EXTRACT_PAGES: {id: 'PDF_EXTRACT_PAGES', titleKey: 'ToolPdfExtractPages', descKey: 'ToolPdfExtractPagesDesc'},
  PDF_ROTATE: {id: 'PDF_ROTATE', titleKey: 'ToolPdfRotate', descKey: 'ToolPdfRotateDesc'},
  PDF_WATERMARK: {id: 'PDF_WATERMARK', titleKey: 'ToolPdfWatermark', descKey: 'ToolPdfWatermarkDesc'},
  PDF_GRAYSCALE: {id: 'PDF_GRAYSCALE', titleKey: 'ToolPdfGrayscale', descKey: 'ToolPdfGrayscaleDesc'},
  PDF_NUP: {id: 'PDF_NUP', titleKey: 'ToolPdfNup', descKey: 'ToolPdfNupDesc'},
  PDF_OPTIMIZE: {id: 'PDF_OPTIMIZE', titleKey: 'ToolPdfOptimize', descKey: 'ToolPdfOptimizeDesc'},
  PDF_STAMP: {id: 'PDF_STAMP', titleKey: 'ToolPdfStamp', descKey: 'ToolPdfStampDesc'},
  PDF_TO_IMAGES: {id: 'PDF_TO_IMAGES', titleKey: 'ToolPdfToImages', descKey: 'ToolPdfToImagesDesc'},
  ZIP_CREATE: {id: 'ZIP_CREATE', titleKey: 'ToolZipCreate', descKey: 'ToolZipCreateDesc'},
  ZIP_EXTRACT: {id: 'ZIP_EXTRACT', titleKey: 'ToolZipExtract', descKey: 'ToolZipExtractDesc'},
  BATCH_RENAME: {id: 'BATCH_RENAME', titleKey: 'ToolBatchRename', descKey: 'ToolBatchRenameDesc'},
  FILE_HASH_INFO: {id: 'FILE_HASH_INFO', titleKey: 'ToolFileHashInfo', descKey: 'ToolFileHashInfoDesc'},
};

export const SERVER_TOOLS: ServerToolDef[] = [
  {
    id: 'video_convert',
    titleTr: 'Video Dönüştür',
    titleEn: 'Convert Video',
    descTr: 'MP4, WEBM, MOV, MKV, AVI, GIF veya ses formatına çevir.',
    descEn: 'Convert video to MP4, WEBM, MOV, MKV, AVI, GIF, or audio.',
    kinds: ['video'],
    formats: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'gif', 'mp3', 'm4a', 'wav'],
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
    id: 'video_extract_audio',
    titleTr: 'Videodan Ses Ayıkla',
    titleEn: 'Extract Audio',
    descTr: 'Videonun ses kanalını MP3, M4A, WAV, FLAC veya OPUS olarak çıkar.',
    descEn: 'Extract the audio track from a video as MP3, M4A, WAV, FLAC, or OPUS.',
    kinds: ['video'],
    formats: ['mp3', 'm4a', 'wav', 'flac', 'opus'],
    fields: ['format'],
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
    id: 'video_rotate',
    titleTr: 'Video Döndür & Aynala',
    titleEn: 'Rotate & Flip Video',
    descTr: 'Videoyu 90°, 180°, 270° döndür veya yatay/dikey aynala.',
    descEn: 'Rotate video by 90°, 180°, 270° or mirror horizontally/vertically.',
    kinds: ['video'],
    formats: [],
    fields: ['rotateMode'],
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
    id: 'video_reverse',
    titleTr: 'Videoyu Ters Çevir',
    titleEn: 'Reverse Video',
    descTr: 'Kısa klipleri sondan başa doğru geriye sararak oynat.',
    descEn: 'Play video clips backward from end to start.',
    kinds: ['video'],
    formats: [],
    fields: [],
  },
  {
    id: 'video_boomerang',
    titleTr: 'Bumerang Efekti',
    titleEn: 'Boomerang Clip',
    descTr: 'Videoyu ileri ve geri akıcı şekilde birleştirerek döngü oluştur.',
    descEn: 'Create a forward-and-backward seamless boomerang clip.',
    kinds: ['video'],
    formats: [],
    fields: [],
  },
  {
    id: 'video_loop',
    titleTr: 'Videoyu Döngüye Al (Loop)',
    titleEn: 'Loop Video',
    descTr: 'Kısa bir videoyu peş peşe 2, 3 veya 4 kez tekrarlat.',
    descEn: 'Repeat a short video clip 2×, 3×, or 4× in one MP4.',
    kinds: ['video'],
    formats: [],
    fields: ['loopCount'],
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
    descTr: 'MP3, M4A, WAV, FLAC, OGG, OPUS veya dalga videolu MP4 üret.',
    descEn: 'Convert audio to MP3, M4A, WAV, FLAC, OGG, OPUS, or waveform MP4.',
    kinds: ['audio', 'video'],
    formats: ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'mp4'],
    fields: ['format'],
  },
  {
    id: 'audio_join',
    titleTr: 'Sesleri Birleştir',
    titleEn: 'Merge Audio',
    descTr: 'Seçili ses dosyalarını sırayla tek ses dosyasında birleştir.',
    descEn: 'Concatenate multiple audio tracks into one seamless file.',
    kinds: ['audio'],
    formats: ['mp3', 'm4a', 'wav'],
    fields: ['format'],
    minFiles: 2,
  },
  {
    id: 'audio_trim',
    titleTr: 'Ses Kırp (Zil Sesi / Kesit)',
    titleEn: 'Trim Audio',
    descTr: 'Başlangıç ve bitiş süresine göre sesi kes.',
    descEn: 'Trim an audio track by timestamps.',
    kinds: ['audio'],
    formats: [],
    fields: ['time'],
  },
  {
    id: 'audio_speed',
    titleTr: 'Ses Hızı & Ton (Slowed / Hızlı)',
    titleEn: 'Audio Speed & Pitch',
    descTr: 'Sesi hızlandır, yavaşlat veya Slowed / Nightcore tonuna çevir.',
    descEn: 'Adjust audio tempo or apply Slowed / Nightcore pitch presets.',
    kinds: ['audio'],
    formats: [],
    fields: ['audioSpeedMode'],
  },
  {
    id: 'audio_fade',
    titleTr: 'Giriş & Çıkış Yumuşat (Fade)',
    titleEn: 'Fade In & Out',
    descTr: 'Zil sesi ve podcastler için yumuşak ses giriş ve çıkışı ekle.',
    descEn: 'Add smooth fade-in and fade-out transitions to audio.',
    kinds: ['audio'],
    formats: [],
    fields: ['fadeSec'],
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
    id: 'audio_reverse',
    titleTr: 'Sesi Ters Çevir',
    titleEn: 'Reverse Audio',
    descTr: 'Ses kaydını sondan başa doğru tersine çevir.',
    descEn: 'Play an audio recording in reverse.',
    kinds: ['audio'],
    formats: [],
    fields: [],
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
    descTr: 'DOCX, ODT, XLSX, PPTX, MD, CSV, RTF ve TXT belgelerini PDF’ye çevir.',
    descEn: 'Convert DOCX, ODT, XLSX, PPTX, MD, CSV, RTF, and TXT documents to PDF.',
    kinds: ['document'],
    formats: [],
    fields: [],
  },
  {
    id: 'doc_to_docx',
    titleTr: 'Belge → Word (DOCX)',
    titleEn: 'Document to Word (DOCX)',
    descTr: 'TXT, Markdown, HTML, CSV, ODT veya RTF metinlerini DOCX’e çevir.',
    descEn: 'Convert TXT, Markdown, HTML, CSV, ODT, or RTF files into Word DOCX.',
    kinds: ['document'],
    formats: [],
    fields: [],
  },
  {
    id: 'doc_to_html',
    titleTr: 'Belge → Web Sayfası (HTML)',
    titleEn: 'Document to Web HTML',
    descTr: 'Markdown, DOCX, XLSX, CSV veya TXT dosyasını şık tek parça HTML yap.',
    descEn: 'Export Markdown, DOCX, XLSX, CSV, or TXT into a standalone HTML page.',
    kinds: ['document'],
    formats: [],
    fields: [],
  },
  {
    id: 'table_convert',
    titleTr: 'Tablo & Veri Dönüştür (CSV ↔ JSON)',
    titleEn: 'Spreadsheet & Data Convert',
    descTr: 'XLSX, CSV ve JSON tablolarını birbirine veya HTML tabloya dönüştür.',
    descEn: 'Convert XLSX, CSV, and JSON datasets to CSV, JSON, or HTML tables.',
    kinds: ['document'],
    formats: ['csv', 'json', 'html'],
    fields: ['format'],
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
  {
    id: 'pdf_to_txt',
    titleTr: 'PDF → Düz Metin (TXT)',
    titleEn: 'PDF to Plain Text (TXT)',
    descTr: 'PDF içindeki tüm metin katmanını sayfa sırasıyla TXT olarak çıkar.',
    descEn: 'Extract all selectable text from PDF pages into a UTF-8 TXT file.',
    kinds: ['pdf'],
    formats: [],
    fields: [],
  },
  {
    id: 'pdf_to_html',
    titleTr: 'PDF → Web Sayfası (HTML)',
    titleEn: 'PDF to HTML',
    descTr: 'PDF metnini okunabilir ve aranabilir bağımsız HTML belgesine çevir.',
    descEn: 'Convert PDF text content into a clean standalone HTML page.',
    kinds: ['pdf'],
    formats: [],
    fields: [],
  },
];

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback below
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function extFromMime(mime: string): string {
  const m = mime.split(';')[0].trim().toLowerCase();
  switch (m) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/bmp':
      return 'bmp';
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon':
      return 'ico';
    case 'image/svg+xml':
      return 'svg';
    case 'image/avif':
      return 'avif';
    case 'image/heic':
    case 'image/heif':
      return 'heic';
    case 'application/pdf':
      return 'pdf';
    case 'application/zip':
    case 'application/x-zip-compressed':
      return 'zip';
    case 'video/mp4':
      return 'mp4';
    case 'video/webm':
      return 'webm';
    case 'video/quicktime':
      return 'mov';
    case 'video/x-matroska':
      return 'mkv';
    case 'video/x-msvideo':
      return 'avi';
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3';
    case 'audio/mp4':
    case 'audio/x-m4a':
    case 'audio/aac':
      return 'm4a';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/flac':
      return 'flac';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/opus':
      return 'opus';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    case 'application/msword':
      return 'doc';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx';
    case 'application/vnd.ms-excel':
      return 'xls';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'pptx';
    case 'application/vnd.ms-powerpoint':
      return 'ppt';
    case 'application/vnd.oasis.opendocument.text':
      return 'odt';
    case 'application/rtf':
    case 'text/rtf':
      return 'rtf';
    case 'text/html':
      return 'html';
    case 'text/csv':
      return 'csv';
    case 'application/json':
      return 'json';
    case 'text/markdown':
      return 'md';
    case 'text/plain':
      return 'txt';
    case 'application/vnd.android.package-archive':
      return 'apk';
    default:
      return '';
  }
}

export function detectFileKind(name: string, mime: string): FileKind {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const m = mime.split(';')[0].trim().toLowerCase();
  if (
    m.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'svg', 'ico', 'avif', 'heic', 'heif'].includes(ext)
  ) {
    return 'image';
  }
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m === 'application/zip' || m === 'application/x-zip-compressed' || ext === 'zip') return 'archive';
  if (m.startsWith('video/') || ['mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v', '3gp'].includes(ext)) return 'video';
  if (m.startsWith('audio/') || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'opus', 'aiff'].includes(ext)) return 'audio';
  if (
    [
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'odt',
      'ods',
      'odp',
      'rtf',
      'txt',
      'md',
      'csv',
      'tsv',
      'json',
      'xml',
      'html',
      'htm',
    ].includes(ext) ||
    m.includes('wordprocessingml') ||
    m.includes('spreadsheetml') ||
    m.includes('presentationml') ||
    m.includes('opendocument') ||
    m === 'application/msword' ||
    m === 'application/vnd.ms-excel' ||
    m === 'application/vnd.ms-powerpoint' ||
    m === 'application/rtf' ||
    m === 'application/json' ||
    m === 'application/xml' ||
    m.startsWith('text/')
  ) {
    return 'document';
  }
  return 'other';
}

export function buildPickedFile(file: File): PickedFile {
  const rawName = (file.name || 'file').trim();
  const dot = rawName.lastIndexOf('.');
  const baseName = dot > 0 ? rawName.slice(0, dot) : rawName;
  let ext = dot > 0 ? rawName.slice(dot + 1).toLowerCase() : '';
  if (!ext && file.type) {
    ext = extFromMime(file.type);
  }
  const name = dot > 0 || !ext ? rawName : `${baseName}.${ext}`;
  const mime = file.type || mimeFromExt(ext);
  const kind = detectFileKind(name, mime);
  const previewUrl = kind === 'image' ? URL.createObjectURL(file) : undefined;
  return {
    id: createId(),
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
    case 'ico':
      return 'image/x-icon';
    case 'svg':
      return 'image/svg+xml';
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
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
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
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'html':
    case 'htm':
      return 'text/html;charset=utf-8';
    case 'csv':
      return 'text/csv;charset=utf-8';
    case 'json':
      return 'application/json;charset=utf-8';
    case 'md':
      return 'text/markdown;charset=utf-8';
    case 'txt':
      return 'text/plain;charset=utf-8';
    case 'apk':
      return 'application/vnd.android.package-archive';
    default:
      return 'application/octet-stream';
  }
}

export function convertTargetsForSelection(files: PickedFile[]): string[] {
  if (files.length === 0) return [];
  const kinds = Array.from(new Set(files.map((f) => f.kind)));
  if (kinds.length !== 1) return [];
  if (kinds[0] === 'image') return ['jpg', 'png', 'webp', 'gif', 'ico', 'bmp', 'svg', 'pdf'];
  if (kinds[0] === 'pdf') return ['jpg', 'png', 'webp', 'docx', 'txt', 'html'];
  if (kinds[0] === 'video') return ['mp4', 'webm', 'mov', 'mkv', 'avi', 'gif', 'mp3', 'm4a', 'wav'];
  if (kinds[0] === 'audio') return ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'mp4'];
  if (kinds[0] === 'document') {
    const exts = new Set(files.map((f) => f.ext.toLowerCase()));
    const hasTable = exts.has('csv') || exts.has('tsv') || exts.has('xlsx') || exts.has('xls') || exts.has('json');
    if (hasTable) {
      return ['pdf', 'docx', 'html', 'csv', 'json', 'txt'];
    }
    return ['pdf', 'docx', 'html', 'txt'];
  }
  return [];
}

export function toolsForSelection(files: PickedFile[]): ToolDef[] {
  if (files.length === 0) return [];
  const kinds = Array.from(new Set(files.map((f) => f.kind)));
  const result: ToolId[] = [];

  if (kinds.length === 1) {
    const k = kinds[0];
    if (k === 'image') {
      result.push('CONVERT', 'COMPRESS', 'SCAN_DOC', 'SOCIAL_FIT', 'FILTERS', 'WATERMARK', 'METADATA');
      if (files.length === 1) {
        result.push('EDIT', 'CROP', 'REDACT', 'FRAME', 'IMAGE_GRID_SPLIT', 'PASSPORT_GRID', 'ICON_PACK');
      } else {
        result.push('COLLAGE', 'GIF_MAKE');
      }
      result.push('PDF_CREATE');
    } else if (k === 'pdf') {
      if (files.length > 1) result.push('PDF_MERGE');
      if (files.length === 1) {
        result.push(
          'PDF_SPLIT',
          'PDF_REMOVE_PAGES',
          'PDF_EXTRACT_PAGES',
          'PDF_ROTATE',
          'PDF_WATERMARK',
          'PDF_STAMP',
          'PDF_GRAYSCALE',
          'PDF_NUP',
          'PDF_OPTIMIZE',
          'METADATA'
        );
      }
      result.push('PDF_TO_IMAGES');
    } else if (k === 'archive' && files.length === 1) {
      result.push('ZIP_EXTRACT');
    }
  }

  result.push('BATCH_RENAME', 'FILE_HASH_INFO', 'ZIP_CREATE');
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
  SCAN_DOC: {tr: 'Belge Tara', en: 'Scan Doc'},
  SOCIAL_FIT: {tr: 'Sığdır', en: 'Social Fit'},
  REDACT: {tr: 'Sansürle', en: 'Redact'},
  IMAGE_GRID_SPLIT: {tr: 'Izgara', en: 'Grid'},
  GIF_MAKE: {tr: 'GIF Yap', en: 'Make GIF'},
  PASSPORT_GRID: {tr: 'Vesikalık', en: 'ID Print'},
  ICON_PACK: {tr: 'İkon Yap', en: 'Icons'},
  PDF_CREATE: {tr: 'PDF Yap', en: 'Make PDF'},
  PDF_MERGE: {tr: 'Birleştir', en: 'Merge'},
  PDF_SPLIT: {tr: 'PDF Böl', en: 'Split'},
  PDF_REMOVE_PAGES: {tr: 'Sayfa Sil', en: 'Del Pages'},
  PDF_EXTRACT_PAGES: {tr: 'Ayıkla', en: 'Extract'},
  PDF_ROTATE: {tr: 'Döndür', en: 'Rotate'},
  PDF_WATERMARK: {tr: 'Filigran', en: 'Watermark'},
  PDF_GRAYSCALE: {tr: 'Gri Ton', en: 'Grayscale'},
  PDF_NUP: {tr: 'Çoklu A4', en: 'N-Up'},
  PDF_OPTIMIZE: {tr: 'Optimize', en: 'Optimize'},
  PDF_STAMP: {tr: 'Damga', en: 'Stamp'},
  PDF_TO_IMAGES: {tr: 'Görsel Al', en: 'To Images'},
  ZIP_CREATE: {tr: 'ZIP Yap', en: 'Make ZIP'},
  ZIP_EXTRACT: {tr: 'ZIP Aç', en: 'Extract'},
  BATCH_RENAME: {tr: 'Adlandır', en: 'Rename'},
  FILE_HASH_INFO: {tr: 'SHA-256', en: 'Checksum'},
  video_convert: {tr: 'Video Çevir', en: 'Convert'},
  video_compress: {tr: 'V. Sıkıştır', en: 'Compress'},
  video_extract_audio: {tr: 'Ses Al', en: 'To Audio'},
  video_mute: {tr: 'Sessiz', en: 'Mute'},
  video_trim: {tr: 'Video Kes', en: 'Trim'},
  video_crop: {tr: 'Kadraj', en: 'Aspect'},
  video_rotate: {tr: 'Döndür', en: 'Rotate'},
  video_speed: {tr: 'Hız', en: 'Speed'},
  video_reverse: {tr: 'Geri Sar', en: 'Reverse'},
  video_boomerang: {tr: 'Bumerang', en: 'Boomerang'},
  video_loop: {tr: 'Döngü', en: 'Loop'},
  video_snapshots: {tr: 'Kare Al', en: 'Frames'},
  video_split: {tr: 'İkiye Böl', en: 'Split'},
  video_join: {tr: 'Birleştir', en: 'Join'},
  audio_convert: {tr: 'Ses Çevir', en: 'Convert'},
  audio_join: {tr: 'Ses Ekle', en: 'Merge'},
  audio_normalize: {tr: 'Dengele', en: 'Normalize'},
  audio_trim: {tr: 'Ses Kes', en: 'Trim'},
  audio_speed: {tr: 'Hız / Ton', en: 'Speed'},
  audio_fade: {tr: 'Fade', en: 'Fade'},
  audio_reverse: {tr: 'Ters Ses', en: 'Reverse'},
  audio_channels: {tr: 'Kanal', en: 'Channels'},
  audio_to_video: {tr: 'Video Yap', en: 'To Video'},
  audio_bleep: {tr: 'Sustur', en: 'Bleep'},
  office_to_pdf: {tr: 'Belge→PDF', en: 'Doc→PDF'},
  doc_to_docx: {tr: 'Word Yap', en: 'To DOCX'},
  doc_to_html: {tr: 'HTML Yap', en: 'To HTML'},
  table_convert: {tr: 'Tablo', en: 'Table'},
  office_to_text: {tr: 'Metin Al', en: 'To Text'},
  pdf_to_docx: {tr: 'PDF→Word', en: 'To Word'},
  pdf_to_txt: {tr: 'PDF→TXT', en: 'To TXT'},
  pdf_to_html: {tr: 'PDF→HTML', en: 'To HTML'},
};

export function shortWheelToolLabel(id: string, lang: 'tr' | 'en', fallback: string): string {
  return WHEEL_TOOL_LABELS[id]?.[lang] ?? fallback;
}

export type WheelToolCategory = 'all' | 'edit' | 'pdf_doc' | 'media' | 'batch';

export function getWheelToolCategory(prefixedId: string): Exclude<WheelToolCategory, 'all'> {
  if (prefixedId.startsWith('server:')) {
    const sid = prefixedId.slice(7);
    if (sid.startsWith('video_') || sid.startsWith('audio_')) return 'media';
    return 'pdf_doc';
  }
  const lid = prefixedId.startsWith('local:') ? prefixedId.slice(6) : prefixedId;
  if (lid.startsWith('PDF_')) return 'pdf_doc';
  if (lid === 'ZIP_CREATE' || lid === 'ZIP_EXTRACT' || lid === 'BATCH_RENAME' || lid === 'FILE_HASH_INFO') {
    return 'batch';
  }
  return 'edit';
}

export const ALL_CONVERT_FORMATS_CATALOG = [
  'pdf',
  'jpg',
  'png',
  'webp',
  'gif',
  'ico',
  'svg',
  'bmp',
  'docx',
  'txt',
  'html',
  'csv',
  'json',
  'mp4',
  'webm',
  'mov',
  'mkv',
  'avi',
  'mp3',
  'm4a',
  'wav',
  'flac',
  'ogg',
  'opus',
];

export interface WheelFileActionDef {
  id: string;
  labelKey: string;
  multiOnly?: boolean;
}

export const ALL_WHEEL_ACTIONS_CATALOG: WheelFileActionDef[] = [
  {id: 'action:sheet', labelKey: 'AllActionsShort'},
  {id: 'action:open', labelKey: 'WheelOpen'},
  {id: 'action:share', labelKey: 'Share'},
  {id: 'action:save', labelKey: 'WheelSaveSource'},
  {id: 'local:BATCH_RENAME', labelKey: 'WheelRename'},
  {id: 'action:reverse', labelKey: 'WheelReverse', multiOnly: true},
  {id: 'action:sortAz', labelKey: 'WheelSortAz', multiOnly: true},
  {id: 'action:autoNum', labelKey: 'WheelAutoNum'},
  {id: 'local:FILE_HASH_INFO', labelKey: 'ToolFileHashInfo'},
  {id: 'local:ZIP_CREATE', labelKey: 'WheelZip'},
  {id: 'action:clear', labelKey: 'Clear'},
];

/**
 * Ranks compatible conversion formats based on exact source file extensions, MIME types, and count.
 */
export function smartConvertTargetsForSelection(files: PickedFile[]): string[] {
  const compatible = convertTargetsForSelection(files);
  if (compatible.length <= 1) return compatible;

  const exts = new Set(files.map((f) => f.ext.toLowerCase()));
  const onlyExt = exts.size === 1 ? Array.from(exts)[0] : '';
  const kind = files[0].kind;
  let preferred: string[] = [];

  if (kind === 'image') {
    if (files.length > 1) {
      preferred = ['pdf', 'gif', 'webp', 'jpg', 'png', 'ico', 'svg', 'bmp'];
    } else if (onlyExt === 'png' || onlyExt === 'svg') {
      preferred = ['webp', 'jpg', 'pdf', 'ico', 'gif', 'svg', 'png', 'bmp'];
    } else if (onlyExt === 'jpg' || onlyExt === 'jpeg') {
      preferred = ['webp', 'png', 'pdf', 'ico', 'gif', 'svg', 'jpg', 'bmp'];
    } else if (onlyExt === 'webp') {
      preferred = ['png', 'jpg', 'pdf', 'gif', 'ico', 'svg', 'webp', 'bmp'];
    } else {
      preferred = ['jpg', 'png', 'webp', 'pdf', 'gif', 'ico', 'svg', 'bmp'];
    }
  } else if (kind === 'pdf') {
    preferred = ['docx', 'jpg', 'png', 'txt', 'html', 'webp'];
  } else if (kind === 'video') {
    preferred = [
      'mp3',
      'gif',
      onlyExt === 'mp4' ? 'webm' : 'mp4',
      'm4a',
      'mov',
      'wav',
      'mp4',
      'webm',
      'mkv',
      'avi',
    ];
  } else if (kind === 'audio') {
    preferred = [
      onlyExt === 'mp3' ? 'm4a' : 'mp3',
      onlyExt === 'wav' ? 'mp3' : 'wav',
      'mp4',
      'flac',
      'opus',
      'ogg',
      'm4a',
    ];
  } else if (kind === 'document') {
    if (exts.has('csv') || exts.has('tsv') || exts.has('xlsx') || exts.has('xls')) {
      preferred = ['json', 'pdf', 'html', 'csv', 'docx', 'txt'];
    } else if (exts.has('json')) {
      preferred = ['csv', 'html', 'pdf', 'docx', 'txt', 'json'];
    } else if (exts.has('md') || exts.has('txt')) {
      preferred = ['pdf', 'docx', 'html', 'txt'];
    } else {
      preferred = ['pdf', 'txt', 'html', 'docx'];
    }
  }

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const fmt of [...preferred, ...compatible]) {
    if (compatible.includes(fmt) && !seen.has(fmt)) {
      seen.add(fmt);
      ordered.push(fmt);
    }
  }
  return ordered;
}

/**
 * Ranks compatible tool IDs (`local:TOOL` and `server:tool`) smartly based on file kind, count, size, and name hints.
 */
export function smartToolIdsForSelection(files: PickedFile[]): string[] {
  if (files.length === 0) return [];
  const locals = toolsForSelection(files).map((d) => `local:${d.id}`);
  const servers = serverToolsForSelection(files).map((d) => `server:${d.id}`);
  const available = [...locals, ...servers];
  const availSet = new Set(available);

  const kinds = Array.from(new Set(files.map((f) => f.kind)));
  const namesJoined = files.map((f) => f.name.toLowerCase()).join(' ');
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  let priority: string[] = [];

  if (kinds.length > 1) {
    priority = ['local:ZIP_CREATE', 'local:BATCH_RENAME', 'local:FILE_HASH_INFO'];
  } else {
    const k = kinds[0];
    if (k === 'image') {
      const looksLikeDoc = /(belge|scan|tara|fis|fiş|fatura|not|kimlik|evrak|makbuz|receipt|doc)/i.test(
        namesJoined
      );
      const looksLikeAvatar = /(icon|logo|favicon|avatar)/i.test(namesJoined);
      if (files.length > 1) {
        priority = [
          looksLikeDoc ? 'local:SCAN_DOC' : 'local:PDF_CREATE',
          'local:PDF_CREATE',
          'local:COLLAGE',
          'local:GIF_MAKE',
          'local:COMPRESS',
          'local:SCAN_DOC',
          'local:BATCH_RENAME',
        ];
      } else {
        priority = [
          looksLikeDoc
            ? 'local:SCAN_DOC'
            : looksLikeAvatar
              ? 'local:ICON_PACK'
              : totalBytes > 1_200_000
                ? 'local:COMPRESS'
                : 'local:CROP',
          'local:COMPRESS',
          'local:CROP',
          'local:SCAN_DOC',
          'local:SOCIAL_FIT',
          'local:REDACT',
          'local:EDIT',
          'local:FILTERS',
        ];
      }
    } else if (k === 'pdf') {
      if (files.length > 1) {
        priority = [
          'local:PDF_MERGE',
          'local:PDF_TO_IMAGES',
          'server:pdf_to_docx',
          'local:BATCH_RENAME',
          'local:ZIP_CREATE',
        ];
      } else {
        priority = [
          'local:PDF_SPLIT',
          'local:PDF_REMOVE_PAGES',
          'server:pdf_to_docx',
          'local:PDF_WATERMARK',
          'local:PDF_EXTRACT_PAGES',
          'local:PDF_OPTIMIZE',
          'local:PDF_TO_IMAGES',
        ];
      }
    } else if (k === 'video') {
      if (files.length > 1) {
        priority = [
          'server:video_join',
          'server:video_compress',
          'server:video_extract_audio',
          'local:BATCH_RENAME',
          'local:ZIP_CREATE',
        ];
      } else {
        priority = [
          'server:video_compress',
          'server:video_extract_audio',
          'server:video_trim',
          'server:video_rotate',
          'server:video_boomerang',
          'server:video_speed',
        ];
      }
    } else if (k === 'audio') {
      if (files.length > 1) {
        priority = [
          'server:audio_join',
          'server:audio_convert',
          'server:audio_normalize',
          'server:audio_speed',
          'local:ZIP_CREATE',
        ];
      } else {
        priority = [
          'server:audio_trim',
          'server:audio_speed',
          'server:audio_fade',
          'server:audio_normalize',
          'server:audio_to_video',
        ];
      }
    } else if (k === 'document') {
      const exts = new Set(files.map((f) => f.ext.toLowerCase()));
      const isTable =
        exts.has('csv') || exts.has('tsv') || exts.has('xlsx') || exts.has('xls') || exts.has('json');
      priority = isTable
        ? [
            'server:table_convert',
            'server:office_to_pdf',
            'server:doc_to_html',
            'server:office_to_text',
            'local:FILE_HASH_INFO',
          ]
        : [
            'server:office_to_pdf',
            'server:doc_to_docx',
            'server:doc_to_html',
            'server:office_to_text',
            'local:ZIP_CREATE',
          ];
    } else if (k === 'archive') {
      priority = ['local:ZIP_EXTRACT', 'local:FILE_HASH_INFO', 'local:BATCH_RENAME'];
    }
  }

  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of [...priority, ...available]) {
    if (availSet.has(id) && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}
