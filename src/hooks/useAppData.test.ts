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
 * si el contrato cambia. Desde Fase 5 NO existen appliers de Journal:
 * el dominio se retiró de RAM (contasis_journals solo se lee para migrar).
 */
function makeAppliers() {
  const mocks = {
    setPolizas: vi.fn(),
    markPolizasMigrated: vi.fn(),
    setFinalInventories: vi.fn(),
    setFixedAssets: vi.fn(),
    setAccounts: vi.fn(),
    markCatalogMigrated: vi.fn()
  };
  return mocks as unknown as AppDataAppliers & typeof mocks;
}

const render = () => {
  const appliers = makeAppliers();
  const onLoaded = vi.fn();
  renderHook(() => useAppData(appliers, onLoaded));
  return { appliers, onLoaded };
};

const INITIAL_READONLY = () => INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true }));

describe('useAppData (orquestador de hidratación, protege R2 — Fase 5 sin Journal)', () => {
  beforeEach(() => { localStorage.clear(); });

  it('hidrata TODOS los dominios activos y marca onLoaded(true) al final', async () => {
    const journals = [{ id: 'j1', name: 'Viejo', entries: [] }];
    localStorage.setItem('contasis_journals', JSON.stringify(journals));
    localStorage.setItem('contasis_final_inventories', JSON.stringify({ j1: 500 }));
    localStorage.setItem('contasis_fixed_assets', JSON.stringify([{ id: 'fa1' }]));
    localStorage.setItem('contasis_accounts', JSON.stringify(INITIAL_READONLY()));
    localStorage.setItem('contasis_polizas', JSON.stringify([{ id: 'p1', folio: 1 }]));

    const { appliers, onLoaded } = render();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.setFixedAssets).toHaveBeenCalledWith([{ id: 'fa1' }]);
    expect(appliers.setAccounts).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ code: '1101', isReadOnly: true })
    ]));
    expect(appliers.setPolizas).toHaveBeenCalledWith([{ id: 'p1', folio: 1 }]);
  });

  it('D-13: inventarios legacy (claves por journalId) se normalizan a la clave general', async () => {
    localStorage.setItem('contasis_final_inventories', JSON.stringify({ 'j-1': 111, 'j-2': 222 }));

    const { appliers, onLoaded } = render();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.setFinalInventories).toHaveBeenCalledWith({ general: 111 });
  });

  it('sin storage previo: catálogo base readonly + pólizas vacías + ambos flags one-shot', async () => {
    const { appliers, onLoaded } = render();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.setAccounts).toHaveBeenCalledWith(INITIAL_READONLY());
    expect(appliers.setPolizas).toHaveBeenCalledWith([]);
    expect(appliers.markPolizasMigrated).toHaveBeenCalledTimes(1);
    expect(appliers.markCatalogMigrated).toHaveBeenCalledTimes(1);
  });

  it('D-12: sin flag de catálogo, consolida las subcuentas de los diarios en contasis_accounts', async () => {
    const globalito = { id: 'a1', code: '1101', name: 'Caja', type: 'asset', isReadOnly: true };
    const journals = [{
      id: 'j1', name: 'Viejo', entries: [],
      subAccounts: [{ id: 's1', code: '9101', name: 'Sub Local', type: 'expense' }]
    }];
    localStorage.setItem('contasis_journals', JSON.stringify(journals));
    localStorage.setItem('contasis_accounts', JSON.stringify([globalito]));
    localStorage.setItem('contasis_polizas_migrated', 'true');

    const { appliers, onLoaded } = render();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.setAccounts).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ code: '1101', isReadOnly: true }),
        expect.objectContaining({ code: '9101', isReadOnly: false })
      ])
    );
    expect(appliers.markCatalogMigrated).toHaveBeenCalledTimes(1);
  });

  it('D-12: con flag de catálogo presente NO re-consolida (respeta eliminaciones del usuario)', async () => {
    localStorage.setItem('contasis_catalog_migrated', 'true');
    localStorage.setItem('contasis_polizas_migrated', 'true');
    const hardcodeadas = [{ id: 'a1', code: '1101', name: 'Caja', type: 'asset', isReadOnly: true }];
    localStorage.setItem('contasis_accounts', JSON.stringify(hardcodeadas));
    localStorage.setItem('contasis_journals', JSON.stringify([
      { id: 'j1', name: 'Viejo', entries: [], subAccounts: [{ id: 's1', code: '9101', name: 'X', type: 'expense' }] }
    ]));

    const { appliers, onLoaded } = render();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.setAccounts).toHaveBeenCalledWith(hardcodeadas);
    expect(appliers.markCatalogMigrated).not.toHaveBeenCalled();
  });

  it('migración one-shot de pólizas: sin storage ni flag → migra los diarios y comanda el flag', async () => {
    const accounts = INITIAL_READONLY();
    const journals = [{
      id: 'j1', name: 'Viejo', entries: [{
        id: 'e1', date: '2025-01-01', description: 'Glosa de prueba',
        policyType: 'ingreso',
        movements: [{ accountId: 'a1', type: 'debit', amount: 100 }]
      }]
    }];
    localStorage.setItem('contasis_journals', JSON.stringify(journals));
    localStorage.setItem('contasis_accounts', JSON.stringify(accounts));

    const { appliers, onLoaded } = render();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.setPolizas).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'e1' })])
    );
    expect(appliers.markPolizasMigrated).toHaveBeenCalledTimes(1);
  });

  it('flag de pólizas presente + clave ausente: NO re-migra (D-2 — borrado total respetado)', async () => {
    localStorage.setItem('contasis_polizas_migrated', 'true');
    localStorage.setItem('contasis_journals', JSON.stringify([{ id: 'j1', name: 'Viejo', entries: [] }]));

    const { appliers, onLoaded } = render();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.setPolizas).toHaveBeenCalledWith([]);
    expect(appliers.markPolizasMigrated).not.toHaveBeenCalled();
  });

  it('storage corrupto: fallback seguro (catálogo inicial sin readonly + pólizas vacías con flag) y onLoaded(true)', async () => {
    // Forzar error: JSON.parse sobre un objeto no-array (asArray falla)
    localStorage.setItem('contasis_polizas', JSON.stringify({ mal: true }));

    const { appliers, onLoaded } = render();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.setAccounts).toHaveBeenCalledWith(INITIAL_ACCOUNTS);
    expect(appliers.setPolizas).toHaveBeenCalledWith([]);
    expect(appliers.markPolizasMigrated).toHaveBeenCalledTimes(1);
  });
});
