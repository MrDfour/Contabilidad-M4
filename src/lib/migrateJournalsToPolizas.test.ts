/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { migrateJournalsToPolizas } from './migrateJournalsToPolizas';
import type { Account, Journal, JournalEntry, Movement } from '../types';

/** Fábrica de cuenta determinista. */
const acc = (id: string, code = '1000', name?: string, type: Account['type'] = 'asset'): Account => ({
  id, code, name: name ?? `Cuenta ${id}`, type
});

/** Fábrica de asiento determinista. */
const entry = (id: string, movements: Movement[], overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id, date: '2024-01-15', description: `Asiento ${id}`, movements, ...overrides
});

/** Fábrica de diario determinista. */
const journal = (id: string, entries: JournalEntry[]): Journal => ({
  id, name: `Diario ${id}`, entries
});

describe('migrateJournalsToPolizas (D-2/D-3/D-4, puro y determinista)', () => {
  it('sin diarios o sin asientos: devuelve [] (el guard anti re-migración vive en el flag de storage)', () => {
    expect(migrateJournalsToPolizas([], [])).toEqual([]);
    expect(migrateJournalsToPolizas([journal('j1', [])], [])).toEqual([]);
  });

  it('mapea 1:1 asientos → pólizas con ids reaprovechados y determinismo estable', () => {
    const asiento = entry('e1', [
      { accountId: 'a1', type: 'debit', amount: 500 },
      { accountId: 'a2', type: 'credit', amount: 500 }
    ]);
    const entrada = [journal('j1', [asiento])];

    const resultado = migrateJournalsToPolizas(entrada, [acc('a1'), acc('a2')]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe('e1'); // D-3: Poliza.id = JournalEntry.id
    expect(resultado[0].partidas).toEqual([
      { id: 'e1-p0', accountId: 'a1', accountCode: '1000', accountName: 'Cuenta a1', debit: 500, credit: 0 },
      { id: 'e1-p1', accountId: 'a2', accountCode: '1000', accountName: 'Cuenta a2', debit: 0, credit: 500 }
    ]);
    // Determinismo: re-invocación con los mismos datos → mismas salidas
    expect(migrateJournalsToPolizas(entrada, [acc('a1'), acc('a2')])).toEqual(resultado);
  });

  it('folios consecutivos e independientes por tipo, en orden de iteración; asiento sin policyType → diario', () => {
    const resultado = migrateJournalsToPolizas([
      journal('j1', [
        entry('d1', []),                                        // diario → folio 1
        entry('d2', [], { policyType: 'ingreso' }),             // ingreso → folio 1
        entry('d3', []),                                        // diario → folio 2
        entry('d4', [], { policyType: 'ingreso' }),             // ingreso → folio 2
        entry('d5', [], { policyType: 'egreso' })               // egreso → folio 1
      ] as JournalEntry[])
    ], []);

    const folios = Object.fromEntries(resultado.map(p => [p.id, { folio: p.folio, tipo: p.tipo }]));
    expect(folios['d1']).toEqual({ folio: 1, tipo: 'diario' });
    expect(folios['d2']).toEqual({ folio: 1, tipo: 'ingreso' });
    expect(folios['d3']).toEqual({ folio: 2, tipo: 'diario' });
    expect(folios['d4']).toEqual({ folio: 2, tipo: 'ingreso' });
    expect(folios['d5']).toEqual({ folio: 1, tipo: 'egreso' });
  });

  it('preserva uuidCFDI/rfcTercero, fecha y descripción (sin pérdida de información)', () => {
    const resultado = migrateJournalsToPolizas([
      journal('j1', [
        entry('e1', [
          { accountId: 'a1', type: 'debit', amount: 100.01, uuidCFDI: 'uuid-fiscal-36', rfcTercero: 'XAXX010101000' },
          { accountId: 'a2', type: 'credit', amount: 100.01 }
        ], { date: '2024-03-10', description: 'Venta con CFDI' })
      ])
    ], [acc('a1'), acc('a2')]);

    expect(resultado[0]).toMatchObject({ fecha: '2024-03-10', concepto: 'Venta con CFDI' });
    expect(resultado[0].partidas[0].uuidCFDI).toBe('uuid-fiscal-36');
    expect(resultado[0].partidas[0].rfcTercero).toBe('XAXX010101000');
    expect(resultado[0].totalDebe).toBe(100.01);
    expect(resultado[0].totalHaber).toBe(100.01);
  });

  it('lookup de cuenta llena code/name; accountId desconocido → fallback ""', () => {
    const resultado = migrateJournalsToPolizas([
      journal('j1', [
        entry('e1', [
          { accountId: 'a1', type: 'debit', amount: 50 },
          { accountId: 'fantasma', type: 'credit', amount: 50 }
        ])
      ])
    ], [acc('a1', '1101', 'Caja')]);

    expect(resultado[0].partidas[0]).toEqual(
      expect.objectContaining({ accountCode: '1101', accountName: 'Caja' })
    );
    expect(resultado[0].partidas[1]).toEqual(
      expect.objectContaining({ accountId: 'fantasma', accountCode: '', accountName: '' })
    );
  });
});
