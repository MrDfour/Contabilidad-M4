/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
    render(<DiarioPrintModal polizas={polizas} empresaId="e1" onClose={vi.fn()} />);
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
    render(<DiarioPrintModal polizas={polizas} empresaId="e1" onClose={vi.fn()} />);
    fireEvent.change(desde(), { target: { value: '2026-03-01' } });
    fireEvent.change(hasta(), { target: { value: '2026-03-31' } });
    // 1000 + 250 + 500 = 1750 en ambas columnas (partida doble) — aparece en Debe y Haber
    const montos = screen.getAllByText('$1,750.00');
    expect(montos.length).toBe(2);
  });

  it('sin pólizas en el rango: mensaje y botón Imprimir deshabilitado', () => {
    render(<DiarioPrintModal polizas={polizas} empresaId="e1" onClose={vi.fn()} />);
    fireEvent.change(desde(), { target: { value: '2025-01-01' } });
    fireEvent.change(hasta(), { target: { value: '2025-01-31' } });
    expect(screen.getByText(/No hay pólizas registradas en el período/i)).toBeTruthy();
    expect(imprimir()).toBeDisabled();
  });

  it('presets Hoy y Este mes ajustan el rango (independiente de la fecha actual)', () => {
    const hoy = new Date();
    const hoyISO = hoy.toISOString().split('T')[0];
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];

    render(<DiarioPrintModal polizas={polizas} empresaId="e1" onClose={vi.fn()} />);
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
    render(<DiarioPrintModal polizas={polizas} empresaId="e1" onClose={vi.fn()} />);
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
    render(<DiarioPrintModal polizas={polizas} empresaId="e1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Libro continuo' }));
    expect(localStorage.getItem('contasis_diario_formato')).toBe('continuo');
  });
});

describe('DiarioPrintModal formato Póliza diaria', () => {
  it('consolida las pólizas del mismo día en una hoja, agregadas por cuenta', () => {
    render(<DiarioPrintModal polizas={polizas} empresaId="e1" onClose={vi.fn()} />);
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
    render(<DiarioPrintModal polizas={polizas} empresaId="e1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Póliza diaria' }));
    expect(localStorage.getItem('contasis_diario_formato')).toBe('diaria');
  });
});

describe('DiarioPrintModal — cheques y toggle de inclusión (Fase 3 de PLAN_CHEQUES.md)', () => {
  const polizaCheque: Poliza = {
    id: 'pc1',
    folio: 1,
    tipo: 'cheque',
    fecha: '2026-03-07',
    concepto: 'Pago renta con cheque',
    cheque: { numero: '1042', banco: 'Banorte', beneficiario: 'Juan Pérez' },
    partidas: [
      { id: 'pc1-0', accountId: 'a1', accountCode: '1101', accountName: 'Caja', debit: 300, credit: 0 },
      { id: 'pc1-1', accountId: 'a2', accountCode: '3101', accountName: 'Capital Social', debit: 0, credit: 300 }
    ],
    totalDebe: 300,
    totalHaber: 300
  };

  const cambiarRangoMarzo = () => {
    fireEvent.change(desde(), { target: { value: '2026-03-01' } });
    fireEvent.change(hasta(), { target: { value: '2026-03-31' } });
  };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('formato Hoja por póliza: el cheque imprime SU hoja propia (título, calcado, datos)', () => {
    render(<DiarioPrintModal polizas={[...polizas, polizaCheque]} empresaId="e1" onClose={vi.fn()} />);
    cambiarRangoMarzo();

    // INCLUIDO (default ON): hoja de cheque propia dentro del libro
    expect(screen.getByText('Póliza de Cheque')).toBeTruthy();
    expect(screen.getByTestId('zona-calcado-cheque')).toBeTruthy();
    expect(screen.getByText('1042')).toBeTruthy();
    expect(screen.getByText('Juan Pérez')).toBeTruthy();
    expect(screen.getAllByText('CHE-0001').length).toBeGreaterThan(0);
    // La suma general del período incluye el cheque (1750 + 300, doble partida)
    expect(screen.getAllByText('$2,050.00').length).toBeGreaterThanOrEqual(2);
  });

  it('toggle OFF: el cheque SALE del libro (hojas, sumas y conteo)', () => {
    render(<DiarioPrintModal polizas={[...polizas, polizaCheque]} empresaId="e1" onClose={vi.fn()} />);
    cambiarRangoMarzo();

    fireEvent.click(screen.getByLabelText('Incluir pólizas de cheque en la impresión'));

    expect(screen.queryByTestId('zona-calcado-cheque')).toBeNull();
    expect(screen.queryByText('1042')).toBeNull();
    expect(screen.queryByText('Póliza de Cheque')).toBeNull();
    // Quedan las 3 pólizas no-cheque y el aviso de exclusión
    expect(screen.getAllByText(/3 póliza/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 cheque\(s\) excluido\(s\)/)).toBeTruthy();
    // Suma general sin el cheque: 1000 + 250 + 500 = 1750
    expect(screen.getAllByText('$1,750.00').length).toBeGreaterThanOrEqual(2);
    // La preferencia persiste
    expect(localStorage.getItem('contasis_diario_cheques')).toBe('0');
  });

  it('toggle OFF: el cheque tampoco entra al consolidado diario ni al continuo', () => {
    render(<DiarioPrintModal polizas={[...polizas, polizaCheque]} empresaId="e1" onClose={vi.fn()} />);
    cambiarRangoMarzo();
    fireEvent.click(screen.getByLabelText('Incluir pólizas de cheque en la impresión'));
    fireEvent.click(screen.getByRole('button', { name: 'Póliza diaria' }));
    // Sin el cheque: 2 hojas diarias (01/03, 05/03) — no la del 07/03
    expect(screen.getAllByText('Póliza Diaria').length).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: 'Libro continuo' }));
    // El folio del cheque no aparece en el libro continuo
    expect(screen.queryByText('CHE-0001')).toBeNull();
    expect(screen.getAllByText('Suma del día').length).toBe(2);
  });

  it('toggle incluido en el libro continuo: el folio del cheque entra una vez', () => {
    render(<DiarioPrintModal polizas={[...polizas, polizaCheque]} empresaId="e1" onClose={vi.fn()} />);
    cambiarRangoMarzo();
    fireEvent.click(screen.getByRole('button', { name: 'Libro continuo' }));
    expect(screen.getAllByText('CHE-0001').length).toBe(1);
  });

  it('opción «Con imagen del cheque»: default DESMARCADA (CH-5: la zona nace en blanco)', () => {
    render(<DiarioPrintModal polizas={[...polizas, polizaCheque]} empresaId="e1" onClose={vi.fn()} />);
    const caja = screen.getByLabelText('Con imagen del cheque en la hoja') as HTMLInputElement;
    expect(caja.checked).toBe(false);
  });

  it('opción «Con imagen del cheque»: la preferencia persistida la enciende al abrir', () => {
    localStorage.setItem('contasis_hoja_cheque_imagen', '1');
    render(<DiarioPrintModal polizas={[...polizas, polizaCheque]} empresaId="e1" onClose={vi.fn()} />);
    const caja = screen.getByLabelText('Con imagen del cheque en la hoja') as HTMLInputElement;
    expect(caja.checked).toBe(true);
  });

  it('opción «Con imagen del cheque»: cambiarla la persiste (clave compartida con la impresión individual)', () => {
    render(<DiarioPrintModal polizas={[...polizas, polizaCheque]} empresaId="e1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Con imagen del cheque en la hoja'));
    expect(localStorage.getItem('contasis_hoja_cheque_imagen')).toBe('1');
    fireEvent.click(screen.getByLabelText('Con imagen del cheque en la hoja'));
    expect(localStorage.getItem('contasis_hoja_cheque_imagen')).toBe('0');
  });
});
