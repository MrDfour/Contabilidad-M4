/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useInventories } from './useInventories';

const KEY = 'contasis_final_inventories';

describe('useInventories (dominio `contasis_final_inventories` — sin auto-guardado, por diseño)', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('NO auto-guarda: setFinalInventories crudo no escribe storage nunca (fiel al original)', async () => {
    const { result } = renderHook(() => useInventories({ activeJournalId: 'j1' }));
    act(() => { result.current.setFinalInventories({ j1: 1000 }); });
    await act(async () => {});
    expect(localStorage.getItem(KEY)).toBeNull(); // solo RAM (vía del orquestador de respaldo)
  });

  it('hydrateFromRemote persiste EXPLÍCITAMENTE lo recibido (sync remoto — R1)', async () => {
    const { result } = renderHook(() => useInventories({ activeJournalId: null }));
    const remotos = { 'j-otro': 250, 'j-otro2': 0 };

    await act(async () => { result.current.hydrateFromRemote(remotos); });

    expect(result.current.finalInventories).toEqual(remotos);
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual(remotos);
    });
  });

  it('handleSetFinalInventory normaliza y persiste por diario activo', async () => {
    const { result } = renderHook(() => useInventories({ activeJournalId: 'j1' }));

    act(() => { result.current.handleSetFinalInventory(500.455); });

    expect(result.current.finalInventory).toBe(500.46); // normalizeAmount (centavos)
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(KEY) as string);
      expect(saved).toEqual({ j1: 500.46 });
    });
  });

  it('finalInventory se sincroniza al cambiar el diario activo (0 si no hay entrada)', () => {
    const { result, rerender } = renderHook(
      ({ activeJournalId }) => useInventories({ activeJournalId }),
      { initialProps: { activeJournalId: 'j1' as string | null } }
    );
    act(() => { result.current.setFinalInventories({ j1: 700, j2: 900 }); });
    act(() => { result.current.handleSetFinalInventory(700); });

    rerender({ activeJournalId: 'j2' });
    expect(result.current.finalInventory).toBe(900);

    rerender({ activeJournalId: 'j-inexistente' });
    expect(result.current.finalInventory).toBe(0);

    // Sin diario activo: edita no persiste ni toca el mapa
    rerender({ activeJournalId: undefined as unknown as string });
    act(() => { result.current.handleSetFinalInventory(1); });
    expect(result.current.finalInventory).toBe(1);
    expect(result.current.finalInventories['j1']).toBe(700);
  });
});
