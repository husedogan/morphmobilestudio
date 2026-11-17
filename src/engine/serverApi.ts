import {ExportItem, PickedFile, mimeFromExt} from '../data/models';
import {isNativeApp} from './nativeBridge';

export interface ServerHealth {
  ok: boolean;
  ffmpeg: boolean;
  libreoffice: boolean;
  ytdlp: boolean;
}

export interface ServerJobStatus {
  state: string;
  progress: number;
  message: string;
  outputs: Array<{name: string; size: number}>;
  error?: string;
}

function buildTargetUrl(serverUrl: string, apiPath: string): string {
  if (isNativeApp()) {
    const base = serverUrl.trim().replace(/\/+$/, '');
    return `${base}${apiPath}`;
  }
  return `/api/morph-proxy?path=${encodeURIComponent(apiPath)}`;
}

function buildHeaders(serverUrl: string, token?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!isNativeApp()) {
    headers['X-Morph-Target-Url'] = serverUrl.trim();
  }
  if (token?.trim()) headers['X-Morph-Token'] = token.trim();
  return headers;
}

export async function checkServerHealth(serverUrl: string, token?: string): Promise<ServerHealth> {
  const res = await fetch(buildTargetUrl(serverUrl, '/api/health'), {
    method: 'GET',
    headers: buildHeaders(serverUrl, token),
  });
  if (!res.ok) throw new Error('Server unreachable');
  const json = await res.json();
  return {
    ok: Boolean(json.ok ?? true),
    ffmpeg: Boolean(json.ffmpeg),
    libreoffice: Boolean(json.libreoffice),
    ytdlp: Boolean(json.ytdlp),
  };
}

export async function submitServerJob(
  serverUrl: string,
  token: string | undefined,
  toolId: string,
  files: PickedFile[],
  options: Record<string, string>,
  signal?: AbortSignal
): Promise<string> {
  const form = new FormData();
  form.append('tool', toolId);
  form.append('options', JSON.stringify(options));
  for (const picked of files) {
    form.append('files', picked.file, picked.name);
  }

  const res = await fetch(buildTargetUrl(serverUrl, '/api/jobs'), {
    method: 'POST',
    headers: buildHeaders(serverUrl, token),
    body: form,
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Server job failed.');
  return data.id;
}

export async function submitServerUrl(
  serverUrl: string,
  token: string | undefined,
  url: string,
  options: Record<string, string>,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(buildTargetUrl(serverUrl, '/api/download'), {
    method: 'POST',
    headers: {
      ...buildHeaders(serverUrl, token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({...options, url}),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Link download failed.');
  return data.id;
}

export async function fetchServerJobStatus(
  serverUrl: string,
  token: string | undefined,
  jobId: string,
  signal?: AbortSignal
): Promise<ServerJobStatus> {
  const res = await fetch(buildTargetUrl(serverUrl, `/api/jobs/${jobId}`), {
    method: 'GET',
    headers: buildHeaders(serverUrl, token),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Server status check failed.');
  return {
    state: data.state || 'queued',
    progress: Number(data.progress || 0),
    message: data.message || '',
    outputs: Array.isArray(data.outputs) ? data.outputs : [],
    error: data.error || undefined,
  };
}

export async function downloadServerOutput(
  serverUrl: string,
  token: string | undefined,
  jobId: string,
  index: number,
  name: string,
  toolTitle: string,
  signal?: AbortSignal
): Promise<ExportItem> {
  const res = await fetch(buildTargetUrl(serverUrl, `/api/jobs/${jobId}/files/${index}`), {
    method: 'GET',
    headers: buildHeaders(serverUrl, token),
    signal,
  });
  if (!res.ok) throw new Error('Download failed.');
  const blob = await res.blob();
  const ext = name.includes('.') ? name.split('.').pop()! : '';
  const mime = blob.type || mimeFromExt(ext);
  return {
    id: crypto.randomUUID(),
    name,
    mime,
    size: blob.size,
    createdAt: Date.now(),
    tool: toolTitle,
    blob,
    previewUrl: mime.startsWith('image/') ? URL.createObjectURL(blob) : undefined,
  };
}

export async function cancelServerJob(
  serverUrl: string,
  token: string | undefined,
  jobId: string
): Promise<void> {
  await fetch(buildTargetUrl(serverUrl, `/api/jobs/${jobId}`), {
    method: 'DELETE',
    headers: buildHeaders(serverUrl, token),
  }).catch(() => {});
}
