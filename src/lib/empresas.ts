/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helpers puros del modelo multi-cliente (C-2 de PLAN_MULTI_CLIENTE.md).
 *
 * Cada dominio de datos VIVE POR CLIENTE con sufijo de empresaId:
 *   `contasis_polizas_<id>`, `contasis_accounts_<id>`, etc.
 * Las claves globales antiguas (sin sufijo) quedan como ARCHIVO histórico
 * tras la migración one-shot y solo se leen para migrar (C-2).
 */

/** Claves de dominio POR CLIENTE (bases sin sufijo; la clave llega con `__<id>`). */
export const BASES_POR_EMPRESA = [
  'contasis_polizas',
  'contasis_accounts',
  'contasis_fixed_assets',
  'contasis_final_inventories'
] as const;

/** Compone la clave de storage de un dominio para un cliente (C-2). */
export const clavePorEmpresa = (base: string, empresaId: string): string => {
  if (!empresaId) return base;
  return `${base}_${empresaId}`;
};

/** Normaliza lo leído de storage a array: string JSON válida, array crudo o [] si corrupto/ausente. */
export const arrayDe = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/** Normaliza lo leído de storage a objeto: objeto crudo o {} si array/corrupto/ausente. */
export const objetoDe = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
};
