/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiarioPrintModal } from './DiarioPrintModal';
import type { Poliza } from '../../types';

const poliza = (id: string, fecha: string, folio: number, tipo: Poliza['tipo'], debe: number): Poliza => ({
  id,
  folio,
  tipo,
  fecha,
  concepto: `Concepto ${id}`,
  partidas: [
    { id: `${id}-p0`, accountId: 'a1', accountCode: '1101', accountName: 'Caja', debit: debe, credit: 0 },
    { id: `${id}-p1`, accountId: 'a2', accountCode: '3101', accountName: 'Capital Social', debit: 0, credit: debe }
  ],
  totalDebe: debe,
  totalHaber: debe
});

const polizas = [
  poliza('p1', '2026-03-01', 1, 'ingreso', 1000),
  poliza('p2', '2026-03-05', 1, 'egreso', 250),
  poliza('p4', '2026-03-01', 2, 'ingreso', 500),
  poliza('p3', '2026-04-10', 1, 'diario', 77)
];

const desde = () => screen.getByLabelText('Fecha inicial del rango') as HTMLInputElement;
const hasta = () => screen.getByLabelText('Fecha final del rango') as HTMLInputElement;
const imprimir = () => screen.getByRole('button', { name: /Imprimir$/ }) as HTMLButtonElement;

describe('DiarioPrintModal (impresión del Libro Diario por período)', () => {
  it('muestra solo las pólizas dentro del rango Desde/Hasta', () => {
    render(<DiarioPrintModal polizas={polizas} onClose={vi.fn()} />);
    // Inicial: día de la póliza más reciente → solo p3
    expect(screen.getAllByText(/1 póliza/).length).toBeGreaterThan(0);
    expect(screen.getByText('DIA-0001')).toBeTruthy();
    expect(screen.queryByText('ING-0001')).toBeNull();

    // Ampliar el rango a marzo completo → 3 pólizas
    fireEvent.change(desde(), { target: { value: '2026-03-01' } });
    fireEvent.change(hasta(), { target: { value: '2026-03-31' } });
    expect(screen.getAllByText(/3 póliza/).length).toBeGreaterThan(0);
    expect(screen.getByText('ING-0001')).toBeTruthy();
    expect(screen.getByText('EGR-0001')).toBeTruthy();
    expect(screen.queryByText('DIA-0001')).toBeNull();
  });

  it('suma general del período = suma de totales de las pólizas en rango', () => {
    render(<DiarioPrintModal polizas={polizas} onClose={vi.fn()} />);
    fireEvent.change(desde(), { target: { value: '2026-03-01' } });
    fireEvent.change(hasta(), { target: { value: '2026-03-31' } });
    // 1000 + 250 + 500 = 1750 en ambas columnas (partida doble) — aparece en Debe y Haber
    const montos = screen.getAllByText('$1,750.00');
    expect(montos.length).toBe(2);
  });

  it('sin pólizas en el rango: mensaje y botón Imprimir deshabilitado', () => {
    render(<DiarioPrintModal polizas={polizas} onClose={vi.fn()} />);
    fireEvent.change(desde(), { target: { value: '2025-01-01' } });
    fireEvent.change(hasta(), { target: { value: '2025-01-31' } });
    expect(screen.getByText(/No hay pólizas registradas en el período/i)).toBeTruthy();
    expect(imprimir()).toBeDisabled();
  });

  it('presets Hoy y Este mes ajustan el rango (independiente de la fecha actual)', () => {
    const hoy = new Date();
    const hoyISO = hoy.toISOString().split('T')[0];
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];

    render(<DiarioPrintModal polizas={polizas} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(desde().value).toBe(hoyISO);
    expect(hasta().value).toBe(hoyISO);

    fireEvent.click(screen.getByRole('button', { name: 'Este mes' }));
    expect(desde().value).toBe(inicioMes);
    expect(hasta().value).toBe(hoyISO);
  });
});

describe('DiarioPrintModal formato Libro continuo', () => {
  it('compacta todas las operaciones en una tabla con suma del día por fecha', () => {
    render(<DiarioPrintModal polizas={polizas} onClose={vi.fn()} />);
    // Ampliar a marzo completo (2 días, 4 partidas)
    fireEvent.change(desde(), { target: { value: '2026-03-01' } });
    fireEvent.change(hasta(), { target: { value: '2026-03-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Libro continuo' }));

    // Encabezados del libro continuo
    expect(screen.getByText('Sumas iguales del período')).toBeTruthy();
    // Una fila de "Suma del día" por fecha (2 días en marzo)
    expect(screen.getAllByText('Suma del día').length).toBe(2);
    // Las 6 partidas (2 por póliza, 3 pólizas) están presentes
    expect(screen.getAllByText('Caja').length).toBe(3);
    expect(screen.getAllByText('Capital Social').length).toBe(3);
    // Suma del día 1 = 1500 (1000+500), del día 2 = 250 (partida doble; también como partidas)
    expect(screen.getAllByText('$1,500.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$250.00').length).toBeGreaterThanOrEqual(1);
    // El folio aparece solo en el primer renglón de cada póliza
    expect(screen.getAllByText('ING-0001').length).toBe(1);
    expect(screen.getAllByText('ING-0002').length).toBe(1);
    expect(screen.getAllByText('EGR-0001').length).toBe(1);
  });

  it('la preferencia de formato persiste en localStorage', () => {
    render(<DiarioPrintModal polizas={polizas} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Libro continuo' }));
    expect(localStorage.getItem('contasis_diario_formato')).toBe('continuo');
  });
});

describe('DiarioPrintModal formato Póliza diaria', () => {
  it('consolida las pólizas del mismo día en una hoja, agregadas por cuenta', () => {
    render(<DiarioPrintModal polizas={polizas} onClose={vi.fn()} />);
    fireEvent.change(desde(), { target: { value: '2026-03-01' } });
    fireEvent.change(hasta(), { target: { value: '2026-03-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Póliza diaria' }));

    // Dos hojas diarias (01/03 con p1+p4, 05/03 con p2)
    expect(screen.getAllByText('Póliza Diaria').length).toBe(2);
    // Caja consolidada: un renglón por día (1000+500=1500 en el día 1)
    expect(screen.getAllByText('Caja').length).toBe(2);
    expect(screen.getAllByText(/Sumas iguales/).length).toBe(2);
    expect(screen.getAllByText('$1,500.00').length).toBeGreaterThanOrEqual(1);
    // La franja muestra el folio DIARIA por fecha
    expect(screen.getAllByText(/DIARIA/).length).toBe(2);
    // El concepto del consolidado lista las pólizas incluidas
    expect(screen.getByText(/Incluye: Concepto p1 · Concepto p4/)).toBeTruthy();
  });

  it('la preferencia diaria también persiste', () => {
    render(<DiarioPrintModal polizas={polizas} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Póliza diaria' }));
    expect(localStorage.getItem('contasis_diario_formato')).toBe('diaria');
  });
});
