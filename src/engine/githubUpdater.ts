declare const __MORPH_VERSION__: string;

export const GITHUB_REPO = 'husodogan/morphmobilestudio';
export const APP_VERSION: string =
  typeof __MORPH_VERSION__ === 'string' && __MORPH_VERSION__.trim().length > 0
    ? __MORPH_VERSION__
    : '1.1.7';

export type VersionChannel = 'stable' | 'preview';

export function parseVersionTuple(raw: string): [number, number, number] {
  const cleaned = raw.replace(/^[^\d]*/, '').split('-')[0];
  const parts = cleaned.split('.').map((n) => parseInt(n, 10));
  return [
    Number.isFinite(parts[0]) ? parts[0] : 0,
    Number.isFinite(parts[1]) ? parts[1] : 0,
    Number.isFinite(parts[2]) ? parts[2] : 0,
  ];
}

export function getVersionChannel(version: string): VersionChannel {
  const [, , patch] = parseVersionTuple(version);
  return patch % 2 === 0 ? 'stable' : 'preview';
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersionTuple(a);
  const pb = parseVersionTuple(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export interface GithubUpdateInfo {
  checkedAt: number;
  repoUrl: string;
  releasesUrl: string;
  apkDownloadUrl: string | null;
  apkSizeBytes: number | null;
  releaseTag: string | null;
  releaseChannel: VersionChannel | null;
  commitMessage: string | null;
  commitDate: string | null;
  hasUpdate: boolean;
  swUpdated: boolean;
  error?: string;
}

interface GithubReleaseAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
}

interface GithubReleaseEntry {
  tag_name?: string;
  prerelease?: boolean;
  draft?: boolean;
  assets?: GithubReleaseAsset[];
}

export async function checkGithubUpdates(): Promise<GithubUpdateInfo> {
  const repoUrl = `https://github.com/${GITHUB_REPO}`;
  const releasesUrl = `${repoUrl}/releases`;

  let swUpdated = false;
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) swUpdated = true;
      }
    } catch {
      // Ignore SW refresh errors
    }
  }

  let apkDownloadUrl: string | null = null;
  let apkSizeBytes: number | null = null;
  let releaseTag: string | null = null;
  let releaseChannel: VersionChannel | null = null;
  let commitMessage: string | null;
  let commitDate: string | null;
  commitMessage = null;
  commitDate = null;
  let error: string | undefined;

  const currentChannel = getVersionChannel(APP_VERSION);

  try {
    const [relsRes, commitRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=15`, {
        headers: {Accept: 'application/vnd.github+json'},
      }),
      fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits/main`, {
        headers: {Accept: 'application/vnd.github+json'},
      }),
    ]);

    if (relsRes.ok) {
      const list = (await relsRes.json()) as GithubReleaseEntry[];
      const published = Array.isArray(list)
        ? list.filter((r) => !r.draft && Boolean(r.tag_name))
        : [];

      // On stable builds prefer stable releases unless no stable exists; on preview builds consider all releases
      const eligible =
        currentChannel === 'stable'
          ? published.filter((r) => !r.prerelease).length > 0
            ? published.filter((r) => !r.prerelease)
            : published
          : published;

      const sorted = [...eligible].sort((a, b) =>
        compareVersions(b.tag_name || '0.0.0', a.tag_name || '0.0.0')
      );

      const best = sorted[0];
      if (best?.tag_name) {
        releaseTag = best.tag_name;
        releaseChannel = getVersionChannel(releaseTag);
        const assets = Array.isArray(best.assets) ? best.assets : [];
        const apkAsset = assets.find((a) => a.name?.toLowerCase().endsWith('.apk')) ?? null;
        if (apkAsset) {
          apkDownloadUrl = apkAsset.browser_download_url ?? null;
          apkSizeBytes = typeof apkAsset.size === 'number' ? apkAsset.size : null;
        }
      }
    }

    if (commitRes.ok) {
      const c = await commitRes.json();
      commitMessage = typeof c.commit?.message === 'string' ? c.commit.message.split('\n')[0] : null;
      commitDate = typeof c.commit?.committer?.date === 'string' ? c.commit.committer.date : null;
    } else if (!relsRes.ok) {
      error = `GitHub HTTP ${commitRes.status}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'GitHub bağlantısı kurulamadı.';
  }

  const hasNewerRelease =
    Boolean(releaseTag) && compareVersions(releaseTag as string, APP_VERSION) > 0;

  return {
    checkedAt: Date.now(),
    repoUrl,
    releasesUrl,
    apkDownloadUrl,
    apkSizeBytes,
    releaseTag,
    releaseChannel,
    commitMessage,
    commitDate,
    hasUpdate: hasNewerRelease || swUpdated,
    swUpdated,
    error,
  };
}

export async function applyPwaUpdateIfWaiting(): Promise<boolean> {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({type: 'SKIP_WAITING'});
        window.location.reload();
        return true;
      }
    } catch {
      // Ignore SW activation errors
    }
  }
  return false;
}
