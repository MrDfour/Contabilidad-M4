/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAppData, type AppDataAppliers } from './useAppData';
import { INITIAL_ACCOUNTS } from '../types';

/**
 * Appliers espiados: useAppData no posee estado, delega cada dominio.
 * Se mantienen las firmas reales de AppDataAppliers para que el test falle
 * si el contrato cambia.
 */
function makeAppliers() {
  const mocks = {
    setJournals: vi.fn(),
    setActiveJournalId: vi.fn(),
    setFinalInventories: vi.fn(),
    setFixedAssets: vi.fn(),
    setAccounts: vi.fn()
  };
  return mocks as unknown as AppDataAppliers & typeof mocks;
}

describe('useAppData (orquestador de hidratación, protege R2)', () => {
  beforeEach(() => { localStorage.clear(); });

  it('hidrata TODOS los dominios desde storage y marca onLoaded(true) al final', async () => {
    const journals = [{ id: 'j-seed', name: 'Histórico', entries: [] }];
    const accounts = [{ id: 'a-local', code: '8888', name: 'Sub', type: 'expense' as const }];
    const inventories = { 'j-seed': 500 };
    const assets = [{
      id: 'asset-1',
      name: 'Equipo',
      acquisitionDate: '2024-01-01',
      originalAmount: 1000,
      assetAccountId: 'a',
      accumulatedDeprAccountId: 'b',
      expenseAccountId: 'c',
      fiscalRate: 0.3,
      isDisposed: false
    }];

    localStorage.setItem('contasis_journals', JSON.stringify(journals));
    localStorage.setItem('contasis_final_inventories', JSON.stringify(inventories));
    localStorage.setItem('contasis_fixed_assets', JSON.stringify(assets));
    localStorage.setItem('contasis_accounts', JSON.stringify(accounts));

    const appliers = makeAppliers();
    const onLoaded = vi.fn();
    renderHook(() => useAppData(appliers, onLoaded));

    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.setJournals).toHaveBeenCalledWith(journals);
    expect(appliers.setActiveJournalId).toHaveBeenCalledWith('j-seed'); // primer diario
    expect(appliers.setFinalInventories).toHaveBeenCalledWith(inventories);
    expect(appliers.setFixedAssets).toHaveBeenCalledWith(assets);
    expect(appliers.setAccounts).toHaveBeenCalledWith(accounts);
  });

  it('sin storage: crea Diario Inicial y catálogo base completo como readonly (copias)', async () => {
    const appliers = makeAppliers();
    const onLoaded = vi.fn();
    renderHook(() => useAppData(appliers, onLoaded));

    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    const journalsCall = appliers.setJournals.mock.calls[0][0];
    expect(journalsCall).toHaveLength(1);
    expect(journalsCall[0].name).toBe('Diario Inicial');
    expect(journalsCall[0].entries).toEqual([]);
    expect(appliers.setActiveJournalId).toHaveBeenCalledWith(journalsCall[0].id);

    const accountsCall = appliers.setAccounts.mock.calls[0][0];
    expect(accountsCall).toHaveLength(INITIAL_ACCOUNTS.length);
    expect(accountsCall).not.toBe(INITIAL_ACCOUNTS); // .map crea copias
    expect(accountsCall.every((a: { isReadOnly?: boolean }) => a.isReadOnly === true)).toBe(true);
  });

  it('contasis_accounts vacío ([]): fallback también a catálogo base readonly', async () => {
    localStorage.setItem('contasis_journals', JSON.stringify([{ id: 'j1', name: 'J', entries: [] }]));
    localStorage.setItem('contasis_accounts', '[]');

    const appliers = makeAppliers();
    const onLoaded = vi.fn();
    renderHook(() => useAppData(appliers, onLoaded));

    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));
    const accountsCall = appliers.setAccounts.mock.calls[0][0];
    expect(accountsCall).toHaveLength(INITIAL_ACCOUNTS.length);
    expect(accountsCall.every((a: { isReadOnly?: boolean }) => a.isReadOnly === true)).toBe(true);
  });

  it('storage críticamente corrupto: fallback seguro (Diario Inicial + catálogo base SIN readonly)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // String NO-JSON en contasis_journals: loadFromStorage hace JSON.parse y lanza
    // → cae en el catch del hook (comportamiento y mensaje idénticos al original).
    localStorage.setItem('contasis_journals', 'esto-no-es-json{{{{');

    const appliers = makeAppliers();
    const onLoaded = vi.fn();
    renderHook(() => useAppData(appliers, onLoaded));

    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));
    expect(error).toHaveBeenCalled();

    const journalsCall = appliers.setJournals.mock.calls[0][0];
    expect(journalsCall[0].name).toBe('Diario Inicial');
    // En el fallback el catálogo base viaja SIN mapear isReadOnly (idéntico al original)
    expect(appliers.setAccounts.mock.calls[0][0]).toBe(INITIAL_ACCOUNTS);
  });
});
