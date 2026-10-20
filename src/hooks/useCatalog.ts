/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Account, INITIAL_ACCOUNTS } from '../types';
import { saveToStorage } from '../services/storageService';
import type { ModalInfo } from '../components/modals/GlobalInfoModal';

/**
 * Hook del CATÁLOGO GLOBAL (Fase 5 de PLAN_POLIZAS.md — D-12).
 *
 * Dueño EXCLUSIVO de la clave de storage: `contasis_accounts`, y del flag
 * one-shot `contasis_catalog_migrated`.
 *
 * Cambio D-12: se retiró el catálogo híbrido. El estado `accounts` ahora
 * contiene TODAS las cuentas (globales readonly + las antes locales del
 * diario, consolidadas por la migración one-shot). La auto-recuperación
 * quirúrgica de cuentas base se conserva idéntica al original.
 */
const ACCOUNTS_KEY = 'contasis_accounts';
const ACCOUNTS_MIGRATED_KEY = 'contasis_catalog_migrated';
const ACCOUNTS_SAVE_DEBOUNCE_MS = 300;

export function useCatalog({
  canSave,
  onSaveError
}: {
  /** true cuando useAppData terminó de cargar (protege R2: no persistir vacíos). */
  canSave: boolean,
  /** Callback para surfear errores de persistencia en UI. */
  onSaveError: (info: ModalInfo) => void
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);

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

  /** Marca la migración one-shot del catálogo como ejecutada (owner del flag). */
  const markMigrated = useCallback(() => {
    saveToStorage(ACCOUNTS_MIGRATED_KEY, true).catch(console.error);
  }, []);

  // Persistencia con debounce (idéntico al original; puerta hasLoaded → canSave).
  useEffect(() => {
    if (!canSave) return;
    const timeoutId = window.setTimeout(() => {
      saveToStorage(ACCOUNTS_KEY, accounts).catch((error) => {
        console.error('Failed to save accounts:', error);
        onSaveError({
          type: 'error',
          title: 'Error al guardar',
          message: 'No se pudo guardar el catálogo de cuentas. Intenta nuevamente o contacta soporte si el problema persiste.'
        });
      });
    }, ACCOUNTS_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [accounts, canSave, onSaveError, markMigrated]);

  return {
    accounts,
    /** Escritura cruda (solo restauración de respaldo, vía orquestador de App — anti-R1). */
    setAccounts,
    finalGlobals,
    combinedAccounts,
    handleCombinedAccountsUpdate,
    /** Escritura del flag `contasis_catalog_migrated` (comandada por useAppData). */
    markMigrated
  };
}
