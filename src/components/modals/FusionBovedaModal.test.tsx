/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests de la pantalla de revisión de fusión (Fase C de
 * PLAN_FUSION_BOVEDA.md): secciones, decisiones de folio F-2, duplicados F-5
 * y bloqueo de aplicación sin decisiones completas (F-8).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FusionBovedaModal, narrarResumenFusion, type FusionBovedaEntrada } from './FusionBovedaModal';
import type { Poliza } from '../../types';
import type { BackupSnapshotV3, EmpresaWorkspace } from '../../hooks/useBackup';
import type { ResumenFusion } from '../../lib/unionBovedas';

let nodo = 0;

const poliza = (args: {
  tipo: Poliza['tipo'];
  folio: number;
  concepto: string;
  capturadoEn?: string;
  editadoEn?: string;
}): Poliza => {
  nodo += 1;
  const id = `p${nodo}`;
  return {
    id,
    folio: args.folio,
    tipo: args.tipo,
    fecha: '2026-10-15',
    concepto: args.concepto,
    partidas: [],
    totalDebe: 100,
    totalHaber: 100,
    capturadoEn: args.capturadoEn,
    editadoEn: args.editadoEn,
  };
};

const empresa = (id: string, parciales: Partial<EmpresaWorkspace>): EmpresaWorkspace => ({
  id,
  nombre: `Cliente ${id}`,
  polizas: [],
  accounts: [],
  fixedAssets: [],
  finalInventories: {},
  ...parciales,
});

/** Escenario cubriendo las cuatro categorías del análisis. */
const fabricarEntrada = (): { entrada: FusionBovedaEntrada; ids: { choca: string; gemela: string } } => {
  nodo = 0;
  const localBase = poliza({ tipo: 'ingreso', folio: 1, concepto: 'Venta A', capturadoEn: '2026-10-15T10:00:00.000Z' });
  const egresoLocal = poliza({ tipo: 'egreso', folio: 1, concepto: 'Gasolina', capturadoEn: '2026-10-15T11:00:00.000Z' });
  const choca = poliza({ tipo: 'ingreso', folio: 1, concepto: 'Choca con folio 1', capturadoEn: '2026-10-16T12:00:00.000Z' });
  const libre = poliza({ tipo: 'ingreso', folio: 3, concepto: 'Folio libre', capturadoEn: '2026-10-16T13:00:00.000Z' });
  const gemela = poliza({ tipo: 'egreso', folio: 2, concepto: 'Gasolina', capturadoEn: '2026-10-16T14:00:00.000Z' });
  const editadaRemota: Poliza = { ...localBase, concepto: 'Venta A editada', editadoEn: '2026-10-16T15:00:00.000Z' };

  const local: BackupSnapshotV3 = {
    empresas: [empresa('e1', { polizas: [localBase, egresoLocal] })],
    activaId: 'e1',
  };
  const remoto: BackupSnapshotV3 = {
    empresas: [empresa('e1', { polizas: [choca, libre, gemela, editadaRemota] })],
    activaId: 'e1',
  };
  return { entrada: { local, remoto }, ids: { choca: choca.id, gemela: gemela.id } };
};

describe('FusionBovedaModal (revisión del tercer camino, Fase C)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const setup = (entradaArgs = fabricarEntrada()) => {
    const props = {
      entrada: entradaArgs.entrada,
      onAplicar: vi.fn(),
      onCancelar: vi.fn(),
    };
    render(<FusionBovedaModal {...props} />);
    return { props, ids: entradaArgs.ids };
  };

  it('abre con la pestaña Resumen: conteos correctos por categoría', () => {
    setup();
    expect(screen.getByText(/Revisar la fusión de ambos/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resumen (2)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Folios en disputa (1)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Duplicados sospechosos (1)' })).toBeTruthy();
    expect(screen.getByText(/gana LO REMOTO/)).toBeTruthy(); // edición cruzada F-3 listada
    expect(screen.getByText(/Se suman directo: 1 póliza/)).toBeTruthy();
  });

  it('sin decisiones de folio el botón Aplicar está DESHABILITADO (F-8)', () => {
    setup();
    const aplicar = screen.getByRole('button', { name: 'Aplicar fusión' }) as HTMLButtonElement;
    expect(aplicar.disabled).toBe(true);
    expect(screen.getByText(/Faltan decisiones: 1 póliza/)).toBeTruthy();
  });

  it('decidir el folio como pendiente habilita y aplica con folio 0; directo conserva su folio', () => {
    const { props, ids } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Folios en disputa (1)' }));
    fireEvent.click(screen.getByText('Folio pendiente'));

    const aplicar = screen.getByRole('button', { name: 'Aplicar fusión' }) as HTMLButtonElement;
    expect(aplicar.disabled).toBe(false);
    fireEvent.click(aplicar);

    expect(props.onAplicar).toHaveBeenCalledTimes(1);
    const snapshot = props.onAplicar.mock.calls[0][0] as BackupSnapshotV3;
    const polizas = snapshot.empresas[0].polizas;
    // pendiente: folio 0 — directo: conserva su folio 3 — duplicado: EXCLUIDO por defecto.
    expect(polizas.find((p) => p.concepto === 'Choca con folio 1')!.folio).toBe(0);
    expect(polizas.find((p) => p.concepto === 'Folio libre')!.folio).toBe(3);
    expect(polizas.filter((p) => p.concepto === 'Gasolina')).toHaveLength(1); // solo la local
    expect(props.onAplicar.mock.calls[0][1] as ResumenFusion).toMatchObject({ pendientes: 1, excluidas: 1 });
    expect(ids.choca).toBeTruthy(); // sanidad del arreglo de prueba
  });

  it('incluir el duplicado NO libera la decisión de folio; aplicando, la gemela entra (F-5)', () => {
    const { props, ids } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicados sospechosos (1)' }));
    fireEvent.click((screen.getByText(/EGR-0002 · Gasolina/).closest('label')) as HTMLElement);

    const aplicar = screen.getByRole('button', { name: 'Aplicar fusión' }) as HTMLButtonElement;
    // El colisionante sigue sin decidirse: incluir el duplicado NO libera el F-8.
    expect(aplicar.disabled).toBe(true);

    // Decidir el folio como 'final' y aplicar: la gemela SÍ entra.
    fireEvent.click(screen.getByRole('button', { name: 'Folios en disputa (1)' }));
    fireEvent.click(screen.getByText('Al final consecutivo'));
    expect(aplicar.disabled).toBe(false);
    fireEvent.click(aplicar);

    const snapshot = props.onAplicar.mock.calls[0][0] as BackupSnapshotV3;
    expect(snapshot.empresas[0].polizas.filter((p) => p.concepto === 'Gasolina')).toHaveLength(2); // local + entrante incluida
    const resumen = props.onAplicar.mock.calls[0][1] as ResumenFusion;
    expect(resumen.excluidas).toBe(0);
    expect(ids.gemela).toBeTruthy();
  });

  it('cancelar cierra la revisión sin aplicar ni consumir el conflicto (F-8)', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(props.onCancelar).toHaveBeenCalledTimes(1);
    expect(props.onAplicar).not.toHaveBeenCalled();
  });

  it('narrarResumenFusion arma el toast con las piezas relevantes', () => {
    expect(
      narrarResumenFusion({
        sumadas: 2,
        reFoliadas: 1,
        localesReFoliadas: 0,
        pendientes: 1,
        finales: 0,
        edicionesRemotoGanan: 1,
        edicionesLocalGanan: 0,
        excluidas: 1,
        cuentasAgregadas: 0,
        activosAgregados: 0,
      })
    ).toBe('2 póliza(s) sumadas, 1 edición(es) cruzadas resueltas, 1 folio(s) re-foliado(s), 1 folio(s) pendiente(s), 1 duplicado(s) excluido(s).');
    expect(
      narrarResumenFusion({
        sumadas: 0,
        reFoliadas: 0,
        localesReFoliadas: 0,
        pendientes: 0,
        finales: 0,
        edicionesRemotoGanan: 0,
        edicionesLocalGanan: 0,
        excluidas: 0,
        cuentasAgregadas: 0,
        activosAgregados: 0,
      })
    ).toBe('No hubo cambios por aplicar.');
  });
});
