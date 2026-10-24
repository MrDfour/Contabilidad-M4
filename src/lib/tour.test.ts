/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DEMO_EMPRESA_ID, esUnicaEmpresaDemo } from './tour';
import type { Empresa } from '../types';

describe('esUnicaEmpresaDemo — salvaguarda de la purga de demo', () => {
  const demo: Empresa = { id: DEMO_EMPRESA_ID, nombre: 'Demo — Tour Interactivo' };
  const real: Empresa = { id: 'empresa-1', nombre: 'Contabilidad JVC' };

  it('permite purgar solo cuando la demo es el único cliente', () => {
    expect(esUnicaEmpresaDemo([demo])).toBe(true);
  });

  it('no permite purgar si no hay clientes', () => {
    expect(esUnicaEmpresaDemo([])).toBe(false);
  });

  it('no permite purgar si además existe un cliente real', () => {
    expect(esUnicaEmpresaDemo([demo, real])).toBe(false);
  });

  it('no permite purgar si el único cliente no es la demo', () => {
    expect(esUnicaEmpresaDemo([real])).toBe(false);
  });
});
