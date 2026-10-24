/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TOUR_STEPS } from './steps';

/**
 * Comportamiento de los pasos condicionales del recorrido: los pasos de
 * captura solo aparecen cuando el formulario está abierto (testid
 * `poliza-form`), y los de impresión cuando su modal correspondiente existe.
 */
describe('TOUR_STEPS — pasos condicionales', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('los pasos de captura se omiten si el formulario no está abierto', () => {
    const visibles = TOUR_STEPS.filter(s => !(s.saltarSi && s.saltarSi()));
    expect(visibles.some(s => s.id === 'form-concepto')).toBe(false);
    expect(visibles.some(s => s.id === 'form-partidas')).toBe(false);
    expect(visibles.some(s => s.id === 'form-cheque')).toBe(false);
    expect(visibles.some(s => s.id === 'form-adjunto')).toBe(false);
    expect(visibles.some(s => s.id === 'form-guardar')).toBe(false);
  });

  it('los pasos de captura aparecen cuando el formulario está abierto', () => {
    document.body.innerHTML = `
      <div data-testid="poliza-form">
        <input data-testid="poliza-form-campo-concepto" />
        <div data-testid="poliza-form-partida-0"></div>
        <select data-testid="poliza-form-hoja"></select>
        <label data-testid="poliza-form-adjuntar-cheque"></label>
        <button data-testid="poliza-form-guardar"></button>
      </div>`;
    const visibles = TOUR_STEPS.filter(s => !(s.saltarSi && s.saltarSi()));
    expect(visibles.some(s => s.id === 'form-concepto')).toBe(true);
    expect(visibles.some(s => s.id === 'form-partidas')).toBe(true);
    expect(visibles.some(s => s.id === 'form-cheque')).toBe(true);
    expect(visibles.some(s => s.id === 'form-adjunto')).toBe(true);
    expect(visibles.some(s => s.id === 'form-guardar')).toBe(true);
  });

  it('el paso de impresión individual aparece cuando el modal de impresión está abierto', () => {
    expect(TOUR_STEPS.filter(s => !(s.saltarSi && s.saltarSi())).some(s => s.id === 'imprimir-individual')).toBe(false);
    document.body.innerHTML = '<div data-testid="poliza-print-modal"><button data-testid="poliza-print-btn"></button></div>';
    expect(TOUR_STEPS.filter(s => !(s.saltarSi && s.saltarSi())).some(s => s.id === 'imprimir-individual')).toBe(true);
  });

  it('el paso de impresión del diario aparece cuando su modal está abierto', () => {
    document.body.innerHTML = '<div data-testid="diario-print-sheet"></div>';
    expect(TOUR_STEPS.filter(s => !(s.saltarSi && s.saltarSi())).some(s => s.id === 'journal-print')).toBe(true);
  });

  it('incluye la migración desde Excel con ancla en la Plantilla', () => {
    const paso = TOUR_STEPS.find(s => s.id === 'polizas-importar');
    expect(paso?.target).toBe('[data-testid="poliza-plantilla"]');
  });

  it('el paso de bóveda ancla la tarjeta del diálogo (no el telón) y dispara su apertura', () => {
    const paso = TOUR_STEPS.find(s => s.id === 'respaldo');
    expect(paso?.target).toBe('[data-testid="sync-card"]');
    expect(paso?.accion).toBe('abrir-boveda');
  });

  it('los pasos del encabezado se anclan con testids reales (visibles en las capturas del usuario)', () => {
    expect(TOUR_STEPS.find(s => s.id === 'header')?.target).toBe('[data-testid="app-header"]');
    expect(TOUR_STEPS.find(s => s.id === 'toggle-modo')?.target).toBe('[data-testid="app-modo"]');
    expect(TOUR_STEPS.find(s => s.id === 'empresas')?.target).toBe('[data-testid="header-clientes"]');
    expect(TOUR_STEPS.find(s => s.id === 'tema-sync')?.target).toBe('[data-testid="header-sync"]');
  });

  it('el paso fiscal de XML en la partida es de modo Fiscal y requiere el formulario abierto', () => {
    const paso = TOUR_STEPS.find(s => s.id === 'form-fiscal');
    expect(paso?.requiereFiscal).toBe(true);
    expect(paso?.targetText).toBe('Leer XML');
    expect(paso?.saltarSi?.()).toBe(true); // sin formulario abierto, se omite
    document.body.innerHTML = '<div data-testid="poliza-form"><span>Leer XML</span></div>';
    expect(paso?.saltarSi?.()).toBe(false); // con formulario abierto, se muestra
  });

  it('cada paso de captura tiene su ancla bien definida (target o targetText)', () => {
    for (const paso of TOUR_STEPS) {
      expect(paso.target !== undefined || paso.targetText !== undefined || paso.placement === 'center').toBe(true);
    }
  });
});
