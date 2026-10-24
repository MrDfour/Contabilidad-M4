/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Empresa, Poliza } from '../types';
import type { TourState } from '../types/tour';

/** Claves de persistencia del tour (ver PLAN_TOUR.md, sección 4). */
export const CLAVE_TOUR_STATE = 'contasis_tour_state';
export const CLAVE_TOUR_DEMO_SEEDADO = 'contasis_tour_demo_seedado';
export const CLAVE_TOUR_SKIPPED = 'contasis_tour_skipped';

/** ID de la empresa demo que el tour puede crear para guiar al usuario. */
export const DEMO_EMPRESA_ID = 'demo-tour';

/** Lee el estado del tour (null si aún no existe). */
export function leerEstadoTour(): TourState | null {
  try {
    const raw = localStorage.getItem(CLAVE_TOUR_STATE);
    return raw ? (JSON.parse(raw) as TourState) : null;
  } catch {
    return null;
  }
}

/** Guarda el estado del tour en localStorage. */
export function escribirEstadoTour(state: TourState): void {
  try {
    localStorage.setItem(CLAVE_TOUR_STATE, JSON.stringify(state));
  } catch {
    // Sin persistencia: el estado del tour vive solo en esta sesión.
  }
}

/** Devuelve true si el tour ya se completó alguna vez. */
export function tourCompletado(): boolean {
  const s = leerEstadoTour();
  return !!s?.completed;
}

/** Devuelve true si el usuario cerró el tour con «Saltar» (así no vuelve a abrirse solo). */
export function tourSaltado(): boolean {
  try {
    return localStorage.getItem(CLAVE_TOUR_SKIPPED) === '1';
  } catch {
    return false;
  }
}

/**
 * ¿Hay datos reales con los que el tour pueda trabajar sin sembrar nada?
 * «Real» = alguna empresa distinta de `demo-tour` que tenga al menos una póliza.
 * La empresa demo no cuenta: si es la única que existe, todavía no hay datos reales.
 */
export function hayDatosReales(empresas: Empresa[], polizas: Poliza[]): boolean {
  const reales = empresas.filter(e => e.id !== DEMO_EMPRESA_ID);
  if (reales.length === 0) return false;
  return polizas.length > 0;
}

/**
 * Salvaguarda de la purga del dato de demostración: solo permite purgar
 * cuando «demo-tour» es el ÚNICO cliente que existe, de modo que nunca hay
 * datos reales que proteger. La decisión final la toma App, que re-verifica
 * esta condición antes de ejecutar el borrado (defensa en profundidad).
 */
export function esUnicaEmpresaDemo(empresas: Empresa[]): boolean {
  return empresas.length === 1 && empresas[0].id === DEMO_EMPRESA_ID;
}

/**
 * Devuelve el `empresaId` con el que el tour trabajará:
 * - si hay una empresa activa (real o demo), la devuelve sin tocar nada.
 * - si no, devuelve null y el tour mostrará el paso «sin datos».
 */
export function empresaIdParaTour(empresas: Empresa[], activaId: string | null): string | null {
  if (activaId && empresas.some(e => e.id === activaId)) return activaId;
  return activaId ?? null;
}

/** Crea el estado inicial para `contasis_tour_state` (apertura; aún no completado). */
export function iniciarEstadoTour(): TourState {
  return { startedAt: new Date().toISOString(), lastStep: 0, completed: false };
}
