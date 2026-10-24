/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TourCoachMark } from './TourCoachMark';
import type { TourStepDef } from '../../types/tour';

const pasoConTarget = (target: string): TourStepDef => ({
  id: 'paso-anclado',
  titulo: 'Paso anclado',
  cuerpo: 'Cuerpo del paso',
  target,
  placement: 'bottom'
});

function rectFrom(top: number, left: number, height: number, width: number): DOMRect {
  return { top, left, bottom: top + height, right: left + width, width, height } as DOMRect;
}

/** jsdom: viewport 1024 × 768. */
describe('TourCoachMark — posición de la tarjeta', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    document.body.innerHTML = '';
  });

  it('muestra el paso con su numeración y no deja la tarjeta fuera del viewport', () => {
    // Objetivo pegado al borde inferior: el lado «bottom» no cabe y el motor
    // debe recortar/girar para mantener la tarjeta dentro del viewport.
    document.body.innerHTML = '<div data-testid="objetivo">x</div>';
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element) { return rectFrom(900, 300, 40, 200); });

    render(
      <TourCoachMark
        paso={pasoConTarget('[data-testid="objetivo"]')}
        pasoIdx={0}
        total={5}
        onNext={() => {}}
        onBack={() => {}}
        onSkip={() => {}}
        onFinish={() => {}}
      />
    );

    const dialogo = screen.getByRole('dialog', { name: /^Recorrido, paso 1 de 5$/ });
    const estilo = dialogo.getAttribute('style') ?? '';
    const top = Number(estilo.match(/top:\s*([\d.]+)px/)?.[1] ?? '0');
    const left = Number(estilo.match(/left:\s*(-?[\d.]+)px/)?.[1] ?? '0');
    expect(left).toBeGreaterThanOrEqual(12);
    expect(top).toBeLessThanOrEqual(768 - 12); // nunca por debajo del borde inferior
    expect(top).toBeGreaterThanOrEqual(12);
    spy.mockRestore();
  });

  it('la tarjeta NUNCA invada al objetivo: si el lado pedido no cabe sin cubrirlo, gira de lado', () => {
    // Caso «Nueva Póliza» (captura del usuario): objetivo pegado al borde
    // derecho; el lado «right» recortado quedaría ENCIMA del botón → debe girar.
    document.body.innerHTML = '<div data-testid="objetivo">x</div>';
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element) { return rectFrom(60, 700, 40, 200); });

    render(
      <TourCoachMark
        paso={{ ...pasoConTarget('[data-testid="objetivo"]'), placement: 'right' }}
        pasoIdx={0}
        total={5}
        onNext={() => {}}
        onBack={() => {}}
        onSkip={() => {}}
        onFinish={() => {}}
      />
    );

    const estilo = screen.getByRole('dialog', { name: /^Recorrido, paso 1 de 5$/ }).getAttribute('style') ?? '';
    const top = Number(estilo.match(/top:\s*([\d.]+)px/)?.[1] ?? '0');
    const left = Number(estilo.match(/left:\s*(-?[\d.]+)px/)?.[1] ?? '0');
    // La tarjeta (384×320) debe quedar enteramente a la IZQUIERDA del objetivo.
    expect(left + 384).toBeLessThanOrEqual(700);
    expect(top).toBeGreaterThanOrEqual(12);
    expect(top + 320).toBeLessThanOrEqual(768 - 12);
    spy.mockRestore();
  });

  it('la tarjeta nunca invada al objetivo: lado «top» recortado sobre el ancla se rechaza', () => {
    // Caso «Libro Diario» (captura del usuario): objetivo arriba a la izquierda;
    // «top» recortado lo taparía → debe girar a «bottom» y quedar debajo.
    document.body.innerHTML = '<div data-testid="objetivo">x</div>';
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element) { return rectFrom(40, 8, 30, 160); });

    render(
      <TourCoachMark
        paso={{ ...pasoConTarget('[data-testid="objetivo"]'), placement: 'top' }}
        pasoIdx={0}
        total={5}
        onNext={() => {}}
        onBack={() => {}}
        onSkip={() => {}}
        onFinish={() => {}}
      />
    );

    const estilo = screen.getByRole('dialog', { name: /^Recorrido, paso 1 de 5$/ }).getAttribute('style') ?? '';
    const top = Number(estilo.match(/top:\s*([\d.]+)px/)?.[1] ?? '0');
    const left = Number(estilo.match(/left:\s*(-?[\d.]+)px/)?.[1] ?? '0');
    // Debe quedar DEBAJO del objetivo (top ≥ bottom del objetivo) y sin cubrirlo.
    expect(top).toBeGreaterThanOrEqual(70);
    expect(left).toBeGreaterThanOrEqual(12);
    expect(left).toBeLessThanOrEqual(168); // no invade horizontalmente al ancla (left 8..168)
    spy.mockRestore();
  });

  it('sin objetivo visible, la tarjeta queda centrada y dentro del viewport', () => {
    render(
      <TourCoachMark
        paso={pasoConTarget('[data-testid="inexistente"]')}
        pasoIdx={2}
        total={5}
        onNext={() => {}}
        onBack={() => {}}
        onSkip={() => {}}
        onFinish={() => {}}
      />
    );
    const dialogo = screen.getByRole('dialog', { name: /^Recorrido, paso 3 de 5$/ });
    const estilo = dialogo.getAttribute('style') ?? '';
    const top = Number(estilo.match(/top:\s*([\d.]+)px/)?.[1] ?? '0');
    const left = Number(estilo.match(/left:\s*(-?[\d.]+)px/)?.[1] ?? '0');
    expect(left).toBeGreaterThanOrEqual(12);
    expect(top).toBeGreaterThanOrEqual(12);
  });
});
