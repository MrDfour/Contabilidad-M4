/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { saveToStorage } from '../services/storageService';
import { normalizeAmount } from '../lib/format';
import { clavePorEmpresa } from '../lib/empresas';

/**
 * Hook del INVENTARIO FINAL por CLIENTE (Fase 3 de PLAN_MULTI_CLIENTE.md).
 *
 * Dueño EXCLUSIVO de la clave POR CLIENTE: `contasis_final_inventories_<empresaId>`
 * (C-2); la clave global sin sufijo quedó como ARCHIVO histórico tras la
 * migración one-shot de clientes (C-2).
 *
 * Cambio D-13 heredado: el mapa opera con la clave fija `'general'`; la
 * normalización del formato legacy vive en el helper puro `inventoriesToGeneral`
 * y se aplica en TODAS las vías de entrada (hidratación, sync remoto).
 *
 * Comportamiento fiel al original: esta clave NO tiene persistencia
 * automática; solo se guarda en `handleSetFinalInventory` y en las vías
 * explícitas (`hydrateFromRemote`, `hydrateEmpresa`).
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

export function useInventories({ empresaId }: { empresaId: string | null }) {
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
    if (empresaId) {
      saveToStorage(clavePorEmpresa(INVENTORIES_KEY, empresaId), updated).catch(console.error);
    }
  };

  /**
   * Aplicación atómica de inventarios remotos/respaldo para el cliente ACTIVO
   * (sync móvil→escritorio): normaliza al formato 'general', setea el estado
   * y persiste explícitamente la clave del cliente.
   */
  const hydrateFromRemote = (inventories: Record<string, number>) => {
    const normalizado = inventoriesToGeneral(inventories);
    setFinalInventories(normalizado);
    if (empresaId) {
      saveToStorage(clavePorEmpresa(INVENTORIES_KEY, empresaId), normalizado).catch(console.error);
    }
  };

  /**
   * C-5 (PLAN_MULTI_CLIENTE.md): escritura de la clave de UN cliente concreto
   * (boot-migración / restauración de respaldos de otros clientes). Anti-R1:
   * el hook dueño escribe SU clave sea cual sea el cliente; la RAM solo
   * cambia si el cliente objetivo es el activo.
   */
  const hydrateEmpresa = (empresaDestinoId: string, inventories: Record<string, number>): void => {
    if (empresaDestinoId === empresaId) {
      setFinalInventories(inventories);
    }
    saveToStorage(clavePorEmpresa(INVENTORIES_KEY, empresaDestinoId), inventories).catch(console.error);
  };

  return {
    finalInventories,
    /** Escritura cruda en RAM (solo carga por cliente, vía orquestador de App). */
    setFinalInventories,
    finalInventory,
    handleSetFinalInventory,
    hydrateFromRemote,
    hydrateEmpresa
  };
}
