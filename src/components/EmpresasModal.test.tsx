/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EmpresasModal } from './EmpresasModal';
import type { Empresa } from '../types';

const empresaA = (): Empresa => ({ id: 'e1', nombre: 'Cliente A', rfc: 'ABC123456XY9' });
const empresaB = (): Empresa => ({ id: 'e2', nombre: 'Cliente B' });

const setup = (empresas: Empresa[] = [empresaA(), empresaB()], activaId = 'e1') => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    empresas,
    activaId,
    onSetActiva: vi.fn(),
    onCrear: vi.fn(),
    onEditar: vi.fn(),
    onEliminarSolicitud: vi.fn()
  };
  render(<EmpresasModal {...props} />);
  return props;
};

describe('EmpresasModal (gestor de clientes, C-1/C-8 de PLAN_MULTI_CLIENTE.md)', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('lista los clientes con su RFC y marca el activo', () => {
    setup();
    expect(screen.getByText('Cliente A')).toBeTruthy();
    expect(screen.getByText('ABC123456XY9')).toBeTruthy();
    expect(screen.getByText('Activo')).toBeTruthy();
    expect(screen.queryByText('Sin RFC')).toBeTruthy(); // Cliente B
  });

  it('el activo no muestra botón "Usar"; el inactivo sí y dispara el switch', () => {
    const props = setup();
    const usar = screen.getByRole('button', { name: 'Usar' });
    fireEvent.click(usar);
    expect(props.onSetActiva).toHaveBeenCalledWith('e2');
  });

  it('prohibido eliminar el ÚLTIMO cliente: botón deshabilitado (C-8)', () => {
    setup([empresaA()], 'e1');
    expect((screen.getByTestId('eliminar-empresa-e1') as HTMLButtonElement).disabled).toBe(true);
  });

  it('con dos clientes la eliminación solicita confirmación en App (no elimina directamente)', () => {
    const props = setup();
    fireEvent.click(screen.getByTestId('eliminar-empresa-e2'));
    expect(props.onEliminarSolicitud).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2' }));
  });

  it('alta de cliente: llama onCrear con el nombre recortado y limpia el campo', () => {
    const props = setup();
    const input = screen.getByPlaceholderText('Nombre del nuevo cliente') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Cliente C  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar Cliente/ }));
    expect(props.onCrear).toHaveBeenCalledWith('Cliente C');
    expect(input.value).toBe('');
  });

  it('alta vacía no dispara onCrear', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /Agregar Cliente/ }));
    expect(props.onCrear).not.toHaveBeenCalled();
  });

  it('edición: comitea nombre recortado y RFC en mayúsculas', async () => {
    const props = setup();
    fireEvent.click(screen.getByTestId('editar-empresa-e2'));

    const nombreInput = screen.getByPlaceholderText('Nombre del cliente') as HTMLInputElement;
    const rfcInput = screen.getByPlaceholderText('RFC del cliente (para los XML SAT)') as HTMLInputElement;
    expect(nombreInput.value).toBe('Cliente B');

    fireEvent.change(nombreInput, { target: { value: ' B Editado ' } });
    fireEvent.change(rfcInput, { target: { value: 'bca010101 xy9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(props.onEditar).toHaveBeenCalledWith('e2', { nombre: 'B Editado', rfc: 'BCA010101XY9' });
    });
  });
});
