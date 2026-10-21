/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests del modal "Asignar folios pendientes" (F-6 de PLAN_FUSION_BOVEDA.md):
 * previsualización con el folio propuesto por captura y confirmación Manual.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AsignarFoliosPendientesModal } from './AsignarFoliosPendientesModal';
import type { Poliza } from '../../types';

const p = (id: string, tipo: Poliza['tipo'], folio: number, concepto: string, capturadoEn?: string): Poliza => ({
  id,
  folio,
  tipo,
  fecha: '2026-10-15',
  concepto,
  partidas: [],
  totalDebe: 100,
  totalHaber: 100,
  capturadoEn
});

describe('AsignarFoliosPendientesModal (previsualización de F-6)', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  const lista = [
    p('local', 'egreso', 4, 'Serie local'),
    p('pen-1', 'egreso', 0, 'Temprano', '2026-10-15T09:00:00.000Z'),
    p('pen-2', 'egreso', 0, 'Tarde', '2026-10-16T18:00:00.000Z')
  ];

  it('previsualiza SOLO las pendientes con su folio propuesto en orden de captura', () => {
    const props = { polizas: lista, onConfirmar: vi.fn(), onClose: vi.fn() };
    render(<AsignarFoliosPendientesModal {...props} />);

    expect(screen.getByText('Asignar 2 folios')).toBeTruthy();
    expect(screen.getByText(/2 pólizas entraron sin folio/)).toBeTruthy();
    // En orden de captura: Temprano (primero) predice EGR-0005; Tarde → EGR-0006.
    const temprano = screen.getByText('Temprano').closest('div.rounded-xl') as HTMLElement;
    expect(temprano.textContent).toContain('EGR-0005');
    const tarde = screen.getByText('Tarde').closest('div.rounded-xl') as HTMLElement;
    expect(tarde.textContent).toContain('EGR-0006');
    expect(screen.queryByText('Serie local')).toBeNull(); // la serie local NO se lista
  });

  it('confirmar delega en el hook dueño y cierra; "Más tarde" no toca folios', () => {
    const props = { polizas: lista, onConfirmar: vi.fn(), onClose: vi.fn() };
    render(<AsignarFoliosPendientesModal {...props} />);

    fireEvent.click(screen.getByText('Asignar 2 folios'));
    expect(props.onConfirmar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Más tarde'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
