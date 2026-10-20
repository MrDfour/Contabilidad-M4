/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JournalView } from './JournalView';
import type { Poliza } from '../types';
import { formatPolizaFolio } from '../lib/accounting';

/** Fábrica mínima de póliza para el reporte (partidas con snapshot de cuenta). */
const partidaReporte = (ocultar?: Partial<Poliza['partidas'][0]>): Poliza['partidas'][0] => ({
  id: 'rep-p',
  accountId: 'a1',
  accountCode: '1101',
  accountName: 'Caja',
  debit: 0,
  credit: 0,
  ...ocultar
});

const polizaReporte = (ocultar?: Partial<Poliza>): Poliza => ({
  id: 'rep-1',
  folio: 1,
  tipo: 'ingreso',
  fecha: '2026-01-10',
  concepto: 'Cobro de cliente',
  partidas: [
    partidaReporte({ id: 'rep-1-p0', accountCode: '1101', accountName: 'Caja', debit: 1500 }),
    partidaReporte({ id: 'rep-1-p1', accountId: 'a2', accountCode: '4051', accountName: 'Ventas', credit: 1500 })
  ],
  totalDebe: 1500,
  totalHaber: 1500,
  ...ocultar
});

describe('JournalView (solo lectura — Fase 4 de PLAN_POLIZAS.md)', () => {
  it('ya NO ofrece captura: sin botón "Nuevo Asiento" y sin importador', () => {
    render(<JournalView polizas={[polizaReporte()]} onSetModal={vi.fn()} />);
    expect(screen.queryByText('Nuevo Asiento')).toBeNull();
    expect(screen.queryByText('Importar')).toBeNull();
    expect(screen.queryByText('Plantilla')).toBeNull();
  });

  it('muestra una fila por partida con folio/tipo/cuenta y suma iguales al final', () => {
    const p = polizaReporte();
    render(<JournalView polizas={[p]} onSetModal={vi.fn()} />);

    const folio = formatPolizaFolio(p);
    // la columna FOLIO repite el folio en cada fila de la póliza
    expect(screen.getAllByText(folio).length).toBe(2);
    // el concepto general se repite en cada fila (una por partida)
    expect(screen.getAllByText('Cobro de cliente').length).toBe(2);
    expect(screen.getAllByText('Caja').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ventas').length).toBeGreaterThan(0);
    expect(screen.getByText('Sumas iguales')).toBeTruthy();
  });

  it('partida 0/0 no genera fila; una póliza solo 0/0 cae en el estado vacío', () => {
    const p = polizaReporte({
      partidas: [partidaReporte({ id: 'rep-0', debit: 0, credit: 0 })]
    });
    render(<JournalView polizas={[p]} onSetModal={vi.fn()} />);
    expect(screen.getByText(/No hay movimientos registrados/i)).toBeTruthy();
  });
});
