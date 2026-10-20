/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { BASIC_NAV_TABS, DEFAULT_TAB, FISCAL_NAV_TABS } from './navigation';

describe('navigation (Fase 3 — módulo Pólizas)', () => {
  it('DEFAULT_TAB es "polizas": el módulo principal de captura abre primero', () => {
    expect(DEFAULT_TAB).toBe('polizas');
  });

  it('BASIC_NAV_TABS: pólizas PRIMERA, diario segundo, catálogo al final', () => {
    expect(BASIC_NAV_TABS[0].id).toBe('polizas');
    expect(BASIC_NAV_TABS[0].label).toBe('Pólizas Contables');
    expect(BASIC_NAV_TABS[1].id).toBe('journal');
    expect(BASIC_NAV_TABS[BASIC_NAV_TABS.length - 1].id).toBe('catalog');
  });

  it('BASIC_NAV_TABS no contiene pestañas fiscales', () => {
    const ids = BASIC_NAV_TABS.map(t => t.id);
    expect(ids).not.toContain('assets');
    expect(ids).not.toContain('electronic');
  });

  it('FISCAL_NAV_TABS se compone DESPUÉS de las básicas y no duplica ids', () => {
    const ids = [...BASIC_NAV_TABS.map(t => t.id), ...FISCAL_NAV_TABS.map(t => t.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.lastIndexOf('assets')).toBeGreaterThan(BASIC_NAV_TABS.length - 1);
  });
});
