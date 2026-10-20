/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PolizaForm } from './PolizaForm';
import type { Account, Poliza } from '../../types';
import type { PolizaInput } from '../../hooks/usePolizas';
import type { AppMode } from '../../lib/navigation';

const accounts: Account[] = [
  { id: 'a1', code: '1101', name: 'Caja', type: 'asset' },
  { id: 'a2', code: '3101', name: 'Capital Social', type: 'equity' }
];

const amount = (idx: number) =>
  screen.getByLabelText(`Monto de partida ${idx}`) as HTMLInputElement;

const columnOf = (idx: number) =>
  screen.getByLabelText(`Columna de partida ${idx}`) as HTMLSelectElement;

const conceptoGeneral = () =>
  screen.getByPlaceholderText(/Cobro de cliente/i) as HTMLInputElement;

const submitButton = () =>
  screen.getByRole('button', { name: /Registrar Póliza|Guardar Cambios/ }) as HTMLButtonElement;

const tipoSelect = () => screen.getByLabelText('Tipo de Póliza') as HTMLSelectElement;

const POLIZA_EDITABLE: Poliza = {
  id: 'p1',
  tipo: 'egreso',
  folio: 7,
  fecha: '2026-03-10',
  concepto: 'Pago de renta',
  partidas: [
    {
      id: 'p1-p0',
      accountId: 'a1',
      accountCode: '1101',
      accountName: 'Caja',
      debit: 0,
      credit: 5000
    },
    {
      id: 'p1-p1',
      accountId: 'a2',
      accountCode: '3101',
      accountName: 'Capital Social',
      debit: 5000,
      credit: 0
    }
  ],
  totalDebe: 5000,
  totalHaber: 5000
};

describe('PolizaForm (partida doble en vivo — Fase 3 PLAN_POLIZAS.md)', () => {
  it('arranca deshabilitado (montos en 0) y el tipo es seleccionable', () => {
    render(<PolizaForm accounts={accounts} appMode="basic" onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(submitButton()).toBeDisabled();
    expect(tipoSelect()).not.toBeDisabled();
  });

  it('bloquea el guardado con diferencia visible y habilita al cuadrarse', () => {
    render(<PolizaForm accounts={accounts} appMode="basic" onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(conceptoGeneral(), { target: { value: 'Prueba de apertura' } });

    fireEvent.change(amount(1), { target: { value: '1,000.00' } });
    expect(screen.getByText(/Diferencia:/)).toBeTruthy();
    expect(submitButton()).toBeDisabled();

    fireEvent.change(amount(2), { target: { value: '1000' } });
    expect(screen.queryByText(/Diferencia:/)).toBeNull();
    expect(submitButton()).not.toBeDisabled();
  });

  it('compone el PolizaInput con códigos/nombres de cuenta y lados correctos', () => {
    const onSave = vi.fn();
    render(<PolizaForm accounts={accounts} appMode="basic" onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(conceptoGeneral(), { target: { value: 'Venta de contado' } });
    fireEvent.change(amount(1), { target: { value: '2500.50' } });
    fireEvent.change(amount(2), { target: { value: '2500.60' } });
    // desajuste de centavos: corrijo el segundo
    fireEvent.change(amount(2), { target: { value: '2,500.50' } });

    fireEvent.click(submitButton());

    expect(onSave).toHaveBeenCalledTimes(1);
    const input = onSave.mock.calls[0][0] as PolizaInput;
    expect(input.tipo).toBe('diario');
    expect(input.concepto).toBe('Venta de contado');
    expect(input.partidas).toHaveLength(2);
    expect(input.partidas[0]).toMatchObject({
      accountId: 'a1', accountCode: '1101', accountName: 'Caja',
      debit: 2500.5, credit: 0
    });
    expect(input.partidas[1]).toMatchObject({
      accountId: 'a2', accountCode: '3101', accountName: 'Capital Social',
      debit: 0, credit: 2500.5
    });
  });

  it('exige al menos 2 partidas con monto: la papera está deshabilitada con 2 filas', () => {
    render(<PolizaForm accounts={accounts} appMode="basic" onSave={vi.fn()} onCancel={vi.fn()} />);
    const papera1 = screen.getByLabelText('Eliminar partida 1') as HTMLButtonElement;
    const papera2 = screen.getByLabelText('Eliminar partida 2') as HTMLButtonElement;
    expect(papera1).toBeDisabled();
    expect(papera2).toBeDisabled();
    expect(screen.getAllByLabelText(/Monto de partida/).length).toBe(2);
  });

  it('tipo CONGELADO al editar (D-8): select deshabilitado y "Guardar Cambios"', () => {
    render(
      <PolizaForm
        accounts={accounts}
        appMode="basic"
        initialData={POLIZA_EDITABLE}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(tipoSelect()).toBeDisabled();
    expect((tipoSelect() as HTMLSelectElement).value).toBe('egreso');
    expect(submitButton().textContent).toBe('Guardar Cambios');
    expect(conceptoGeneral().value).toBe('Pago de renta');
  });

  it('campos CFDI (UUID/RFC + Leer XML) SOLO en modo fiscal', () => {
    const { unmount } = render(
      <PolizaForm accounts={accounts} appMode="basic" onSave={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.queryAllByPlaceholderText(/XXXXXXXX-/).length).toBe(0);
    expect(screen.queryAllByPlaceholderText(/XAXX010101000/).length).toBe(0);
    unmount();

    render(<PolizaForm accounts={accounts} appMode="fiscal" onSave={vi.fn()} onCancel={vi.fn()} />);
    // un par UUID/RFC + botón "Leer XML" por cada partida
    expect(screen.getAllByPlaceholderText(/XXXXXXXX-/).length).toBe(2);
    expect(screen.getAllByPlaceholderText(/XAXX010101000/).length).toBe(2);
    expect(screen.getAllByText('Leer XML').length).toBe(2);
  });

  it('elaboro/autorizo viajan al PolizaInput', () => {
    const onSave = vi.fn();
    render(<PolizaForm accounts={accounts} appMode="basic" onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(conceptoGeneral(), { target: { value: 'Asiento inicial' } });
    fireEvent.change(screen.getByLabelText('Elaboró'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Autorizó'), { target: { value: 'Beto' } });
    fireEvent.change(amount(1), { target: { value: '100' } });
    fireEvent.change(amount(2), { target: { value: '100' } });
    fireEvent.click(submitButton());

    const input = onSave.mock.calls[0][0] as PolizaInput;
    expect(input.elaboro).toBe('Ana');
    expect(input.autorizo).toBe('Beto');
  });

  it('cambiar la columna de una partida mueve el monto al lado opuesto en vivo', () => {
    const onSave = vi.fn();
    render(<PolizaForm accounts={accounts} appMode="basic" onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(conceptoGeneral(), { target: { value: 'Traspaso' } });
    fireEvent.change(amount(1), { target: { value: '300' } });
    fireEvent.change(amount(2), { target: { value: '300' } });
    // ambas filas al HABER → desbalance visible y guardado bloqueado
    fireEvent.change(columnOf(1), { target: { value: 'credit' } });
    fireEvent.change(columnOf(2), { target: { value: 'credit' } });

    expect(screen.getByText(/Diferencia:/)).toBeTruthy();
    expect(submitButton()).toBeDisabled();

    // fila 1 vuelve a DEBE: Debe=300 = Haber=300 → habilita
    fireEvent.change(columnOf(1), { target: { value: 'debit' } });
    expect(submitButton()).not.toBeDisabled();

    fireEvent.click(submitButton());
    const input = onSave.mock.calls[0][0] as PolizaInput;
    expect(input.partidas[0]).toMatchObject({ accountId: 'a1', debit: 300, credit: 0 });
    expect(input.partidas[1]).toMatchObject({ accountId: 'a2', debit: 0, credit: 300 });
  });

  it('Cancel llama onCancel (AppMode irrelevante para el tipo)', () => {
    const onCancel = vi.fn();
    render(
      <PolizaForm
        accounts={accounts}
        appMode={'basic' as AppMode}
        onSave={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
