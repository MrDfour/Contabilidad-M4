/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildPolizasXML, exportPolizasXML } from './satExport';
import type { Account, PartidaPoliza, Poliza } from '../types';

/**
 * Batería del constructor puro `buildPolizasXML` (Fase 6 de PLAN_POLIZAS.md):
 * cada test PARSEA el XML producido con DOMParser (nativo de jsdom) y verifica
 * los atributos del Anexo 24 (schema 1.3).
 */

const cuenta = (id: string, code: string, name: string): Account => ({
  id, code, name, type: 'asset', satGroupCode: '101.01'
});

const parseXML = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return {
    doc,
    polizas: Array.from(doc.querySelectorAll('Poliza')),
    transacciones: Array.from(doc.querySelectorAll('Transaccion')),
    compNal: Array.from(doc.querySelectorAll('CompNal'))
  };
};

const partida = (over: Partial<PartidaPoliza> & Pick<PartidaPoliza, 'accountId' | 'debit' | 'credit'>): PartidaPoliza => ({
  id: 'p-id',
  accountCode: '1101',
  accountName: 'Caja',
  ...over
});

const poliza = (over: Partial<Poliza> & Pick<Poliza, 'id' | 'folio' | 'tipo' | 'fecha'>, partidas: PartidaPoliza[]): Poliza => ({
  concepto: 'Concepto general',
  partidas,
  totalDebe: 0,
  totalHaber: 0,
  ...over
});

const ACCOUNTS: Account[] = [
  cuenta('a1', '1101', 'Caja'),
  cuenta('a2', '4101', 'Ventas y Servicios')
];

const PARTIDA_CAJA = partida({ accountId: 'a1', debit: 1000, credit: 0 });
const PARTIDA_VENTAS = partida({
  accountId: 'a2', debit: 0, credit: 1000,
  concept: 'Venta de mostrador', uuidCFDI: 'AABBCCDD-1122-3344-5566-778899001122', rfcTercero: 'GACJ890101ABA'
});

describe('buildPolizasXML (constructor puro del XML SAT de Pólizas — Anexo 24)', () => {
  it('TipoPoliza: ingreso→1, egreso→2, diario→3, cheque→2 (CH-2 de PLAN_CHEQUES.md)', () => {
    const x = parseXML(buildPolizasXML('GACJ890101ABA', '2025', '03', [
      poliza({ id: 'p1', folio: 1, tipo: 'ingreso', fecha: '2025-03-05' }, [PARTIDA_CAJA]),
      poliza({ id: 'p2', folio: 1, tipo: 'egreso', fecha: '2025-03-06' }, [PARTIDA_CAJA]),
      poliza({ id: 'p3', folio: 1, tipo: 'diario', fecha: '2025-03-07' }, [PARTIDA_CAJA]),
      poliza({ id: 'p4', folio: 1, tipo: 'cheque', fecha: '2025-03-08' }, [PARTIDA_CAJA])
    ], ACCOUNTS));

    // El Anexo 24 no define "cheque": la póliza de cheque sale como egreso real.
    expect(x.polizas.map(p => p.getAttribute('TipoPoliza'))).toEqual(['1', '2', '3', '2']);
  });

  it('NumUnIdenPol = FOLIO REAL (no índice+1) — el cambio central de la Fase 6', () => {
    const x = parseXML(buildPolizasXML('GACJ890101ABA', '2025', '03', [
      poliza({ id: 'p1', folio: 7, tipo: 'ingreso', fecha: '2025-03-05' }, [PARTIDA_CAJA]),
      poliza({ id: 'p2', folio: 13, tipo: 'diario', fecha: '2025-03-06' }, [PARTIDA_CAJA])
    ], ACCOUNTS));

    expect(x.polizas.map(p => p.getAttribute('NumUnIdenPol'))).toEqual(['7', '13']);
  });

  it('folio PENDIENTE (centinela 0 del merge, F-2 de PLAN_FUSION_BOVEDA.md) BLOQUEA el XML', () => {
    // El esquema SAT exige NumUnIdenPol positivo y único: no se exporta con 0
    // y no se omiten en silencio — exige la acción manual F-6 primero.
    expect(() => buildPolizasXML('GACJ890101ABA', '2025', '03', [
      poliza({ id: 'p1', folio: 1, tipo: 'ingreso', fecha: '2025-03-05' }, [PARTIDA_CAJA]),
      poliza({ id: 'p2', folio: 0, tipo: 'egreso', fecha: '2025-03-06' }, [PARTIDA_CAJA])
    ], ACCOUNTS)).toThrow(/1 póliza\(s\) con folio pendiente/);
  });

  it('Concepto de transacción: usa partida.concept cuando existe, con fallback al concepto general', () => {
    const x = parseXML(buildPolizasXML('GACJ890101ABA', '2025', '03', [
      poliza({ id: 'p1', folio: 1, tipo: 'ingreso', fecha: '2025-03-05' }, [PARTIDA_CAJA, PARTIDA_VENTAS])
    ], ACCOUNTS));

    const [sinConcepto, conConcepto] = x.transacciones;
    expect(sinConcepto.getAttribute('Concepto')).toBe('Concepto general');
    expect(conConcepto.getAttribute('Concepto')).toBe('Venta de mostrador');
    expect(x.polizas[0].getAttribute('Concepto')).toBe('Concepto general');
  });

  it('CompNal se incluye SOLO cuando la partida trae uuidCFDI Y rfcTercero', () => {
    const x = parseXML(buildPolizasXML('GACJ890101ABA', '2025', '03', [
      poliza({ id: 'p1', folio: 1, tipo: 'ingreso', fecha: '2025-03-05' }, [PARTIDA_CAJA, PARTIDA_VENTAS])
    ], ACCOUNTS));

    expect(x.compNal).toHaveLength(1);
    expect(x.compNal[0].getAttribute('UUID_CFDI')).toBe('AABBCCDD-1122-3344-5566-778899001122');
    expect(x.compNal[0].getAttribute('RFC')).toBe('GACJ890101ABA');
    expect(x.compNal[0].getAttribute('MontoTotal')).toBe('1000.00');
  });

  it('CompNal se OMITE cuando falta el RFC del tercero (comportamiento vigente, tal cual)', () => {
    const sinRfc = partida({
      accountId: 'a1', debit: 500, credit: 0,
      uuidCFDI: 'AABBCCDD-1122-3344-5566-778899001122'
    });
    const x = parseXML(buildPolizasXML('GACJ890101ABA', '2025', '03', [
      poliza({ id: 'p1', folio: 1, tipo: 'diario', fecha: '2025-03-05' }, [sinRfc])
    ], ACCOUNTS));

    expect(x.compNal).toHaveLength(0);
  });

  it('TipoMov: DEBE para cargos, HABER para abonos; Monto con centavos', () => {
    const x = parseXML(buildPolizasXML('GACJ890101ABA', '2025', '03', [
      poliza({ id: 'p1', folio: 1, tipo: 'diario', fecha: '2025-03-05' }, [PARTIDA_CAJA, PARTIDA_VENTAS])
    ], ACCOUNTS));

    expect(x.transacciones[0].getAttribute('TipoMov')).toBe('DEBE');
    expect(x.transacciones[0].getAttribute('Monto')).toBe('1000.00');
    expect(x.transacciones[1].getAttribute('TipoMov')).toBe('HABER');
  });

  it('escaping de &<>"\' en conceptos y cuentas: sobrevive la ronda de ida y vuelta del parseo', () => {
    const tricky = partida({
      accountId: 'a3', debit: 0, credit: 99.5,
      concept: 'Comisión & "match" <premium> \'especial\''
    });
    const cuentaTricky = cuenta('a3', '5301', 'Primas <bajas> & "altas" \'mixtas\'');
    const x = parseXML(buildPolizasXML('GACJ890101ABA', '2025', '03', [
      poliza({ id: 'p1', folio: 2, tipo: 'egreso', fecha: '2025-03-05', concepto: 'Gasto & "varios" <raro>' }, [tricky])
    ], [...ACCOUNTS, cuentaTricky]));

    expect(x.transacciones[0].getAttribute('Concepto')).toBe('Comisión & "match" <premium> \'especial\'');
    expect(x.transacciones[0].getAttribute('DesCta')).toBe('Primas <bajas> & "altas" \'mixtas\'');
    expect(x.polizas[0].getAttribute('Concepto')).toBe('Gasto & "varios" <raro>');
  });

  it('SOLO incluye pólizas cuya fecha cae en el periodo AAIO-MES', () => {
    const x = parseXML(buildPolizasXML('GACJ890101ABA', '2025', '03', [
      poliza({ id: 'p1', folio: 1, tipo: 'ingreso', fecha: '2025-02-28' }, [PARTIDA_CAJA]),
      poliza({ id: 'p2', folio: 2, tipo: 'diario', fecha: '2025-03-15' }, [PARTIDA_CAJA]),
      poliza({ id: 'p3', folio: 3, tipo: 'diario', fecha: '2025-04-01' }, [PARTIDA_CAJA])
    ], ACCOUNTS));

    expect(x.polizas).toHaveLength(1);
    expect(x.polizas[0].getAttribute('Fecha')).toBe('2025-03-15');
  });

  it('sin pólizas del periodo lanza el mensaje vigente', () => {
    expect(() => buildPolizasXML('GACJ890101ABA', '2025', '03', [], ACCOUNTS))
      .toThrow('No hay pólizas registradas en el periodo seleccionado para generar el XML.');
  });

  it('encabezado: RFC mayúsculas, Mes/Anio, Version 1.3, TipoSolicitud AF (sin cambios); NumCta/DesCta desde el catálogo', () => {
    const x = parseXML(buildPolizasXML('gacj890101aba', '2025', '03', [
      poliza({ id: 'p1', folio: 1, tipo: 'diario', fecha: '2025-03-05' }, [PARTIDA_CAJA])
    ], ACCOUNTS));

    expect(x.doc.documentElement.getAttribute('RFC')).toBe('GACJ890101ABA');
    expect(x.doc.documentElement.getAttribute('Mes')).toBe('03');
    expect(x.doc.documentElement.getAttribute('Anio')).toBe('2025');
    expect(x.doc.documentElement.getAttribute('Version')).toBe('1.3');
    expect(x.doc.documentElement.getAttribute('TipoSolicitud')).toBe('AF');
    expect(x.transacciones[0].getAttribute('NumCta')).toBe('1101');
    expect(x.transacciones[0].getAttribute('DesCta')).toBe('Caja');
  });

  it('cuenta sin entrada en el catálogo: NumCta/DesCta vacíos (fallback tal cual)', () => {
    const huerfana = partida({ accountId: 'zzz', debit: 10, credit: 0 });
    const x = parseXML(buildPolizasXML('GACJ890101ABA', '2025', '03', [
      poliza({ id: 'p1', folio: 1, tipo: 'diario', fecha: '2025-03-05' }, [huerfana])
    ], ACCOUNTS));

    expect(x.transacciones[0].getAttribute('NumCta')).toBe('');
    expect(x.transacciones[0].getAttribute('DesCta')).toBe('');
  });
});

describe('exportPolizasXML (wrapper de descarga — DV-4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('descarga con filename RFCAÑOMESPL.xml (patrón vigente) y el contenido es el XML del builder', () => {
    // Spy con firma relajada: jsdom sobrecarga `createElement` con literales de etiqueta.
    const createElementSpy = vi.spyOn(document, 'createElement') as unknown as {
      mock: { calls: Array<[string]>; results: Array<{ value: unknown }> };
    };
    const xml = exportPolizasXML('GACJ890101ABA', '2025', '03',
      [poliza({ id: 'p1', folio: 5, tipo: 'diario', fecha: '2025-03-05' }, [PARTIDA_CAJA])],
      ACCOUNTS
    );

    const call = createElementSpy.mock.calls.find(args => args[0] === 'a');
    expect(call).toBeDefined();
    const anchor = createElementSpy.mock.results[0].value as HTMLAnchorElement;
    expect(anchor.download).toBe('GACJ890101ABA202503PL.xml');
    expect(xml).toContain('<PLZ:Poliza NumUnIdenPol="5"');
    expect(xml.trimEnd().endsWith('</PLZ:Polizas>')).toBe(true);
  });

  it('propaga el error de periodo vacío (no descarga nada)', () => {
    expect(() => exportPolizasXML('GACJ890101ABA', '2025', '03', [], ACCOUNTS)).toThrow();
  });
});
