/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCatalog } from './useCatalog';
import { INITIAL_ACCOUNTS } from '../types';
import type { Account } from '../types';

/* Helpers ------------------------------------------------------------- */

const local = (id: string, code: string, name = `Sub ${id}`): Account => ({
  id, code, name, type: 'expense'
});

const setup = (overrides: Partial<Parameters<typeof useCatalog>[0]> = {}) => {
  const props = Object.assign({
    journalId: 'j1',
    journalSubAccounts: [] as Account[],
    canSave: true,
    onSaveError: vi.fn(),
    commitSubAccounts: vi.fn()
  }, overrides) as Parameters<typeof useCatalog>[0];

  const rendered = renderHook(() => useCatalog(props));
  return { ...rendered, props };
};

/* Tests ---------------------------------------------------------------- */

describe('useCatalog (catálogo híbrido — R2, más frágil)', () => {
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

  it('combinedAccounts = globales (recuperadas) + subcuentas del diario, en ese orden', () => {
    const sub = local('sub-1', '9999');
    const { result } = setup({
      journalId: 'j1',
      journalSubAccounts: [sub],
      canSave: false
    });
    act(() => { result.current.setAccounts([INITIAL_ACCOUNTS[0]]); });

    const combined = result.current.combinedAccounts;
    expect(combined).toHaveLength(INITIAL_ACCOUNTS.length + 1);
    expect(combined[combined.length - 1]).toEqual(sub); // locales SIEMPRE al final
  });

  it('handleCombinedAccountsUpdate comitea SOLO locales, con dedup por code y sin globales', () => {
    const commitSubAccounts = vi.fn();
    const existingSub = local('sub-0', '9500');
    const { result } = setup({
      journalId: 'j1',
      journalSubAccounts: [existingSub],
      commitSubAccounts
    });
    act(() => { result.current.setAccounts([INITIAL_ACCOUNTS[0]]); });

    // Updater estilo CatalogView: agrega una NT nueva y un duplicado de una global
    act(() => {
      result.current.handleCombinedAccountsUpdate(prev => [
        ...prev,
        local('nueva', '9600', 'Nueva NT'),
        local('dup', '1101', 'Doble de Caja')
      ]);
    });

    const [calledJournalId, locals] = commitSubAccounts.mock.calls.at(-1);
    expect(calledJournalId).toBe('j1');
    // Locales: la subprevia + la nueva; el duplicado 1101 se descarta por code global
    expect(locals.map((a: Account) => a.code)).toEqual(['9500', '9600']);
  });

  it('handleCombinedAccountsUpdate sin diario activo: no comitea (warning defensivo)', () => {
    const commitSubAccounts = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = setup({ journalId: null, commitSubAccounts });

    act(() => { result.current.handleCombinedAccountsUpdate([]); });

    expect(commitSubAccounts).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('persistencia debounced con canSave=true: escribe contasis_accounts tras 300ms', () => {
    vi.useFakeTimers();
    const { result } = setup({ canSave: true });

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
