/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { JournalEntry, Account, FixedAsset, TAccountsData, TAccountColumns, Poliza, PartidaPoliza, TipoPoliza } from '../types';
import { normalizeAmount } from './format';

/**
 * Cálculos contables como funciones puras (sin React, sin storage, sin DOM).
 * Fuente ÚNICA de la derivación: Cuentas T y saldos por naturaleza de la cuenta.
 * Ver REFACTORING_PLAN.md, Fase 1 — habilita pruebas unitarias en Node (Fase 5).
 */

/** Agrupa los movimientos de un diario en Cuentas T (debe/haber con ref del asiento, 1-index). */
export const buildTAccountsData = (entries: JournalEntry[]): TAccountsData => {
  const data: TAccountsData = {};

  entries.forEach((entry, index) => {
    entry.movements.forEach(mov => {
      if (!data[mov.accountId]) {
        data[mov.accountId] = { debits: [], credits: [] };
      }
      const accountData: TAccountColumns = data[mov.accountId];
      if (mov.type === 'debit') {
        accountData.debits.push({ amount: normalizeAmount(mov.amount), ref: index + 1 });
      } else {
        accountData.credits.push({ amount: normalizeAmount(mov.amount), ref: index + 1 });
      }
    });
  });

  return data;
};

/**
 * Saldos por cuenta con su natureza estándar:
 * deudora para activo/gasto (debe − haber), acreedora para pasivo/capital/ingreso (haber − debe).
 */
export const computeAccountBalances = (
  tAccountsData: TAccountsData,
  accounts: Account[]
): Record<string, number> => {
  const balances: Record<string, number> = {};
  Object.entries(tAccountsData).forEach(([accountId, data]) => {
    const totalDebit = normalizeAmount(data.debits.reduce((sum, d) => sum + d.amount, 0));
    const totalCredit = normalizeAmount(data.credits.reduce((sum, c) => sum + c.amount, 0));
    const account = accounts.find(a => a.id === accountId);

    if (account?.type === 'asset' || account?.type === 'expense') {
      balances[accountId] = normalizeAmount(totalDebit - totalCredit);
    } else {
      balances[accountId] = normalizeAmount(totalCredit - totalDebit);
    }
  });
  return balances;
};

/** Depreciación mensual fiscal: MOI × tasa anual ÷ 12. */
export const calculateMonthlyDepreciation = (asset: FixedAsset): number => {
  return (asset.originalAmount * asset.fiscalRate) / 12;
};

/**
 * Deducción fiscal de inversiones (Art. 31 LISR): MOI × tasa × factor de actualización INPC,
 * con el factor TRUNCADO (no redondeado) a 4 decimales.
 */
export const calculateFiscalDeduction = (
  asset: FixedAsset,
  inpcUltimoMesMitadPeriodo: number,
  inpcMesAdquisicion: number
): number => {
  const factorActualizacion = inpcUltimoMesMitadPeriodo / inpcMesAdquisicion;
  const factorTruncado = Math.trunc(factorActualizacion * 10000) / 10000;
  return (asset.originalAmount * asset.fiscalRate) * factorTruncado;
};

/**
 * Valida la partida doble de una póliza (Fase 1 módulo Pólizas).
 * Función pura: no toca estado. Tolerante a ambas columnas en 0.
 * Una póliza sin partidas NO se considera balanceada.
 */
export const validatePolizaBalance = (
  partidas: PartidaPoliza[]
): { isBalanced: boolean; totalDebe: number; totalHaber: number; difference: number } => {
  const totalDebe = normalizeAmount(partidas.reduce((sum, p) => sum + p.debit, 0));
  const totalHaber = normalizeAmount(partidas.reduce((sum, p) => sum + p.credit, 0));
  const difference = normalizeAmount(totalDebe - totalHaber);
  return {
    isBalanced: partidas.length > 0 && difference === 0,
    totalDebe,
    totalHaber,
    difference
  };
};

/**
 * Proyección de lectura: Poliza[] → JournalEntry[] (D-6: NO ordena — respeta el
 * orden de entrada; el orden cronológico lo aplica el consumidor).
 * Partida 0/0 no genera movimiento (defensa pasiva contra pólizas inválidas).
 */
export const flattenPolizasToJournalEntries = (polizas: Poliza[]): JournalEntry[] => {
  return polizas.map(poliza => ({
    id: poliza.id,
    date: poliza.fecha,
    description: poliza.concepto,
    policyType: poliza.tipo,
    movements: poliza.partidas
      .filter(p => p.debit > 0 || p.credit > 0)
      .map(p => ({
        accountId: p.accountId,
        type: p.debit > 0 ? ('debit' as const) : ('credit' as const),
        amount: p.debit > 0 ? p.debit : p.credit,
        uuidCFDI: p.uuidCFDI,
        rfcTercero: p.rfcTercero
      }))
  }));
};

/** Siguiente folio disponible para un tipo: max(folio) + 1, 1 si el tipo no tiene pólizas. */
export const nextPolizaFolio = (polizas: Poliza[], tipo: TipoPoliza): number => {
  const max = polizas.reduce(
    (acc, p) => (p.tipo === tipo && p.folio > acc ? p.folio : acc),
    0
  );
  return max + 1;
};

/** Folio para presentación: "ING-0001" | "EGR-0001" | "DIA-0001" (solo display, no storage). */
export const formatPolizaFolio = (poliza: Poliza): string => {
  const prefix = { ingreso: 'ING', egreso: 'EGR', diario: 'DIA' }[poliza.tipo];
  return `${prefix}-${String(poliza.folio).padStart(4, '0')}`;
};
