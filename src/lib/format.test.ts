/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeAmount,
  parseFormattedAmount,
  parseImportedAmount,
  formatAmountForInput,
  formatAmountInput,
  formatCurrency,
  formatSatGroupCode,
  normalizeString
} from './format';
import {
  parseJournalImport
} from './importEntriesFromExcel';
import type { Account } from '../types';

describe('normalizeAmount', () => {
  it('redondea a 2 decimales con corrección de EPSILON', () => {
    expect(normalizeAmount(10.005)).toBe(10.01);
    expect(normalizeAmount(1.004999)).toBe(1);
    expect(normalizeAmount(0)).toBe(0);
  });

  it('valores no finitos devuelven 0 (defensa de UI)', () => {
    expect(normalizeAmount(NaN)).toBe(0);
    expect(normalizeAmount(Infinity)).toBe(0);
    expect(normalizeAmount(-Infinity)).toBe(0);
  });
});

describe('parseFormattedAmount', () => {
  it('acepta separador de miles con coma', () => {
    expect(parseFormattedAmount('1,234.56')).toBe(1234.56);
    expect(parseFormattedAmount('-1,234.56')).toBe(-1234.56);
  });
  it('tolera string vacío', () => {
    expect(parseFormattedAmount('')).toBe(0);
  });
});

describe('parseImportedAmount (importaciones de Excel con signos raros)', () => {
  it('signo guion en cualquier posición (formato de exportación Excel)', () => {
    expect(parseImportedAmount('$-1,234.56-')).toBe(-1234.56);
  });
  it('montos con $ y comas', () => {
    expect(parseImportedAmount('$1,000.50')).toBe(1000.5);
  });
  it('celdas vacías/null → 0', () => {
    expect(parseImportedAmount('')).toBe(0);
    expect(parseImportedAmount(null)).toBe(0);
    expect(parseImportedAmount(undefined)).toBe(0);
  });
  it('números recibidos como número', () => {
    expect(parseImportedAmount(500.1)).toBe(500.1);
  });
});

describe('formatAmountForInput', () => {
  it('format en-US con miles y máximo 2 decimales', () => {
    expect(formatAmountForInput(1234.56)).toBe('1,234.56');
    expect(formatAmountForInput(1000000)).toBe('1,000,000');
  });
  it('0 devuelve cadena vacía (input limpio)', () => {
    expect(formatAmountForInput(0)).toBe('');
  });
});

describe('formatAmountInput (sanitización de teclado)', () => {
  it('agrupa miles y corta a 2 decimales', () => {
    expect(formatAmountInput('1234567.899')).toBe('1,234,567.89');
  });
  it('elimina caracteres no numéricos', () => {
    expect(formatAmountInput('$12a3b')).toBe('123');
  });
  it('normaliza ceros a la izquierda y maneja punto inicial', () => {
    expect(formatAmountInput('0123')).toBe('123');
    expect(formatAmountInput('.5')).toBe('0.5');
  });
  it('recorta dígitos decimales adicionales (máximo 2)', () => {
    expect(formatAmountInput('12.345')).toBe('12.34');
  });
  it('punto final conserva el separador', () => {
    expect(formatAmountInput('12.')).toBe('12.');
  });
  it('cadena vacía/puro no numérico → vacío', () => {
    expect(formatAmountInput('')).toBe('');
    expect(formatAmountInput('abc')).toBe('');
  });
});

describe('formatCurrency (es-MX MXN)', () => {
  it('prefiere espacio "$1,234.56" independiente del separador de grupo local', () => {
    const out = formatCurrency(1234.56);
    expect(out).toContain('1,234.56');
    expect(out.replace(/\u00a0/g, ' ')).toMatch(/^\$/);
  });
});

describe('formatSatGroupCode', () => {
  it('códigos de 4+ dígitos → XX.XX', () => {
    expect(formatSatGroupCode('10101')).toBe('10.101');
    expect(formatSatGroupCode('1101')).toBe('11.01');
  });
  it('códigos cortos quedan intactos', () => {
    expect(formatSatGroupCode('101')).toBe('101');
  });
});

describe('normalizeString (colisión de nombres de cuenta)', () => {
  it('minúsculas, sin espacios de bordes ni tildes', () => {
    expect(normalizeString('  Caja Chica  ')).toBe('caja chica');
    expect(normalizeString('Gastos Público')).toBe('gastos publico');
    expect(normalizeString('Móvil')).toBe('movil');
  });

  it('nombres distintos solo por tilde/espacios colisionan (parseo de catálogo)', () => {
    expect(normalizeString('Bancos')).toBe(normalizeString('  bancos '));
  });
});

describe('parseJournalImport (contrato del parser de Libro Diario)', () => {
  const catalog: Account[] = [
    { id: 'a1', code: '1101', name: 'Caja', type: 'asset' },
    { id: 'a2', code: '3101', name: 'Capital Social', type: 'equity' }
  ];

  it('arma un asiento de 2 movimientos cuadrado desde fila DEBE/HABER (con ASIENTO_ID compartido)', () => {
    const { entries, unmatchedAccounts } = parseJournalImport([
      { ASIENTO_ID: '1', FECHA: '2024-05-01', GLOSA: 'Apertura', CUENTA: 'Caja', DEBE: 1000, HABER: 0 },
      { ASIENTO_ID: '1', FECHA: '', GLOSA: '', CUENTA: 'Capital Social', DEBE: 0, HABER: '1,000.00' }
    ], catalog);

    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe('2024-05-01');
    expect(entries[0].description).toBe('Apertura');
    expect(entries[0].movements).toEqual([
      { accountId: 'a1', type: 'debit', amount: 1000 },
      { accountId: 'a2', type: 'credit', amount: 1000 }
    ]);
    expect(unmatchedAccounts).toEqual([]);
  });

  it('cuenta desconocida NO genera movimiento (ni rompe el resto) y se reporta', () => {
    const { entries, unmatchedAccounts } = parseJournalImport([
      { FECHA: '2024-05-01', GLOSA: 'X', CUENTA: 'No Existe', DEBE: 500, HABER: 0 },
      { FECHA: '2024-05-01', GLOSA: 'X', CUENTA: 'Caja', DEBE: 500, HABER: 0 }
    ], catalog);

    expect(entries.every(e => e.movements.length > 0)).toBe(true);
    expect(unmatchedAccounts).toEqual(['No Existe']);
  });

  it('columna MOVIMIENTO mapea a ASIENTO_ID y el código de cuenta (1101) empareja', () => {
    const { entries } = parseJournalImport([
      { MOVIMIENTO: '1', FECHA: '2024-05-01', GLOSA: 'Prueba', CUENTA: '1101', DEBE: 100, HABER: 0 }
    ], catalog);
    // La fecha cruda se conserva tal cual (el getPeriod de EntryList la interpreta después)
    expect(entries[0].date).toBe('2024-05-01');
    expect(entries[0].description).toBe('Prueba');
    expect(entries[0].movements).toEqual([{ accountId: 'a1', type: 'debit', amount: 100 }]);
  });

  it('la variante CONCEPTO NO pasa la validación de encabezados (original exige GLOSA cruda)', () => {
    // Comportamiento preservado: el header-check corre ANTES de la normalización,
    // de modo que un archivo solo con "CONCEPTO" es rechazado con el mensaje de plantilla.
    expect(() => parseJournalImport([
      { FECHA: '2024-05-01', CONCEPTO: 'X', CUENTA: 'Caja', DEBE: 1, HABER: 0 }
    ], catalog)).toThrow(/GLOSA/);
  });

  it('archivo vacío o sin columnas requeridas: lanza error (el llamador decide el modal)', () => {
    expect(() => parseJournalImport([], catalog)).toThrow();
    expect(() => parseJournalImport([{ FOO: 1 }], catalog)).toThrow(/FECHA/);
  });

  it('agrupa por ASIENTO_ID con carry-forward de fecha/glosa', () => {
    const { entries } = parseJournalImport([
      { ASIENTO_ID: '1', FECHA: '2024-05-01', GLOSA: 'A', CUENTA: 'Caja', DEBE: 10, HABER: 0 },
      { ASIENTO_ID: '', FECHA: '', GLOSA: '', CUENTA: 'Caja', DEBE: 20, HABER: 0 },
      { ASIENTO_ID: '2', FECHA: '2024-05-02', GLOSA: 'B', CUENTA: 'Caja', DEBE: 5, HABER: 0 }
    ], catalog);

    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.description === 'A')?.movements.map(m => m.amount)).toEqual([10, 20]);
    expect(entries.find(e => e.description === 'B')?.movements.map(m => m.amount)).toEqual([5]);
  });
});
