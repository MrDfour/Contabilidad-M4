/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAppData, type AppDataAppliers } from './useAppData';
import { INITIAL_ACCOUNTS, type Journal } from '../types';

/**
 * Appliers espiados: useAppData no posee estado, delega cada dominio.
 * Se mantienen las firmas reales de AppDataAppliers para que el test falle
 * si el contrato cambia.
 */
function makeAppliers() {
  const mocks = {
    setJournals: vi.fn(),
    setActiveJournalId: vi.fn(),
    setPolizas: vi.fn(),
    markPolizasMigrated: vi.fn(),
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
    // Fallback de pólizas: vacías + flag de migración (evita re-migrar con datos corrompidos)
    expect(appliers.setPolizas).toHaveBeenCalledWith([]);
    expect(appliers.markPolizasMigrated).toHaveBeenCalled();
  });

  // --- Fase 2 módulo Pólizas: carga, migración ONE-SHOT y guard del flag (D-2) ---

  describe('dominio pólizas', () => {
    it('con contasis_polizas en storage: hidrata y NUNCA marca migración', async () => {
      const polizas = [{ id: 'p1', folio: 1, tipo: 'diario', fecha: '2024-01-01', concepto: 'C', partidas: [], totalDebe: 0, totalHaber: 0 }];
      localStorage.setItem('contasis_polizas', JSON.stringify(polizas));

      const appliers = makeAppliers();
      const onLoaded = vi.fn();
      renderHook(() => useAppData(appliers, onLoaded));

      await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));
      expect(appliers.setPolizas).toHaveBeenCalledWith(polizas);
      expect(appliers.markPolizasMigrated).not.toHaveBeenCalled();
    });

    it('sin contasis_polizas Y sin flag: migración ONE-SHOT de los diarios cargados + flag', async () => {
      const journals: Journal[] = [{
        id: 'j1',
        name: 'Histórico',
        entries: [{
          id: 'e1',
          date: '2024-01-05',
          description: 'Venta',
          movements: [
            { accountId: 'a1', type: 'debit', amount: 120, uuidCFDI: 'uuid-36', rfcTercero: 'XAXX010101000' },
            { accountId: 'a2', type: 'credit', amount: 120 }
          ]
        }]
      }];
      const accounts = [{ id: 'a1', code: '1101', name: 'Caja', type: 'asset' as const }];
      localStorage.setItem('contasis_journals', JSON.stringify(journals));
      localStorage.setItem('contasis_accounts', JSON.stringify(accounts));

      const appliers = makeAppliers();
      const onLoaded = vi.fn();
      renderHook(() => useAppData(appliers, onLoaded));

      await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

      expect(appliers.setPolizas).toHaveBeenCalledTimes(1);
      const migradas = appliers.setPolizas.mock.calls[0][0];
      expect(migradas).toHaveLength(1);
      expect(migradas[0]).toMatchObject({
        id: 'e1', folio: 1, tipo: 'diario', fecha: '2024-01-05',
        concepto: 'Venta', totalDebe: 120, totalHaber: 120
      });
      expect(migradas[0].partidas[0]).toMatchObject({
        accountId: 'a1', accountCode: '1101', accountName: 'Caja',
        debit: 120, credit: 0, uuidCFDI: 'uuid-36', rfcTercero: 'XAXX010101000'
      });
      expect(appliers.markPolizasMigrated).toHaveBeenCalledTimes(1);
      // Los journals del histórico NO se agregan a las migraciones (archivo intacto)
      expect(appliers.setJournals).toHaveBeenCalledWith(journals);
    });

    it('sin contasis_polizas PERO con flag: NO re-migra (D-2: respeta el borrado total) → []', async () => {
      localStorage.setItem('contasis_polizas_migrated', 'true');
      localStorage.setItem('contasis_journals', JSON.stringify([{
        id: 'j1', name: 'Histórico', entries: []
      }]));

      const appliers = makeAppliers();
      const onLoaded = vi.fn();
      renderHook(() => useAppData(appliers, onLoaded));

      await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));
      expect(appliers.setPolizas).toHaveBeenCalledWith([]);
      expect(appliers.markPolizasMigrated).not.toHaveBeenCalled();
    });

    it('journal corrupto: fallback seguro con pólizas [] + flag de migración', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem('contasis_journals', 'esto-no-es-json{{{{');

      const appliers = makeAppliers();
      renderHook(() => useAppData(appliers, vi.fn()));

      await waitFor(() => expect(appliers.setPolizas).toHaveBeenCalled());
      expect(appliers.setPolizas).toHaveBeenCalledWith([]);
      expect(appliers.markPolizasMigrated).toHaveBeenCalled();
      error.mockRestore();
    });
  });
});
