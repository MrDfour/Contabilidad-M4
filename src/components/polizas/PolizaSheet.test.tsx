/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { PolizaChequeSheet, HojaPolizaImprimible } from './PolizaSheet';
import { PolizaPrintModal } from './PolizaPrintModal';
import { guardarAnexo } from '../../services/attachmentService';
import type { ChequeAnexo, Poliza } from '../../types';

/** Póliza de CHEQUE con metadatos (CH-1/CH-4 de PLAN_CHEQUES.md). */
const polizaCheque: Poliza = {
  id: 'pc1',
  folio: 1,
  tipo: 'cheque',
  fecha: '2026-03-07',
  concepto: 'Pago renta con cheque',
  cheque: { numero: '1042', banco: 'Banorte', beneficiario: 'Juan Pérez' },
  partidas: [
    { id: 'pc1-0', accountId: 'a1', accountCode: '1101', accountName: 'Caja', debit: 300, credit: 0 },
    { id: 'pc1-1', accountId: 'a2', accountCode: '3101', accountName: 'Capital Social', debit: 0, credit: 300 }
  ],
  totalDebe: 300,
  totalHaber: 300
};

const polizaDiario: Poliza = {
  id: 'pd1',
  folio: 1,
  tipo: 'diario',
  fecha: '2026-03-08',
  concepto: 'Asiento de ajuste',
  partidas: [
    { id: 'pd1-0', accountId: 'a1', accountCode: '1101', accountName: 'Caja', debit: 100, credit: 0 },
    { id: 'pd1-1', accountId: 'a2', accountCode: '3101', accountName: 'Capital Social', debit: 0, credit: 100 }
  ],
  totalDebe: 100,
  totalHaber: 100
};

/** Variante del cheque CON referencia de anexo (Fase 4); el binario puede o no
 * vivir local en este equipo (CH-11) — ahí va la prueba. */
const polizaChequeConAnexo = (anexos: ChequeAnexo[]): Poliza => ({
  ...polizaCheque,
  cheque: { numero: '1042', banco: 'Banorte', beneficiario: 'Juan P\u00e9rez', anexos }
});

/** Referencia de anexo SIN binario local detrás (simula otro equipo). */
const anexoFalso: ChequeAnexo = {
  id: 'sha-fuera',
  sha256: 'sha-fuera',
  bytes: 12,
  mime: 'image/webp',
  capturadoEn: '2026-03-07T00:00:00.000Z'
};

describe('PolizaChequeSheet (hoja imprimible del cheque - Fase 3 de PLAN_CHEQUES.md)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('título PÓLIZA DE CHEQUE + zona de calcado EN BLANCO (CH-5)', () => {
    render(<PolizaChequeSheet poliza={polizaCheque} />);
    expect(screen.getByText('Póliza de Cheque')).toBeTruthy();
    const zona = screen.getByTestId('zona-calcado-cheque');
    // La zona NO imprime contenido: ni la imagen anexa ni ningún dato caen ahí.
    expect(zona.textContent).toBe('');
  });

  it('con anexos pero SIN la opción «Con imagen del cheque»: la zona queda EN BLANCO (CH-5)', () => {
    // Aunque el metadato del anexo exista, la opción apagada nunca toca el binario.
    render(<PolizaChequeSheet poliza={polizaChequeConAnexo([anexoFalso])} />);
    const zona = screen.getByTestId('zona-calcado-cheque');
    expect(zona.querySelector('img')).toBeNull();
    expect(zona.textContent).toBe('');
  });

  it('opción «Con imagen del cheque» + binario local: la imagen cae DENTRO de la zona de calcado', async () => {
    const { metadato } = (await guardarAnexo('e1', new Blob(['imagen-semilla'], { type: 'image/webp' })))!;
    render(<PolizaChequeSheet poliza={polizaChequeConAnexo([metadato])} conImagen empresaId="e1" />);
    const zona = screen.getByTestId('zona-calcado-cheque');
    await waitFor(() => {
      // La imagen se carga ASÍNCRONamente (vía cargarAnexo): llega con el estado local listo.
      expect(zona.querySelector('img')).toBeTruthy();
    });
    expect(zona.querySelector('img')?.getAttribute('alt')).toBe('Imagen del cheque anexa');
  });

  it('opción encendida pero el binario NO vive en este equipo (CH-11): zona en blanco, el impreso nunca rompe', async () => {
    render(<PolizaChequeSheet poliza={polizaChequeConAnexo([anexoFalso])} conImagen empresaId="e1" />);
    const zona = screen.getByTestId('zona-calcado-cheque');
    await waitFor(() => {
      expect(zona.textContent).toBe('');
    });
    expect(zona.querySelector('img')).toBeNull();
  });

  it('datos del cheque (CH-4) + Nº de póliza de SU serie', () => {
    render(<PolizaChequeSheet poliza={polizaCheque} />);
    expect(screen.getByText('Nº de cheque')).toBeTruthy();
    expect(screen.getByText('1042')).toBeTruthy();
    expect(screen.getByText('Banorte')).toBeTruthy();
    expect(screen.getByText('Juan Pérez')).toBeTruthy();
    expect(screen.getByText('CHE-0001')).toBeTruthy();
  });

  it('pie SUMAS IGUALES (CH-15) + cuadros de concepto del pago y firma', () => {
    render(<PolizaChequeSheet poliza={polizaCheque} />);
    expect(screen.getByText('Sumas iguales')).toBeTruthy();
    expect(screen.getByText('Concepto del pago')).toBeTruthy();
    expect(screen.getByText(/Firma \(cheque\) recibido/i)).toBeTruthy();
    expect(screen.getByText('Pago renta con cheque')).toBeTruthy();
  });

  it('renglones de relleno hasta 10 partidas', () => {
    const { container } = render(<PolizaChequeSheet poliza={polizaCheque} />);
    // 2 partidas reales + 8 de relleno (base 10) + 1 fila de sumas
    const filas = container.querySelectorAll('table tbody tr');
    expect(filas.length).toBe(11);
  });
});

describe('HojaPolizaImprimible (despacho por tipo)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('tipo cheque → hoja de cheque (con zona de calcado)', () => {
    render(<HojaPolizaImprimible poliza={polizaCheque} />);
    expect(screen.getByTestId('zona-calcado-cheque')).toBeTruthy();
  });

  it('tipo diario → hoja clásica (SIN zona de calcado)', () => {
    render(<HojaPolizaImprimible poliza={polizaDiario} />);
    expect(screen.queryByTestId('zona-calcado-cheque')).toBeNull();
    expect(screen.getByText('Sumas iguales')).toBeTruthy();
  });
});

describe('PolizaPrintModal con póliza de cheque (ruta de impresión individual)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('la impresión individual de un cheque muestra su hoja propia', () => {
    render(<PolizaPrintModal poliza={polizaCheque} empresaId="e1" onClose={vi.fn()} />);
    expect(screen.getByText('Póliza de Cheque')).toBeTruthy();
    expect(screen.getByTestId('zona-calcado-cheque')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Imprimir/ })).toBeTruthy();
  });

  it('una póliza normal NO trae zona de calcado', () => {
    render(<PolizaPrintModal poliza={polizaDiario} empresaId="e1" onClose={vi.fn()} />);
    expect(screen.queryByTestId('zona-calcado-cheque')).toBeNull();
  });
});
