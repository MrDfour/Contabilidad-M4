/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAppData, type AppDataAppliers } from './useAppData';
import { INITIAL_ACCOUNTS } from '../types';

/**
 * Appliers espiados: useAppData no posee estado, delega cada dominio.
 * Firmas reales de AppDataAppliers (Fase 3 de PLAN_MULTI_CLIENTE.md):
 * metadatos de clientes viajan por hydrateEmpresas y las claves por cliente
 * por los appliers hydrate*Empresa (anti-R1: viajan por el dueño).
 */
function makeAppliers() {
  const mocks = {
    hydrateEmpresas: vi.fn(),
    markEmpresasMigrated: vi.fn(),
    setPolizas: vi.fn(),
    setFinalInventories: vi.fn(),
    setFixedAssets: vi.fn(),
    setAccounts: vi.fn(),
    hydratePolizasEmpresa: vi.fn(),
    hydrateInventoriesEmpresa: vi.fn(),
    hydrateAccountsEmpresa: vi.fn(),
    hydrateAssetsEmpresa: vi.fn()
  };
  return mocks as unknown as AppDataAppliers & typeof mocks;
}

const INITIAL_READONLY = () => INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true }));

/** renderHook con activaId como prop controlable (simula el estado de useEmpresas en App). */
const setup = (activaInicial: string | null = null) => {
  const appliers = makeAppliers();
  const onLoaded = vi.fn();
  const rendered = renderHook(
    (props: string | null) => useAppData(appliers, onLoaded, props),
    { initialProps: activaInicial }
  );
  return { appliers, onLoaded, rerender: rendered.rerender, result: rendered.result };
};

describe('useAppData (orquestador multi-cliente, protege R2 — PLAN_MULTI_CLIENTE.md)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  // --- Migración one-shot legacy → empresa por defecto (C-2) ---

  it('sin flag de empresas: migra el archivo legacy a un cliente por defecto vía los dueños de las claves', async () => {
    localStorage.setItem('contasis_polizas', JSON.stringify([{ id: 'p1', folio: 1 }]));
    localStorage.setItem('contasis_accounts', JSON.stringify(INITIAL_READONLY()));
    localStorage.setItem('contasis_fixed_assets', JSON.stringify([{ id: 'fa1' }]));
    localStorage.setItem('contasis_final_inventories', JSON.stringify({ legacy: 500 }));

    const { appliers, onLoaded } = setup();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.markEmpresasMigrated).toHaveBeenCalledTimes(1);
    expect(appliers.hydrateEmpresas).toHaveBeenCalledWith({
      activaId: expect.any(String),
      empresas: [expect.objectContaining({ nombre: 'Mi Empresa' })]
    });
    const idDefault = appliers.hydrateEmpresas.mock.calls[0][0].activaId;
    // Copia por cliente vía el hook dueño (nunca las claves globales)
    expect(appliers.hydratePolizasEmpresa).toHaveBeenCalledWith(idDefault, [{ id: 'p1', folio: 1 }]);
    expect(appliers.hydrateAssetsEmpresa).toHaveBeenCalledWith(idDefault, [{ id: 'fa1' }]);
    expect(appliers.hydrateInventoriesEmpresa).toHaveBeenCalledWith(idDefault, { general: 500 }); // D-13
    expect(appliers.hydrateAccountsEmpresa).toHaveBeenCalledWith(idDefault, INITIAL_READONLY());
    // RAM del cliente activo
    expect(appliers.setPolizas).toHaveBeenCalledWith([{ id: 'p1', folio: 1 }]);
    // Las claves globales quedan como ARCHIVO (intactas) — los appliers son mocks,
    // así que la escritura por cliente se verifica en las llamadas, no en el storage.
    expect(JSON.parse(localStorage.getItem('contasis_polizas') as string)).toEqual([{ id: 'p1', folio: 1 }]);
  });

  it('migración de diarios legacy (D-2): contasis_polizas ausente sin flag → pólizas desde journals', async () => {
    localStorage.setItem('contasis_journals', JSON.stringify([{
      id: 'j1', name: 'Viejo', entries: [],
      subAccounts: [{ id: 's1', code: '9101', name: 'Sub', type: 'expense' }]
    },]));
    // Contenido mínimo: entries vacios → sin pólizas, pero el flujo no re-migra jamás
    const { appliers, onLoaded } = setup();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.markEmpresasMigrated).toHaveBeenCalledTimes(1);
    expect(appliers.setPolizas).toHaveBeenCalledWith([]);
  });

  it('D-12 subsumida en la migración de clientes: subAccounts → catálogo del cliente defecto', async () => {
    const globalito = { id: 'a1', code: '1101', name: 'Caja', type: 'asset', isReadOnly: true };
    localStorage.setItem('contasis_journals', JSON.stringify([{
      id: 'j1', name: 'Viejo', entries: [{
        id: 'e1', date: '2025-01-01', description: 'Glosa',
        policyType: 'ingreso',
        movements: [{ accountId: 'a1', type: 'debit', amount: 100 }]
      }],
      subAccounts: [{ id: 's1', code: '9101', name: 'Sub', type: 'expense' }]
    }]));
    localStorage.setItem('contasis_accounts', JSON.stringify([globalito]));

    const { appliers, onLoaded } = setup();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    const catalogo = appliers.hydrateAccountsEmpresa.mock.calls[0][1] as (typeof INITIAL_ACCOUNTS[number])[];
    expect(catalogo.map(a => a.code)).toEqual(expect.arrayContaining(['1101', '9101']));
    expect(catalogo.find(a => a.code === '9101')?.isReadOnly).toBe(false);
    // Y el flujo completo de pólizas también migra los entries del journal
    expect(appliers.setPolizas).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'e1' })])
    );
  });

  // --- Path normal: metadatos vigentes + carga del cliente activo ---

  it('con flag y metadatos: hidrata empresas y carga los dominios del cliente activo', async () => {
    localStorage.setItem('contasis_empresas_migrated', 'true');
    localStorage.setItem('contasis_empresas', JSON.stringify({
      activaId: 'e1',
      empresas: [{ id: 'e1', nombre: 'A' }, { id: 'e2', nombre: 'B' }]
    }));
    localStorage.setItem('contasis_polizas_e1', JSON.stringify([{ id: 'pA' }]));
    localStorage.setItem('contasis_polizas_e2', JSON.stringify([{ id: 'pB' }]));
    localStorage.setItem('contasis_accounts_e1', JSON.stringify(INITIAL_READONLY()));

    const { appliers, onLoaded } = setup();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.hydrateEmpresas).toHaveBeenCalledWith({
      activaId: 'e1',
      empresas: [{ id: 'e1', nombre: 'A' }, { id: 'e2', nombre: 'B' }]
    });
    expect(appliers.setPolizas).toHaveBeenCalledWith([{ id: 'pA' }]);
    expect(appliers.setAccounts).toHaveBeenCalledWith(INITIAL_READONLY());
    expect(appliers.markEmpresasMigrated).not.toHaveBeenCalled();
    // NO toca el archivo del otro cliente
    expect(appliers.hydratePolizasEmpresa).not.toHaveBeenCalled();
  });

  it('C-4: cambio de activaId recarga los dominios desde las claves del cliente destino', async () => {
    localStorage.setItem('contasis_empresas_migrated', 'true');
    localStorage.setItem('contasis_empresas', JSON.stringify({
      activaId: 'e1',
      empresas: [{ id: 'e1', nombre: 'A' }, { id: 'e2', nombre: 'B' }]
    }));
    localStorage.setItem('contasis_polizas_e1', JSON.stringify([{ id: 'pA' }]));
    localStorage.setItem('contasis_polizas_e2', JSON.stringify([{ id: 'pB' }]));
    localStorage.setItem('contasis_fixed_assets_e2', JSON.stringify([{ id: 'faB' }]));
    localStorage.setItem('contasis_final_inventories_e2', JSON.stringify({ legacy: 70 }));

    const { appliers, onLoaded, rerender } = setup();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));
    expect(appliers.setPolizas).toHaveBeenLastCalledWith([{ id: 'pA' }]);

    onLoaded.mockClear();
    // Dos pasos, como en App: el boot asigna el activo (null→e1, sin recarga)
    // y después el usuario cambia de cliente (e1→e2, con recarga).
    await act(async () => { rerender('e1'); });
    await act(async () => { rerender('e2'); });

    await waitFor(() => expect(onLoaded).toHaveBeenLastCalledWith(true));
    expect(onLoaded).toHaveBeenCalledWith(false); // puerta canSave durante la recarga (R2)
    expect(appliers.setPolizas).toHaveBeenLastCalledWith([{ id: 'pB' }]);
    expect(appliers.setFixedAssets).toHaveBeenLastCalledWith([{ id: 'faB' }]);
    expect(appliers.setFinalInventories).toHaveBeenLastCalledWith({ general: 70 }); // D-13 en recarga
  });

  it('nuevo cliente sin claves: recarga con catálogo base readonly y vacíos', async () => {
    localStorage.setItem('contasis_empresas_migrated', 'true');
    localStorage.setItem('contasis_empresas', JSON.stringify({
      activaId: 'e1',
      empresas: [{ id: 'e1', nombre: 'A' }, { id: 'e3', nombre: 'Nueva' }]
    }));

    const { appliers, onLoaded, rerender } = setup();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    await act(async () => { rerender('e1'); });
    await act(async () => { rerender('e3'); });
    await waitFor(() => expect(onLoaded).toHaveBeenLastCalledWith(true));

    expect(appliers.setPolizas).toHaveBeenLastCalledWith([]);
    expect(appliers.setAccounts).toHaveBeenLastCalledWith(INITIAL_READONLY());
    expect(appliers.setFixedAssets).toHaveBeenLastCalledWith([]);
  });

  // --- Fallbacks defensivos ---

  it('con flag pero metadatos corruptos/ausentes: cliente por defecto en RAM SIN escribir claves de dominio', async () => {
    localStorage.setItem('contasis_empresas_migrated', 'true');
    localStorage.setItem('contasis_polizas_eX', JSON.stringify([{ id: 'hist' }])); // claves huérfanas

    const { appliers, onLoaded } = setup();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.hydrateEmpresas).toHaveBeenCalledWith({
      activaId: expect.any(String),
      empresas: [expect.objectContaining({ nombre: 'Mi Empresa' })]
    });
    expect(appliers.hydratePolizasEmpresa).not.toHaveBeenCalled(); // nada se sobrescribe
    appliers.hydrateEmpresas.mockClear();
  });

  it('metadatos corruptos (JSON inválido): fallback cliente por defecto + onLoaded(true), sin marcar flag', async () => {
    localStorage.setItem('contasis_empresas_migrated', 'true');
    // JSON inválido → loadFromStorage lanza → catch principal
    localStorage.setItem('contasis_empresas', '{"activaId": MAL');

    const { appliers, onLoaded } = setup();
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(true));

    expect(appliers.hydrateEmpresas).toHaveBeenCalledWith({
      activaId: expect.any(String),
      empresas: [expect.objectContaining({ nombre: 'Mi Empresa' })]
    });
    expect(appliers.setAccounts).toHaveBeenCalledWith(INITIAL_ACCOUNTS);
    // El fallback NO marca la migración: un re-arranque reintentaría la migración legacy
    expect(appliers.markEmpresasMigrated).not.toHaveBeenCalled();
  });
});
