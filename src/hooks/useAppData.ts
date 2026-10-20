/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { Account, FixedAsset, INITIAL_ACCOUNTS, Journal, Poliza } from '../types';
import { loadFromStorage, migrateFromLocalStorage } from '../services/storageService';
import { migrateJournalsToPolizas } from '../lib/migrateJournalsToPolizas';
import { migrateCatalogToGlobal } from '../lib/migrateCatalogToGlobal';
import { inventoriesToGeneral } from './useInventories';

/**
 * Hook de HYDRATION inicial (Fase 2 del plan de modularización; Fase 5 simplificado).
 *
 * Dueño de: NINGUNA clave de storage (orquesta la carga inicial y delega cada clave
 * al hook dueño — ver tabla de propiedad en ARCHITECTURE.md §3).
 *
 * Cambios de Fase 5 (PLAN_POLIZAS.md):
 * - SIN diario inicial: el dominio Journal se retiró de RAM. `contasis_journals`
 *   solo se LEE para las migraciones one-shot (D-2: archivo histórico intacto).
 * - D-12: consolidación one-shot del catálogo (subcuentas de diarios →
 *   `contasis_accounts`), gobernada por el flag `contasis_catalog_migrated`
 *   cuyo dueño es useCatalog (anti-R1).
 * - D-13: inventarios legacy (claves por journalId) se normalizan a la clave
 *   `'general'` vía el helper puro `inventoriesToGeneral`.
 * - Pólizas: carga `contasis_polizas`; si no existe y el flag
 *   `contasis_polizas_migrated` tampoco, ejecuta la migración ONE-SHOT
 *   `migrateJournalsToPolizas(journals, accounts)`. El flag se consulta aquí por
 *   lectura; su ESCRITURA solo nace en usePolizas (anti-R1). Con flag presente y
 *   clave ausente NO re-migra (D-2: respetaría el borrado total de pólizas).
 *
 * Protege R2: marca `onLoaded` SOLO tras terminar la hidratación (o su fallback),
 * para que ningún hook persista vacíos antes de tiempo.
 */
const POLIZAS_KEY = 'contasis_polizas';
const POLIZAS_MIGRATED_KEY = 'contasis_polizas_migrated';
const CATALOG_MIGRATED_KEY = 'contasis_catalog_migrated';

export interface AppDataAppliers {
  setPolizas: (polizas: Poliza[]) => void;
  markPolizasMigrated: () => void;
  setFinalInventories: (inventories: Record<string, number>) => void;
  setFixedAssets: (assets: FixedAsset[]) => void;
  setAccounts: (accounts: Account[]) => void;
  markCatalogMigrated: () => void;
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
      // Variables para las migraciones one-shot (necesitan journals y catálogo).
      let journalsCargadas: Journal[] = [];
      let catalogoCargado: Account[] = [];

      try {
        await migrateFromLocalStorage();

        // --- Diarios legacy (solo LECTURA — archivo histórico, D-2/D-15) ---
        const savedJournals = await loadFromStorage('contasis_journals');
        if (savedJournals) {
          journalsCargadas = asArray(savedJournals) as Journal[];
        }

        const savedInventories = await loadFromStorage('contasis_final_inventories');
        if (savedInventories) {
          const parsed = typeof savedInventories === 'string' ? JSON.parse(savedInventories) : savedInventories;
          // D-13: formato legacy (claves por journalId) → clave única 'general'
          appliersRef.current.setFinalInventories(inventoriesToGeneral(parsed as Record<string, number>));
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
          } else {
            catalogoCargado = INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true }));
          }
        } else {
          catalogoCargado = INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true }));
        }

        // --- D-12: consolidación ONE-SHOT del catálogo (gobierna el flag de useCatalog) ---
        const catalogMigrationDone = await loadFromStorage(CATALOG_MIGRATED_KEY);
        if (!catalogMigrationDone) {
          catalogoCargado = migrateCatalogToGlobal(catalogoCargado, journalsCargadas);
          appliersRef.current.setAccounts(catalogoCargado);
          appliersRef.current.markCatalogMigrated();
        } else {
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
