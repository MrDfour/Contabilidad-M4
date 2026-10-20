/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCatalog } from './useCatalog';
import { INITIAL_ACCOUNTS } from '../types';
import type { Account } from '../types';

/* Helpers ------------------------------------------------------------- */

const local = (id: string, code: string, name = `Cuenta ${code}`): Account => ({
  id, code, name, type: 'expense', isReadOnly: false
});

const setup = (overrides: Partial<Parameters<typeof useCatalog>[0]> = {}) => {
  const props = Object.assign({
    canSave: true,
    onSaveError: vi.fn()
  }, overrides) as Parameters<typeof useCatalog>[0];

  const rendered = renderHook(() => useCatalog(props));
  return { ...rendered, props };
};

/* Tests ---------------------------------------------------------------- */

describe('useCatalog (catálogo global consolidado — sin híbrido, D-12)', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('recupera quirúrgicamente TODAS las cuentas base (isReadOnly) que falten en el estado', () => {
    // Estado con solo UNA global base (las demás borradas del catálogo)
    const { result } = setup({ canSave: false });
    act(() => { result.current.setAccounts([INITIAL_ACCOUNTS[0]]); });

    // finalGlobals devuelve el catálogo base completo (recuperadas)
    expect(result.current.finalGlobals).toHaveLength(INITIAL_ACCOUNTS.length);
    expect(result.current.finalGlobals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: '1101', isReadOnly: true }),
        expect.objectContaining({ code: '3101', isReadOnly: true })
      ])
    );
  });

  it('combinedAccounts = globales (recuperadas) + locales del propio hook, en ese orden', () => {
    const { result } = setup({ canSave: false });
    act(() => {
      result.current.setAccounts([
        { ...INITIAL_ACCOUNTS[0], isReadOnly: true },
        local('c1', '9101'),
        local('c2', '9102')
      ]);
    });

    const combined = result.current.combinedAccounts;
    expect(combined).toHaveLength(INITIAL_ACCOUNTS.length + 2);
    expect(combined.slice(0, INITIAL_ACCOUNTS.length).every(a => a.isReadOnly)).toBe(true);
    expect(combined.filter(a => !a.isReadOnly).map(a => a.code)).toEqual(['9101', '9102']);
  });

  it('handleCombinedAccountsUpdate comitea SOLO locales al estado completo (dedup por code, sin globales)', () => {
    const { result } = setup();
    act(() => { result.current.setAccounts([INITIAL_ACCOUNTS[0], local('previa', '9500')]); });

    // Updater estilo CatalogView: agrega una NT nueva y un duplicado de una global
    act(() => {
      result.current.handleCombinedAccountsUpdate(prev => [
        ...prev,
        local('nueva', '9600', 'Nueva NT'),
        local('dup', '1101', 'Doble de Caja')
      ]);
    });

    // El estado guarda globales recuperadas SIEMPRE + locales resultantes (dup descartado)
    expect(result.current.accounts.filter(a => !a.isReadOnly).map(a => a.code)).toEqual(['9500', '9600']);
    expect(result.current.accounts.filter(a => a.isReadOnly)).toHaveLength(INITIAL_ACCOUNTS.length);
    expect(result.current.combinedAccounts.at(-1)).toEqual(expect.objectContaining({ code: '9600' }));
  });

  it('handleCombinedAccountsUpdate elimina locales que el updater retira (persisten en accounts, sin híbrido)', () => {
    const { result } = setup();
    act(() => {
      result.current.setAccounts([INITIAL_ACCOUNTS[0], local('a', '9101'), local('b', '9102')]);
    });

    act(() => { result.current.handleCombinedAccountsUpdate(prev => prev.filter(a => a.code !== '9101')); });

    expect(result.current.accounts.filter(a => !a.isReadOnly).map(a => a.code)).toEqual(['9102']);
    expect(result.current.accounts.filter(a => a.isReadOnly)).toHaveLength(INITIAL_ACCOUNTS.length);
  });

  it('markMigrated escribe el flag one-shot `contasis_catalog_migrated`', async () => {
    const { result } = setup();

    act(() => { result.current.markMigrated(); });

    await waitFor(() => {
      expect(localStorage.getItem('contasis_catalog_migrated')).not.toBeNull();
    });
  });

  it('persistencia debounced con canSave=true: escribe contasis_accounts tras 300ms', () => {
    vi.useFakeTimers();
    const { result } = setup();

    const custom = [local('l1', '8888')];
    act(() => { result.current.setAccounts(custom); }); // dispara efecto + timeout 300ms
    expect(localStorage.getItem('contasis_accounts')).toBeNull(); // aún silencioso

    act(() => { vi.advanceTimersByTime(300); });
    const saved = localStorage.getItem('contasis_accounts');
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved as string)).toEqual(custom);
  });

  it('puerta canSave=false: jamás persiste (protege R2: no guardar catálogo vacío pre-hidratación)', () => {
    vi.useFakeTimers();
    const { result } = setup({ canSave: false });

    act(() => { result.current.setAccounts([local('l1', '8888')]); });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(localStorage.getItem('contasis_accounts')).toBeNull();
  });

  it('guardado exitoso no genera llamados a onSaveError', () => {
    vi.useFakeTimers();
    const onSaveError = vi.fn();
    const { result } = setup({ canSave: true, onSaveError });

    act(() => { result.current.setAccounts([local('l1', '8888')]); });
    act(() => { vi.advanceTimersByTime(300); });

    expect(onSaveError).not.toHaveBeenCalled();
  });
});
