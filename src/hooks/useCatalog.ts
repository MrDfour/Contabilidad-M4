/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Account, INITIAL_ACCOUNTS } from '../types';
import { saveToStorage } from '../services/storageService';
import type { ModalInfo } from '../components/modals/GlobalInfoModal';

/**
 * Hook del CATÁLOGO HÍBRIDO (Fase 2 del plan de modularización).
 *
 * Dueño EXCLUSIVO de la clave de storage: `contasis_accounts`.
 *
 * La escritura de subcuentas del diario activo NO toca esta clave: pasa por el
 * callback `commitSubAccounts` → `useJournals.setSubAccounts` (regla anti-R1).
 */
const ACCOUNTS_KEY = 'contasis_accounts';
const ACCOUNTS_SAVE_DEBOUNCE_MS = 300;

export function useCatalog({
  journalId,
  journalSubAccounts,
  canSave,
  onSaveError,
  commitSubAccounts
}: {
  /** Id del diario activo (de useJournals). Solo lectura. */
  journalId: string | null,
  /** Subcuentas locales del diario activo (de useJournals). */
  journalSubAccounts: Account[] | undefined,
  /** true cuando useAppData terminó de cargar (protege R2: no persistir vacíos). */
  canSave: boolean,
  /** Callback para surfaced errores de persistencia en UI. */
  onSaveError: (info: ModalInfo) => void,
  /** Escribe las subcuentas locales filtradas en el diario (useJournals). */
  commitSubAccounts: (journalId: string, localAccounts: Account[]) => void
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

  // --- Catálogo combinado (CLIENTE: globals + subcuentas del diario activo) ---
  const combinedAccounts = useMemo(() => {
    const locals = journalSubAccounts || [];
    return [...finalGlobals, ...locals];
  }, [finalGlobals, journalSubAccounts]);

  /**
   * Update estilo setState delegado por CatalogView: separa locales de globales
   * (por `isReadOnly` y dedup por `code`) y commita SOLO las locales al diario.
   * Firma idéntica a la original para seguir satisfaciendo
   * `React.Dispatch<React.SetStateAction<Account[]>>` en CatalogView.
   */
  const handleCombinedAccountsUpdate = (action: React.SetStateAction<Account[]>) => {
    if (!journalId) {
      console.warn('Cannot update subaccounts: No active journal selected. Please select a journal first.');
      return;
    }

    const globalCodes = new Set(finalGlobals.map(a => a.code));
    const effectiveCombinedAccounts = [...finalGlobals, ...(journalSubAccounts || [])];

    const nextCombinedAccounts = typeof action === 'function' ? action(effectiveCombinedAccounts) : action;
    const nextLocalAccounts = nextCombinedAccounts.filter(
      a => !a.isReadOnly && !globalCodes.has(a.code)
    );

    commitSubAccounts(journalId, nextLocalAccounts);
  };

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
  }, [accounts, canSave, onSaveError]);

  return {
    accounts,
    /** Escritura cruda (solo restauración de respaldo, vía orquestador de App — anti-R1). */
    setAccounts,
    finalGlobals,
    combinedAccounts,
    handleCombinedAccountsUpdate
  };
}
