/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePolizas, type PolizaInput } from './usePolizas';
import type { PartidaPoliza, Poliza } from '../types';

/** Fábrica de partida determinista. */
const partida = (accountId: string, monto: number, lado: 'debit' | 'credit' = 'debit'): PartidaPoliza => ({
  id: `p-${accountId}`,
  accountId,
  accountCode: '1000',
  accountName: `Cuenta ${accountId}`,
  debit: lado === 'debit' ? monto : 0,
  credit: lado === 'credit' ? monto : 0
});

/** Póliza cuadrada simple (500 cargo / 500 abono). */
const inputCuadrada = (tipo: Poliza['tipo'] = 'diario', concepto = 'Póliza de prueba'): PolizaInput => ({
  tipo,
  fecha: '2024-01-15',
  concepto,
  partidas: [
    partida('a1', 500, 'debit'),
    partida('a2', 500, 'credit')
  ]
});

/** Póliza legada/externa completa (para hydrate/importPolizas). */
const polizaCompleta = (id: string, tipo: Poliza['tipo'], folio: number): Poliza => ({
  ...inputCuadrada(tipo),
  id,
  folio,
  totalDebe: 500,
  totalHaber: 500
});

/** Cliente de prueba: id que compone las claves (C-2 de PLAN_MULTI_CLIENTE.md). */
const E1 = 'e1';

describe('usePolizas (dominio contasis_polizas_e1 — clave por cliente, regla anti-R1)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('con canSave=false NO persiste: ni el montaje vacío ni después de mutar (guard de migración)', () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));
    expect(localStorage.getItem('contasis_polizas_e1')).toBeNull();

    act(() => { result.current.createPoliza(inputCuadrada()); });
    expect(result.current.polizas).toHaveLength(1); // cambia en RAM…
    expect(localStorage.getItem('contasis_polizas_e1')).toBeNull(); // …pero no en storage
  });

  it('C-4 regresión: en el cambio de cliente NO escribe el estado del cliente anterior en la clave del nuevo', async () => {
    const E2 = 'e2';
    const { result, rerender } = renderHook(
      ({ empresaId }) => usePolizas({ canSave: true, empresaId }),
      { initialProps: { empresaId: E1 } }
    );

    // Cliente E1 con una póliza persistida
    act(() => { result.current.createPoliza(inputCuadrada()); });
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('contasis_polizas_e1')!)).toHaveLength(1)
    );

    // Cambio de cliente: storageKey cambia con el estado en RAM AÚN de E1
    // (en App, el efecto de persistencia corre antes de que useAppData apague canSave)
    rerender({ empresaId: E2 });

    // Transición: la clave del cliente E2 NO debe recibir datos de E1
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(localStorage.getItem('contasis_polizas_e2')).toBeNull();

    // La recarga orquestada trae el estado del cliente destino → ahí sí persiste
    act(() => { result.current.setPolizas([]); });
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('contasis_polizas_e2')!)).toEqual([])
    );
    // Y el cliente E1 conserva SU contenido intacto
    expect(JSON.parse(localStorage.getItem('contasis_polizas_e1')!)).toHaveLength(1);
  });

  it('createPoliza: asigna folio 1, id generado y recalcula totales (D-7/D-9/Folio D-4)', () => {
    const { result } = renderHook(() => usePolizas({ canSave: true, empresaId: E1 }));
    let creada!: Poliza;
    act(() => { creada = result.current.createPoliza(inputCuadrada()); });

    expect(creada.folio).toBe(1);
    expect(creada.id).toBeTruthy();
    expect(creada.totalDebe).toBe(500);
    expect(creada.totalHaber).toBe(500);
    expect(result.current.polizas).toHaveLength(1);
  });

  it('createPoliza lanza con < 2 partidas y lanza con desbalance (última línea D-9)', () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));

    act(() => {
      expect(() => result.current.createPoliza({
        ...inputCuadrada(), partidas: [partida('a1', 100)]
      })).toThrow(/al menos 2 partidas/);
    });

    act(() => {
      expect(() => result.current.createPoliza({
        ...inputCuadrada(),
        partidas: [partida('a1', 100, 'debit'), partida('a2', 99, 'credit')]
      })).toThrow(/no cuadra/);
    });

    expect(result.current.polizas).toHaveLength(0);
  });

  it('folios consecutivos e independientes entre tipos (D-4)', () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));
    let a!: Poliza, b!: Poliza, c!: Poliza, d!: Poliza;
    // Un evento de guardado por act: el folio se lee del estado materializado
    // (patrón idéntico a createJournal en useJournals, cierre sobre el estado).
    act(() => { a = result.current.createPoliza(inputCuadrada('ingreso')); });
    act(() => { b = result.current.createPoliza(inputCuadrada('ingreso')); });
    act(() => { c = result.current.createPoliza(inputCuadrada('egreso')); });
    act(() => { d = result.current.createPoliza(inputCuadrada('diario')); });
    expect([a.folio, b.folio]).toEqual([1, 2]);      // ingreso: consecutivo propio
    expect(c.folio).toBe(1);                          // egreso: independiente
    expect(d.folio).toBe(1);                          // diario: independiente
  });

  it('updatePoliza: preserva folio y tipo (D-8) aunque el payload diga lo contrario; recalcula totales', () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));
    act(() => { result.current.createPoliza(inputCuadrada('diario')); });

    act(() => {
      result.current.updatePoliza(result.current.polizas[0].id, {
        tipo: 'ingreso',                      // intento de cambio de tipo: IGNORADO
        fecha: '2024-02-01',
        concepto: 'Editada',
        partidas: [partida('a1', 700, 'debit'), partida('a2', 700, 'credit')]
      });
    });

    const editada = result.current.polizas[0];
    expect(editada.tipo).toBe('diario');
    expect(editada.folio).toBe(1);
    expect(editada.totalDebe).toBe(700);
    expect(editada.totalHaber).toBe(700);
    expect(editada.concepto).toBe('Editada');
  });

  it('updatePoliza lanza con póliza desbalanceada y no muta', () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));
    act(() => { result.current.createPoliza(inputCuadrada()); });
    const original = [...result.current.polizas];

    act(() => {
      expect(() => result.current.updatePoliza(original[0].id, {
        ...inputCuadrada(), partidas: [partida('a1', 1), partida('a2', 2)]
      })).toThrow(/no cuadra/);
    });
    expect(result.current.polizas).toEqual(original);
  });

  it('deletePoliza elimina SOLO la póliza indicada', () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));
    act(() => {
      result.current.createPoliza(inputCuadrada('diario'));
      result.current.createPoliza(inputCuadrada('egreso'));
    });
    const idAEliminar = result.current.polizas[0].id;

    act(() => { result.current.deletePoliza(idAEliminar); });
    expect(result.current.polizas.map(p => p.tipo)).toEqual(['egreso']);
  });

  it('importPolizas sobre estado en RAM: folio faltante asignado y colisión reasignada por tipo', () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));
    act(() => { result.current.hydrate([polizaCompleta('p-eg-1', 'egreso', 5)]); });

    act(() => {
      result.current.importPolizas([
        { ...polizaCompleta('n1', 'ingreso', 0) },  // folio 0 → asigna 1
        { ...polizaCompleta('n2', 'egreso', 5) },   // colisión con folio 5 → reasigna 6
        polizaCompleta('n3', 'egreso', 3)           // válido y sin colisión → se respeta
      ]);
    });

    const porId = Object.fromEntries(result.current.polizas.map(p => [p.id, p.folio]));
    expect(porId['n1']).toBe(1);
    expect(porId['n2']).toBe(6);
    expect(porId['n3']).toBe(3);
    expect(result.current.polizas).toHaveLength(4);
  });

  it('estampados silenciosos: alta/edición llevan hora; el import ESTIMA con la fecha fiscal (merge futuro K-7)', () => {
    const { result } = renderHook(() => usePolizas({ canSave: true, empresaId: E1 }));
    let creada!: Poliza;
    act(() => { creada = result.current.createPoliza(inputCuadrada()); });
    expect(creada.capturadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(creada.editadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    act(() => { result.current.updatePoliza(creada.id, { ...inputCuadrada(), concepto: 'Editada' }); });
    expect(result.current.polizas[0].concepto).toBe('Editada');
    expect(result.current.polizas[0].editadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // El respaldo/import SIN estampado se estima con su fecha contable (no "ahora",
    // que guardaría un orden falso); con estampado propio se respeta tal cual.
    act(() => {
      result.current.importPolizas([
        polizaCompleta('n1', 'diario', 9),
        { ...polizaCompleta('n2', 'diario', 10), capturadoEn: '2019-06-01T10:00:00.000Z' },
      ]);
    });
    const importada1 = result.current.polizas.find(p => p.id === 'n1');
    const importada2 = result.current.polizas.find(p => p.id === 'n2');
    expect(importada1?.capturadoEn).toBe(new Date('2024-01-15').toISOString());
    expect(importada2?.capturadoEn).toBe('2019-06-01T10:00:00.000Z');
  });

  it('createProgrammaticPoliza es la misma lógica de alta validada (D-10)', () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));
    let creada!: Poliza;
    act(() => { creada = result.current.createProgrammaticPoliza(inputCuadrada('diario', 'Depreciación mensual')); });
    expect(creada.folio).toBe(1);
    expect(creada.concepto).toBe('Depreciación mensual');
  });

  it('hydrate persiste explícitamente lo que recibe', async () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));
    await act(async () => { result.current.hydrate([polizaCompleta('p1', 'diario', 1)]); });

    expect(result.current.polizas).toHaveLength(1);
    await waitFor(() => {
      const saved = localStorage.getItem('contasis_polizas_e1');
      expect(saved).not.toBeNull();
      expect(JSON.parse(saved as string)[0]?.id).toBe('p1');
    });
  });

  it('hydrate escribe SIEMPRE, incluso [] → contasis_polizas queda "[]" (no resucita por re-migración)', async () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));
    await act(async () => { result.current.hydrate([]); });
    await waitFor(() => expect(localStorage.getItem('contasis_polizas_e1')).toBe('[]'));
    expect(result.current.polizas).toEqual([]);
  });

  it('efecto con canSave persiste los cambios de los mutadores (post-carga persiste SIEMPRE)', async () => {
    const { result } = renderHook(() => usePolizas({ canSave: true, empresaId: E1 }));
    act(() => { result.current.createPoliza(inputCuadrada('egreso')); });

    await waitFor(() => {
      const saved = localStorage.getItem('contasis_polizas_e1');
      const parsed = JSON.parse(saved as string) as Poliza[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0].tipo).toBe('egreso');
    });
  });

  it('hydrate persiste en la clave del cliente activo y NO toca la de otro cliente', async () => {
    localStorage.setItem('contasis_polizas_e2', JSON.stringify([polizaCompleta('otra', 'ingreso', 1)]));
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));

    await act(async () => { result.current.hydrate([polizaCompleta('p1', 'diario', 1)]); });
    await waitFor(() => expect(localStorage.getItem('contasis_polizas_e1')).toBe(JSON.stringify([polizaCompleta('p1', 'diario', 1)])));

    expect(JSON.parse(localStorage.getItem('contasis_polizas_e2') as string)).toHaveLength(1); // intacto
  });

  it('asignarFoliosPendientes (F-6 de PLAN_FUSION_BOVEDA.md): asigna en orden capturadoEn y devuelve las tocadas', () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));
    act(() => { result.current.hydrate([
      { ...polizaCompleta('lo-egr', 'egreso', 4) },
      { ...polizaCompleta('pend-late', 'egreso', 0), capturadoEn: '2026-10-16T18:00:00.000Z' },
      { ...polizaCompleta('pend-early', 'egreso', 0), capturadoEn: '2026-10-15T09:00:00.000Z' }
    ]); });

    let tocadas!: Poliza[];
    act(() => { tocadas = result.current.asignarFoliosPendientes(); });

    expect(tocadas.map(p => p.id)).toEqual(['pend-early', 'pend-late']); // orden de captura
    expect(tocadas.map(p => p.folio)).toEqual([5, 6]); // sigue la serie del egreso (max 4)
    const porId = Object.fromEntries(result.current.polizas.map(p => [p.id, p.folio]));
    expect(porId['pend-early']).toBe(5);
    expect(porId['pend-late']).toBe(6);
    expect(porId['lo-egr']).toBe(4); // la serie local se conserva
  });

  it('hydrateEmpresa escribe la clave del cliente destino (anti-R1) sin tocar la RAM del activo', async () => {
    const { result } = renderHook(() => usePolizas({ canSave: false, empresaId: E1 }));
    act(() => { result.current.createPoliza(inputCuadrada('diario')); });
    const ramActiva = [...result.current.polizas];

    await act(async () => { result.current.hydrateEmpresa('e2', [polizaCompleta('otra', 'ingreso', 1)]); });

    await waitFor(() => expect(localStorage.getItem('contasis_polizas_e2')).not.toBeNull());
    expect(result.current.polizas).toEqual(ramActiva); // RAM del activo intacta
    expect(localStorage.getItem('contasis_polizas_e1')).toBeNull(); // persiste la del destino only
  });
});
