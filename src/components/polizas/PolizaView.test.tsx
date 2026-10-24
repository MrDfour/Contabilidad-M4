/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { PolizaView } from './PolizaView';
import { cargarAnexo } from '../../services/attachmentService';
import { clavePorEmpresa } from '../../lib/empresas';
import type { Account, Poliza } from '../../types';

// readExcel vive en utils (xlsx real): se simula el contenido del archivo.
const leerExcelDePrueba = vi.hoisted(() => vi.fn());
vi.mock('../../lib/utils', async () => {
  const real = await vi.importActual<typeof import('../../lib/utils')>('../../lib/utils');
  return { ...real, readExcel: (...args: unknown[]) => leerExcelDePrueba(...args) };
});

const accounts: Account[] = [
  { id: 'a1', code: '1101', name: 'Caja', type: 'asset' },
  { id: 'a2', code: '1102', name: 'Bancos', type: 'asset' }
];

const propsBase = {
  polizas: [] as Poliza[],
  accounts,
  appMode: 'basic' as const,
  empresaId: 'e1',
  onUpdate: vi.fn(),
  onImportPolizas: vi.fn(),
  onAsignarFoliosPendientes: vi.fn((): Poliza[] => []),
  onDeleteRequest: vi.fn(),
  onSetModal: vi.fn()
};

describe('PolizaView — guardado del anexo del cheque (Fase 4 PLAN_CHEQUES.md)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('regresión de la carrera 2026-10-23: al GUARDAR con imagen, el metadato entra a la póliza y el binario queda local', async () => {
    // Hoja de cheque directamente (contasis_hoja_papel recordada).
    localStorage.setItem('contasis_hoja_papel', 'cheque');
    const onCreate = vi.fn();
    render(<PolizaView {...propsBase} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: /Nueva Póliza/ }));
    expect(formato().value).toBe('cheque');

    fireEvent.change(concepto(), { target: { value: 'Cheque integration' } });
    fireEvent.change(screen.getByLabelText('Debe de partida 1'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Haber de partida 2'), { target: { value: '90' } });

    const archivo = new File(['foto-del-cheque'], 'cheque-foto.jpg', { type: 'image/jpeg' });
    // El picker del anexo es el ÚNICO con accept="image/*" (el otro input file
    // de la vista es el de "Importar Excel").
    const picker = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    Object.defineProperty(picker, 'files', { value: [archivo] });
    fireEvent.change(picker);

    fireEvent.click(screen.getByRole('button', { name: /Registrar Póliza/ }));

    // El guardado es async (escalera + sha + registro): esperamos el alta.
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const input = onCreate.mock.calls[0][0] as Parameters<typeof onCreate>[0];
    expect(input.tipo).toBe('cheque');
    expect(input.cheque?.anexos).toHaveLength(1);
    const anexo = input.cheque!.anexos![0];
    expect(anexo.bytes).toBe(15); // 'foto-del-cheque' (pipeline cae al original en jsdom)
    expect(anexo.mime).toBe('image/jpeg');
    expect(anexo.sha256).toMatch(/^[0-9a-f]+$/);

    // CH-11: el binario es local a ESTE equipo — lo recupera el mismo servicio.
    const binario = await cargarAnexo('e1', anexo.sha256);
    expect(binario).not.toBeNull();
    expect(await binario!.text()).toBe('foto-del-cheque');
  });

  it('guardar SIN imagen: la póliza de cheque NO trae anexos y no hay error', async () => {
    localStorage.setItem('contasis_hoja_papel', 'cheque');
    const onCreate = vi.fn();
    const onSetModal = vi.fn();
    render(<PolizaView {...propsBase} onCreate={onCreate} onSetModal={onSetModal} /> );

    fireEvent.click(screen.getByRole('button', { name: /Nueva Póliza/ }));
    fireEvent.change(concepto(), { target: { value: 'Cheque sin foto' } });
    fireEvent.change(screen.getByLabelText('Debe de partida 1'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Haber de partida 2'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar Póliza/ }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const input = onCreate.mock.calls[0][0] as Parameters<typeof onCreate>[0];
    expect(input.cheque?.anexos ?? []).toHaveLength(0);
    expect(onSetModal).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('importación parcial (regresión plantilla 2026-10-23): las cuentas que NO están en el catálogo se avisan en el éxito', async () => {
    // Fila 2 con cuenta muerta del catálogo viejo («Mercaderías»): debe importar
    // el asiento válido Y listar la cuenta omitida en el modal de éxito.
    const onSetModal = vi.fn();
    leerExcelDePrueba.mockResolvedValue([
      { ASIENTO_ID: '1', FECHA: '2024-05-01', GLOSA: 'Apertura', CUENTA: 'Caja', DEBE: 500, HABER: 0 },
      { ASIENTO_ID: '1', FECHA: '2024-05-01', GLOSA: 'Apertura', CUENTA: 'Capital Social', DEBE: 0, HABER: 500 },
      { ASIENTO_ID: '2', FECHA: '2024-05-02', GLOSA: 'Compra', CUENTA: 'Mercaderías', DEBE: 500, HABER: 0 },
      { ASIENTO_ID: '2', FECHA: '2024-05-02', GLOSA: 'Compra', CUENTA: 'Bancos', DEBE: 0, HABER: 500 },
      { ASIENTO_ID: '3', FECHA: null, GLOSA: null, CUENTA: null, DEBE: null, HABER: null }
    ]);
    render(<PolizaView {...propsBase} onCreate={vi.fn()} onSetModal={onSetModal} />);

    const pickerExcel = document.querySelector('input[type="file"][accept=".xlsx,.xls"]') as HTMLInputElement;
    Object.defineProperty(pickerExcel, 'files', { value: [new File(['x'], 'libro.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] });
    fireEvent.change(pickerExcel);

    await waitFor(() => expect(onSetModal).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' })));
    const modal = onSetModal.mock.calls.find(c => c[0].type === 'success')[0] as { message: string };
    expect(modal.message).toContain('2 pólizas diarias');
    expect(modal.message).toContain('Mercaderías');
    expect(modal.message).toContain('se omitieron');
    // Lo válido sí llegó: asientos 1 y 2 → 2 pólizas diarias importadas.
    expect(propsBase.onImportPolizas).toHaveBeenCalledTimes(1);
    const importadas = propsBase.onImportPolizas.mock.calls[0][0] as Poliza[];
    expect(importadas).toHaveLength(2);
  });
});

/** Selectores locales del modal (formato del control FORMATO ▾ y concepto). */
const formato = () => screen.getByLabelText('Formato de la póliza') as HTMLSelectElement;
const concepto = () => screen.getByPlaceholderText(/Cobro de cliente/i) as HTMLInputElement;
