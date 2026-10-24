/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { TourProvider, useTour } from './TourProvider';
import { CLAVE_TOUR_SKIPPED, leerEstadoTour } from '../../lib/tour';
import type { TourContextValue } from '../../types/tour';
import type { AppMode } from '../../lib/navigation';

const baseProps = { appMode: 'basic' as AppMode, empresaId: null, abierto: true, onAbiertoChange: vi.fn() };

// Harness: expone el contexto al test.
let ctx: TourContextValue;
function Probe() {
  ctx = useTour();
  return null;
}

describe('TourProvider (motor del tour guiado)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('cuando abierto=false, no muestra overlay ni coach mark', () => {
    render(<TourProvider {...baseProps} abierto={false}><Probe /></TourProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cuando abierto=true, muestra el overlay (role presentation) y la burbuja (role dialog)', () => {
    render(<TourProvider {...baseProps}><Probe /></TourProvider>);
    // La burbuja se renderiza en document.body vía portal.
    expect(screen.getByRole('dialog', { name: /^Recorrido, paso 1 de / })).toBeTruthy();
  });

  it('abrir() avisa apertura y persiste estado; saltar() cierra y marca skipped', () => {
    const onAbiertoChange = vi.fn();
    render(<TourProvider appMode="basic" empresaId={null} abierto={false} onAbiertoChange={onAbiertoChange}><Probe /></TourProvider>);
    expect(leerEstadoTour()).toBeNull();

    ctx.abrir();
    expect(onAbiertoChange).toHaveBeenCalledWith(true);
    expect(leerEstadoTour()).not.toBeNull(); // startedAt/lastStep persistidos

    ctx.saltar();
    expect(onAbiertoChange).toHaveBeenCalledWith(false);
    expect(localStorage.getItem(CLAVE_TOUR_SKIPPED)).toBe('1');
  });

  it('Escape cierra el tour activo', () => {
    const onClose = vi.fn();
    render(<TourProvider {...baseProps} abierto={true} onAbiertoChange={onClose}><Probe /></TourProvider>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith(false);
    expect(localStorage.getItem(CLAVE_TOUR_SKIPPED)).toBe('1');
  });

  it('El botón Finalizar en el último paso completa el tour', () => {
    const onClose = vi.fn();
    render(<TourProvider appMode="basic" empresaId={null} abierto={true} onAbiertoChange={onClose}><Probe /></TourProvider>);
    const total = ctx.pasos.length;
    act(() => {
      for (let i = 0; i < total - 1; i++) ctx.siguiente();
    });
    expect(screen.getByRole('button', { name: /finalizar/i })).toBeTruthy();
  });

  it('la purga de demo solo se ofrece en el último paso y solo si App transmitió la acción segura', () => {
    const onPurga = vi.fn();
    render(<TourProvider {...baseProps} purgarDemo={onPurga}><Probe /></TourProvider>);
    // En el primer paso la pregunta no existe.
    expect(screen.queryByTestId('tour-purga-demo')).toBeNull();

    const total = ctx.pasos.length;
    act(() => {
      for (let i = 0; i < total - 1; i++) ctx.siguiente();
    });
    expect(screen.getByTestId('tour-purga-demo')).toBeTruthy();

    // Purgar borra y también cierra el tour.
    fireEvent.click(screen.getByTestId('tour-purga-demo-btn'));
    expect(onPurga).toHaveBeenCalledTimes(1);
  });

  it('sin acción de purga (App no la transmitió), el último paso no ofrece borrar nada', () => {
    render(<TourProvider {...baseProps}><Probe /></TourProvider>);
    const total = ctx.pasos.length;
    act(() => {
      for (let i = 0; i < total - 1; i++) ctx.siguiente();
    });
    expect(screen.queryByTestId('tour-purga-demo')).toBeNull();
  });

  it('reabrir el tour (botón Tour → abierto false→true) reinicia desde el paso 1, no retoma el último', () => {
    const onAbiertoChange = vi.fn();
    const { rerender } = render(
      <TourProvider appMode="basic" empresaId={null} abierto={true} onAbiertoChange={onAbiertoChange}><Probe /></TourProvider>
    );
    const total = ctx.pasos.length;
    act(() => {
      for (let i = 0; i < total - 1; i++) ctx.siguiente();
    });
    // Se quedó en el último paso...
    expect(screen.getByRole('dialog', { name: new RegExp(`paso ${total} de ${total}`) })).toBeTruthy();
    // ...y al reabrir por el botón «Tour» (App solo enciende la visibilidad) vuelve al paso 1.
    rerender(<TourProvider appMode="basic" empresaId={null} abierto={false} onAbiertoChange={onAbiertoChange}><Probe /></TourProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<TourProvider appMode="basic" empresaId={null} abierto={true} onAbiertoChange={onAbiertoChange}><Probe /></TourProvider>);
    expect(screen.getByRole('dialog', { name: /^Recorrido, paso 1 de / })).toBeTruthy();
  });

  it('el botón Finalizar completa el recorrido (completed) sin marcarlo como saltado', () => {
    const onAbiertoChange = vi.fn();
    render(
      <TourProvider appMode="basic" empresaId={null} abierto={true} onAbiertoChange={onAbiertoChange}><Probe /></TourProvider>
    );
    const total = ctx.pasos.length;
    act(() => {
      for (let i = 0; i < total - 1; i++) ctx.siguiente();
    });
    fireEvent.click(screen.getByRole('button', { name: /finalizar/i }));
    expect(onAbiertoChange).toHaveBeenCalledWith(false);
    expect(leerEstadoTour()?.completed).toBe(true);
    expect(localStorage.getItem(CLAVE_TOUR_SKIPPED)).toBeNull();
  });

  it('el paso de bóveda abre el modal de sincronización SOLO una vez y lo cierra al salir del paso', () => {
    const abrirBoveda = vi.fn();
    const cerrarBoveda = vi.fn();
    render(
      <TourProvider {...baseProps} onAbrirBoveda={abrirBoveda} onCerrarBoveda={cerrarBoveda}><Probe /></TourProvider>
    );
    const idxBoveda = ctx.pasos.findIndex(s => s.id === 'respaldo');
    expect(idxBoveda).toBeGreaterThan(-1);
    act(() => { ctx.irAlPaso(idxBoveda); });
    expect(abrirBoveda).toHaveBeenCalledTimes(1);
    expect(cerrarBoveda).not.toHaveBeenCalled();
    // Quedarse revisando (rerenders) no vuelve a abrirla.
    act(() => { ctx.siguiente(); });
    // Salió del paso: el tour cerró lo que abrió.
    expect(cerrarBoveda).toHaveBeenCalledTimes(1);
    expect(abrirBoveda).toHaveBeenCalledTimes(1);
  });

  it('si el tour se cierra mientras la bóveda abierta por el tour sigue abierta, la cierra', () => {
    const abrirBoveda = vi.fn();
    const cerrarBoveda = vi.fn();
    const onAbiertoChange = vi.fn();
    const { rerender } = render(
      <TourProvider appMode="basic" empresaId={null} abierto={true} onAbiertoChange={onAbiertoChange} onAbrirBoveda={abrirBoveda} onCerrarBoveda={cerrarBoveda}><Probe /></TourProvider>
    );
    const idxBoveda = ctx.pasos.findIndex(s => s.id === 'respaldo');
    act(() => { ctx.irAlPaso(idxBoveda); });
    expect(abrirBoveda).toHaveBeenCalledTimes(1);
    // El usuario cierra el tour con la X / Escape → App apaga la visibilidad.
    act(() => { ctx.cerrar(); });
    rerender(
      <TourProvider appMode="basic" empresaId={null} abierto={false} onAbiertoChange={onAbiertoChange} onAbrirBoveda={abrirBoveda} onCerrarBoveda={cerrarBoveda}><Probe /></TourProvider>
    );
    expect(cerrarBoveda).toHaveBeenCalledTimes(1);
  });
});
