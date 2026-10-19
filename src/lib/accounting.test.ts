/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  buildTAccountsData,
  computeAccountBalances,
  calculateMonthlyDepreciation,
  calculateFiscalDeduction
} from './accounting';
import type { Account, FixedAsset, JournalEntry, Movement } from '../types';

/** Fábrica de asiento con id determinista y movimientos dados. */
const entry = (id: string, movements: Movement[], date = '2024-01-15'): JournalEntry => ({
  id, date, description: `Asiento ${id}`, movements
});

const acc = (id: string, type: Account['type'], code = '1000'): Account => ({
  id, code, name: `Cuenta ${id}`, type
});

describe('buildTAccountsData', () => {
  it('separa debe y haber y referencia el asiento 1-index (ref = índice + 1)', () => {
    const data = buildTAccountsData([
      entry('e1', [
        { accountId: 'a1', type: 'debit', amount: 500 },
        { accountId: 'a2', type: 'credit', amount: 500 }
      ]),
      entry('e2', [
        { accountId: 'a1', type: 'debit', amount: 200.005 }
      ])
    ]);

    expect(data['a1'].debits).toEqual([
      { amount: 500, ref: 1 },
      { amount: 200.01, ref: 2 } // normalizeAmount redondea a 2 decimales
    ]);
    expect(data['a1'].credits).toEqual([]);
    expect(data['a2'].credits).toEqual([{ amount: 500, ref: 1 }]);
  });

  it('agrega movimientos en la misma cuenta a través de varios asientos', () => {
    const data = buildTAccountsData([
      entry('e1', [{ accountId: 'a1', type: 'credit', amount: 100 }]),
      entry('e2', [{ accountId: 'a1', type: 'credit', amount: 50 }])
    ]);
    expect(data['a1'].credits.map(c => c.amount)).toEqual([100, 50]);
  });

  it('devuelve objeto vacío sin movimientos', () => {
    expect(buildTAccountsData([])).toEqual({});
  });
});

describe('computeAccountBalances', () => {
  const tData = buildTAccountsData([
    entry('e1', [
      { accountId: 'activo', type: 'debit', amount: 1000 },
      { accountId: 'activo', type: 'credit', amount: 200 },
      { accountId: 'pasivo', type: 'credit', amount: 800 }
    ])
  ]);

  it('cuenta de ACTIVO: saldo = debe − haber (naturaleza deudora)', () => {
    expect(computeAccountBalances(tData, [acc('activo', 'asset')]))
      .toMatchObject({ activo: 800 });
  });

  it('cuenta de GASTO: saldo = debe − haber (naturaleza deudora)', () => {
    expect(computeAccountBalances(tData, [acc('activo', 'expense')]))
      .toMatchObject({ activo: 800 });
  });

  it('cuenta de PASIVO: saldo = haber − debe (naturaleza acreedora)', () => {
    expect(computeAccountBalances(tData, [acc('pasivo', 'liability')]))
      .toMatchObject({ pasivo: 800 });
  });

  it('cuenta con id ausente en el catálogo: acreedora por defecto', () => {
    expect(computeAccountBalances(tData, []))
      .toMatchObject({ activo: -800, pasivo: 800 });
  });
});

describe('calculateMonthlyDepreciation', () => {
  const asset = (): FixedAsset => ({
    id: 'fa1',
    name: 'Equipo',
    acquisitionDate: '2024-01-01',
    originalAmount: 10000,
    assetAccountId: 'anc-4',
    accumulatedDeprAccountId: 'anc-15',
    expenseAccountId: 'g1',
    fiscalRate: 0.30,
    isDisposed: false
  });

  it('MOC × tasa anual ÷ 12', () => {
    expect(calculateMonthlyDepreciation(asset())).toBe(250); // 10000 * 0.30 / 12
  });
});

describe('calculateFiscalDeduction (Art. 31 LISR, factor truncado a 4 dec.)', () => {
  const asset: FixedAsset = {
    id: 'fa1',
    name: 'Edificio',
    acquisitionDate: '2024-01-01',
    originalAmount: 10000,
    assetAccountId: 'anc-2',
    accumulatedDeprAccountId: 'anc-13',
    expenseAccountId: 'g1',
    fiscalRate: 0.3,
    isDisposed: false
  };

  it('trunca (no redondea) el factor: 1.10123456 → 1.1012', () => {
    // factor = 110.123456/100 = 1.10123456 → trunc = 1.1012 (NO 1.1013)
    // deducción = 10000 * 0.3 * 1.1012 = 3303.6
    expect(calculateFiscalDeduction(asset, 110.123456, 100)).toBeCloseTo(3303.6, 6);
  });

  it('trunc hacia abajo aunque el quinto decimal suba', () => {
    // 1.000099 → trunc = 1.0000 → 10000 * 0.5 * 1.0000 = 5000
    const halfAsset = { ...asset, fiscalRate: 0.5 };
    expect(calculateFiscalDeduction(halfAsset, 100.0099, 100)).toBe(5000);
  });

  it('factor exacto 1.0 da la deducción sin actualización', () => {
    expect(calculateFiscalDeduction(asset, 100, 100)).toBe(3000);
  });
});
