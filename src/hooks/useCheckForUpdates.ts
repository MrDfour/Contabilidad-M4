import { useState, useEffect } from 'react';

const GITHUB_RELEASES_API = 'https://api.github.com/repos/mrdfour/contabilidad-m4/releases/latest';

// 12 horas en milisegundos para el chequeo silencioso
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

interface UpdateInfo {
  isUpdateAvailable: boolean;
  latestVersion: string;
  downloadUrl: string;
  isBackgroundUpdate: boolean; // Indica si se encontró silenciosamente durante el uso
}

function parseVersion(version: string): [number, number, number] {
  const cleaned = version.replace(/^v/, '');
  const parts = cleaned.split('.').map(p => parseInt(p, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isNewer(local: string, remote: string): boolean {
  const [lMaj, lMin, lPat] = parseVersion(local);
  const [rMaj, rMin, rPat] = parseVersion(remote);
  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPat > lPat;
}

const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron');

export function useCheckForUpdates(): UpdateInfo {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [isBackgroundUpdate, setIsBackgroundUpdate] = useState(false);

  useEffect(() => {
    if (isElectron) return;

    let cancelled = false;

    async function checkForUpdates(isBackground: boolean) {
      try {
        const response = await fetch(GITHUB_RELEASES_API, {
          headers: { Accept: 'application/vnd.github+json' },
        });

        if (!response.ok) return;

        const data = await response.json();
        if (cancelled) return;

        const tagName: string = data.tag_name ?? '';
        const assets: { name: string; browser_download_url: string }[] = data.assets ?? [];
        const apkAsset = assets.find(a => a.name.toLowerCase().endsWith('.apk'));

        if (!tagName) return;

        const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;

        if (!currentVersion) return;

        if (isNewer(currentVersion, tagName) && apkAsset?.browser_download_url) {
          setLatestVersion(tagName.replace(/^v/, ''));
          setDownloadUrl(apkAsset.browser_download_url);
          setIsUpdateAvailable(true);
          setIsBackgroundUpdate(isBackground); // Marcamos si fue un chequeo silencioso
        }
      } catch {
        // Ignorar silenciosamente errores de red
      }
    }

    // 1. Chequeo inicial inmediato (al abrir la app)
    checkForUpdates(false);

    // 2. Calcular Jitter (Ruido aleatorio de 0 a 60 minutos)
    const jitterMs = Math.floor(Math.random() * 60 * 60 * 1000);

    let intervalId: ReturnType<typeof setInterval> | undefined;

    // 3. Programar el primer chequeo en segundo plano
    const timeoutId = setTimeout(() => {
      checkForUpdates(true);
      // Establecer el ciclo recurrente
      intervalId = setInterval(() => checkForUpdates(true), CHECK_INTERVAL_MS);
    }, CHECK_INTERVAL_MS + jitterMs);

    // 4. PREVENCIÓN DE MEMORY LEAKS
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return { isUpdateAvailable, latestVersion, downloadUrl, isBackgroundUpdate };
}
