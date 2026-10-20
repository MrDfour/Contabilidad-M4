/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { migrateCatalogToGlobal } from './migrateCatalogToGlobal';
import { INITIAL_ACCOUNTS, type Account, type Journal } from '../types';

const account = (id: string, code: string, isReadOnly?: boolean): Account => ({
  id,
  code,
  name: `Cuenta ${code}`,
  type: 'expense',
  ...(isReadOnly === undefined ? {} : { isReadOnly })
});

const journalWith = (id: string, subs: Account[]): Journal => ({
  id,
  name: `Diario ${id}`,
  entries: [],
  subAccounts: subs
});

describe('migrateCatalogToGlobal (D-12: consolidación one-shot del catálogo)', () => {
  it('funde las subcuentas de TODOS los diarios al final del catálogo base, en orden de almacenamiento', () => {
    const base = INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true }));
    const subJ1 = account('sub-1', '9101');
    const subJ2 = account('sub-2', '9202');
    const journals = [journalWith('j1', [subJ1]), journalWith('j2', [subJ2])];

    const resultado = migrateCatalogToGlobal(base, journals);

    expect(resultado).toHaveLength(base.length + 2);
    expect(resultado.slice(0, base.length)).toEqual(base); // base intacta y primero
    expect(resultado.at(-2)).toEqual(expect.objectContaining({ code: '9101', isReadOnly: false }));
    expect(resultado.at(-1)).toEqual(expect.objectContaining({ code: '9202', isReadOnly: false }));
  });

  it('dedup por código: NO duplica globales readonly NI cuentas ya creadas por el usuario', () => {
    const base = [...INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true })), account('usuario', '6001')];
    const journals = [
      journalWith('j1', [account('dup-global', INITIAL_ACCOUNTS[0].code), account('dup-usuario', '6001')]),
      journalWith('j2', [])
    ];

    const resultado = migrateCatalogToGlobal(base, journals);

    expect(resultado).toHaveLength(base.length); // nada nuevo: todo era duplicado
    expect(resultado.filter(a => a.code === INITIAL_ACCOUNTS[0].code)).toHaveLength(1);
    expect(resultado.filter(a => a.code === '6001')).toHaveLength(1);
  });

  it('dedup entre subcuentas con el mismo código en diarios distintos', () => {
    const journals = [
      journalWith('j1', [account('a', '9500')]),
      journalWith('j2', [account('b', '9500'), account('c', '9600')])
    ];

    const resultado = migrateCatalogToGlobal([], journals);

    expect(resultado.map(a => a.code)).toEqual(['9500', '9600']);
  });

  it('es IDEMPOTENTE: re-migrar con el catálogo ya consolidado no cambia nada', () => {
    const base = INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true }));
    const journals = [journalWith('j1', [account('sub', '9900')])];

    const primera = migrateCatalogToGlobal(base, journals);
    const segunda = migrateCatalogToGlobal(primera, journals);

    expect(segunda).toEqual(primera);
  });

  it('sin diarios (o diarios sin subcuentas) retorna el catálogo base sin mutarlo', () => {
    const base = [account('g', '1101', true)];
    const journals = [journalWith('j1', [])];

    const resultado = migrateCatalogToGlobal(base, journals);

    expect(resultado).toEqual(base);
    expect(resultado).not.toBe(base); // nueva lista (pura)
    expect(migrateCatalogToGlobal(base, [])).toEqual(base);
  });
});
