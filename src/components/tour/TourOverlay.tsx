/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TourStepDef } from '../../types/tour';

interface Rect { top: number; left: number; bottom: number; right: number; width: number; height: number; }

/**
 * ¿El elemento es realmente visible en pantalla? Un nodo puede existir en el DOM
 * y estar oculto (p. ej. el sidebar de escritorio con `hidden` en móvil o el
 * toggle Básico/Fiscal con `hidden sm:grid`): recorrer la cadena de ancestros
 * con el estilo calculado detecta esos casos. El rect 0×0 se considera visible
 * porque jsdom no mide: así las pruebas unitarias siguen resolviendo como siempre.
 */
function cadenaVisible(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const estilo = window.getComputedStyle(n);
    if (estilo.display === 'none' || estilo.visibility === 'hidden') return false;
  }
  const r = el.getBoundingClientRect();
  if (r.width >= 2 || r.height >= 2) return true;
  return r.width === 0 && r.height === 0;
}

/** Primer candidato visible del DOM; null si todos están ocultos. */
function primerVisible(nodos: NodeListOf<Element>): Element | null {
  for (const n of nodos) if (cadenaVisible(n)) return n;
  return null;
}

/**
 * Localiza el objetivo del paso en el DOM: primero el selector (`data-testid`,
 * con variantes de escritorio y móvil separadas por coma: se toma el primero
 * VISIBLE), después el `aria-label` o el texto visible. SOLO toma elementos
 * visibles: los ocultos con `display:none` (sidebar en móvil, toggle de modo
 * en móvil) se ignoran para no anclar ni enfocar fantasmas. Devuelve null
 * cuando el objetivo no está o no se ve; en ese caso la tarjeta se centra con
 * un mensaje guía.
 */
export function resolverTarget(paso: TourStepDef): Element | null {
  const sel = paso.target;
  if (sel) {
    const hit = primerVisible(document.querySelectorAll(sel));
    if (hit) return hit;
  }
  const txt = paso.targetText;
  if (txt) {
    const buscado = txt.toLowerCase();
    const nodos = document.querySelectorAll<HTMLElement>('[aria-label], button, span, h1, h2');
    for (const nodo of nodos) {
      const etiqueta = nodo.getAttribute('aria-label') ?? nodo.textContent ?? '';
      if (etiqueta.toLowerCase().includes(buscado) && cadenaVisible(nodo)) return nodo;
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
    if (!objetivo) { setRect(null); return false; }
    const r = objetivo.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height });
    return true;
  };

  useEffect(() => {
    // Primero se trae el objetivo a la vista (solo en el cambio de paso, no en
    // cada evento de scroll para no secuestrar el desplazamiento del usuario).
    const objetivo = resolverTarget(paso);
    if (objetivo) traerAVista(objetivo);
    // Pasos con `navegarA` cambian de vista en el MISMO commit: el ancla puede
    // montar algunas_frames después. Se reintenta con rAF hasta encontrarla
    // (~40 frames ≈ 0.7 s) para no dejar el foco fantasma ni ausente.
    let encontrado = sincronizar();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let intentos = 0;
    if (!encontrado) {
      const reintento = () => {
        if (encontrado || ++intentos > 40) return;
        encontrado = sincronizar();
        if (!encontrado) timer = setTimeout(reintento, 50);
      };
      timer = setTimeout(reintento, 50);
    }
    const alRedimensionar = () => sincronizar();
    window.addEventListener('resize', alRedimensionar);
    document.addEventListener('scroll', alRedimensionar, { passive: true });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
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
