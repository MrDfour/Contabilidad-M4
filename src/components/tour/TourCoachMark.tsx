/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, PauseCircle, X } from 'lucide-react';
import type { TourStepDef } from '../../types/tour';
import { resolverTarget, traerAVista } from './TourOverlay';

interface Props {
  paso: TourStepDef;
  pasoIdx: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  /** Cierre por «Finalizar»: completa el recorrido (marca completed). */
  onFinish: () => void;
  /** Purga de la empresa de demostración; si es null, no se ofrece borrar nada. */
  onPurgarDemo?: (() => void) | null;
}

/** Tamaño estimado de la tarjeta (w-96 ≈ 384 px; alto conservador) para giros y recortes. */
const TARJETA_W = 384;
const TARJETA_H = 320;
const BORDE = 12;

type Lado = 'top' | 'right' | 'bottom' | 'left';
type Pos = { top: number; left: number };

/**
 * Posiciona la tarjeta respecto al objetivo y nunca la deja fuera del viewport:
 * si el lado preferido no cabe lo recorta, y si aun así no cabe prueba con los
 * lados alternos (girar a «top» ↔ «bottom», «left» ↔ «right»). Un candidato —
 * crudo o recortado— que INVADA el rectángulo del objetivo se rechaza: la burbuja
 * jamás debe tapar aquello que está explicando. Sin objetivo (o con placement
 * «center») queda centrada en pantalla.
 */
function posicionTarjeta(placement: NonNullable<TourStepDef['placement']>, objetivo: DOMRect | null): Pos {
  const anchoVentana = window.innerWidth;
  const altoVentana = window.innerHeight;
  const centrada: Pos = {
    top: Math.max(BORDE, Math.min((altoVentana - TARJETA_H) / 2, altoVentana - TARJETA_H - BORDE)),
    left: Math.max(BORDE, Math.min((anchoVentana - TARJETA_W) / 2, anchoVentana - TARJETA_W - BORDE))
  };
  if (!objetivo || placement === 'center') return centrada;

  const margen = 16;
  const centroX = objetivo.left + objetivo.width / 2;
  const centroY = objetivo.top + objetivo.height / 2;
  const candidato = (lado: Lado): Pos => {
    switch (lado) {
      case 'top': return { top: objetivo.top - margen - TARJETA_H, left: centroX - TARJETA_W / 2 };
      case 'bottom': return { top: objetivo.bottom + margen, left: centroX - TARJETA_W / 2 };
      case 'left': return { top: centroY - TARJETA_H / 2, left: objetivo.left - margen - TARJETA_W };
      case 'right': return { top: centroY - TARJETA_H / 2, left: objetivo.right + margen };
    }
  };
  const encaja = (p: Pos) =>
    p.top >= BORDE && p.left >= BORDE &&
    p.top + TARJETA_H <= altoVentana - BORDE && p.left + TARJETA_W <= anchoVentana - BORDE;
  const recorta = (p: Pos): Pos => ({
    top: Math.max(BORDE, Math.min(p.top, altoVentana - TARJETA_H - BORDE)),
    left: Math.max(BORDE, Math.min(p.left, anchoVentana - TARJETA_W - BORDE))
  });
  // Preferencia por el lado pedido y alternos en orden natural (flip).
  const alternos: Record<Lado, Lado[]> = {
    top: ['top', 'bottom', 'right', 'left'],
    bottom: ['bottom', 'top', 'right', 'left'],
    left: ['left', 'right', 'top', 'bottom'],
    right: ['right', 'left', 'top', 'bottom']
  };
  // ¿El cuadro de la tarjeta cruza el rectángulo del objetivo? (con un colchón
  // para que nunca quede pegado ni sobre el elemento explicado).
  const cruzaObjetivo = (p: Pos) =>
    p.left < objetivo.right && p.left + TARJETA_W > objetivo.left &&
    p.top < objetivo.bottom && p.top + TARJETA_H > objetivo.top;
  for (const lado of alternos[placement] ?? alternos.bottom) {
    for (const c of [candidato(lado), recorta(candidato(lado))]) {
      if (encaja(c) && !cruzaObjetivo(c)) return c;
    }
  }
  // Ningún lado cabe sin invadir el objetivo: centro (último recurso).
  return centrada;
}

export function TourCoachMark({ paso, pasoIdx, total, onNext, onBack, onSkip, onFinish, onPurgarDemo = null }: Props) {
  const markRef = useRef<HTMLDivElement>(null);
  const esUltimo = pasoIdx >= total - 1;

  // Posición calculada en un efecto de layout: primero se trae el objetivo a la
  // vista (p. ej. el pie de página) y después se mide, así la tarjeta se ancla
  // al elemento ya visible y no a una posición vieja. Si el objetivo todavía no
  // está en el DOM (pasos con `navegarA`: la vista cambia en el mismo commit),
  // se reintenta con rAF un momento antes de rendirse y centrar la tarjeta.
  const [pos, setPos] = useState(() => posicionTarjeta(paso.placement ?? 'bottom', null));
  useLayoutEffect(() => {
    const ubicar = (): boolean => {
      const objetivo = resolverTarget(paso);
      if (!objetivo) return false;
      traerAVista(objetivo);
      setPos(posicionTarjeta(paso.placement ?? 'bottom', objetivo.getBoundingClientRect()));
      return true;
    };
    if (ubicar()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let intentos = 0;
    const reintento = () => {
      if (ubicar() || ++intentos > 40) return;
      timer = setTimeout(reintento, 50);
    };
    timer = setTimeout(reintento, 50);
    return () => { if (timer !== undefined) clearTimeout(timer); };
  }, [paso]);

  // La tecla Escape también cierra desde aquí (el proveedor ya la escucha; esta es otra capa).
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
      if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); onBack(); }
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onNext, onBack, onSkip]);

  return createPortal(
    <div
      ref={markRef}
      role="dialog"
      aria-label={`Recorrido, paso ${pasoIdx + 1} de ${total}`}
      className="fixed z-[201] w-96 max-w-[calc(100vw-2rem)] bg-white text-neutral-900 rounded-2xl shadow-2xl p-5 pointer-events-auto"
      style={{ top: pos.top, left: pos.left }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold text-indigo-700 leading-tight">{paso.titulo}</h3>
        <button
          type="button"
          aria-label="Saltar el recorrido"
          onClick={onSkip}
          className="p-1 -mt-1 text-slate-500 hover:text-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="mt-2 text-sm text-neutral-700 whitespace-pre-line">{paso.cuerpo}</p>

      {esUltimo && onPurgarDemo ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="tour-purga-demo">
          <p className="text-xs font-semibold text-amber-900">¿Borrar el cliente de demostración?</p>
          <p className="mt-1 text-xs text-amber-800">
            Si empezaste a probar la app con el cliente de demostración del recorrido, puedes borrarlo aquí
            para partir de una lista vacía. Los demás clientes y sus datos reales nunca se borran desde el tour.
          </p>
          <button
            type="button"
            data-testid="tour-purga-demo-btn"
            onClick={() => { onPurgarDemo(); onFinish(); }}
            className="mt-2 inline-flex items-center px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500"
          >
            Borrar el cliente de demostración
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <span className="font-mono">{pasoIdx + 1}</span>/<span>{total}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={pasoIdx === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Atrás
          </button>
          {esUltimo ? (
            <button type="button" onClick={onFinish} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500">
              <PauseCircle className="w-4 h-4" /> Finalizar
            </button>
          ) : (
            <button type="button" onClick={onNext} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500">
              <ChevronRight className="w-3.5 h-3.5" /> Continuar
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
