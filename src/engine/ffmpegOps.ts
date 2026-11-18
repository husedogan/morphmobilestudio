import {FFmpeg} from '@ffmpeg/ffmpeg';
import {fetchFile, toBlobURL} from '@ffmpeg/util';
import {PickedFile, mimeFromExt} from '../data/models';

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

function terminateFFmpegInstance(): void {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // Ignore termination errors
    }
    ffmpegInstance = null;
  }
  ffmpegLoading = null;
}

async function fetchLocalAssetAsBlobUrl(url: string, mime: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Asset HTTP ${res.status}`);
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html')) {
    throw new Error('Fallback HTML returned instead of asset');
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 1024) {
    throw new Error('Asset payload too small');
  }
  return URL.createObjectURL(new Blob([buf], {type: mime}));
}

async function getFFmpeg(onStatus?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    const ffmpeg = new FFmpeg();
    onStatus?.('FFmpeg motoru yükleniyor…');

    const localBase = `${window.location.origin}/ffmpeg`;
    const cdnBase = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';

    let coreURL = '';
    let wasmURL = '';
    try {
      [coreURL, wasmURL] = await Promise.all([
        fetchLocalAssetAsBlobUrl(`${localBase}/ffmpeg-core.js`, 'text/javascript'),
        fetchLocalAssetAsBlobUrl(`${localBase}/ffmpeg-core.wasm`, 'application/wasm'),
      ]);
    } catch {
      if (coreURL) URL.revokeObjectURL(coreURL);
      if (wasmURL) URL.revokeObjectURL(wasmURL);
      coreURL = await toBlobURL(`${cdnBase}/ffmpeg-core.js`, 'text/javascript');
      wasmURL = await toBlobURL(`${cdnBase}/ffmpeg-core.wasm`, 'application/wasm');
    }

    await ffmpeg.load({coreURL, wasmURL});
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoading;
  } catch (err) {
    ffmpegLoading = null;
    throw err;
  }
}

function parseTimestampToSeconds(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(':').map((p) => Number(p.trim()));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function safeExt(file: PickedFile, fallback: string): string {
  const clean = (file.ext || fallback).replace(/[^a-z0-9]/gi, '').toLowerCase();
  return clean || fallback;
}

async function execSingle(
  ffmpeg: FFmpeg,
  args: string[],
  inputFiles: Array<{name: string; blob: Blob}>,
  outputNames: string[],
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal
): Promise<Array<{name: string; blob: Blob}>> {
  if (signal?.aborted) throw new Error('Cancelled');

  const progressHandler = ({progress}: {progress: number}) => {
    if (Number.isFinite(progress)) {
      onProgress?.(Math.min(0.98, Math.max(0.05, progress)));
    }
  };
  const onAbort = () => {
    terminateFFmpegInstance();
  };

  ffmpeg.on('progress', progressHandler);
  signal?.addEventListener('abort', onAbort, {once: true});

  try {
    for (const f of inputFiles) {
      if (signal?.aborted) throw new Error('Cancelled');
      await ffmpeg.writeFile(f.name, await fetchFile(f.blob));
    }
    if (signal?.aborted) throw new Error('Cancelled');

    const exitCode = await ffmpeg.exec(args);
    if (signal?.aborted) throw new Error('Cancelled');
    if (exitCode !== 0) {
      throw new Error('FFmpeg işlemi tamamlanamadı.');
    }

    const outputs: Array<{name: string; blob: Blob}> = [];
    for (const outName of outputNames) {
      const data = await ffmpeg.readFile(outName);
      const uint8 =
        data instanceof Uint8Array ? new Uint8Array(data) : new TextEncoder().encode(String(data));
      const ext = outName.includes('.') ? outName.split('.').pop()! : '';
      outputs.push({
        name: outName,
        blob: new Blob([uint8], {type: mimeFromExt(ext)}),
      });
    }
    return outputs;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (ffmpegInstance === ffmpeg && ffmpeg.loaded) {
      ffmpeg.off('progress', progressHandler);
      for (const f of inputFiles) {
        await ffmpeg.deleteFile(f.name).catch(() => {});
      }
      for (const outName of outputNames) {
        await ffmpeg.deleteFile(outName).catch(() => {});
      }
    }
  }
}

async function probeStreamInfo(
  ffmpeg: FFmpeg,
  inputName: string
): Promise<{durationSec: number; hasAudio: boolean}> {
  let durationSec = 0;
  let hasAudio = false;
  const logHandler = ({message}: {message: string}) => {
    const m = message.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (m) {
      durationSec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
    if (/Stream\s+#\d+:\d+.*Audio:/i.test(message)) {
      hasAudio = true;
    }
  };
  ffmpeg.on('log', logHandler);
  try {
    await ffmpeg.exec(['-i', inputName]).catch(() => {});
  } finally {
    ffmpeg.off('log', logHandler);
  }
  return {durationSec, hasAudio};
}

function buildAudioEncodeArgs(inName: string, targetFmt: string, outName: string): string[] {
  if (targetFmt === 'mp3') {
    return ['-i', inName, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', '-y', outName];
  }
  if (targetFmt === 'm4a') {
    return ['-i', inName, '-vn', '-c:a', 'aac', '-b:a', '192k', '-y', outName];
  }
  if (targetFmt === 'wav') {
    return ['-i', inName, '-vn', '-c:a', 'pcm_s16le', '-y', outName];
  }
  if (targetFmt === 'flac') {
    return ['-i', inName, '-vn', '-c:a', 'flac', '-y', outName];
  }
  if (targetFmt === 'ogg') {
    return ['-i', inName, '-vn', '-c:a', 'libvorbis', '-q:a', '4', '-y', outName];
  }
  if (targetFmt === 'opus') {
    return ['-i', inName, '-vn', '-c:a', 'libopus', '-b:a', '128k', '-y', outName];
  }
  return ['-i', inName, '-vn', '-y', outName];
}

export async function runLocalFfmpegTool(
  toolId: string,
  files: PickedFile[],
  options: Record<string, string>,
  onProgress: (ratio: number, step: string) => void,
  signal?: AbortSignal
): Promise<Array<{name: string; blob: Blob}>> {
  const ffmpeg = await getFFmpeg((msg) => onProgress(0.05, msg));
  if (signal?.aborted) throw new Error('Cancelled');

  const first = files[0];
  const inExt = safeExt(first, first.kind === 'audio' ? 'mp3' : 'mp4');
  const inName = `input_0.${inExt}`;

  const onAbortSpecial = () => {
    terminateFFmpegInstance();
  };

  if (toolId === 'video_join') {
    const inputs: Array<{name: string; blob: Blob}> = [];
    const normalizedNames: string[] = [];
    signal?.addEventListener('abort', onAbortSpecial, {once: true});
    try {
      for (let i = 0; i < files.length; i++) {
        if (signal?.aborted) throw new Error('Cancelled');
        onProgress((i / files.length) * 0.4, files[i].name);
        const fExt = safeExt(files[i], 'mp4');
        const src = `join_in_${i}.${fExt}`;
        const ts = `join_part_${i}.ts`;
        inputs.push({name: src, blob: files[i].file});
        await ffmpeg.writeFile(src, await fetchFile(files[i].file));
        const rc = await ffmpeg.exec([
          '-i',
          src,
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-pix_fmt',
          'yuv420p',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-c:a',
          'aac',
          '-f',
          'mpegts',
          '-y',
          ts,
        ]);
        if (signal?.aborted) throw new Error('Cancelled');
        if (rc !== 0) throw new Error('Video birleştirme başarısız.');
        normalizedNames.push(ts);
      }
      const outName = `${first.baseName}-joined.mp4`;
      const concatArg = `concat:${normalizedNames.join('|')}`;
      onProgress(0.65, outName);
      const rc = await ffmpeg.exec(['-i', concatArg, '-c', 'copy', '-y', outName]);
      if (signal?.aborted) throw new Error('Cancelled');
      if (rc !== 0) throw new Error('Video birleştirme başarısız.');
      const data = await ffmpeg.readFile(outName);
      const uint8 = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array();
      await ffmpeg.deleteFile(outName).catch(() => {});
      return [{name: outName, blob: new Blob([uint8], {type: 'video/mp4'})}];
    } finally {
      signal?.removeEventListener('abort', onAbortSpecial);
      if (ffmpegInstance === ffmpeg && ffmpeg.loaded) {
        for (const f of inputs) await ffmpeg.deleteFile(f.name).catch(() => {});
        for (const n of normalizedNames) await ffmpeg.deleteFile(n).catch(() => {});
      }
    }
  }

  if (toolId === 'audio_join') {
    const targetFmt = (options.format || 'mp3').toLowerCase();
    const outName = `${first.baseName}-joined.${targetFmt}`;
    const inputArgs: string[] = [];
    const filterInputs: string[] = [];
    const writtenNames: string[] = [];
    signal?.addEventListener('abort', onAbortSpecial, {once: true});

    try {
      for (let i = 0; i < files.length; i++) {
        if (signal?.aborted) throw new Error('Cancelled');
        onProgress((i / files.length) * 0.35, files[i].name);
        const fExt = safeExt(files[i], 'mp3');
        const src = `ajoin_${i}.${fExt}`;
        writtenNames.push(src);
        await ffmpeg.writeFile(src, await fetchFile(files[i].file));
        inputArgs.push('-i', src);
        filterInputs.push(`[${i}:a]`);
      }

      const codecArgs =
        targetFmt === 'wav'
          ? ['-c:a', 'pcm_s16le']
          : targetFmt === 'm4a'
            ? ['-c:a', 'aac', '-b:a', '192k']
            : ['-c:a', 'libmp3lame', '-q:a', '2'];

      onProgress(0.55, outName);
      const rc = await ffmpeg.exec([
        ...inputArgs,
        '-filter_complex',
        `${filterInputs.join('')}concat=n=${files.length}:v=0:a=1[outa]`,
        '-map',
        '[outa]',
        ...codecArgs,
        '-y',
        outName,
      ]);
      if (signal?.aborted) throw new Error('Cancelled');
      if (rc !== 0) throw new Error('Ses birleştirme tamamlanamadı.');
      const data = await ffmpeg.readFile(outName);
      const uint8 = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array();
      await ffmpeg.deleteFile(outName).catch(() => {});
      return [{name: outName, blob: new Blob([uint8], {type: mimeFromExt(targetFmt)})}];
    } finally {
      signal?.removeEventListener('abort', onAbortSpecial);
      if (ffmpegInstance === ffmpeg && ffmpeg.loaded) {
        for (const n of writtenNames) await ffmpeg.deleteFile(n).catch(() => {});
      }
    }
  }

  if (toolId === 'video_snapshots') {
    const fmt = options.format === 'png' ? 'png' : 'jpg';
    const interval = Math.max(1, Number(options.interval) || 5);
    signal?.addEventListener('abort', onAbortSpecial, {once: true});
    await ffmpeg.writeFile(inName, await fetchFile(first.file));
    try {
      onProgress(0.2, first.name);
      const rc = await ffmpeg.exec(['-i', inName, '-vf', `fps=1/${interval}`, '-y', `frame_%03d.${fmt}`]);
      if (signal?.aborted) throw new Error('Cancelled');
      if (rc !== 0) throw new Error('Kare çıkarılamadı.');
      const dir = await ffmpeg.listDir('/');
      const frameFiles = dir
        .map((e) => e.name)
        .filter((n) => n.startsWith('frame_') && n.endsWith(`.${fmt}`))
        .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
      const outputs: Array<{name: string; blob: Blob}> = [];
      for (let i = 0; i < frameFiles.length; i++) {
        const fName = frameFiles[i];
        const data = await ffmpeg.readFile(fName);
        const uint8 = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array();
        outputs.push({
          name: `${first.baseName}-frame-${i + 1}.${fmt}`,
          blob: new Blob([uint8], {type: mimeFromExt(fmt)}),
        });
        await ffmpeg.deleteFile(fName).catch(() => {});
      }
      if (outputs.length === 0) throw new Error('Hiç kare çıkarılamadı.');
      return outputs;
    } finally {
      signal?.removeEventListener('abort', onAbortSpecial);
      if (ffmpegInstance === ffmpeg && ffmpeg.loaded) {
        await ffmpeg.deleteFile(inName).catch(() => {});
      }
    }
  }

  if (toolId === 'video_split') {
    signal?.addEventListener('abort', onAbortSpecial, {once: true});
    await ffmpeg.writeFile(inName, await fetchFile(first.file));
    const p1 = `${first.baseName}-part1.mp4`;
    const p2 = `${first.baseName}-part2.mp4`;
    try {
      let splitSec = parseTimestampToSeconds(options.start || '');
      if (splitSec <= 0) {
        const {durationSec: dur} = await probeStreamInfo(ffmpeg, inName);
        splitSec = dur > 2 ? Math.round((dur / 2) * 10) / 10 : 5;
      }
      onProgress(0.3, p1);
      const r1 = await ffmpeg.exec([
        '-i',
        inName,
        '-t',
        String(splitSec),
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-c:a',
        'aac',
        '-y',
        p1,
      ]);
      if (signal?.aborted) throw new Error('Cancelled');
      if (r1 !== 0) throw new Error('İlk parça kesilemedi.');
      onProgress(0.65, p2);
      const r2 = await ffmpeg.exec([
        '-ss',
        String(splitSec),
        '-i',
        inName,
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-c:a',
        'aac',
        '-y',
        p2,
      ]);
      if (signal?.aborted) throw new Error('Cancelled');
      if (r2 !== 0) throw new Error('İkinci parça kesilemedi.');

      const d1 = await ffmpeg.readFile(p1);
      const d2 = await ffmpeg.readFile(p2);
      return [
        {
          name: p1,
          blob: new Blob([d1 instanceof Uint8Array ? new Uint8Array(d1) : new Uint8Array()], {
            type: 'video/mp4',
          }),
        },
        {
          name: p2,
          blob: new Blob([d2 instanceof Uint8Array ? new Uint8Array(d2) : new Uint8Array()], {
            type: 'video/mp4',
          }),
        },
      ];
    } finally {
      signal?.removeEventListener('abort', onAbortSpecial);
      if (ffmpegInstance === ffmpeg && ffmpeg.loaded) {
        await ffmpeg.deleteFile(inName).catch(() => {});
        await ffmpeg.deleteFile(p1).catch(() => {});
        await ffmpeg.deleteFile(p2).catch(() => {});
      }
    }
  }

  let outName = `${first.baseName}-morph.${inExt}`;
  let args: string[] = [];

  switch (toolId) {
    case 'video_convert': {
      const targetFmt = (options.format || 'mp4').toLowerCase();
      outName = `${first.baseName}.${targetFmt}`;
      if (targetFmt === 'gif') {
        args = ['-i', inName, '-vf', 'fps=12,scale=480:-2:flags=lanczos', '-y', outName];
      } else if (['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus'].includes(targetFmt)) {
        args = buildAudioEncodeArgs(inName, targetFmt, outName);
      } else if (targetFmt === 'webm') {
        args = ['-i', inName, '-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libvorbis', '-y', outName];
      } else if (targetFmt === 'avi') {
        args = [
          '-i',
          inName,
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-c:v',
          'mpeg4',
          '-q:v',
          '5',
          '-c:a',
          'libmp3lame',
          '-y',
          outName,
        ];
      } else {
        args = [
          '-i',
          inName,
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-pix_fmt',
          'yuv420p',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-c:a',
          'aac',
          '-y',
          outName,
        ];
      }
      break;
    }
    case 'video_extract_audio': {
      const targetFmt = (options.format || 'mp3').toLowerCase();
      outName = `${first.baseName}.${targetFmt}`;
      args = buildAudioEncodeArgs(inName, targetFmt, outName);
      break;
    }
    case 'video_compress': {
      const crf = options.quality || '28';
      outName = `${first.baseName}-compressed.mp4`;
      args = [
        '-i',
        inName,
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        crf,
        '-c:a',
        'aac',
        '-y',
        outName,
      ];
      break;
    }
    case 'video_mute': {
      outName = `${first.baseName}-muted.${inExt === 'webm' ? 'webm' : 'mp4'}`;
      args = ['-i', inName, '-c:v', 'copy', '-an', '-y', outName];
      break;
    }
    case 'video_trim': {
      outName = `${first.baseName}-trimmed.mp4`;
      const start = options.start?.trim() || '0';
      const end = options.end?.trim();
      args = [
        '-ss',
        start,
        '-i',
        inName,
        ...(end ? ['-to', end] : []),
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-c:a',
        'aac',
        '-y',
        outName,
      ];
      break;
    }
    case 'video_crop': {
      outName = `${first.baseName}-cropped.mp4`;
      const aspect = options.aspect || '1:1';
      let expr = "crop='trunc(min(iw,ih)/2)*2':'trunc(min(iw,ih)/2)*2'";
      if (aspect === '16:9') expr = "crop='trunc(min(iw,ih*16/9)/2)*2':'trunc(min(ih,iw*9/16)/2)*2'";
      if (aspect === '9:16') expr = "crop='trunc(min(iw,ih*9/16)/2)*2':'trunc(min(ih,iw*16/9)/2)*2'";
      if (aspect === '4:5') expr = "crop='trunc(min(iw,ih*4/5)/2)*2':'trunc(min(ih,iw*5/4)/2)*2'";
      args = [
        '-i',
        inName,
        '-vf',
        expr,
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-c:a',
        'aac',
        '-y',
        outName,
      ];
      break;
    }
    case 'video_rotate': {
      outName = `${first.baseName}-rotated.mp4`;
      const mode = options.rotateMode || '90';
      let vf = 'transpose=1';
      if (mode === '180') vf = 'transpose=1,transpose=1';
      if (mode === '270') vf = 'transpose=2';
      if (mode === 'hflip') vf = 'hflip';
      if (mode === 'vflip') vf = 'vflip';
      args = [
        '-i',
        inName,
        '-vf',
        `${vf},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-c:a',
        'aac',
        '-y',
        outName,
      ];
      break;
    }
    case 'video_speed': {
      outName = `${first.baseName}-speed.mp4`;
      const speed = Math.min(2, Math.max(0.5, Number(options.speed) || 1.5));
      const setpts = (1 / speed).toFixed(3);
      await ffmpeg.writeFile(inName, await fetchFile(first.file));
      let hasAudio = false;
      try {
        const info = await probeStreamInfo(ffmpeg, inName);
        hasAudio = info.hasAudio;
      } finally {
        await ffmpeg.deleteFile(inName).catch(() => {});
      }
      args = [
        '-i',
        inName,
        '-filter:v',
        `setpts=${setpts}*PTS,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        ...(hasAudio ? ['-filter:a', `atempo=${speed}`, '-c:a', 'aac'] : ['-an']),
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-y',
        outName,
      ];
      break;
    }
    case 'video_reverse': {
      outName = `${first.baseName}-reversed.mp4`;
      await ffmpeg.writeFile(inName, await fetchFile(first.file));
      let hasAudio = false;
      try {
        const info = await probeStreamInfo(ffmpeg, inName);
        hasAudio = info.hasAudio;
      } finally {
        await ffmpeg.deleteFile(inName).catch(() => {});
      }
      args = [
        '-i',
        inName,
        '-vf',
        'reverse,scale=trunc(iw/2)*2:trunc(ih/2)*2',
        ...(hasAudio ? ['-af', 'areverse', '-c:a', 'aac'] : ['-an']),
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-y',
        outName,
      ];
      break;
    }
    case 'video_boomerang': {
      outName = `${first.baseName}-boomerang.mp4`;
      args = [
        '-i',
        inName,
        '-t',
        '8',
        '-filter_complex',
        '[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,split[f][r];[r]reverse[rv];[f][rv]concat=n=2:v=1:a=0[outv]',
        '-map',
        '[outv]',
        '-an',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-y',
        outName,
      ];
      break;
    }
    case 'video_loop': {
      const loops = Math.min(6, Math.max(2, Number(options.loopCount) || 2));
      outName = `${first.baseName}-loop-${loops}x.mp4`;
      args = [
        '-stream_loop',
        String(loops - 1),
        '-i',
        inName,
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-c:a',
        'aac',
        '-y',
        outName,
      ];
      break;
    }
    case 'audio_convert': {
      const targetFmt = (options.format || 'mp3').toLowerCase();
      if (targetFmt === 'mp4') {
        outName = `${first.baseName}-video.mp4`;
        args = [
          '-f',
          'lavfi',
          '-i',
          'color=c=0x101D31:s=1280x720:r=24',
          '-i',
          inName,
          '-filter_complex',
          '[1:a]showwaves=s=1280x260:mode=cline:colors=0xF0788A[sw];[0:v][sw]overlay=0:230[v]',
          '-map',
          '[v]',
          '-map',
          '1:a',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-c:a',
          'aac',
          '-shortest',
          '-y',
          outName,
        ];
      } else {
        outName = `${first.baseName}.${targetFmt}`;
        args = buildAudioEncodeArgs(inName, targetFmt, outName);
      }
      break;
    }
    case 'audio_normalize': {
      outName = `${first.baseName}-normalized.mp3`;
      args = ['-i', inName, '-vn', '-af', 'loudnorm', '-c:a', 'libmp3lame', '-q:a', '2', '-y', outName];
      break;
    }
    case 'audio_trim': {
      const outExt = ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus'].includes(inExt) ? inExt : 'mp3';
      outName = `${first.baseName}-trimmed.${outExt}`;
      const start = options.start?.trim() || '0';
      const end = options.end?.trim();
      args = ['-ss', start, '-i', inName, ...(end ? ['-to', end] : []), '-vn', '-y', outName];
      break;
    }
    case 'audio_speed': {
      const mode = options.audioSpeedMode || '1.25';
      outName = `${first.baseName}-${mode === 'slowed' ? 'slowed' : mode === 'nightcore' ? 'nightcore' : 'tempo'}.mp3`;
      let af = 'atempo=1.25';
      if (mode === '0.75') af = 'atempo=0.75';
      else if (mode === '1.5') af = 'atempo=1.5';
      else if (mode === '2') af = 'atempo=2.0';
      else if (mode === 'slowed') af = 'asetrate=44100*0.86,aresample=44100';
      else if (mode === 'nightcore') af = 'asetrate=44100*1.22,aresample=44100';
      args = ['-i', inName, '-vn', '-af', af, '-c:a', 'libmp3lame', '-q:a', '2', '-y', outName];
      break;
    }
    case 'audio_fade': {
      const fadeD = Math.min(15, Math.max(0.5, Number(options.fadeSec) || 2));
      outName = `${first.baseName}-fade.mp3`;
      await ffmpeg.writeFile(inName, await fetchFile(first.file));
      let dur = 0;
      try {
        const info = await probeStreamInfo(ffmpeg, inName);
        dur = info.durationSec;
      } finally {
        await ffmpeg.deleteFile(inName).catch(() => {});
      }
      const outStart = dur > fadeD * 2 ? Math.max(0.5, Number((dur - fadeD).toFixed(2))) : 0;
      const af =
        outStart > 0
          ? `afade=t=in:st=0:d=${fadeD},afade=t=out:st=${outStart}:d=${fadeD}`
          : `afade=t=in:st=0:d=${fadeD}`;
      args = ['-i', inName, '-vn', '-af', af, '-c:a', 'libmp3lame', '-q:a', '2', '-y', outName];
      break;
    }
    case 'audio_reverse': {
      outName = `${first.baseName}-reversed.mp3`;
      args = ['-i', inName, '-vn', '-af', 'areverse', '-c:a', 'libmp3lame', '-q:a', '2', '-y', outName];
      break;
    }
    case 'audio_channels': {
      const ch = options.channels === 'stereo' ? '2' : '1';
      outName = `${first.baseName}-${ch === '1' ? 'mono' : 'stereo'}.mp3`;
      args = ['-i', inName, '-vn', '-ac', ch, '-c:a', 'libmp3lame', '-q:a', '2', '-y', outName];
      break;
    }
    case 'audio_to_video': {
      outName = `${first.baseName}-video.mp4`;
      args = [
        '-f',
        'lavfi',
        '-i',
        'color=c=0x101D31:s=1280x720:r=24',
        '-i',
        inName,
        '-filter_complex',
        '[1:a]showwaves=s=1280x260:mode=cline:colors=0xF0788A[sw];[0:v][sw]overlay=0:230[v]',
        '-map',
        '[v]',
        '-map',
        '1:a',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-c:a',
        'aac',
        '-shortest',
        '-y',
        outName,
      ];
      break;
    }
    case 'audio_bleep': {
      outName = `${first.baseName}-muted-range.mp3`;
      const sSec = parseTimestampToSeconds(options.start || '0');
      const eSec = Math.max(sSec + 0.2, parseTimestampToSeconds(options.end || String(sSec + 2)));
      args = ['-i', inName, '-af', `volume=enable='between(t,${sSec},${eSec})':volume=0`, '-y', outName];
      break;
    }
    default:
      throw new Error(`Desteklenmeyen araç: ${toolId}`);
  }

  onProgress(0.15, first.name);
  return execSingle(
    ffmpeg,
    args,
    [{name: inName, blob: first.file}],
    [outName],
    (r) => onProgress(0.15 + r * 0.82, first.name),
    signal
  );
}
