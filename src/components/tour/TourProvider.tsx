/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TourCoachMark } from './TourCoachMark';
import { TourOverlay } from './TourOverlay';
import { TOUR_STEPS } from './steps';
import {
  CLAVE_TOUR_SKIPPED,
  escribirEstadoTour,
  iniciarEstadoTour,
  leerEstadoTour
} from '../../lib/tour';
import type { AppMode, AppTab } from '../../lib/navigation';
import type { TourContextValue, TourStepDef } from '../../types/tour';

interface TourProviderProps {
  children: ReactNode;
  appMode: AppMode;
  empresaId: string | null;
  /** Controla la visibilidad del tour (lo posee App, con esto el primer arranque es predecible). */
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  /** Cambio de pestaña, para los pasos cuyo objetivo vive en otra vista. */
  onNavigateTab?: (tab: AppTab) => void;
  /**
   * Acción de purga de la empresa de demostración. App la transmite SOLO
   * cuando el borrado es seguro (único cliente y de id `demo-tour`); si es
   * null, la burbuja final no ofrece borrar nada.
   */
  purgarDemo?: (() => void) | null;
  /** Abre/cierra el modal de la bóveda (para el paso con `accion: 'abrir-boveda'`). */
  onAbrirBoveda?: () => void;
  onCerrarBoveda?: () => void;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

/**
 * Motor del recorrido: estado del paso actual y persistencia ligera en
 * `contasis_tour_*`.
 *
 * - La visibilidad la controla App mediante `abierto`/`onAbiertoChange`.
 * - El overlay y la tarjeta se proyectan a `document.body` con un portal,
 *   para que ningún contenedor con transformaciones los corte.
 * - Este módulo nunca escribe datos reales: solo lee `appMode` y `empresaId`.
 */
export function TourProvider({ children, appMode, empresaId, abierto, onAbiertoChange, onNavigateTab, purgarDemo = null, onAbrirBoveda, onCerrarBoveda }: TourProviderProps) {
  const [pasoIdx, setPasoIdx] = useState(0);

  // Filtro de pasos: oculta los de modo Fiscal cuando la app está en Básico,
  // y los marcados como no aplicables según el DOM actual.
  const pasosVisibles = useMemo(() => {
    return TOUR_STEPS.filter(s => {
      if (s.requiereFiscal && appMode !== 'fiscal') return false;
      if (s.saltarSi && s.saltarSi()) return false;
      return true;
    });
    // `pasoIdx` en las dependencias: al avanzar se re-evalúa `saltarSi`
    // (p. ej. el usuario abrió el formulario de captura a mitad del recorrido).
  }, [appMode, pasoIdx]);

  const ultimoIdx = Math.max(0, pasosVisibles.length - 1);

  // Si la lista de pasos visibles se encogió (un `saltarSi` cambió a mitad del
  // recorrido), vuelve al inicio en lugar de quedarse en un índice inexistente.
  useEffect(() => {
    if (pasoIdx > ultimoIdx) setPasoIdx(0);
  }, [pasoIdx, ultimoIdx]);

  const abrir = () => {
    setPasoIdx(0);
    onAbiertoChange(true);
    if (!leerEstadoTour()) escribirEstadoTour(iniciarEstadoTour());
  };

  const cerrar = () => {
    onAbiertoChange(false);
    try { localStorage.setItem(CLAVE_TOUR_SKIPPED, '1'); } catch {}
    const estado = leerEstadoTour();
    if (estado) escribirEstadoTour({ ...estado, lastStep: pasoIdx });
  };

  /** Cierre normal por «Finalizar»: completa el recorrido y NO lo marca como saltado. */
  const finalizar = () => {
    onAbiertoChange(false);
    escribirEstadoTour({
      startedAt: leerEstadoTour()?.startedAt ?? new Date().toISOString(),
      lastStep: pasoIdx,
      completed: true
    });
  };

  const reiniciar = () => {
    try { localStorage.removeItem(CLAVE_TOUR_SKIPPED); } catch {}
    abrir();
  };

  // Con actualizador funcional se evita el problema del cierre (closure) pasado:
  // `siguiente()` puede llamarse varias veces dentro del mismo render.
  const irAlPaso = (i: number) => setPasoIdx(p => Math.max(0, Math.min(i, ultimoIdx)));

  const siguiente = () => {
    const estado = leerEstadoTour() ?? iniciarEstadoTour();
    setPasoIdx(p => {
      if (p < ultimoIdx) return p + 1;
      // Último paso: cerrar y marcar el tour como completado.
      onAbiertoChange(false);
      escribirEstadoTour({ ...estado, lastStep: p, completed: true });
      return p;
    });
    escribirEstadoTour({ ...estado, lastStep: pasoIdx });
  };

  const anterior = () => setPasoIdx(p => (p > 0 ? p - 1 : p));

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
      if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto, pasoIdx]);

  const pasoActual: TourStepDef | undefined = pasosVisibles[pasoIdx];

  // Navega a la pestaña del paso cuando su objetivo todavía no está en el DOM.
  // Se marca cada paso como navegado para no repetir el cambio de vista.
  const navegadosRef = useRef<Set<string>>(new Set());

  // Reapertura SIEMPRE reinicia: App enciende la visibilidad directamente
  // (botón «Tour» del encabezado y primer arranque), sin pasar por `abrir()`,
  // así que el motor resetea el paso al abrirse; nunca retoma la posición del
  // cierre anterior, ni tampoco la auto-navegación ya registrada.
  useEffect(() => {
    if (!abierto) return;
    setPasoIdx(0);
    navegadosRef.current.clear();
    if (!leerEstadoTour()) escribirEstadoTour(iniciarEstadoTour());
  }, [abierto]);

  useEffect(() => {
    const paso = pasoActual;
    if (!paso || !paso.navegarA || !onNavigateTab) return;
    if (paso.target && document.querySelector(paso.target)) return;
    if (navegadosRef.current.has(paso.id)) return;
    navegadosRef.current.add(paso.id);
    onNavigateTab(paso.navegarA);
  }, [pasoActual, onNavigateTab]);

  // Acción automática del paso: abrir la bóveda de sincronización (el paso
  // `respaldo` la usa para explicar frase de papel y QR EN VIVO). Al salir del
  // paso —o al cerrarse el tour— se cierra SOLO si el tour la abrió; si el
  // usuario ya la tenía abierta, se respeta.
  const bovedaPorTourRef = useRef(false);
  useEffect(() => {
    if (!abierto) return;
    if (pasoActual?.accion === 'abrir-boveda') {
      if (bovedaPorTourRef.current) return;
      if (document.querySelector('[data-testid="sync-modal"]')) return;
      bovedaPorTourRef.current = true;
      onAbrirBoveda?.();
    } else if (bovedaPorTourRef.current) {
      bovedaPorTourRef.current = false;
      onCerrarBoveda?.();
    }
  }, [pasoActual, abierto, onAbrirBoveda, onCerrarBoveda]);

  useEffect(() => {
    if (abierto) return;
    if (bovedaPorTourRef.current) {
      bovedaPorTourRef.current = false;
      onCerrarBoveda?.();
    }
  }, [abierto, onCerrarBoveda]);

  const value: TourContextValue = useMemo(
    () => ({
      activo: abierto,
      paso: pasoIdx,
      pasos: pasosVisibles,
      appMode,
      empresaId,
      abrir,
      cerrar,
      /** Cierra el recorrido marcándolo como completado (botón «Finalizar»). */
      finalizar,
      reiniciar,
      siguiente,
      anterior,
      irAlPaso,
      saltar: cerrar
    }),
    [abierto, pasoIdx, pasosVisibles, appMode, empresaId]
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {abierto && pasoActual ? (
        <>
          <TourOverlay paso={pasoActual} />
          <TourCoachMark paso={pasoActual} pasoIdx={pasoIdx} total={pasosVisibles.length} onNext={siguiente} onBack={anterior} onSkip={cerrar} onFinish={finalizar} onPurgarDemo={purgarDemo} />
        </>
      ) : null}
    </TourContext.Provider>
  );
}

export const useTour = (): TourContextValue => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour debe usarse dentro de <TourProvider>.');
  return ctx;
};
