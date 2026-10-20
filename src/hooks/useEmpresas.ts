/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { Empresa, EstadoEmpresas } from '../types';
import { saveToStorage, loadFromStorage } from '../services/storageService';

/**
 * Hook del dominio CLIENTES/EMPRESAS (Fase 2 del plan PLAN_MULTI_CLIENTE.md).
 *
 * Dueño EXCLUSIVO de las claves:
 * - `contasis_empresas`          → { activaId, empresas } (metadatos de clientes).
 * - `contasis_empresas_migrated` → flag de migración one-shot legacy → cliente por defecto (C-2).
 *
 * Regla anti-R1: ninguna otra pieza ESCRIBE estas claves; las escrituras
 * multi-dominio (respaldo, sync, boot de App) viajan por `hydrate`/`markMigrated`.
 *
 * Persistencia: efecto con puerta `canSave` (nunca escribe antes de hidratar).
 * `hydrate` persiste explícitamente SIEMPRE (contrato idéntico a usePolizas).
 */
const EMPRESAS_KEY = 'contasis_empresas';
const EMPRESAS_MIGRATED_KEY = 'contasis_empresas_migrated';

export function useEmpresas({ canSave }: { canSave: boolean }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [activaId, setActivaId] = useState<string | null>(null);

  // Persistencia con puerta canSave (ver JSDoc del hook).
  useEffect(() => {
    if (!canSave) return;
    const estado: EstadoEmpresas = { activaId, empresas };
    saveToStorage(EMPRESAS_KEY, estado).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresas, activaId, canSave]);

  const activa = useMemo(
    () => empresas.find(e => e.id === activaId) ?? null,
    [empresas, activaId]
  );

  /** Alta de cliente: id estable (uuid) que compone las claves de dominio (C-2). No cambia el activo. */
  const crearEmpresa = (nombre: string): Empresa => {
    const nueva: Empresa = { id: crypto.randomUUID(), nombre: nombre.trim() };
    setEmpresas(prev => [...prev, nueva]);
    return nueva;
  };

  /** Edición de metadatos (nombre/rfc). El id es inmutable. */
  const actualizarEmpresa = (id: string, cambios: Partial<Omit<Empresa, 'id'>>): void => {
    setEmpresas(prev => prev.map(e => (e.id === id ? { ...e, ...cambios } : e)));
  };

  /** C-8: prohibido eliminar el ÚLTIMO cliente; si se elimina el activo → activa el primero restante. */
  const eliminarEmpresa = (id: string): boolean => {
    if (empresas.length <= 1) return false;
    const restantes = empresas.filter(e => e.id !== id);
    if (restantes.length === empresas.length) return false;
    setEmpresas(restantes);
    if (activaId === id) setActivaId(restantes[0]?.id ?? null);
    return true;
  };

  /** Cambio de cliente activo (dispara la recarga orquestada de dominios en useAppData — C-4). */
  const setActiva = (id: string): void => {
    setActivaId(id);
  };

  /**
   * Reemplazo atómico + persistencia explícita SIEMPRE (boot / respaldo / sync).
   * Persiste incluso con lista vacía (contrato idéntico a usePolizas.hydrate).
   */
  const hydrate = (estado: EstadoEmpresas): void => {
    setEmpresas(estado.empresas);
    setActivaId(estado.activaId);
    saveToStorage(EMPRESAS_KEY, estado).catch(console.error);
  };

  /** Escritura del flag de migración one-shot (C-2). Única autorización de escritura. */
  const markMigrated = (): void => {
    saveToStorage(EMPRESAS_MIGRATED_KEY, true).catch(console.error);
  };

  /** Consulta del flag (uso en useAppData: LECTURA; la escritura pasa por markMigrated). */
  const isMigrated = async (): Promise<boolean> => {
    try {
      const flag = await loadFromStorage(EMPRESAS_MIGRATED_KEY);
      return Boolean(flag);
    } catch {
      return false;
    }
  };

  return {
    empresas,
    activaId,
    activa,
    /** Escritura cruda (solo orquestador para casos extraordinarios — anti-R1). */
    setEmpresas,
    crearEmpresa,
    actualizarEmpresa,
    eliminarEmpresa,
    setActiva,
    hydrate,
    markMigrated,
    isMigrated
  };
}
