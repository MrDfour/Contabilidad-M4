/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Poliza } from '../types';
import { saveToStorage, loadFromStorage } from '../services/storageService';
import { validatePolizaBalance, nextPolizaFolio } from '../lib/accounting';

/**
 * Hook del dominio PÓLIZAS (Fase 2 del plan PLAN_POLIZAS.md).
 *
 * Dueño EXCLUSIVO de las claves:
 * - `contasis_polizas`          → estado de pólizas (nueva unidad de captura).
 * - `contasis_polizas_migrated` → flag de migración única de diarios legacy (D-2).
 *
 * Regla anti-R1: ninguna otra pieza ESCRIBE estas claves por su cuenta; las
 * escrituras multi-dominio (respaldo, sync, migración one-shot) viajan por el
 * orquestador de App vía `hydrate` / `markMigrated` / appliers.
 *
 * Persistencia: el efecto persiste CON puerta `canSave` (protección idéntica a
 * useCatalog: nunca escribe antes de que useAppData termine de hidratar — de lo
 * contrario un `[]` de montaje sobrescribiría el storage y mataría la migración).
 * Luego de la carga persiste SIEMPRE, incluso con [] (a diferencia del quirk de
 * useJournals): sin eso, borrar todas las pólizas las resucitaría re-migrando.
 * `hydrate` persiste explícitamente SIEMPRE (mismo contrato que useJournals.hydrate).
 */
const POLIZAS_KEY = 'contasis_polizas';
const POLIZAS_MIGRATED_KEY = 'contasis_polizas_migrated';

/** Payload de alta/edición: el folio lo asigna el hook, los totales se recalculan (D-7). */
export type PolizaInput = Omit<Poliza, 'id' | 'folio' | 'totalDebe' | 'totalHaber'>;

export function usePolizas({ canSave }: { canSave: boolean }) {
  const [polizas, setPolizas] = useState<Poliza[]>([]);

  // Persistencia con puerta canSave (ver JSDoc del hook). Persiste incluso [].
  useEffect(() => {
    if (!canSave) return;
    saveToStorage(POLIZAS_KEY, polizas).catch(console.error);
  }, [polizas, canSave]);

  /** D-9: línea final de defensa — al menos 2 partidas y Debe = Haber. Lanza si inválida. */
  const validarGuardar = (partidas: PolizaInput['partidas']) => {
    if (partidas.length < 2) {
      throw new Error('La póliza requiere al menos 2 partidas.');
    }
    const balance = validatePolizaBalance(partidas);
    if (!balance.isBalanced) {
      throw new Error('La póliza no cuadra: el Debe y el Haber deben ser iguales.');
    }
    return balance;
  };

  const createPoliza = (data: PolizaInput): Poliza => {
    const balance = validarGuardar(data.partidas);
    const nueva: Poliza = {
      ...data,
      id: crypto.randomUUID(),
      folio: nextPolizaFolio(polizas, data.tipo),
      totalDebe: balance.totalDebe,
      totalHaber: balance.totalHaber
    };
    setPolizas(prev => [...prev, nueva]);
    return nueva;
  };

  /** D-10: alta programática sin UI (cierre de resultados, depreciación de activos). */
  const createProgrammaticPoliza = (data: PolizaInput): Poliza => createPoliza(data);

  /** D-8: tipo y folio congelados en edición; los totales SIEMPRE se recalculan. */
  const updatePoliza = (id: string, data: PolizaInput): void => {
    const balance = validarGuardar(data.partidas);
    setPolizas(prev => prev.map(p =>
      p.id === id
        ? {
            ...p,
            ...data,
            tipo: p.tipo,
            folio: p.folio,
            totalDebe: balance.totalDebe,
            totalHaber: balance.totalHaber
          }
        : p
    ));
  };

  const deletePoliza = (id: string): void => {
    setPolizas(prev => prev.filter(p => p.id !== id));
  };

  /** Importación masiva (Excel / respaldos): folio ausente o colisionante → se reasigna por tipo. */
  const importPolizas = (nuevas: Poliza[]): void => {
    setPolizas(prev => {
      const working = [...prev];
      const procesadas = nuevas.map(nueva => {
        let folio = nueva.folio;
        if (!folio || working.some(w => w.tipo === nueva.tipo && w.folio === folio)) {
          folio = nextPolizaFolio(working, nueva.tipo);
        }
        const polizaFinal: Poliza = { ...nueva, folio };
        working.push(polizaFinal);
        return polizaFinal;
      });
      return procesadas.length > 0 ? working : prev;
    });
  };

  /**
   * Reemplazo atómico + persistencia explícita SIEMPRE (carga, respaldo, sync).
   * Persiste incluso con [] — necesario para los flujos que en el modelo de
   * diarios comandaba `applyRemoteSyncState` (comportamiento del hydrate original).
   */
  const hydrate = (nextPolizas: Poliza[]): void => {
    setPolizas(nextPolizas);
    saveToStorage(POLIZAS_KEY, nextPolizas).catch(console.error);
  };

  /** Escribe el flag de migración one-shot (D-2). Única autorización de escritura. */
  const markMigrated = (): void => {
    saveToStorage(POLIZAS_MIGRATED_KEY, true).catch(console.error);
  };

  /** Consulta del flag (uso en useAppData: LECTURA; la escritura pasa por markMigrated). */
  const isMigrated = async (): Promise<boolean> => {
    try {
      const flag = await loadFromStorage(POLIZAS_MIGRATED_KEY);
      return Boolean(flag);
    } catch {
      return false;
    }
  };

  return {
    polizas,
    /** Escritura cruda en RAM (solo orquestador de App para carga/respaldo — anti-R1). */
    setPolizas,
    createPoliza,
    createProgrammaticPoliza,
    updatePoliza,
    deletePoliza,
    importPolizas,
    hydrate,
    markMigrated,
    isMigrated
  };
}
