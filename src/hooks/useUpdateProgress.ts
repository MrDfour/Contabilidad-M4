import { useState, useEffect } from 'react';

interface DownloadProgress {
  /** 0–100 */
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

declare global {
  interface Window {
    electronAPI?: {
      onDownloadProgress: (
        callback: (progress: DownloadProgress) => void
      ) => () => void;
      saveData: (key: string, data: any) => Promise<void>;
      loadData: (key: string) => Promise<any>;
    };
    Capacitor?: {
      isNativePlatform: () => boolean;
      [key: string]: any;
    };
  }
}

/**
 * Returns the current update download progress (0-100) when running inside
 * Electron. Returns null when no download is in progress or on non-desktop
 * platforms.
 */
export function useUpdateProgress(): number | null {
  const [percent, setPercent] = useState<number | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.onDownloadProgress) return;

    const unsub = window.electronAPI.onDownloadProgress((progress) => {
      setPercent(Math.round(progress.percent));
    });

    return unsub;
  }, []);

  return percent;
}
