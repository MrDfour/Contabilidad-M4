/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { clavePorEmpresa, BASES_POR_EMPRESA, arrayDe, objetoDe } from './empresas';

describe('clavePorEmpresa (C-2: claves de dominio por cliente)', () => {
  it('sufija la clave del dominio con el id del cliente', () => {
    expect(clavePorEmpresa('contasis_polizas', 'abc-123')).toBe('contasis_polizas_abc-123');
    expect(clavePorEmpresa('contasis_accounts', 'abc-123')).toBe('contasis_accounts_abc-123');
  });

  it('diferencia clientes de forma determinista (dos clientes → dos claves)', () => {
    expect(clavePorEmpresa('contasis_polizas', 'a')).not.toBe(clavePorEmpresa('contasis_polizas', 'b'));
  });

  it('sin id (empresa no activa aún) conserva la base cruda (defensivo)', () => {
    expect(clavePorEmpresa('contasis_polizas', '')).toBe('contasis_polizas');
  });

  it('arrayDe: array crudo pasa; JSON string se parsea; corrupto/otro → []', () => {
    expect(arrayDe([1, 2])).toEqual([1, 2]);
    expect(arrayDe('[{"id": "p1"}]')).toEqual([{ id: 'p1' }]);
    expect(arrayDe('{"mal": true}')).toEqual([]);
    expect(arrayDe('{no es json')).toEqual([]);
    expect(arrayDe(null)).toEqual([]);
    expect(arrayDe(undefined)).toEqual([]);
  });

  it('objetoDe: objeto crudo pasa; JSON string se parsea; array/corrupto/otro → {}', () => {
    expect(objetoDe({ general: 500 })).toEqual({ general: 500 });
    expect(objetoDe('{"general": 500}')).toEqual({ general: 500 });
    expect(objetoDe('[1]')).toEqual({});
    expect(objetoDe('malo')).toEqual({});
    expect(objetoDe(null)).toEqual({});
    expect(objetoDe(undefined)).toEqual({});
  });

  it('las 4 bases de dominio por cliente están declaradas', () => {
    expect(BASES_POR_EMPRESA).toEqual([
      'contasis_polizas',
      'contasis_accounts',
      'contasis_fixed_assets',
      'contasis_final_inventories'
    ]);
  });
});
