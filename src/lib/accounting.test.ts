/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  buildTAccountsData,
  computeAccountBalances,
  calculateMonthlyDepreciation,
  calculateFiscalDeduction,
  validatePolizaBalance,
  flattenPolizasToJournalEntries,
  nextPolizaFolio,
  formatPolizaFolio
} from './accounting';
import type { Account, FixedAsset, JournalEntry, Movement, Poliza, PartidaPoliza } from '../types';

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

// --- Fase 1 módulo Pólizas: funciones puras de pólizas ---

/** Fábrica de partida determinista. */
const partida = (overrides: Partial<PartidaPoliza> & { accountId: string }): PartidaPoliza => ({
  id: `p-${overrides.accountId}`,
  accountCode: '1000',
  accountName: `Cuenta ${overrides.accountId}`,
  debit: 0,
  credit: 0,
  ...overrides
});

/** Fábrica de póliza determinista (sin crypto). */
const poliza = (ocultar?: Partial<Poliza>): Poliza => ({
  id: 'pol-1',
  folio: 1,
  tipo: 'diario',
  fecha: '2024-01-15',
  concepto: 'Póliza de prueba',
  partidas: [],
  totalDebe: 0,
  totalHaber: 0,
  ...ocultar
});

describe('validatePolizaBalance', () => {
  it('póliza cuadrada: isBalanced true, difference 0 y totales correctos', () => {
    const resultado = validatePolizaBalance([
      partida({ accountId: 'a1', debit: 500 }),
      partida({ accountId: 'a2', credit: 500 })
    ]);
    expect(resultado).toEqual({ isBalanced: true, totalDebe: 500, totalHaber: 500, difference: 0 });
  });

  it('desbalance de 1 centavo: isBalanced false', () => {
    const resultado = validatePolizaBalance([
      partida({ accountId: 'a1', debit: 100.01 }),
      partida({ accountId: 'a2', credit: 100 })
    ]);
    expect(resultado.isBalanced).toBe(false);
    expect(resultado.difference).toBe(0.01);
  });

  it('sin partidas: isBalanced false con totales en 0', () => {
    expect(validatePolizaBalance([])).toEqual({
      isBalanced: false, totalDebe: 0, totalHaber: 0, difference: 0
    });
  });

  it('mono-partida: desbalanceada (el cargo no tiene abono espejo)', () => {
    const resultado = validatePolizaBalance([partida({ accountId: 'a1', debit: 300 })]);
    expect(resultado).toEqual({ isBalanced: false, totalDebe: 300, totalHaber: 0, difference: 300 });
  });

  it('redondeo a 2 decimales vía normalizeAmount (0.005 → 0.01)', () => {
    const resultado = validatePolizaBalance([
      partida({ accountId: 'a1', debit: 100.005 }),
      partida({ accountId: 'a2', credit: 100 })
    ]);
    expect(resultado.totalDebe).toBe(100.01);
    expect(resultado.difference).toBe(0.01);
  });
});

describe('flattenPolizasToJournalEntries', () => {
  it('mapea exacto debit/credit, respeta uuidCFDI/rfcTercero y copia policyType', () => {
    const entrada = poliza({
      partidas: [
        partida({ accountId: 'a1', debit: 400, uuidCFDI: 'uuid-36-chars', rfcTercero: 'XAXX010101000' }),
        partida({ accountId: 'a2', credit: 400 })
      ]
    });
    const salida = flattenPolizasToJournalEntries([entrada]);

    expect(salida).toHaveLength(1);
    expect(salida[0]).toEqual({
      id: 'pol-1',
      date: '2024-01-15',
      description: 'Póliza de prueba',
      policyType: 'diario',
      movements: [
        { accountId: 'a1', type: 'debit', amount: 400, uuidCFDI: 'uuid-36-chars', rfcTercero: 'XAXX010101000' },
        { accountId: 'a2', type: 'credit', amount: 400 }
      ]
    });
  });

  it('partida 0/0 no genera movimiento', () => {
    const salida = flattenPolizasToJournalEntries([
      poliza({ partidas: [partida({ accountId: 'a1' })] })
    ]);
    expect(salida[0].movements).toEqual([]);
  });

  it('NO ordena: respeta el orden de entrada de las pólizas', () => {
    const salida = flattenPolizasToJournalEntries([
      poliza({ id: 'b', fecha: '2024-03-01', concepto: 'Tarde' }),
      poliza({ id: 'a', fecha: '2024-01-01', concepto: 'Temprano' })
    ]);
    expect(salida.map(e => e.id)).toEqual(['b', 'a']);
  });
});

describe('nextPolizaFolio', () => {
  it('sin pólizas: 1', () => {
    expect(nextPolizaFolio([], 'egreso')).toBe(1);
  });

  it('tipo sin folios (solo hay de otro tipo): 1', () => {
    const lista = [poliza({ id: '1', tipo: 'ingreso', folio: 7 })];
    expect(nextPolizaFolio(lista, 'egreso')).toBe(1);
  });

  it('con huecos: max(folio del tipo) + 1', () => {
    const lista = [
      poliza({ id: '1', tipo: 'egreso', folio: 1 }),
      poliza({ id: '2', tipo: 'egreso', folio: 9 })
    ];
    expect(nextPolizaFolio(lista, 'egreso')).toBe(10);
  });

  it('independencia entre tipos: los folios de ingreso no contaminan diario', () => {
    const lista: Poliza[] = [
      poliza({ id: '1', tipo: 'ingreso', folio: 1 }),
      poliza({ id: '2', tipo: 'ingreso', folio: 2 })
    ];
    expect(nextPolizaFolio(lista, 'diario')).toBe(1);
  });
});

describe('formatPolizaFolio', () => {
  it('prefijo por tipo y relleno a 4 dígitos', () => {
    expect(formatPolizaFolio(poliza({ tipo: 'ingreso', folio: 1 }))).toBe('ING-0001');
    expect(formatPolizaFolio(poliza({ tipo: 'egreso', folio: 12 }))).toBe('EGR-0012');
    expect(formatPolizaFolio(poliza({ tipo: 'diario', folio: 123 }))).toBe('DIA-0123');
  });

  it('folio de 5 dígitos no se trunca', () => {
    expect(formatPolizaFolio(poliza({ tipo: 'diario', folio: 10000 }))).toBe('DIA-10000');
  });
});
