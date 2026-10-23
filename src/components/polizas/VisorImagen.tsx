/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Visor EN GRANDE de la imagen del cheque (Fase 4 de PLAN_CHEQUES.md).
 *
 * Se renderiza vía PORTAL a `document.body`: la tarjeta del cheque vive dentro
 * de contenedores con transformes (motion), y un `position: fixed` pierde su
 * anclaje al viewport dentro de un ancestro transformado — el lightbox quedaba
 * recortado al tamaño de la tarjeta, sin scroll ni salida (reporte del
 * contador, 2026-10-23). A nivel de página el overlay ES el viewport completo.
 *
 * Cierre: clic en CUALQUIER parte (la imagen o fuera de ella) o tecla Escape.
 * Mientras está abierto, el scroll del fondo queda bloqueado.
 */
export function VisorImagen({
  url,
  titulo,
  onCerrar
}: {
  url: string;
  /** Nombre accesible del diálogo (p. ej. "Imagen del cheque"). */
  titulo: string;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', tecla);
    const scrollPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = scrollPrevio;
    };
  }, [onCerrar]);

  return createPortal(
    <div
      role="dialog"
      aria-label={titulo}
      onClick={onCerrar}
      className="fixed inset-0 z-[160] bg-noche/95 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
    >
      <img
        src={url}
        alt={titulo}
        className="max-w-[94vw] max-h-[90vh] w-auto h-auto object-contain rounded-xl shadow-2xl"
      />
    </div>,
    document.body
  );
}
