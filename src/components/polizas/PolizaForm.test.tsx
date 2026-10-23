/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  it('reviso (opcional) viaja al PolizaInput y queda ausente si va vacío', () => {
    const onSave = vi.fn();
    const { unmount } = render(<PolizaForm accounts={accounts} appMode="basic" onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(conceptoGeneral(), { target: { value: 'Asiento inicial' } });
    fireEvent.change(screen.getByLabelText('Revisó'), { target: { value: 'Carla' } });
    fireEvent.change(amount(1), { target: { value: '100' } });
    fireEvent.change(amount(2), { target: { value: '100' } });
    fireEvent.click(submitButton());

    expect((onSave.mock.calls[0][0] as PolizaInput).reviso).toBe('Carla');
    unmount();

    // Vacío → undefined (no string vacío)
    const onSave2 = vi.fn();
    render(<PolizaForm accounts={accounts} appMode="basic" onSave={onSave2} onCancel={vi.fn()} />);
    fireEvent.change(conceptoGeneral(), { target: { value: 'Asiento inicial' } });
    fireEvent.change(amount(1), { target: { value: '100' } });
    fireEvent.change(amount(2), { target: { value: '100' } });
    fireEvent.click(submitButton());
    expect((onSave2.mock.calls[0][0] as PolizaInput).reviso).toBeUndefined();
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

describe('PolizaForm modo papel (captura tipo póliza física)', () => {
  const debe = (idx: number) =>
    screen.getByLabelText(`Debe de partida ${idx}`) as HTMLInputElement;
  const haber = (idx: number) =>
    screen.getByLabelText(`Haber de partida ${idx}`) as HTMLInputElement;

  it('renderiza columnas DEBE/HABER por partida y oculta el selector de columna', () => {
    render(
      <PolizaForm
        accounts={accounts}
        appMode="basic"
        modo="papel"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Debe de partida 1')).toBeTruthy();
    expect(screen.getByLabelText('Haber de partida 2')).toBeTruthy();
    // El modo clásico (selector Columna) NO existe en papel
    expect(screen.queryByLabelText('Columna de partida 1')).toBeNull();
    // Y el importe inicial vive en la columna del lado de la fila
    expect(debe(1).value).toBe('');
    expect(haber(1).value).toBe('');
    expect(screen.getByText(/Sumas iguales/i)).toBeTruthy();
  });

  it('teclear en DEBE/HABER fija el lado de la partida y compone el mismo PolizaInput', () => {
    const onSave = vi.fn();
    render(
      <PolizaForm
        accounts={accounts}
        appMode="basic"
        modo="papel"
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );
    fireEvent.change(conceptoGeneral(), { target: { value: 'Venta de contado' } });
    fireEvent.change(debe(1), { target: { value: '2,500.50' } });
    fireEvent.change(haber(2), { target: { value: '2500.60' } });
    fireEvent.change(haber(2), { target: { value: '2,500.50' } });

    fireEvent.click(submitButton());

    const input = onSave.mock.calls[0][0] as PolizaInput;
    expect(input.partidas[0]).toMatchObject({
      accountId: 'a1', accountCode: '1101', accountName: 'Caja',
      debit: 2500.5, credit: 0
    });
    expect(input.partidas[1]).toMatchObject({
      accountId: 'a2', accountCode: '3101', accountName: 'Capital Social',
      debit: 0, credit: 2500.5
    });
  });

  it('cambiar de columna borra el importe previo y la validación sigue bloqueando el desbalance', () => {
    const onSave = vi.fn();
    render(
      <PolizaForm
        accounts={accounts}
        appMode="basic"
        modo="papel"
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );
    fireEvent.change(conceptoGeneral(), { target: { value: 'Traspaso' } });
    fireEvent.change(debe(1), { target: { value: '300' } });
    fireEvent.change(haber(2), { target: { value: '300' } });
    // muevo fila 2 al DEBE → desbalance
    fireEvent.change(debe(2), { target: { value: '300' } });
    expect(haber(2).value).toBe(''); // el importe se movió de columna
    expect(screen.getByText(/Diferencia:/)).toBeTruthy();
    expect(submitButton()).toBeDisabled();

    // regreso fila 2 al HABER → cuadra
    fireEvent.change(haber(2), { target: { value: '300' } });
    expect(submitButton()).not.toBeDisabled();
    fireEvent.click(submitButton());
    const input = onSave.mock.calls[0][0] as PolizaInput;
    expect(input.partidas[1]).toMatchObject({ debit: 0, credit: 300 });
  });

  it('los accesos alternos de captura aparecen solo si el dueño puede persistir (CH-8)', () => {
    const onModoChange = vi.fn();
    const { unmount } = render(
      <PolizaForm accounts={accounts} appMode="basic" onSave={vi.fn()} onCancel={vi.fn()} />
    );
    // Sin dueño: NO hay enlace alterno en clásica
    expect(screen.queryByRole('button', { name: /usar captura en papel/i })).toBeNull();
    unmount();

    // Clásica + dueño → enlace hacia la hoja papel
    render(
      <PolizaForm
        accounts={accounts}
        appMode="basic"
        modo="clasica"
        onModoChange={onModoChange}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /usar captura en papel/i }));
    expect(onModoChange).toHaveBeenCalledWith('papel');
  });
});

describe('PolizaForm CH-8 de PLAN_CHEQUES.md (FORMATO, hoja recordada, cheque)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const formato = () => screen.getByLabelText('Formato de la póliza') as HTMLSelectElement;

  it('modo papel: control FORMATO con las 4 hojas y default DIARIO sin clave previa', () => {
    render(
      <PolizaForm accounts={accounts} appMode="basic" modo="papel" onSave={vi.fn()} onCancel={vi.fn()} />
    );
    expect(formato()).toBeTruthy();
    expect(formato().value).toBe('diario'); // contasis_hoja_papel ausente → Diario (CH-8)
    expect(screen.getByRole('option', { name: 'Póliza de Cheque' })).toBeTruthy();
    // En papel NO existe el select "Tipo de Póliza" clásico ( FORMATO lo sustituye)
    expect(screen.queryByLabelText('Tipo de Póliza')).toBeNull();
  });

  it('elegir FORMATO persiste contasis_hoja_papel y muestra los datos del cheque', () => {
    const onSave = vi.fn();
    render(
      <PolizaForm accounts={accounts} appMode="basic" modo="papel" onSave={onSave} onCancel={vi.fn()} />
    );
    fireEvent.change(formato(), { target: { value: 'cheque' } });
    expect(localStorage.getItem('contasis_hoja_papel')).toBe('cheque');
    expect(screen.getByLabelText('Número de cheque')).toBeTruthy();
    expect(screen.getByLabelText('Banco del cheque')).toBeTruthy();
    expect(screen.getByLabelText('Beneficiario del cheque')).toBeTruthy();
  });

  it('hoja recordada: contasis_hoja_papel=cheque abre el modal EN CHEQUE', () => {
    localStorage.setItem('contasis_hoja_papel', 'cheque');
    render(
      <PolizaForm accounts={accounts} appMode="basic" modo="papel" onSave={vi.fn()} onCancel={vi.fn()} />
    );
    expect(formato().value).toBe('cheque');
    expect(screen.getByLabelText('Número de cheque')).toBeTruthy();
  });

  it('enlace "usar captura clásica (campos)" delega en el dueño (onModoChange)', () => {
    const onModoChange = vi.fn();
    render(
      <PolizaForm
        accounts={accounts}
        appMode="basic"
        modo="papel"
        onModoChange={onModoChange}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /usar captura clásica/i }));
    expect(onModoChange).toHaveBeenCalledWith('clasica');
  });

  it('clásica: TIPO gana "Cheque" → datos del cheque visibles y viajan al PolizaInput', () => {
    const onSave = vi.fn();
    render(
      <PolizaForm accounts={accounts} appMode="basic" modo="clasica" onSave={onSave} onCancel={vi.fn()} />
    );
    expect(screen.queryByLabelText('Formato de la póliza')).toBeNull();
    fireEvent.change(tipoSelect(), { target: { value: 'cheque' } });
    expect(screen.getByLabelText('Número de cheque')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Número de cheque'), { target: { value: '1042' } });
    fireEvent.change(screen.getByLabelText('Banco del cheque'), { target: { value: 'Banorte' } });
    fireEvent.change(screen.getByLabelText('Beneficiario del cheque'), { target: { value: 'Juan Pérez' } });
    fireEvent.change(conceptoGeneral(), { target: { value: 'Pago con cheque' } });
    fireEvent.change(amount(1), { target: { value: '100' } });
    fireEvent.change(amount(2), { target: { value: '100' } });
    fireEvent.click(submitButton());

    const input = onSave.mock.calls[0][0] as PolizaInput;
    expect(input.tipo).toBe('cheque');
    expect(input.cheque).toEqual({ numero: '1042', banco: 'Banorte', beneficiario: 'Juan Pérez' });
  });

  it('tipo/hoja de cheque CONGELADO al editar y el cheque se prellena (D-8/CH-4)', () => {
    const editable: Poliza = {
      id: 'c1',
      tipo: 'cheque',
      folio: 3,
      fecha: '2026-03-10',
      concepto: 'Pago renta con cheque',
      cheque: { numero: '1042', banco: 'Banorte', beneficiario: 'Juan Pérez' },
      partidas: [
        { id: 'c1-1', accountId: 'a1', accountCode: '1101', accountName: 'Caja', debit: 500, credit: 0 },
        { id: 'c1-2', accountId: 'a2', accountCode: '3101', accountName: 'Capital Social', debit: 0, credit: 500 }
      ],
      totalDebe: 500,
      totalHaber: 500
    };
    render(
      <PolizaForm
        accounts={accounts}
        appMode="basic"
        modo="papel"
        initialData={editable}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(formato()).toBeDisabled();
    expect(formato().value).toBe('cheque');
    expect((screen.getByLabelText('Número de cheque') as HTMLInputElement).value).toBe('1042');
    expect((screen.getByLabelText('Banco del cheque') as HTMLInputElement).value).toBe('Banorte');
    expect((screen.getByLabelText('Beneficiario del cheque') as HTMLInputElement).value).toBe('Juan Pérez');
  });

  it('un TIPO diario NO compone cheque en el PolizaInput', () => {
    const onSave = vi.fn();
    render(
      <PolizaForm accounts={accounts} appMode="basic" modo="clasica" onSave={onSave} onCancel={vi.fn()} />
    );
    fireEvent.change(conceptoGeneral(), { target: { value: 'Asiento simple' } });
    expect(screen.queryByLabelText('Número de cheque')).toBeNull(); // diario: SIN datos de cheque
    fireEvent.change(amount(1), { target: { value: '100' } });
    fireEvent.change(amount(2), { target: { value: '100' } });
    fireEvent.click(submitButton());
    expect((onSave.mock.calls[0][0] as PolizaInput).cheque).toBeUndefined();
  });

  it('anexo (regresión de la carrera 2026-10-23): el archivo LLEGA a onSave como 2º argumento SÍNCRONO', () => {
    // Antes: onAnexoPendiente avisaba por un useState del dueño, que React
    // actualiza DESPUÉS del evento; al guardar el anexo todavía era null y
    // la imagen nunca se procesaba. Ahora viaja junto al PolizaInput.
    const onSave = vi.fn();
    const { container } = render(
      <PolizaForm accounts={accounts} appMode="basic" modo="clasica" onSave={onSave} onCancel={vi.fn()} />
    );
    fireEvent.change(tipoSelect(), { target: { value: 'cheque' } });
    fireEvent.change(conceptoGeneral(), { target: { value: 'Pago con cheque' } });
    fireEvent.change(amount(1), { target: { value: '100' } });
    fireEvent.change(amount(2), { target: { value: '100' } });

    const archivo = new File(['foto-del-cheque'], 'cheque-foto.jpg', { type: 'image/jpeg' });
    const picker = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(picker, 'files', { value: [archivo] });
    fireEvent.change(picker);
    fireEvent.click(submitButton());

    expect(onSave).toHaveBeenCalledTimes(1);
    const [input, transportado] = onSave.mock.calls[0];
    expect(input.tipo).toBe('cheque');
    expect(transportado).toBe(archivo);
    expect(transportado.name).toBe('cheque-foto.jpg');
  });

  it('anexo: si el usuario abandona el tipo cheque, el archivo NO viaja al guardado', () => {
    const onSave = vi.fn();
    const { container } = render(
      <PolizaForm accounts={accounts} appMode="basic" modo="clasica" onSave={onSave} onCancel={vi.fn()} />
    );
    fireEvent.change(tipoSelect(), { target: { value: 'cheque' } });
    const archivo = new File(['foto'], 'cheque.jpg', { type: 'image/jpeg' });
    const picker = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(picker, 'files', { value: [archivo] });
    fireEvent.change(picker);
    fireEvent.change(tipoSelect(), { target: { value: 'diario' } });
    fireEvent.change(conceptoGeneral(), { target: { value: 'Asiento simple' } });
    fireEvent.change(amount(1), { target: { value: '100' } });
    fireEvent.change(amount(2), { target: { value: '100' } });
    fireEvent.click(submitButton());
    const [input, transportado] = onSave.mock.calls[0];
    expect(input.tipo).toBe('diario');
    expect(transportado).toBeUndefined();
  });
});
