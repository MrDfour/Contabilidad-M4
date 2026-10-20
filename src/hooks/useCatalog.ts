/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Account, INITIAL_ACCOUNTS } from '../types';
import { saveToStorage } from '../services/storageService';
import type { ModalInfo } from '../components/modals/GlobalInfoModal';
import { clavePorEmpresa } from '../lib/empresas';

/**
 * Hook del CATÁLOGO por CLIENTE (Fase 3 de PLAN_MULTI_CLIENTE.md, heredera
 * del catálogo global de D-12 en PLAN_POLIZAS.md).
 *
 * Dueño EXCLUSIVO de la clave POR CLIENTE: `contasis_accounts_<empresaId>` (C-2).
 * La clave global sin sufijo quedó como ARCHIVO histórico tras la migración
 * one-shot de clientes (C-2, flag `contasis_empresas_migrated` del boot).
 *
 * El estado `accounts` contiene TODAS las cuentas del cliente activo
 * (globales readonly + locales). La auto-recuperación quirúrgica de cuentas
 * base se conserva idéntica al original y opera por cliente.
 */
const ACCOUNTS_KEY = 'contasis_accounts';
const ACCOUNTS_SAVE_DEBOUNCE_MS = 300;

export function useCatalog({
  canSave,
  onSaveError,
  empresaId
}: {
  /** true cuando useAppData terminó de cargar (protege R2: no persistir vacíos). */
  canSave: boolean,
  /** Callback para surfear errores de persistencia en UI. */
  onSaveError: (info: ModalInfo) => void,
  /** Cliente activo (null antes del boot: el efecto no escribe). */
  empresaId: string | null
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);

  /** Clave del cliente activo (null antes del boot: el efecto no escribe). */
  const storageKey = empresaId ? clavePorEmpresa(ACCOUNTS_KEY, empresaId) : null;

  // --- Catálogo global con auto-recuperación quirúrgica (idéntico al original) ---
  const finalGlobals = useMemo(() => {
    const currentGlobals = accounts.filter(a => a.isReadOnly);
    const missingGlobals = INITIAL_ACCOUNTS.filter(
      initial => !currentGlobals.some(current => current.code === initial.code)
    );

    if (missingGlobals.length > 0) {
      const recovered = missingGlobals.map(a => ({ ...a, isReadOnly: true }));
      return [...currentGlobals, ...recovered];
    }

    return currentGlobals;
  }, [accounts]);

  // --- Catálogo combinado: globales (recuperadas) + locales propias del hook, en ese orden ---
  const combinedAccounts = useMemo(() => {
    const locals = accounts.filter(a => !a.isReadOnly);
    return [...finalGlobals, ...locals];
  }, [finalGlobals, accounts]);

  /**
   * Update estilo setState delegado por CatalogView: filtra por `isReadOnly`
   * y dedup por `code` contra las globales vigentes; el resultado completo se
   * comitea a `contasis_accounts` (ya no hay subcuentas por diario).
   * Firma idéntica a la original para seguir satisfaciendo
   * `React.Dispatch<React.SetStateAction<Account[]>>` en CatalogView.
   */
  const handleCombinedAccountsUpdate = (action: React.SetStateAction<Account[]>) => {
    const globalCodes = new Set(finalGlobals.map(a => a.code));
    const nextCombinedAccounts = typeof action === 'function' ? action(combinedAccounts) : action;
    // Las globales (readonly, incluidas las recuperadas quirúrgicamente) SIEMPRE
    // se conservan: el updater solo decide sobre las locales (dedup por code).
    const nextLocalAccounts = nextCombinedAccounts.filter(
      a => !a.isReadOnly && !globalCodes.has(a.code)
    );

    setAccounts([...finalGlobals, ...nextLocalAccounts]);
  };

  // Persistencia con debounce (idéntico al original; puerta hasLoaded → canSave).
  useEffect(() => {
    if (!canSave || !storageKey) return;
    const timeoutId = window.setTimeout(() => {
      saveToStorage(storageKey, accounts).catch((error) => {
        console.error('Failed to save accounts:', error);
        onSaveError({
          type: 'error',
          title: 'Error al guardar',
          message: 'No se pudo guardar el catálogo de cuentas. Intenta nuevamente o contacta soporte si el problema persiste.'
        });
      });
    }, ACCOUNTS_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [accounts, canSave, storageKey, onSaveError]);

  /**
   * C-5 (PLAN_MULTI_CLIENTE.md): escritura de la clave de UN cliente concreto
   * (boot-migración / restauración de respaldos de otros clientes). Anti-R1:
   * el hook dueño escribe SU clave sea cual sea el cliente; la RAM solo
   * cambia si el cliente objetivo es el activo.
   */
  const hydrateEmpresa = useCallback((empresaDestinoId: string, valor: Account[]): void => {
    if (empresaDestinoId === empresaId) {
      setAccounts(valor);
    }
    saveToStorage(clavePorEmpresa(ACCOUNTS_KEY, empresaDestinoId), valor).catch(console.error);
  }, [empresaId]);

  return {
    accounts,
    /** Escritura cruda (solo carga por cliente, vía orquestador de App — anti-R1). */
    setAccounts,
    finalGlobals,
    combinedAccounts,
    handleCombinedAccountsUpdate,
    hydrateEmpresa
  };
}
