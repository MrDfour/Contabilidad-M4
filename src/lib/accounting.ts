/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { JournalEntry, Account, FixedAsset, TAccountsData, TAccountColumns } from '../types';
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
