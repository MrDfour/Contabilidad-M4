/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TourStepDef } from '../../types/tour';

interface Rect { top: number; left: number; bottom: number; right: number; width: number; height: number; }

/**
 * Localiza el objetivo del paso en el DOM: primero el selector (`data-testid`),
 * después el `aria-label` o el texto visible. Devuelve null cuando el objetivo
 * todavía no está en el DOM (p. ej. vive en una pestaña o modal cerrado); en
 * ese caso la tarjeta se centra con un mensaje guía.
 */
export function resolverTarget(paso: TourStepDef): Element | null {
  const sel = paso.target;
  if (sel) {
    const hit = document.querySelector(sel);
    if (hit) return hit;
  }
  const txt = paso.targetText;
  if (txt) {
    const buscado = txt.toLowerCase();
    const nodos = document.querySelectorAll<HTMLElement>('[aria-label], button, span, h1, h2');
    for (const nodo of nodos) {
      const etiqueta = nodo.getAttribute('aria-label') ?? nodo.textContent ?? '';
      if (etiqueta.toLowerCase().includes(buscado)) return nodo;
    }
  }
  return null;
}

/** Capa del recorrido a nivel de página (proyectada a document.body). */
/** ¿El rectángulo quedó enteramente fuera de la ventana? */
function fueraDeVista(r: DOMRect): boolean {
  return r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth;
}

/** Trae el objetivo a la vista cuando quedó fuera de pantalla (p. ej. el pie de página). */
export function traerAVista(objetivo: Element): void {
  if (typeof (objetivo as HTMLElement).scrollIntoView !== 'function') return; // jsdom y similares
  try {
    const r = objetivo.getBoundingClientRect();
    if (fueraDeVista(r)) objetivo.scrollIntoView({ block: 'center', inline: 'nearest' });
  } catch {
    // Sin scroll programático disponible: se resalta como se pueda.
  }
}

export function TourOverlay({ paso }: { paso: TourStepDef }) {
  const [rect, setRect] = useState<Rect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const sincronizar = () => {
    const objetivo = resolverTarget(paso);
    if (!objetivo) { setRect(null); return; }
    const r = objetivo.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height });
  };

  useEffect(() => {
    // Primero se trae el objetivo a la vista (solo en el cambio de paso, no en
    // cada evento de scroll para no secuestrar el desplazamiento del usuario).
    const objetivo = resolverTarget(paso);
    if (objetivo) traerAVista(objetivo);
    sincronizar();
    const alRedimensionar = () => sincronizar();
    window.addEventListener('resize', alRedimensionar);
    document.addEventListener('scroll', alRedimensionar, { passive: true });
    return () => {
      window.removeEventListener('resize', alRedimensionar);
      document.removeEventListener('scroll', alRedimensionar);
    };
  }, [paso]);

  const anchoVentana = typeof window !== 'undefined' ? window.innerWidth : 0;
  const altoVentana = typeof window !== 'undefined' ? window.innerHeight : 0;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] bg-black/60"
      role="presentation"
      onClick={e => { e.stopPropagation(); }}
    >
      {rect && rect.top < altoVentana && rect.left < anchoVentana ? (
        // Foco con cuatro cuadrantes: se oscurece todo y se deja visible el objetivo.
        <>
          <div className="absolute bg-black/70 pointer-events-none" style={{ top: 0, left: 0, width: anchoVentana, height: rect.top }} />
          <div className="absolute bg-black/70 pointer-events-none" style={{ top: rect.bottom, left: 0, width: anchoVentana, height: altoVentana - rect.bottom }} />
          <div className="absolute bg-black/70 pointer-events-none" style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }} />
          <div className="absolute bg-black/70 pointer-events-none" style={{ top: rect.top, left: rect.right, width: anchoVentana - rect.right, height: rect.height }} />
          {/* Aro que resalta el elemento señalado. */}
          <div
            className="absolute rounded-xl ring-2 ring-amber-400 pointer-events-none"
            style={{ top: rect.top - 2, left: rect.left - 2, width: rect.width + 4, height: rect.height + 4 }}
          />
        </>
      ) : null}
    </div>,
    document.body
  );
}
