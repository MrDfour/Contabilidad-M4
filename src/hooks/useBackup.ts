/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import type { ModalInfo } from '../components/modals/GlobalInfoModal';
import { Account, FixedAsset, Journal, Poliza } from '../types';

/**
 * Hook del RESPALDO LOCAL (Fase 5 de PLAN_MULTI_CLIENTE.md → v3; heredero de
 * la Fase 5 → v2, D-14, de PLAN_POLIZAS.md).
 *
 * Dueño EXCLUSIVO de la clave: `contasis_last_backup` (timestamp del último
 * respaldo). Las claves de datos JAMÁS se escriben ni leen aquí: el hook
 * empaqueta el snapshot que le entrega App (delegando lecturas y escrituras
 * al hook dueño de cada clave — regla anti-R1).
 */
const LAST_BACKUP_STORAGE_KEY = 'contasis_last_backup';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Datos de UN cliente dentro del respaldo (C-5): workspace completo con sus
 * cuatro dominios. En la exportación App lee las claves por cliente vía sus
 * dueños appliers; en la restauración cada parte vuelve por su dueño.
 */
export interface EmpresaWorkspace {
  id: string;
  nombre: string;
  rfc?: string;
  polizas: Poliza[];
  accounts: Account[];
  fixedAssets: FixedAsset[];
  finalInventories: Record<string, number>;
}

/** Formato v3.0.0 (multi-cliente): TODAS las empresas + cuál estaba activa. */
export interface BackupSnapshotV3 {
  empresas: EmpresaWorkspace[];
  activaId: string;
}

/** Formato v2.0.0 (post-Fase 5 de PLAN_POLIZAS.md): la captura vive en pólizas. */
export interface BackupSnapshotV2 {
  polizas: Poliza[];
  accounts: Account[];
  fixedAssets: FixedAsset[];
  finalInventories: Record<string, number>;
  /** Vacío en v2; se conserva por compatibilidad de formato (D-14). */
  journals: Journal[];
}

/** Respaldos v1.0.0 (pre-Fase 5): la captura vivía en journals. */
export interface BackupSnapshotV1 {
  journals: Journal[];
  accounts: Account[];
  fixedAssets?: FixedAsset[];
  finalInventories?: Record<string, number>;
}

/**
 * Formatos aceptados por la restauración (C-5):
 * - v3 → hidrata a TODOS los clientes con sus datos.
 * - v2/v1 → sobrescriben SOLO los datos del cliente ACTIVO (semántica previa).
 */
export type RestorableBackup = BackupSnapshotV3 | BackupSnapshotV2 | BackupSnapshotV1;

/** Discriminador de respaldo v3 (multi-cliente). */
export const esBackupV3 = (backup: RestorableBackup): backup is BackupSnapshotV3 =>
  Array.isArray((backup as BackupSnapshotV3).empresas);

export function useBackup({
  getSnapshot,
  notify,
  restore,
  canSuggest
}: {
  /** Snapshot actual de todos los clientes (async: lee las claves de cada empresa al exportar). */
  getSnapshot: () => Promise<BackupSnapshotV3>,
  /** Muestra modales de éxito/error en UI. */
  notify: (info: ModalInfo) => void,
  /** Restauración de una estructura válida v3/v2/v1 (orquestador multi-hook en App). */
  restore: (backup: RestorableBackup) => void,
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

  const handleExportBackup = async () => {
    try {
      const data = await depsRef.current.getSnapshot();
      const backupData = {
        version: '3.0.0',
        timestamp: new Date().toISOString(),
        data
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Contabilidad_M4_Respaldo_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      localStorage.setItem(LAST_BACKUP_STORAGE_KEY, new Date().toISOString());
      depsRef.current.notify({ type: 'success', title: 'Respaldo Exitoso', message: 'Se ha descargado el archivo JSON con la base de datos de todos tus clientes.' });
    } catch (error) {
      console.error('Error al exportar el respaldo:', error);
      depsRef.current.notify({ type: 'error', title: 'Error de Respaldo', message: 'No se pudo generar el archivo de respaldo. Intenta nuevamente.' });
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const backup = parsed.data || parsed; // Soporte para respaldo con envoltorio

      // v3: `empresas` por cliente; v2: `polizas`; v1: `journals`
      // (la migración al vuelo ocurre en el orquestador `restore` de App).
      const esV3 = esBackupV3(backup);
      const esV2 = Array.isArray(backup.polizas);
      const esV1 = !esV3 && Array.isArray(backup.journals) && Array.isArray(backup.accounts);
      if (esV3 || esV2 || esV1) {
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
