/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Account, Journal } from '../types';

/**
 * Consolidación del catálogo (D-12 de PLAN_POLIZAS.md): función PURA que fusiona
 * las subcuentas de TODOS los diarios legacy en el catálogo global.
 *
 * Reglas congeladas por tests:
 * - Dedup por `code`: si el código ya existe en el catálogo base (global readonly
 *   o cuenta creada por el usuario) la subcuenta NO se duplica.
 * - Las cuentas antes locales llegan con `isReadOnly: false` (editables).
 * - NO muta entradas; retorna una lista nueva (idempotente: correrla dos veces
 *   con el mismo input produce el mismo resultado).
 * - Orden determinista: catálogo base primero; después las subcuentas nuevas en
 *   orden de almacenamiento de los diarios.
 */
export const migrateCatalogToGlobal = (
  catalogoBase: Account[],
  journals: Journal[]
): Account[] => {
  const codigos = new Set(catalogoBase.map(a => a.code));
  const consolidadas = [...catalogoBase];

  for (const journal of journals) {
    const subcuentas = journal?.subAccounts ?? [];
    for (const subcuenta of subcuentas) {
      if (codigos.has(subcuenta.code)) continue;
      consolidadas.push({ ...subcuenta, isReadOnly: false });
      codigos.add(subcuenta.code);
    }
  }

  return consolidadas;
};
