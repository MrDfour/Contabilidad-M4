/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { Journal, Account, FixedAsset, INITIAL_ACCOUNTS, Poliza } from '../types';
import { loadFromStorage, migrateFromLocalStorage } from '../services/storageService';
import { migrateJournalsToPolizas } from '../lib/migrateJournalsToPolizas';

/**
 * Hook de HYDRATION inicial (Fase 2 del plan de modularización).
 *
 * Dueño de: NINGUNA clave de storage (orquesta la carga inicial y delega cada clave
 * al hook dueño — ver tabla de propiedad en ARCHITECTURE.md §3).
 *
 * Pólizas (Fase 2 de PLAN_POLIZAS.md): carga `contasis_polizas`; si no existe y
 * el flag `contasis_polizas_migrated` tampoco, ejecuta la migración ONE-SHOT
 * `migrateJournalsToPolizas(journals, accounts)` y comanda el flag vía applier.
 * El flag se consulta aquí por lectura; su ESCRITURA solo nace en usePolizas
 * (anti-R1). Con flag presente y clave ausente NO re-migra (D-2: respetaría el
 * borrado total de pólizas del usuario).
 *
 * Protege R2: marca `onLoaded` SOLO tras terminar la hidratación (o su fallback),
 * para que NO se persista un catálogo/estado vacío antes de cargar.
 *
 * Se declara al final de la cadena de hooks en App (después de useCatalog) porque
 * su objeto de appliers referencia setters generados por los otros hooks; el ref
 * interno garantiza que el efecto de montaje vea la versión estable final.
 */
const POLIZAS_KEY = 'contasis_polizas';
const POLIZAS_MIGRATED_KEY = 'contasis_polizas_migrated';

export interface AppDataAppliers {
  setJournals: (journals: Journal[]) => void;
  setActiveJournalId: (id: string) => void;
  setPolizas: (polizas: Poliza[]) => void;
  markPolizasMigrated: () => void;
  setFinalInventories: (inventories: Record<string, number>) => void;
  setFixedAssets: (assets: FixedAsset[]) => void;
  setAccounts: (accounts: Account[]) => void;
}

/** Normaliza lo devuelto por el storage a un array (Electron/Capacitor pueden traer JSON crudo). */
const asArray = (raw: unknown): unknown[] =>
  Array.isArray(raw) ? (raw as unknown[]) : JSON.parse(raw as string) as unknown[];

export function useAppData(appliers: AppDataAppliers, onLoaded: (ready: boolean) => void) {
  // Capturados en ref: el efecto corre una sola vez en montaje y debe ver siempre
  // la versión más reciente de los appliers.
  const appliersRef = useRef(appliers);
  appliersRef.current = appliers;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    const loadData = async () => {
      // Variables para la migración de pólizas (necesitan journals y catálogo).
      let journalsCargadas: Journal[] = [];
      let catalogoCargado: Account[] = [];

      try {
        await migrateFromLocalStorage();

        // --- Diarios (legacy de la captura; fuente de la migración de pólizas) ---
        const savedJournals = await loadFromStorage('contasis_journals');
        if (savedJournals) {
          const parsed = asArray(savedJournals) as Journal[];
          journalsCargadas = parsed;
          appliersRef.current.setJournals(parsed);
          if (parsed.length > 0) appliersRef.current.setActiveJournalId(parsed[0].id);
        } else {
          // Crear diario inicial si no existe nada
          const initialJournal: Journal = { id: crypto.randomUUID(), name: 'Diario Inicial', entries: [] };
          journalsCargadas = [initialJournal];
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
            catalogoCargado = parsed;
            appliersRef.current.setAccounts(parsed);
          } else {
            catalogoCargado = INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true }));
            appliersRef.current.setAccounts(catalogoCargado);
          }
        } else {
          catalogoCargado = INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true }));
          appliersRef.current.setAccounts(catalogoCargado);
        }

        // --- Pólizas (nueva unidad de captura): carga o migración ONE-SHOT ---
        const savedPolizas = await loadFromStorage(POLIZAS_KEY);
        if (savedPolizas) {
          appliersRef.current.setPolizas(asArray(savedPolizas) as Poliza[]);
        } else {
          const migrationDone = await loadFromStorage(POLIZAS_MIGRATED_KEY);
          if (migrationDone) {
            // Flag presente + clave ausente: el usuario borró todas las pólizas
            // tras migrar. NO re-migrar (D-2 de PLAN_POLIZAS.md).
            appliersRef.current.setPolizas([]);
          } else {
            const migradas = migrateJournalsToPolizas(journalsCargadas, catalogoCargado);
            appliersRef.current.setPolizas(migradas);
            appliersRef.current.markPolizasMigrated();
          }
        }

        onLoadedRef.current(true);
      } catch (error) {
        console.error("Error crítico al cargar datos desde el almacenamiento:", error);
        // Fallback seguro (idéntico al original; INITIAL_ACCOUNTS SIN mapeo isReadOnly aquí)
        const initialJournal: Journal = { id: crypto.randomUUID(), name: 'Diario Inicial', entries: [] };
        appliersRef.current.setJournals([initialJournal]);
        appliersRef.current.setActiveJournalId(initialJournal.id);
        appliersRef.current.setAccounts(INITIAL_ACCOUNTS);
        // Pólizas: sin datos confiables → vacías + flag (evita re-migración con datos corrompidos)
        appliersRef.current.setPolizas([]);
        appliersRef.current.markPolizasMigrated();
        onLoadedRef.current(true);
      }
    };

    loadData();
  }, []);

  return {}; // Marcador de fase; el estado `hasLoaded` vive en App.
}
