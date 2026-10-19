/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { Journal, Account, FixedAsset, INITIAL_ACCOUNTS } from '../types';
import { loadFromStorage, migrateFromLocalStorage } from '../services/storageService';

/**
 * Hook de HYDRATION inicial (Fase 2 del plan de modularización).
 *
 * Dueño de: NINGUNA clave de storage (orquesta la carga inicial y delega cada clave
 * al hook dueño — ver tabla de propiedad en REFACTORING_PLAN.md §Fase 2).
 *
 * Protege R2: marca `onLoaded` SOLO tras terminar la hidratación (o su fallback),
 * para que `useCatalog` no persista un catálogo vacío antes de cargar
 * (comportamiento idéntico al `hasLoadedAccounts` original).
 *
 * Se declara al final de la cadena de hooks en App (después de useCatalog) porque
 * su objeto de appliers referencia setters generados por los otros hooks; el ref
 * interno garantiza que el efecto de montaje vea la versión estable final.
 */
export interface AppDataAppliers {
  setJournals: (journals: Journal[]) => void;
  setActiveJournalId: (id: string) => void;
  setFinalInventories: (inventories: Record<string, number>) => void;
  setFixedAssets: (assets: FixedAsset[]) => void;
  setAccounts: (accounts: Account[]) => void;
}

export function useAppData(appliers: AppDataAppliers, onLoaded: (ready: boolean) => void) {
  // Capturados en ref: el efecto corre una sola vez en montaje y debe ver siempre
  // la versión más reciente de los appliers.
  const appliersRef = useRef(appliers);
  appliersRef.current = appliers;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    const loadData = async () => {
      try {
        await migrateFromLocalStorage();

        const saved = await loadFromStorage('contasis_journals');
        if (saved) {
          const parsed = Array.isArray(saved) ? saved : JSON.parse(saved);
          appliersRef.current.setJournals(parsed);
          if (parsed.length > 0) appliersRef.current.setActiveJournalId(parsed[0].id);
        } else {
          // Crear diario inicial si no existe nada
          const initialJournal: Journal = { id: crypto.randomUUID(), name: 'Diario Inicial', entries: [] };
          appliersRef.current.setJournals([initialJournal]);
          appliersRef.current.setActiveJournalId(initialJournal.id);
        }

        const savedInventories = await loadFromStorage('contasis_final_inventories');
        if (savedInventories) {
          const parsed = typeof savedInventories === 'string' ? JSON.parse(savedInventories) : savedInventories;
          appliersRef.current.setFinalInventories(parsed);
        }

        const savedFixedAssets = await loadFromStorage('contasis_fixed_assets');
        if (savedFixedAssets) {
          const parsed = typeof savedFixedAssets === 'string' ? JSON.parse(savedFixedAssets) : savedFixedAssets;
          appliersRef.current.setFixedAssets(parsed);
        }

        const savedAccounts = await loadFromStorage('contasis_accounts');
        if (savedAccounts) {
          const parsed = typeof savedAccounts === 'string' ? JSON.parse(savedAccounts) : savedAccounts;
          if (Array.isArray(parsed) && parsed.length > 0) {
            appliersRef.current.setAccounts(parsed);
          } else {
            appliersRef.current.setAccounts(INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true })));
          }
        } else {
          appliersRef.current.setAccounts(INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true })));
        }
        onLoadedRef.current(true);
      } catch (error) {
        console.error("Error crítico al cargar datos desde el almacenamiento:", error);
        // Fallback seguro (idéntico al original; INITIAL_ACCOUNTS SIN mapeo isReadOnly aquí)
        const initialJournal: Journal = { id: crypto.randomUUID(), name: 'Diario Inicial', entries: [] };
        appliersRef.current.setJournals([initialJournal]);
        appliersRef.current.setActiveJournalId(initialJournal.id);
        appliersRef.current.setAccounts(INITIAL_ACCOUNTS);
        onLoadedRef.current(true);
      }
    };

    loadData();
  }, []);

  return {}; // Marcador de fase; el estado `hasLoaded` vive en App.
}
