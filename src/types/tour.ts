/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AppTab } from '../lib/navigation';

/** Modo de la app (ver lib/navigation.ts). */
export type TourAppMode = 'basic' | 'fiscal';

/** Definición de un paso del recorrido guiado. */
export interface TourStepDef {
  /** Identificador interno, útil para pruebas y saltos condicionales. */
  id: string;
  /** Título que se muestra en la tarjeta del tour. */
  titulo: string;
  /** Texto explicativo del paso. */
  cuerpo: string;
  /**
   * Ancla visual del paso:
   * - `target` → selector CSS (con `data-testid` cuando existe).
   * - `targetText` → respaldo por `aria-label` o texto visible.
   * Si ninguno resuelve, la tarjeta se centra con un mensaje guía.
   */
  target?: string;
  targetText?: string;
  /** Posición sugerida: 'top' | 'right' | 'bottom' | 'left' | 'center'. */
  placement?: 'top' | 'right' | 'bottom' | 'left' | 'center';
  /** Pestaña a la que navegar antes de anclar (si el target vive en otra). */
  navegarA?: AppTab;
  /** Paso visible solo en modo Fiscal (p. ej. Activos Fijos). */
  requiereFiscal?: boolean;
  /** Si existe, el paso solo avanza cuando la función devuelve true. */
  validate?: () => boolean;
  /** Oculta el paso cuando la función devuelve true (p. ej. falta de datos). */
  saltarSi?: () => boolean;
  /**
   * Acción automática que el proveedor ejecuta al mostrar el paso (App la
   * autoriza transmitiendo el callback correspondiente). 'abrir-boveda'
   * abre el modal de la bóveda de sincronización.
   */
  accion?: 'abrir-boveda';
}

/** Estado del tour guardado en localStorage (`contasis_tour_state`). */
export interface TourState {
  /** Fecha/hora de la primera apertura (ISO). */
  startedAt: string;
  /** Índice del último paso mostrado. */
  lastStep: number;
  /** Verdadero cuando el usuario terminó el recorrido completo. */
  completed: boolean;
}

/** API que el tour expone vía contexto a la app. */
export interface TourContextValue {
  /** ¿Está abierto el tour? */
  activo: boolean;
  /** Índice del paso actual. */
  paso: number;
  /** Pasos visibles en esta ejecución (tras filtrar). */
  pasos: TourStepDef[];
  /** Modo actual de la app. */
  appMode: TourAppMode;
  /** Cliente activo (null si la app aún no terminó de arrancar). */
  empresaId: string | null;
  abrir: () => void;
  cerrar: () => void;
  reiniciar: () => void;
  siguiente: () => void;
  anterior: () => void;
  /** Ir directamente a un paso por índice (con límites seguros). */
  irAlPaso: (i: number) => void;
  /** Cerrar marcando «Saltar». */
  saltar: () => void;
  /** Cierre por «Finalizar»: completa el recorrido (estado `completed: true`). */
  finalizar: () => void;
}
