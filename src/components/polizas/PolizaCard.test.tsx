/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { PolizaCard } from './PolizaCard';
import { guardarAnexo } from '../../services/attachmentService';
import type { Poliza } from '../../types';

/** Tarjeta de CHEQUE con anexo si viene; sin él queda como las demás. */
const tarjeta = (anexos = [], empresaId: string | null = 'e1'): Poliza => ({
  id: 'pc1',
  folio: 1,
  tipo: 'cheque',
  fecha: '2026-03-07',
  concepto: 'Pago renta con cheque',
  cheque: { numero: '1042', banco: 'Banorte', beneficiario: 'Juan Pérez', ...(anexos.length > 0 ? { anexos } : {}) },
  partidas: [
    { id: 'pc1-0', accountId: 'a1', accountCode: '1101', accountName: 'Caja', debit: 300, credit: 0 },
    { id: 'pc1-1', accountId: 'a2', accountCode: '3101', accountName: 'Capital Social', debit: 0, credit: 300 }
  ],
  totalDebe: 300,
  totalHaber: 300
});

const acciones = { onEdit: vi.fn(), onDelete: vi.fn(), onPrint: vi.fn() };

describe('PolizaCard — miniatura del anexo del cheque (Fase 4 de PLAN_CHEQUES.md)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('tarjeta SIN anexo: no hay miniatura ni placeholder', () => {
    render(<PolizaCard poliza={tarjeta()} empresaId="e1" {...acciones} />);
    expect(screen.queryByRole('button', { name: 'Ver imagen del cheque' })).toBeNull();
    expect(screen.queryByText(/solo en su equipo/)).toBeNull();
  });

  it('anexo SIN binario local (otro equipo, CH-11): placeholder con la pista', async () => {
    render(
      <PolizaCard
        poliza={tarjeta([{
          id: 'sha-de-otro-equipo',
          sha256: 'sha-de-otro-equipo',
          bytes: 90000,
          mime: 'image/webp',
          capturadoEn: '2026-03-07T10:00:00.000Z'
        }])}
        empresaId="e1"
        {...acciones}
      />
    );
    // La carga del binario es async; el placeholder llega cuando no existe.
    await waitFor(() => {
      expect(screen.getByText(/solo en su equipo/)).toBeTruthy();
    });
  });

  it('anexo con binario local: miniatura → clic abre el lightbox (decisión 2026-10-23)', async () => {
    const { metadato } = (await guardarAnexo('e1', new Blob(['imagen-semilla'], { type: 'image/webp' })))!;
    render(<PolizaCard poliza={tarjeta([metadato])} empresaId="e1" {...acciones} />);
    const ver = await screen.findByRole('button', { name: 'Ver imagen del cheque' });
    fireEvent.click(ver);
    expect(screen.getByRole('dialog', { name: 'Imagen del cheque' })).toBeTruthy();
    fireEvent.click(screen.getByRole('dialog', { name: 'Imagen del cheque' }));
    expect(screen.queryByRole('dialog', { name: 'Imagen del cheque' })).toBeNull();
  });

  it('lightbox VÍA PORTAL: dialogo a nivel de página, Escape cierra y el scroll del fondo se restaura', async () => {
    // Regresión 2026-10-23: el overlay vivía dentro de la tarjeta (ancestro con
    // transformes) y el `fixed` quedaba recortado sin scroll. El visor es un
    // portal a document.body — a nivel de página, cerrable con clic o Escape.
    const { metadato } = (await guardarAnexo('e1', new Blob(['imagen-semilla'], { type: 'image/webp' })))!;
    render(<PolizaCard poliza={tarjeta([metadato])} empresaId="e1" {...acciones} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver imagen del cheque' }));
    const dialogo = screen.getByRole('dialog', { name: 'Imagen del cheque' });
    // Portal: el overlay vive FUERA del árbol de la tarjeta, colgado del body.
    expect(document.body.contains(dialogo)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden'); // sin scroll del fondo
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Imagen del cheque' })).toBeNull();
    expect(document.body.style.overflow).toBe(''); // scroll restaurado
  });

  it('los datos del cheque siguen visibles con el anexo presente (CH-4 + Fase 2)', () => {
    render(
      <PolizaCard
        poliza={tarjeta([{
          id: 'sha',
          sha256: 'sha',
          bytes: 10,
          mime: 'image/webp',
          capturadoEn: '2026-03-07T10:00:00.000Z'
        }])}
        empresaId="e1"
        {...acciones}
      />
    );
    expect(screen.getByText(/Cheque Nº 1042 · Banorte · Juan Pérez/)).toBeTruthy();
  });
});
