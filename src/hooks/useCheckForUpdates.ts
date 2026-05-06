import { useState, useEffect } from 'react';

declare const __APP_VERSION__: string;

const GITHUB_RELEASES_API =
  'https://api.github.com/repos/mrdfour/contabilidad-m4/releases/latest';

interface UpdateInfo {
  isUpdateAvailable: boolean;
  latestVersion: string;
  downloadUrl: string;
}

/**
 * Parses a version string into a numeric tuple [major, minor, patch],
 * ignoring any trailing non-numeric suffixes (e.g. "0.0.5c" → [0, 0, 5]).
 */
function parseVersion(version: string): [number, number, number] {
  const cleaned = version.replace(/^v/, '');
  const parts = cleaned.split('.').map(p => parseInt(p, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Returns true if `remote` is strictly newer than `local`.
 */
function isNewer(local: string, remote: string): boolean {
  const [lMaj, lMin, lPat] = parseVersion(local);
  const [rMaj, rMin, rPat] = parseVersion(remote);
  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPat > lPat;
}

export function useCheckForUpdates(): UpdateInfo {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdates() {
      try {
        const response = await fetch(GITHUB_RELEASES_API, {
          headers: { Accept: 'application/vnd.github+json' },
        });

        if (!response.ok) return;

        const data = await response.json();
        if (cancelled) return;

        const tagName: string = data.tag_name ?? '';
        const assets: { name: string; browser_download_url: string }[] =
          data.assets ?? [];

        const apkAsset = assets.find(a =>
          a.name.toLowerCase().endsWith('.apk')
        );

        if (!tagName) return;

        const currentVersion = typeof __APP_VERSION__ !== 'undefined'
          ? __APP_VERSION__
          : '0.0.0';

        if (isNewer(currentVersion, tagName)) {
          setLatestVersion(tagName.replace(/^v/, ''));
          setDownloadUrl(apkAsset?.browser_download_url ?? '');
          setIsUpdateAvailable(true);
        }
      } catch {
        // Silently ignore network / parse errors so the app never crashes
      }
    }

    checkForUpdates();
    return () => { cancelled = true; };
  }, []);

  return { isUpdateAvailable, latestVersion, downloadUrl };
}
