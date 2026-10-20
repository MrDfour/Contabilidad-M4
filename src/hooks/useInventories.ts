/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { saveToStorage } from '../services/storageService';
import { normalizeAmount } from '../lib/format';

/**
 * Hook del INVENTARIO FINAL (Fase 5 de PLAN_POLIZAS.md).
 *
 * Dueño EXCLUSIVO de la clave de storage: `contasis_final_inventories`.
 *
 * Cambio D-13: sin diario activo no hay clave por la cual indexar; el mapa
 * opera con la clave fija `'general'`. La migración del formato legacy
 * (claves por journalId) vive en el helper puro `inventoriesToGeneral` y se
 * aplica en TODAS las vías de entrada (hidratación, sync remoto).
 *
 * Comportamiento fiel al original: esta clave NO tiene persistencia
 * automática; solo se guarda en `handleSetFinalInventory` y en la aplicación
 * de estado remoto (`hydrateFromRemote`). La restauración de respaldo escribe
 * en RAM únicamente (vía `setFinalInventories` crudo, expuesto para el
 * orquestador de App — regla anti-R1), igual que el `handleImportBackup` original.
 */
const INVENTORIES_KEY = 'contasis_final_inventories';

/** Única clave vigente en el mapa de inventarios (D-13). */
export const GENERAL_INVENTORY_KEY = 'general';

/**
 * Normaliza un mapa de inventarios al formato post-migración cuando falta la
 * clave `'general'`: conserva SOLO esa clave, copiada del primer valor en orden
 * de inserción. Función PURA e idempotente (usada por useAppData y sync).
 */
export const inventoriesToGeneral = (
  raw: Record<string, number>
): Record<string, number> => {
  if (!raw || typeof raw !== 'object') return {};
  if (Object.prototype.hasOwnProperty.call(raw, GENERAL_INVENTORY_KEY)) {
    return { [GENERAL_INVENTORY_KEY]: (raw as Record<string, number>)[GENERAL_INVENTORY_KEY] };
  }
  const values = Object.values(raw);
  return values.length > 0 ? { [GENERAL_INVENTORY_KEY]: values[0] } : {};
};

export function useInventories() {
  const [finalInventories, setFinalInventories] = useState<Record<string, number>>({});
  const [finalInventory, setFinalInventory] = useState<number>(0);

  // `finalInventory` refleja SIEMPRE la clave 'general' (única vigente).
  useEffect(() => {
    setFinalInventory(finalInventories[GENERAL_INVENTORY_KEY] ?? 0);
  }, [finalInventories]);

  const handleSetFinalInventory = (value: number) => {
    const normalizedValue = normalizeAmount(value);
    setFinalInventory(normalizedValue);
    const updated = { ...finalInventories, [GENERAL_INVENTORY_KEY]: normalizedValue };
    setFinalInventories(updated);
    saveToStorage(INVENTORIES_KEY, updated).catch(console.error);
  };

  /**
   * Aplicación atómica de inventarios remotos (sync móvil→escritorio):
   * normaliza al formato 'general', setea el estado y persiste explícitamente,
   * como el `applyRemoteSyncState` original.
   */
  const hydrateFromRemote = (inventories: Record<string, number>) => {
    const normalizado = inventoriesToGeneral(inventories);
    setFinalInventories(normalizado);
    saveToStorage(INVENTORIES_KEY, normalizado).catch(console.error);
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
