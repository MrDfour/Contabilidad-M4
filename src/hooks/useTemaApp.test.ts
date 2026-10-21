/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests del sistema de temas (v0.9.9): validación de lo guardado y el hook
 * (data-theme + persistencia SOLO tras una elección del usuario).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTemaApp } from './useTemaApp';
import { CLAVE_TEMA, COLOR_BARRA_TEMA, TEMAS_APP, temaValido } from '../lib/temas';

describe('temas.ts (catálogo y validación)', () => {
  it('temaValido: acepta los 4 y degrada corruptos/ausentes a oscuro', () => {
    expect(temaValido('oscuro')).toBe('oscuro');
    expect(temaValido('claro')).toBe('claro');
    expect(temaValido('contrasteOscuro')).toBe('contrasteOscuro');
    expect(temaValido('contrasteClaro')).toBe('contrasteClaro');
    expect(temaValido(null)).toBe('oscuro');
    expect(temaValido(undefined)).toBe('oscuro');
    expect(temaValido('clarín')).toBe('oscuro');   // valor corrupto del storage
    expect(temaValido(42)).toBe('oscuro');
  });

  it('el catálogo está completo y cada tema tiene color de barra', () => {
    expect(TEMAS_APP.map(o => o.id)).toEqual(['oscuro', 'claro', 'contrasteOscuro', 'contrasteClaro']);
    for (const opcion of TEMAS_APP) {
      expect(COLOR_BARRA_TEMA[opcion.id]).toMatch(/^#[0-9a-f]{6}$/);
      expect(opcion.etiqueta.length).toBeGreaterThan(0);
    }
  });
});

describe('useTemaApp (persistencia por dispositivo, data-theme en html)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('carga la preferencia del dispositivo y la aplica a <html>', async () => {
    localStorage.setItem(CLAVE_TEMA, JSON.stringify('claro'));
    const { result } = renderHook(() => useTemaApp());
    expect(result.current.tema).toBe('oscuro'); // defecto primero...

    await act(async () => { await Promise.resolve(); }); // la carga async aterriza
    expect(result.current.tema).toBe('claro');
    expect(document.documentElement.getAttribute('data-theme')).toBe('claro');
  });

  it('la carga NO persiste en el montaje (no borra la preferencia con el defecto)', async () => {
    localStorage.setItem(CLAVE_TEMA, JSON.stringify('contrasteClaro'));
    const { result } = renderHook(() => useTemaApp());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.tema).toBe('contrasteClaro');
    // El storage NUNCA fue reescrito por el defecto del montaje:
    expect(JSON.parse(localStorage.getItem(CLAVE_TEMA) ?? '')).toBe('contrasteClaro');
  });

  it('setTema aplica el data-theme Y persiste la elección', async () => {
    // jsdom no carga index.html: fabricamos la meta theme-color esperada.
    if (!document.querySelector('meta[name="theme-color"]')) {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    const { result } = renderHook(() => useTemaApp());
    await act(async () => { await Promise.resolve(); });

    act(() => { result.current.setTema('contrasteOscuro'); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('contrasteOscuro');
    await act(async () => { await Promise.resolve(); });
    expect(JSON.parse(localStorage.getItem(CLAVE_TEMA) ?? '')).toBe('contrasteOscuro');
    // La meta theme-color acompaña al tema (barra Android/PWA):
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#000000');
  });
});
