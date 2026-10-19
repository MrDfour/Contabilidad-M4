/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import type { ModalInfo } from '../components/modals/GlobalInfoModal';
import { Account, FixedAsset, Journal } from '../types';

/**
 * Hook del RESPALDO LOCAL (Fase 2 del plan de modularización).
 *
 * Dueño EXCLUSIVO de la clave: `contasis_last_backup` (localStorage simple,
 * timestamp del último respaldo). Las claves de datos JAMÁS se escriben aquí:
 * el hook solo empaqueta el snapshot actual o delega su restauración al
 * orquestador de App (`restore`) que comanda a cada hook dueño — regla anti-R1.
 */
const LAST_BACKUP_STORAGE_KEY = 'contasis_last_backup';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface BackupSnapshot {
  journals: Journal[];
  accounts: Account[];
  fixedAssets: FixedAsset[];
  finalInventories: Record<string, number>;
}

export function useBackup({
  getSnapshot,
  notify,
  restore,
  canSuggest
}: {
  /** Snapshot actual de todos los dominios (leído solo al exportar). */
  getSnapshot: () => BackupSnapshot,
  /** Muestra modales de éxito/error en UI. */
  notify: (info: ModalInfo) => void,
  /** Restauración de una estructura válida (orquestador multi-hook en App). */
  restore: (backup: { journals: Journal[], accounts: Account[], fixedAssets?: FixedAsset[], finalInventories?: Record<string, number> }) => void,
  /** false mientras haya un modal abierto: el vigilante no interrumpe. */
  canSuggest: () => boolean
}) {
  const depsRef = useRef({ getSnapshot, notify, restore, canSuggest });
  depsRef.current = { getSnapshot, notify, restore, canSuggest };

  // --- Vigilante de Respaldo Semanal (Rutina Continua, idéntico al original) ---
  useEffect(() => {
    const checkBackupStatus = () => {
      // Ignorar chequeo si ya hay un modal abierto para no interrumpir
      if (!depsRef.current.canSuggest()) return;

      const lastBackup = localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
      if (!lastBackup) {
        localStorage.setItem(LAST_BACKUP_STORAGE_KEY, new Date().toISOString());
        return;
      }

      const lastDate = new Date(lastBackup).getTime();
      const now = Date.now();

      if (now - lastDate > SEVEN_DAYS_MS) {
        depsRef.current.notify({
          type: 'success',
          title: 'Sugerencia de Respaldo',
          message: 'Ha pasado más de una semana desde tu último respaldo de seguridad. ¿Deseas descargar una copia de tu base de datos ahora?',
        });
      }
    };

    // 1. Chequeo inicial al cargar la app
    checkBackupStatus();

    // 2. Chequeo continuo cada 12 horas (Por si nunca cierran la app)
    const intervalId = setInterval(checkBackupStatus, 12 * 60 * 60 * 1000);

    // 3. Limpieza para evitar memory leaks
    return () => clearInterval(intervalId);
  }, []);

  const handleExportBackup = () => {
    const backupData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      data: depsRef.current.getSnapshot()
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Contabilidad_M4_Respaldo_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem(LAST_BACKUP_STORAGE_KEY, new Date().toISOString());
    depsRef.current.notify({ type: 'success', title: 'Respaldo Exitoso', message: 'Se ha descargado el archivo JSON con toda tu base de datos.' });
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const backup = parsed.data || parsed; // Soporte para formato nuevo o legacy

      if (Array.isArray(backup.journals) && Array.isArray(backup.accounts)) {
        depsRef.current.restore(backup);
      } else {
        throw new Error('Formato inválido');
      }
    } catch {
      depsRef.current.notify({ type: 'error', title: 'Error de Restauración', message: 'El archivo JSON está corrupto o no tiene el formato correcto de Contabilidad M4.' });
    }
    e.target.value = ''; // Resetear input
  };

  return { handleExportBackup, handleImportBackup };
}
