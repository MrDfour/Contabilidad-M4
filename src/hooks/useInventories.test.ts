/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useInventories, inventoriesToGeneral, GENERAL_INVENTORY_KEY } from './useInventories';

/** Cliente de prueba: compone la clave por cliente (C-2 de PLAN_MULTI_CLIENTE.md). */
const KEY = 'contasis_final_inventories_e1';
const empresaId = 'e1';

describe('inventoriesToGeneral (helper puro de migración D-13)', () => {
  it('conserva el valor cuando la clave general ya existe (ignora claves legacy)', () => {
    expect(inventoriesToGeneral({ general: 800, 'j-viejo': 5 })).toEqual({ general: 800 });
  });

  it('migra el PRIMER valor en orden de inserción cuando falta la clave general', () => {
    const raw = { 'j-1': 111, 'j-2': 222 };
    expect(inventoriesToGeneral(raw)).toEqual({ general: 111 });
  });

  it('mapa vacío → vacío; input inválido → vacío (defensivo)', () => {
    expect(inventoriesToGeneral({})).toEqual({});
    expect(inventoriesToGeneral(null as unknown as Record<string, number>)).toEqual({});
  });
});

describe('useInventories (dominio `contasis_final_inventories_<empresaId>` — clave general D-13)', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('NO auto-guarda: setFinalInventories crudo no escribe storage nunca (fiel al original)', async () => {
    const { result } = renderHook(() => useInventories({ empresaId }));
    act(() => { result.current.setFinalInventories({ [GENERAL_INVENTORY_KEY]: 1000 }); });
    await act(async () => {});
    expect(localStorage.getItem(KEY)).toBeNull(); // solo RAM (vía del orquestador de respaldo)
  });

  it('hydrateFromRemote NORMALIZA al formato legacy y persiste EXPLÍCITAMENTE (sync remoto — R1)', async () => {
    const { result } = renderHook(() => useInventories({ empresaId }));

    await act(async () => { result.current.hydrateFromRemote({ 'j-otro': 250, 'j-otro2': 0 }); });

    expect(result.current.finalInventories).toEqual({ general: 250 });
    expect(result.current.finalInventory).toBe(250); // sincronizado con la clave general
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ general: 250 });
    });
  });

  it('handleSetFinalInventory normaliza y persiste bajo la clave general', async () => {
    const { result } = renderHook(() => useInventories({ empresaId }));

    act(() => { result.current.handleSetFinalInventory(500.455); });

    expect(result.current.finalInventory).toBe(500.46); // normalizeAmount (centavos)
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(KEY) as string);
      expect(saved).toEqual({ general: 500.46 });
    });
  });

  it('finalInventory se sincroniza con la clave general al cambiar el mapa (escritura cruda)', () => {
    const { result } = renderHook(() => useInventories({ empresaId }));

    act(() => { result.current.setFinalInventories({ [GENERAL_INVENTORY_KEY]: 700 }); });
    expect(result.current.finalInventory).toBe(700);

    act(() => { result.current.setFinalInventories({}); });
    expect(result.current.finalInventory).toBe(0); // sin clave general → 0
  });

  it('hydrateEmpresa escribe la clave del cliente destino sin alterar la RAM del activo', async () => {
    const { result } = renderHook(() => useInventories({ empresaId }));
    const otros = { general: 999 };

    await act(async () => { result.current.hydrateEmpresa('e2', otros); });

    expect(result.current.finalInventories).toEqual({}); // RAM del activo intacta
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('contasis_final_inventories_e2') as string)).toEqual(otros);
    });
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
