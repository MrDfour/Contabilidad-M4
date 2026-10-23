/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ImagePlus, Printer, X } from 'lucide-react';
import type { Poliza } from '../../types';
import { HojaPolizaImprimible } from './PolizaSheet';

const CLAVE_HOJA_CHEQUE_IMAGEN = 'contasis_hoja_cheque_imagen';

const leerConImagen = (): boolean => {
  try {
    return localStorage.getItem(CLAVE_HOJA_CHEQUE_IMAGEN) === '1';
  } catch {
    return false;
  }
};

/**
 * Vista de formato físico de UNA póliza contable (formato papel mexicano).
 * El contenido de la hoja vive en PolizaPapelSheet (compartido con el Libro
 * Diario); aquí solo el envoltorio de modal y el aislamiento @media print.
 * En pólizas de CHEQUE aparece la opción "Con imagen del cheque" (decisión del
 * usuario, 2026-10-23; default en blanco CH-5) — misma preferencia persistida
 * que el diario (contasis_hoja_cheque_imagen).
 */
export function PolizaPrintModal({
  poliza,
  empresaId,
  onClose
}: {
  poliza: Poliza | null,
  /** Contexto del anexo de cheques (opción "Con imagen del cheque"). */
  empresaId: string | null,
  onClose: () => void
}) {
  const [conImagen, setConImagen] = useState(leerConImagen);

  const cambiarConImagen = (con: boolean) => {
    setConImagen(con);
    try {
      localStorage.setItem(CLAVE_HOJA_CHEQUE_IMAGEN, con ? '1' : '0');
    } catch {
      // Sin persistencia disponible: la opción vive solo en esta sesión.
    }
  };

  return (
    <AnimatePresence>
      {poliza && (
        <div className="fixed inset-0 z-[115] flex items-start justify-center p-4 bg-noche/80 backdrop-blur-sm overflow-y-auto">
          <style>{`
            @page { size: A4; margin: 12mm; }
            @media print {
              body * { visibility: hidden !important; }
              .poliza-print-sheet, .poliza-print-sheet * { visibility: visible !important; }
              .poliza-print-sheet {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                margin: 0 !important;
                box-shadow: none !important;
                border: none !important;
                border-radius: 0 !important;
              }
              .poliza-print-actions { display: none !important; }
            }
          `}</style>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="w-full max-w-3xl my-8 bg-white text-neutral-900 rounded-2xl shadow-2xl poliza-print-sheet px-6 pt-6 pb-8"
          >
            <HojaPolizaImprimible poliza={poliza} conImagen={conImagen} empresaId={empresaId} />
          </motion.div>

          {/* Acciones (no imprimibles) */}
          <div className="absolute top-4 right-4 flex gap-2 poliza-print-actions">
            {poliza.tipo === 'cheque' && poliza.cheque?.anexos?.length ? (
              <label
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-300 cursor-pointer select-none"
                title="Imprime la imagen anexa en la zona del cheque en lugar de dejarla en blanco para el calcado (solo si este equipo tiene la imagen)."
              >
                <input
                  type="checkbox"
                  aria-label="Con imagen del cheque en la hoja"
                  checked={conImagen}
                  onChange={e => cambiarConImagen(e.target.checked)}
                  className="w-3.5 h-3.5 accent-indigo-500"
                />
                <ImagePlus className="w-3.5 h-3.5" />
                Con imagen del cheque
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium shadow-lg shadow-indigo-500/20 transition-all"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista de impresión"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
