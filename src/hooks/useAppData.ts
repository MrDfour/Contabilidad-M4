/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { Account, EstadoEmpresas, FixedAsset, INITIAL_ACCOUNTS, Journal, Poliza } from '../types';
import { loadFromStorage, migrateFromLocalStorage } from '../services/storageService';
import { migrateJournalsToPolizas } from '../lib/migrateJournalsToPolizas';
import { migrateCatalogToGlobal } from '../lib/migrateCatalogToGlobal';
import { inventoriesToGeneral } from './useInventories';
import { clavePorEmpresa } from '../lib/empresas';

/**
 * Hook de HYDRATION + ORQUESTADOR MULTI-CLIENTE (Fase 3 de PLAN_MULTI_CLIENTE.md).
 *
 * Dueño de: NINGUNA clave de storage (orquesta la carga y delega cada clave al
 * hook dueño — ver tabla de propiedad en ARCHITECTURE.md §3).
 *
 * Flujo de arranque (efecto de montaje):
 *  1. `migrateFromLocalStorage` (legado localStorage → plataforma, intacto).
 *  2. Sin flag `contasis_empresas_migrated` → migración ONE-SHOT (C-2): los
 *     contenidos históricos de las claves GLOBALES (sin sufijo; ARCHIVO) se
 *     copian a las claves por cliente de una empresa por defecto "Mi Empresa".
 *     Ahí corren por ÚNICA vez la migración de diarios legacy → pólizas (D-2,
 *     respetando `contasis_polizas_migrated`) y la consolidación del catálogo
 *     (D-12, respetando `contasis_catalog_migrated`). Las claves globales
 *     quedan INTACTAS (archivo histórico; nunca se borran).
 *  3. Con flag → carga metadatos de `contasis_empresas` (dueño: useEmpresas)
 *     hidratándolos, y los 4 dominios del cliente ACTIVO (claves por cliente).
 *     Metadatos inválidos → fallback: cliente por defecto nuevo en RAM SIN
 *     escribir claves de dominio (no se destruye nada del storage).
 *
 * Cambio de cliente (C-4): el tercer parámetro `activaId` cambia por acción
 * del usuario → `onLoaded(false)` + recarga de los 4 dominios desde las claves
 * del cliente destino + `onLoaded(true)`. App usa ese boolean como `canSave`
 * de TODOS los dominios → ninguna puerta escribe el estado vacío transitorio.
 * La asignación de `activaId` que hace el PROPIO arranque no dispara recarga
 * (el ref de arranque distingue el primer ciclo).
 */
const EMPRESAS_KEY = 'contasis_empresas';
const EMPRESAS_MIGRATED_KEY = 'contasis_empresas_migrated';

// Claves globales legacy — ARCHIVO histórico (C-2): solo se LEEN en la migración one-shot.
const LEGACY_KEY = {
  polizas: 'contasis_polizas',
  accounts: 'contasis_accounts',
  assets: 'contasis_fixed_assets',
  inventories: 'contasis_final_inventories',
  journals: 'contasis_journals',
  polizasFlag: 'contasis_polizas_migrated',
  catalogFlag: 'contasis_catalog_migrated'
} as const;

export interface AppDataAppliers {
  // --- clientes (metadatos; dueño: useEmpresas) ---
  hydrateEmpresas: (estado: EstadoEmpresas) => void;
  markEmpresasMigrated: () => void;
  // --- dominios del cliente ACTIVO (RAM) ---
  setPolizas: (polizas: Poliza[]) => void;
  setFinalInventories: (inventories: Record<string, number>) => void;
  setFixedAssets: (assets: FixedAsset[]) => void;
  setAccounts: (accounts: Account[]) => void;
  // --- escritura por CLIENTE (boot-migración; anti-R1: viaja por el dueño) ---
  hydratePolizasEmpresa: (empresaId: string, valor: Poliza[]) => void;
  hydrateInventoriesEmpresa: (empresaId: string, valor: Record<string, number>) => void;
  hydrateAccountsEmpresa: (empresaId: string, valor: Account[]) => void;
  // activos fijos viven en App (dueño del dominio): applier que compone su clave
  hydrateAssetsEmpresa: (empresaId: string, valor: FixedAsset[]) => void;
}

/** Normaliza lo devuelto por el storage a un array (Electron/Capacitor traen JSON crudo). */
const asArray = (raw: unknown): unknown[] =>
  Array.isArray(raw) ? (raw as unknown[]) : (JSON.parse(String(raw)) as unknown[]);

const asParsed = (raw: unknown): unknown =>
  typeof raw === 'string' ? JSON.parse(raw) : raw;

/** Catálogo del cliente: ausente/vacío/corrupto → base readonly (la recuperación quirúrgica sostiene el resto). */
const normalizaCatalogo = (raw: unknown): Account[] => {
  try {
    if (raw != null) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Account[];
    }
  } catch {
    // corrupto → base readonly
  }
  return INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true }));
};

/** Lectura defensiva de un array por cliente: ausente o corrupto → []. */
const leerArray = async (key: string): Promise<unknown[]> => {
  const raw = await loadFromStorage(key);
  if (raw == null) return [];
  return asArray(raw);
};

/** Lectura defensiva de un objeto por cliente: ausente → {}; corrupto → {}. */
const leerObjeto = async (key: string): Promise<Record<string, unknown>> => {
  const raw = await loadFromStorage(key);
  if (raw == null) return {};
  try {
    const parsed = asParsed(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

/**
 * Crea el cargador de los 4 dominios de UN cliente. La normalización de
 * catálogo e inventario (D-13) es idéntica en arranque y cambio de cliente.
 */
const crearCargadorDominios = (appliersRef: { current: AppDataAppliers }) => {
  return async (empresaId: string): Promise<void> => {
    const [polizas, accountsRaw, assets, inventoriesRaw] = await Promise.all([
      leerArray(clavePorEmpresa('contasis_polizas', empresaId)),
      loadFromStorage(clavePorEmpresa('contasis_accounts', empresaId)),
      leerArray(clavePorEmpresa('contasis_fixed_assets', empresaId)),
      leerObjeto(clavePorEmpresa('contasis_final_inventories', empresaId))
    ]);
    const ap = appliersRef.current;
    ap.setPolizas(polizas as Poliza[]);
    ap.setAccounts(normalizaCatalogo(accountsRaw));
    ap.setFixedAssets(assets as FixedAsset[]);
    ap.setFinalInventories(inventoriesToGeneral(inventoriesRaw as Record<string, number>));
  };
};

export function useAppData(
  appliers: AppDataAppliers,
  onLoaded: (ready: boolean) => void,
  activaId: string | null
) {
  // Capturados en ref: los efectos deben ver siempre la versión más reciente
  // de los appliers y del callback.
  const appliersRef = useRef(appliers);
  appliersRef.current = appliers;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const cargarDominiosRef = useRef(crearCargadorDominios(appliersRef));

  // --- Cambio de cliente (C-4): el ref distingue la asignación del arranque ---
  const activaAnteriorRef = useRef<string | null | 'inicial'>('inicial');

  useEffect(() => {
    const loadData = async () => {
      try {
        await migrateFromLocalStorage();

        const migracionPendiente = !(await loadFromStorage(EMPRESAS_MIGRATED_KEY));
        if (migracionPendiente) {
          await migrarLegacyAEmpresaDefault();
        } else {
          const meta = await leerEstadoEmpresas();
          if (!meta) {
            // C-2: con flag, metadatos ausentes o corruptos → cliente por
            // defecto nuevo SOLO en RAM (no se escribe ninguna clave de
            // dominio: el storage real queda intacto ante recargas).
            crearClienteDefaultEnRam();
            console.error('Metadatos de clientes ausentes o corruptos; se inicia un cliente vacío (las claves por cliente quedan como archivo).');
          } else {
            appliersRef.current.hydrateEmpresas(meta);
            if (meta.activaId) {
              cargarDominiosRef.current(meta.activaId);
            }
          }
        }
        onLoadedRef.current(true);
      } catch (error) {
        console.error('Error crítico al cargar datos desde el almacenamiento:', error);
        crearClienteDefaultEnRam();
        onLoadedRef.current(true);
      }
    };

    /** Migración ONE-SHOT legacy → empresa por defecto "Mi Empresa" (C-2). */
    const migrarLegacyAEmpresaDefault = async () => {
      const id = crypto.randomUUID();

      // --- Archivo histórico: lecturas puras, NUNCA se escribe estas claves ---
      let journals: Journal[] = [];
      try {
        const rawJournals = await loadFromStorage(LEGACY_KEY.journals);
        if (rawJournals) journals = asArray(rawJournals) as Journal[];
      } catch {
        journals = [];
      }

      // Pólizas: conforme al estado previo de la APP (contasis_polizas ya
      // vencido por la migración de diarios de PLAN_POLIZAS.md; si ausente,
      // corre ahí por única vez respetando su flag).
      let polizasLegacy: Poliza[];
      try {
        const rawPolizas = await loadFromStorage(LEGACY_KEY.polizas);
        if (rawPolizas) {
          polizasLegacy = asArray(rawPolizas) as Poliza[];
        } else if (await loadFromStorage(LEGACY_KEY.polizasFlag)) {
          // Flag presente + clave ausente: el usuario borró todo tras migrar → NO re-migrar (D-2).
          polizasLegacy = [];
        } else {
          polizasLegacy = migrateJournalsToPolizas(journals, normalizaCatalogo(await loadFromStorage(LEGACY_KEY.accounts)));
        }
      } catch {
        polizasLegacy = [];
      }

      // Catálogo del cliente defecto (D-12 subsumida: corre única vez si su flag no existe).
      let accountsLegacy = normalizaCatalogo(await loadFromStorage(LEGACY_KEY.accounts));
      if (!(await loadFromStorage(LEGACY_KEY.catalogFlag))) {
        accountsLegacy = migrateCatalogToGlobal(accountsLegacy, journals);
      }

      const inventoriesLegacy = inventoriesToGeneral(
        (await leerObjeto(LEGACY_KEY.inventories)) as Record<string, number>
      );

      let assetsLegacy: FixedAsset[] = [];
      try {
        const rawAssets = await loadFromStorage(LEGACY_KEY.assets);
        if (rawAssets) assetsLegacy = asArray(rawAssets) as FixedAsset[];
      } catch {
        assetsLegacy = [];
      }

      // --- Escrituras por cliente: SIEMPRE vía el dueño de cada clave (C-5) ---
      const ap = appliersRef.current;
      ap.hydrateAccountsEmpresa(id, accountsLegacy);
      ap.hydratePolizasEmpresa(id, polizasLegacy);
      ap.hydrateAssetsEmpresa(id, assetsLegacy);
      ap.hydrateInventoriesEmpresa(id, inventoriesLegacy);
      ap.setAccounts(accountsLegacy);
      ap.setPolizas(polizasLegacy);
      ap.setFixedAssets(assetsLegacy);
      ap.setFinalInventories(inventoriesLegacy);

      ap.hydrateEmpresas({ activaId: id, empresas: [{ id, nombre: 'Mi Empresa' }] });
      ap.markEmpresasMigrated();
    };

    /** Valida los metadatos de `contasis_empresas`; null si no son utilizables. */
    const leerEstadoEmpresas = async (): Promise<EstadoEmpresas | null> => {
      try {
        const raw = await loadFromStorage(EMPRESAS_KEY);
        if (raw == null) return null;
        const parsed = asParsed(raw) as Partial<EstadoEmpresas>;
        if (!parsed || !Array.isArray(parsed.empresas) || parsed.empresas.length === 0) return null;
        const validaActiva = parsed.empresas.some(e => e && e.id === parsed.activaId);
        return {
          activaId: validaActiva ? (parsed.activaId as string) : parsed.empresas[0].id,
          empresas: parsed.empresas
        };
      } catch {
        return null;
      }
    };

    /** Fallback defensivo: cliente por defecto NUEVO en RAM, sin tocar claves de dominio. */
    const crearClienteDefaultEnRam = () => {
      const id = crypto.randomUUID();
      const ap = appliersRef.current;
      ap.setAccounts(INITIAL_ACCOUNTS);
      ap.setPolizas([]);
      ap.setFinalInventories({});
      ap.setFixedAssets([]);
      ap.hydrateEmpresas({ activaId: id, empresas: [{ id, nombre: 'Mi Empresa' }] });
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Cambio de cliente (C-4): recarga orquestada de los 4 dominios ---
  useEffect(() => {
    const previo = activaAnteriorRef.current;
    activaAnteriorRef.current = activaId;

    // 'inicial' (montaje) y null (asignación del arranque) NO disparan recarga:
    // el boot hidrata los dominios por sí mismo.
    if (previo === 'inicial' || previo === null || previo === activaId) return;
    if (!activaId) return;

    const recargar = async () => {
      onLoadedRef.current(false);
      try {
        await cargarDominiosRef.current(activaId);
      } catch (error) {
        console.error(`Error al cargar los datos del cliente ${activaId}:`, error);
        const ap = appliersRef.current;
        ap.setPolizas([]);
        ap.setAccounts(normalizaCatalogo(null));
        ap.setFixedAssets([]);
        ap.setFinalInventories({});
      }
      onLoadedRef.current(true);
    };
    recargar();
  }, [activaId]);

  return {};
}

export { EMPRESAS_KEY, EMPRESAS_MIGRATED_KEY };
