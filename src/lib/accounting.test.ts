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
  esFolioPendiente,
  asignarFoliosPendientes,
  formatPolizaFolio,
  entryToPolizaInput,
  entriesToPolizasDiarias,
  consolidarPolizasDiaria
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

  it('tipo cheque: serie propia CHE independiente (CH-3 de PLAN_CHEQUES.md)', () => {
    const lista: Poliza[] = [
      poliza({ id: '1', tipo: 'ingreso', folio: 5 }),
      poliza({ id: '2', tipo: 'egreso', folio: 9 })
    ];
    // El folio contable del cheque NO hereda la serie de egresos, aunque para
    // el SAT la póliza salga como egreso (CH-2/CH-3 de PLAN_CHEQUES.md).
    expect(nextPolizaFolio(lista, 'cheque')).toBe(1);
    expect(nextPolizaFolio([...lista, poliza({ id: '3', tipo: 'cheque', folio: 3 })], 'cheque')).toBe(4);
  });
});

describe('formatPolizaFolio', () => {
  it('prefijo por tipo y relleno a 4 dígitos', () => {
    expect(formatPolizaFolio(poliza({ tipo: 'ingreso', folio: 1 }))).toBe('ING-0001');
    expect(formatPolizaFolio(poliza({ tipo: 'egreso', folio: 12 }))).toBe('EGR-0012');
    expect(formatPolizaFolio(poliza({ tipo: 'diario', folio: 123 }))).toBe('DIA-0123');
    expect(formatPolizaFolio(poliza({ tipo: 'cheque', folio: 1 }))).toBe('CHE-0001'); // CH-3
  });

  it('folio de 5 dígitos no se trunca', () => {
    expect(formatPolizaFolio(poliza({ tipo: 'diario', folio: 10000 }))).toBe('DIA-10000');
  });

  it('folio pendiente (centinela 0 del merge) se muestra PENDIENTE', () => {
    expect(esFolioPendiente(poliza({ folio: 0 }))).toBe(true);
    expect(esFolioPendiente(poliza({ folio: 1 }))).toBe(false);
    expect(formatPolizaFolio(poliza({ tipo: 'egreso', folio: 0 }))).toBe('PENDIENTE');
  });
});

describe('asignarFoliosPendientes (F-6 de PLAN_FUSION_BOVEDA.md)', () => {
  it('sin pendientes: la lista sale IDÉNTICA y no hay afectadas', () => {
    const lista = [
      poliza({ id: '1', tipo: 'ingreso', folio: 1 }),
      poliza({ id: '2', tipo: 'egreso', folio: 1 })
    ];
    const resultado = asignarFoliosPendientes(lista);
    expect(resultado.polizas).toEqual(lista);
    expect(resultado.afectadas).toHaveLength(0);
  });

  it('asigna el siguiente disponible de su tipo en orden capturadoEn ASCENDENTE', () => {
    const lista: Poliza[] = [
      // egresos: la serie local llega a 4; entrante LATE capturado después.
      poliza({ id: 'lo-egr', tipo: 'egreso', folio: 4 }),
      poliza({ id: 'pen-2', tipo: 'egreso', folio: 0, concepto: 'Tarde', capturadoEn: '2026-10-16T18:00:00.000Z' }),
      poliza({ id: 'pen-1', tipo: 'egreso', folio: 0, concepto: 'Temprano', capturadoEn: '2026-10-15T09:00:00.000Z' }),
      // ingreso: la serie llega a 2.
      poliza({ id: 'pen-3', tipo: 'ingreso', folio: 0, concepto: 'Venta móvil', capturadoEn: '2026-10-17T12:00:00.000Z' }),
      poliza({ id: 'lo-ing', tipo: 'ingreso', folio: 2 })
    ];
    const resultado = asignarFoliosPendientes(lista);

    expect(resultado.afectadas.map(a => a.id)).toEqual(['pen-1', 'pen-2', 'pen-3']); // orden de captura
    expect(resultado.afectadas.map(a => a.folio)).toEqual([5, 6, 3]); // egreso: 5 y 6; ingreso: 3
    expect(resultado.afectadas[0].concepto).toBe('Temprano');
    // las NO afectadas quedan intactas y todos los demás folios se conservan.
    expect(resultado.polizas.find(p => p.id === 'lo-ing')!.folio).toBe(2);
    expect(resultado.polizas.find(p => p.id === 'lo-egr')!.folio).toBe(4);
    expect(resultado.polizas).toHaveLength(5);
  });

  it('el id se mantiene y SOLO cambia folio en las afectadas; sin capturadoEn va primero (fallback)', () => {
    const lista: Poliza[] = [
      poliza({ id: 'lo', tipo: 'diario', folio: 1 }),
      poliza({ id: 'sin-sello', tipo: 'diario', folio: 0, concepto: 'Legado', capturadoEn: undefined }),
      poliza({ id: 'con-sello', tipo: 'diario', folio: 0, concepto: 'Nueva', capturadoEn: '2026-10-16T10:00:00.000Z' })
    ];
    const resultado = asignarFoliosPendientes(lista);
    expect(resultado.afectadas.map(a => a.id)).toEqual(['sin-sello', 'con-sello']);
    expect(resultado.afectadas.map(a => a.folio)).toEqual([2, 3]);

    const tocada = resultado.polizas.find(p => p.id === 'con-sello')!;
    expect(tocada.concepto).toBe('Nueva');          // resto de campos intacto
    expect(tocada.capturadoEn).toBe('2026-10-16T10:00:00.000Z');
    expect(resultado.polizas.find(p => p.id === 'lo')!.folio).toBe(1);
  });
});

describe('entryToPolizaInput (D-10 captura programática)', () => {
  it('convierte movimientos a partidas con snapshot de cuenta y tipo diario forzado', () => {
    const accounts: Account[] = [
      acc('a1', 'asset', '1101'),
      acc('a2', 'equity', '3101')
    ];
    const salida = entryToPolizaInput(
      {
        date: '2024-06-30',
        description: 'Depreciación del mes de junio',
        movements: [
          { accountId: 'a1', type: 'debit', amount: 350 },
          { accountId: 'a2', type: 'credit', amount: 350 }
        ]
      },
      accounts
    );
    expect(salida.tipo).toBe('diario');
    expect(salida.fecha).toBe('2024-06-30');
    expect(salida.concepto).toBe('Depreciación del mes de junio');
    expect(salida.partidas).toMatchObject([
      { accountId: 'a1', accountCode: '1101', accountName: 'Cuenta a1', debit: 350, credit: 0 },
      { accountId: 'a2', accountCode: '3101', accountName: 'Cuenta a2', debit: 0, credit: 350 }
    ]);
  });

  it('movimientos con monto 0 no se convierten a partida (defensa pasiva)', () => {
    const salida = entryToPolizaInput(
      {
        date: '2024-06-30',
        description: 'Prueba',
        movements: [{ accountId: 'a1', type: 'debit', amount: 0 }]
      },
      [acc('a1', 'asset')]
    );
    expect(salida.partidas).toHaveLength(0);
  });
});

describe('entriesToPolizasDiarias (D-11 importación Excel)', () => {
  it('folio 0: importPolizas lo reasigna; estructura diaria y totales calculados', () => {
    const accounts: Account[] = [
      acc('a1', 'asset', '1101'),
      acc('a2', 'equity', '3101')
    ];
    const entradas: JournalEntry[] = [
      entry('x1', [
        { accountId: 'a1', type: 'debit', amount: 1000 },
        { accountId: 'a2', type: 'credit', amount: 1000 }
      ])
    ];
    const salida = entriesToPolizasDiarias(entradas, accounts);
    expect(salida).toHaveLength(1);
    expect(salida[0]).toMatchObject({
      id: 'x1',
      folio: 0,
      tipo: 'diario',
      totalDebe: 1000,
      totalHaber: 1000
    });
    expect(salida[0].partidas[0]).toMatchObject({ accountId: 'a1', accountCode: '1101' });
  });

  it('preserva uuidCFDI/rfcTercero de los movimientos (DIOT)', () => {
    const salida = entriesToPolizasDiarias(
      [
        entry('x1', [
          { accountId: 'a1', type: 'debit', amount: 100, uuidCFDI: 'uuid-1', rfcTercero: 'ABC010101AAA' },
          { accountId: 'a2', type: 'credit', amount: 100 }
        ])
      ],
      [acc('a1', 'asset'), acc('a2', 'equity')]
    );
    expect(salida[0].partidas[0].uuidCFDI).toBe('uuid-1');
    expect(salida[0].partidas[0].rfcTercero).toBe('ABC010101AAA');
  });

  it('INTEGRIDAD: el aplanado alimenta buildTAccountsData con los MISMOS totales Debe/Haber', () => {
    const entrada = poliza({
      partidas: [
        partida({ accountId: 'a1', debit: 800 }),
        partida({ accountId: 'a2', credit: 800 })
      ],
      totalDebe: 800,
      totalHaber: 800
    });
    const balance = validatePolizaBalance(entrada.partidas);
    const cuentasT = buildTAccountsData(flattenPolizasToJournalEntries([entrada]));

    const debeGenerado = Object.values(cuentasT)
      .flatMap(col => col.debits)
      .reduce((sum, d) => sum + d.amount, 0);
    const haberGenerado = Object.values(cuentasT)
      .flatMap(col => col.credits)
      .reduce((sum, c) => sum + c.amount, 0);

    expect(debeGenerado).toBe(balance.totalDebe);
    expect(haberGenerado).toBe(balance.totalHaber);
  });
});

describe('consolidarPolizasDiaria (póliza diaria de impresión)', () => {
  it('agrega por cuenta y lado: dos cargos a la misma cuenta salen en un renglón con el total del día', () => {
    const dia = [
      poliza({
        id: 'p1', folio: 1, tipo: 'ingreso', fecha: '2024-03-01',
        concepto: 'Cobro A',
        partidas: [
          partida({ id: 'p1-0', accountId: 'caja', accountCode: '1101', accountName: 'Caja', debit: 1222 }),
          partida({ id: 'p1-1', accountId: 'clie', accountCode: '1105', accountName: 'Clientes', credit: 1222 })
        ],
        totalDebe: 1222, totalHaber: 1222
      }),
      poliza({
        id: 'p2', folio: 2, tipo: 'ingreso', fecha: '2024-03-01',
        concepto: 'Cobro B',
        partidas: [
          partida({ id: 'p2-0', accountId: 'caja', accountCode: '1101', accountName: 'Caja', debit: 1000 }),
          partida({ id: 'p2-1', accountId: 'banc', accountCode: '1102', accountName: 'Bancos', credit: 1000 })
        ],
        totalDebe: 1000, totalHaber: 1000
      })
    ];

    const consolidado = consolidarPolizasDiaria('2024-03-01', dia);
    expect(consolidado).not.toBeNull();
    expect(consolidado!.tipo).toBe('diario');
    expect(consolidado!.fecha).toBe('2024-03-01');
    // Caja aparece UNA sola vez con el total del día (1222 + 1000)
    expect(consolidado!.partidas).toHaveLength(3);
    expect(consolidado!.partidas[0]).toMatchObject({
      accountId: 'caja', accountCode: '1101', debit: 2222, credit: 0
    });
    // El consolidado del día cuadra (cada póliza cuadra → el día cuadra)
    expect(consolidado!.totalDebe).toBe(2222);
    expect(consolidado!.totalHaber).toBe(2222);
    // El concepto lista las pólizas incluidas
    expect(consolidado!.concepto).toContain('Póliza diaria del');
    expect(consolidado!.concepto).toContain('Cobro A');
    expect(consolidado!.concepto).toContain('Cobro B');
  });

  it('misma cuenta cargada Y abonada en el día: conserva dos renglones (cargo y abono)', () => {
    const dia = [
      poliza({
        partidas: [
          partida({ accountId: 'caja', debit: 500 }),
          partida({ accountId: 'banc', credit: 500 })
        ],
        totalDebe: 500, totalHaber: 500
      }),
      poliza({
        partidas: [
          partida({ accountId: 'banc', debit: 300 }),
          partida({ accountId: 'caja', credit: 300 })
        ],
        totalDebe: 300, totalHaber: 300
      })
    ];
    const consolidado = consolidarPolizasDiaria('2024-03-01', dia)!;
    const caja = consolidado.partidas.filter(p => p.accountId === 'caja');
    expect(caja).toHaveLength(2);
    expect(caja[0].debit).toBe(500);
    expect(caja[1].credit).toBe(300);
    expect(consolidado.totalDebe).toBe(800);
    expect(consolidado.totalHaber).toBe(800);
  });

  it('une las glosas únicas de las partidas agregadas con " · "', () => {
    const dia = [
      poliza({
        partidas: [
          partida({ accountId: 'caja', debit: 100, concept: 'Recibo 1' }),
          partida({ accountId: 'banc', credit: 100 })
        ],
        totalDebe: 100, totalHaber: 100
      }),
      poliza({
        partidas: [
          partida({ accountId: 'caja', debit: 200, concept: 'Recibo 2' }),
          partida({ accountId: 'banc', credit: 200 })
        ],
        totalDebe: 200, totalHaber: 200
      })
    ];
    const consolidado = consolidarPolizasDiaria('2024-03-01', dia)!;
    expect(consolidado.partidas[0].concept).toBe('Recibo 1 · Recibo 2');
  });

  it('día sin partidas con monto → null', () => {
    expect(consolidarPolizasDiaria('2024-03-01', [
      poliza({ partidas: [partida({ accountId: 'a1', debit: 0, credit: 0 })] })
    ])).toBeNull();
    expect(consolidarPolizasDiaria('2024-03-01', [])).toBeNull();
  });
});
