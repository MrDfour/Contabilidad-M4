/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEmpresas } from './useEmpresas';
import type { EstadoEmpresas } from '../types';

describe('useEmpresas (domino CLIENTES — PLAN_MULTI_CLIENTE.md)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('arranca vacío (sin cliente activo hasta que useAppData hidrata)', () => {
    const { result } = renderHook(() => useEmpresas({ canSave: false }));
    expect(result.current.empresas).toEqual([]);
    expect(result.current.activaId).toBeNull();
    expect(result.current.activa).toBeNull();
  });

  it('crearEmpresa agrega con nombre recortado e id estable; NO cambia el activo', () => {
    const { result } = renderHook(() => useEmpresas({ canSave: false }));
    let creada!: { id: string; nombre: string };
    act(() => { creada = result.current.crearEmpresa('  Cliente A  '); });

    expect(creada.nombre).toBe('Cliente A');
    expect(creada.id).toBeTruthy();
    expect(result.current.empresas).toHaveLength(1);
    expect(result.current.activaId).toBeNull(); // alta no activa el cliente nuevo
  });

  it('actualizarEmpresa edita nombre/rfc y el id es inmutable', () => {
    const { result } = renderHook(() => useEmpresas({ canSave: false }));
    let emp!: { id: string };
    act(() => { emp = result.current.crearEmpresa('Cliente B'); });

    act(() => {
      result.current.actualizarEmpresa(emp.id, { nombre: 'B Editado', rfc: 'ABC123456XY9' });
    });

    expect(result.current.empresas[0]).toEqual({ id: emp.id, nombre: 'B Editado', rfc: 'ABC123456XY9' });
  });

  it('eliminarEmpresa: prohibido eliminar el ÚLTIMO cliente (C-8, defensivo en hook)', () => {
    const { result } = renderHook(() => useEmpresas({ canSave: false }));
    let unica!: { id: string };
    act(() => { unica = result.current.crearEmpresa('Única'); });
    act(() => { result.current.setActiva(unica.id); });

    const snapshot = [...result.current.empresas];
    let resultado!: boolean;
    act(() => { resultado = result.current.eliminarEmpresa(unica.id); });

    expect(resultado).toBe(false);
    expect(result.current.empresas).toEqual(snapshot);
    expect(result.current.activaId).toBe(unica.id);
  });

  it('eliminar el cliente ACTIVO cambia el activo al primero restante (C-8)', () => {
    const { result } = renderHook(() => useEmpresas({ canSave: false }));
    act(() => { result.current.crearEmpresa('Uno'); result.current.crearEmpresa('Dos'); });
    const primero = result.current.empresas[0];
    const segundo = result.current.empresas[1];
    act(() => { result.current.setActiva(segundo.id); });

    let eliminado!: boolean;
    act(() => { eliminado = result.current.eliminarEmpresa(segundo.id); });

    expect(eliminado).toBe(true);
    expect(result.current.empresas).toHaveLength(1);
    expect(result.current.activaId).toBe(primero.id);
  });

  it('eliminar un cliente INACTIVO mantiene el activo', () => {
    const { result } = renderHook(() => useEmpresas({ canSave: false }));
    act(() => { result.current.crearEmpresa('Uno'); result.current.crearEmpresa('Dos'); });
    const primero = result.current.empresas[0];
    const segundo = result.current.empresas[1];
    act(() => { result.current.setActiva(primero.id); });

    act(() => { result.current.eliminarEmpresa(segundo.id); });
    expect(result.current.activaId).toBe(primero.id);
  });

  it('hydrate persiste explícitamente el estado completo { activaId, empresas }', async () => {
    const { result } = renderHook(() => useEmpresas({ canSave: false }));
    const estado: EstadoEmpresas = {
      activaId: 'e1',
      empresas: [{ id: 'e1', nombre: 'Mi Empresa', rfc: 'XAXX010101000' }]
    };
    await act(async () => { result.current.hydrate(estado); });

    expect(result.current.empresas).toHaveLength(1);
    expect(result.current.activa?.nombre).toBe('Mi Empresa');
    await waitFor(() => {
      const saved = localStorage.getItem('contasis_empresas');
      expect(saved).not.toBeNull();
      expect(JSON.parse(saved as string)).toEqual(estado);
    });
  });

  it('hydrate persiste SIEMPRE, incluso lista vacía', async () => {
    const { result } = renderHook(() => useEmpresas({ canSave: false }));
    await act(async () => { result.current.hydrate({ activaId: null, empresas: [] }); });
    await waitFor(() =>
      expect(localStorage.getItem('contasis_empresas')).toBe(JSON.stringify({ activaId: null, empresas: [] }))
    );
  });

  it('efecto con canSave persiste los mutadores (post-carga persiste SIEMPRE)', async () => {
    const { result } = renderHook(() => useEmpresas({ canSave: true }));
    act(() => { result.current.crearEmpresa('Persistida'); });

    await waitFor(() => {
      const saved = localStorage.getItem('contasis_empresas');
      const parsed = JSON.parse(saved as string) as EstadoEmpresas;
      expect(parsed.empresas).toHaveLength(1);
      expect(parsed.empresas[0].nombre).toBe('Persistida');
    });
  });

  it('sin canSave NO persiste (nunca escribe antes de hidratar)', async () => {
    const { result } = renderHook(() => useEmpresas({ canSave: false }));
    act(() => { result.current.crearEmpresa('No persistida'); });
    await act(async () => {}); // cede la tarea para descartar escrituras tardías
    expect(localStorage.getItem('contasis_empresas')).toBeNull();
  });

  it('setActiva cambia el activo (dispara la recarga de dominios en useAppData — C-4)', async () => {
    const { result } = renderHook(() => useEmpresas({ canSave: false }));
    act(() => { result.current.crearEmpresa('Uno'); result.current.crearEmpresa('Dos'); });
    const segundo = result.current.empresas[1];

    act(() => { result.current.setActiva(segundo.id); });
    expect(result.current.activa?.nombre).toBe('Dos');

    await act(async () => {}); // el efecto con canSave=false no escribe
  });

  it('markMigrated/isMigrated: flag ausente → false; tras marcar → true (idempotente)', async () => {
    const { result } = renderHook(() => useEmpresas({ canSave: false }));
    await expect(result.current.isMigrated()).resolves.toBe(false);

    await act(async () => { result.current.markMigrated(); });
    await expect(result.current.isMigrated()).resolves.toBe(true);

    await act(async () => { result.current.markMigrated(); });
    await expect(result.current.isMigrated()).resolves.toBe(true);
  });
});
