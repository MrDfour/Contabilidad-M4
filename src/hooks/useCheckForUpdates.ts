/**
 * Chequeo de actualizaciones para Android (estilo Mihon): consulta
 * /releases/latest de GitHub de forma silenciosa, compara semver con la
 * version local y respeta la version "saltada" por el usuario.
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { esAndroidNativo } from '../services/appUpdater';

const GITHUB_RELEASES_API = 'https://api.github.com/repos/mrdfour/contabilidad-m4/releases/latest';
// 12 horas en milisegundos para el chequeo silencioso
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const CLAVE_SALTAR_VERSION = 'contasis_update_skip_version';

export interface UpdateInfo {
  isUpdateAvailable: boolean;
  latestVersion: string;
  downloadUrl: string;
  /** Changelog (body) del release para mostrar en el modal. */
  changelog: string;
  /** True cuando corre como APK Android nativo (descarga/instalacion in-app). */
  isAndroidNative: boolean;
  isBackgroundUpdate: boolean; // Indica si se encontro silenciosamente durante el uso
}

interface ReleaseGitHub {
  tag_name?: string;
  body?: string;
  assets?: { name: string; browser_download_url: string }[];
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

export function obtenerVersionSaltada(): string | null {
  try {
    return localStorage.getItem(CLAVE_SALTAR_VERSION);
  } catch {
    return null;
  }
}

export function saltarVersion(version: string): void {
  try {
    localStorage.setItem(CLAVE_SALTAR_VERSION, version);
  } catch {
    // Sin persistencia disponible: el skip solo dura esta sesion.
  }
}

const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron');

export function useCheckForUpdates(): UpdateInfo {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [changelog, setChangelog] = useState('');
  const [isBackgroundUpdate, setIsBackgroundUpdate] = useState(false);

  useEffect(() => {
    // Electron: updater propio dentro del proceso main. Web/PWA: el service
    // worker de vite-plugin-pwa (autoUpdate) refresca el cache al reabrir.
    // Solo el APK Android necesita este chequeo + descarga in-app.
    if (isElectron || !esAndroidNativo) return;
    let cancelled = false;
    async function checkForUpdates(isBackground: boolean) {
      try {
        const response = await fetch(GITHUB_RELEASES_API, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        const release: ReleaseGitHub = data ?? {};
        const tagName = release.tag_name ?? '';
        const assets = release.assets ?? [];
        const apkAsset = assets.find(a => a.name.toLowerCase().endsWith('.apk'));
        if (!tagName) return;
        const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;
        if (!currentVersion) return;
        // El usuario eligio "saltar esta version": no molestar con ella.
        if (tagName === obtenerVersionSaltada()) return;
        if (isNewer(currentVersion, tagName) && apkAsset?.browser_download_url) {
          setLatestVersion(tagName.replace(/^v/, ''));
          setDownloadUrl(apkAsset.browser_download_url);
          setChangelog(release.body ?? '');
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
    // 4. PREVENCION DE MEMORY LEAKS
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return { isUpdateAvailable, latestVersion, downloadUrl, changelog, isAndroidNative: esAndroidNativo, isBackgroundUpdate };
}
