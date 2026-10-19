/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Account, JournalEntry } from '../types';
import { normalizeString, parseImportedAmount } from './format';

export interface JournalImportResult {
  entries: JournalEntry[];
  /** Nombres/códigos de cuenta que no coincidieron con el catálogo (para el mensaje de error). */
  unmatchedAccounts: string[];
}

const REQUIRED_COLUMNS = ['FECHA', 'GLOSA', 'CUENTA', 'DEBE', 'HABER'];
const UNKNOWN_DATE_FALLBACK = () => new Date().toISOString().split('T')[0];

/** Normaliza encabezados (mayúsculas/variantes comunes) de las filas del Excel. */
function normalizeRowKeys(data: Record<string, any>[]): Record<string, any>[] {
  return data.map(row => {
    const newRow: any = {};
    Object.keys(row).forEach(key => {
      const k = key.toUpperCase().trim()
        .replace(/\s+/g, '_')
        .replace('CONCEPTO', 'GLOSA')
        .replace('MOVIMIENTO', 'ASIENTO_ID')
        .replace('NO._DE_MOVIMIENTO', 'ASIENTO_ID')
        .replace('NO_DE_MOVIMIENTO', 'ASIENTO_ID');
      newRow[k] = row[key];
    });
    return newRow;
  });
}

/** Convierte la fecha cruda del Excel (Date | serial | string) a ISO yyyy-mm-dd. */
function normalizeImportedDate(dateVal: any): string {
  if (dateVal instanceof Date) {
    return dateVal.toISOString().split('T')[0];
  }
  if (typeof dateVal === 'number') {
    // Fecha serial de Excel
    const utc = new Date((dateVal - 25569) * 86400 * 1000);
    return utc.toISOString().split('T')[0];
  }
  return dateVal;
}

/**
 * Parser del libro de Excel de importación del Libro Diario (Fase 4: extraído de JournalView).
 * VALIDA contra el catálogo de cuentas: una fila solo produce movimiento si su cuenta
 * existe por nombre normalizado o por código; las cuentas desconocidas se reportan.
 * Lanza Error con mensajes en español si el archivo no cumple el formato de la plantilla
 * (el llamador decide cómo presentarlo).
 */
export function parseJournalImport(
  data: Record<string, any>[],
  accounts: Account[]
): JournalImportResult {
  if (data.length === 0) {
    throw new Error('El archivo está vacío o no tiene el formato correcto.');
  }

  // Handle potential case sensitivity in header
  const actualKeys = Object.keys(data[0]).map(k => k.toUpperCase());
  const hasRequiredColumns = REQUIRED_COLUMNS.every(col => actualKeys.includes(col));
  if (!hasRequiredColumns) {
    throw new Error('Formato inválido. Asegúrate de usar la plantilla descargada con las columnas: ' + REQUIRED_COLUMNS.join(', '));
  }

  const normalizedData = normalizeRowKeys(data);
  const groupedEntries: Record<string, any> = {};
  const unmatchedAccounts = new Set<string>();

  let lastId = "";
  let lastDate: any = null;
  let lastGlosa = "";

  normalizedData.forEach((row: any, index: number) => {
    // Skip truly empty rows (no account and no values)
    if (!row.CUENTA && !row.DEBE && !row.HABER) return;

    // Carry-forward logic for empty cells
    const currentId = (row.ASIENTO_ID !== undefined && row.ASIENTO_ID !== null && row.ASIENTO_ID !== "") ? String(row.ASIENTO_ID) : "";

    if (currentId !== "") lastId = currentId;
    if (row.FECHA) lastDate = row.FECHA;
    if (row.GLOSA) lastGlosa = row.GLOSA;

    // Determine which movement this row belongs to
    const groupKey = lastId || `INITIAL_GROUP_${index}`;

    if (!groupedEntries[groupKey]) {
      const dateVal = lastDate ? normalizeImportedDate(lastDate) : UNKNOWN_DATE_FALLBACK();
      groupedEntries[groupKey] = {
        date: dateVal,
        description: lastGlosa || "Asiento Importado",
        movements: []
      };
    }

    const accountSearch = String(row.CUENTA || "").trim();
    if (!accountSearch) return;

    const account = accounts.find(a =>
      normalizeString(a.name) === normalizeString(accountSearch) ||
      a.code === accountSearch
    );

    if (account) {
      const debe = parseImportedAmount(row.DEBE);
      const haber = parseImportedAmount(row.HABER);

      if (debe > 0) {
        groupedEntries[groupKey].movements.push({ accountId: account.id, type: 'debit', amount: debe });
      }
      if (haber > 0) {
        groupedEntries[groupKey].movements.push({ accountId: account.id, type: 'credit', amount: haber });
      }
    } else {
      unmatchedAccounts.add(accountSearch);
    }
  });

  const entries: JournalEntry[] = Object.values(groupedEntries)
    .filter((entry: any) => entry.movements.length > 0)
    .map(entry => ({
      ...entry,
      id: crypto.randomUUID(),
    }));

  return { entries, unmatchedAccounts: Array.from(unmatchedAccounts) };
}
