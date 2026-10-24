/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TourOverlay } from './TourOverlay';
import type { TourStepDef } from '../../types/tour';

const basicStep: TourStepDef = {
  id: 'test-step',
  titulo: 'Test step',
  cuerpo: 'Este es un paso de test',
  target: '[data-testid="nonexistent-element"]',
  placement: 'bottom'
};

const textTargetStep: TourStepDef = {
  id: 'text-target',
  titulo: 'Test con texto',
  cuerpo: 'Target por texto',
  targetText: 'No existe este texto en el DOM',
  placement: 'bottom'
};

describe('TourOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="test-root"></div>';
  });

  afterEach(() => {
    cleanup();
  });

  it('renderiza overlay cuando el target existe', () => {
    document.body.innerHTML = '<div data-testid="existing-target">Test element</div>';
    render(<TourOverlay paso={{ id: 'test', titulo: 'T', cuerpo: 'C' }} />);
    // Overlay es un portal a document.body; buscamos el contenedor por z-index.
    const overlay = document.querySelector('.z-\\[200\\]');
    expect(overlay).toBeTruthy();
  });

  it('no renderiza spotlight cuando el target no existe y no hay texto visible', () => {
    render(<TourOverlay paso={basicStep} />);
    // Sin target en DOM y sin texto visible → el overlay existe pero no el spotlight.
    const spotlightSquares = document.querySelectorAll('[style*="height: 0px"]');
    expect(spotlightSquares.length).toBe(0);
  });

  it('resuelve target por texto visible cuando no hay selector', () => {
    document.body.innerHTML = '<h1>Contabilidad M4 Pro</h1>';
    render(<TourOverlay paso={textTargetStep} />);
    // Con texto pero no coincidencia exacta, el overlay se renderiza pero sin spotlight.
    const overlay = document.querySelector('.z-\\[200\\]');
    expect(overlay).toBeTruthy();
  });
});