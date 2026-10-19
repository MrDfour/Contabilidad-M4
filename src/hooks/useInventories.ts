/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { saveToStorage } from '../services/storageService';
import { normalizeAmount } from '../lib/format';

/**
 * Hook del INVENTARIO FINAL (Fase 2 del plan de modularización).
 *
 * Dueño EXCLUSIVO de la clave de storage: `contasis_final_inventories`.
 *
 * Comportamiento fiel al original: esta clave NO tiene efecto de persistencia
 * automática; solo se guarda en `handleSetFinalInventory` y en la aplicación de
 * estado remoto (`hydrateFromRemote`). La restauración de respaldo escribe en
 * RAM únicamente (vía `setFinalInventories` crudo, expuesto para el orquestador
 * de App — regla anti-R1), igual que el `handleImportBackup` original.
 */
const INVENTORIES_KEY = 'contasis_final_inventories';

export function useInventories({ activeJournalId }: { activeJournalId: string | null }) {
  const [finalInventories, setFinalInventories] = useState<Record<string, number>>({});
  const [finalInventory, setFinalInventory] = useState<number>(0);

  // Sincronizar finalInventory cuando cambia el diario activo (idéntico al original).
  useEffect(() => {
    if (activeJournalId) {
      setFinalInventory(finalInventories[activeJournalId] ?? 0);
    }
  }, [activeJournalId, finalInventories]);

  const handleSetFinalInventory = (value: number) => {
    const normalizedValue = normalizeAmount(value);
    setFinalInventory(normalizedValue);
    if (activeJournalId) {
      const updated = { ...finalInventories, [activeJournalId]: normalizedValue };
      setFinalInventories(updated);
      saveToStorage(INVENTORIES_KEY, updated).catch(console.error);
    }
  };

  /**
   * Aplicación atómica de inventarios remotos (sync móvil→escritorio):
   * setea el estado y persiste explícitamente, como el `applyRemoteSyncState` original.
   */
  const hydrateFromRemote = (inventories: Record<string, number>) => {
    setFinalInventories(inventories);
    saveToStorage(INVENTORIES_KEY, inventories).catch(console.error);
  };

  return {
    finalInventories,
    /** Escritura cruda en RAM (solo restauración de respaldo, vía orquestador de App). */
    setFinalInventories,
    finalInventory,
    handleSetFinalInventory,
    hydrateFromRemote
  };
}
