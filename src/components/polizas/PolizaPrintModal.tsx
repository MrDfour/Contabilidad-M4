/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { Printer, X } from 'lucide-react';
import type { Poliza } from '../../types';
import { PolizaPapelSheet } from './PolizaSheet';

/**
 * Vista de formato físico de UNA póliza contable (formato papel mexicano).
 * El contenido de la hoja vive en PolizaPapelSheet (compartido con el Libro
 * Diario); aquí solo el envoltorio de modal y el aislamiento @media print.
 */
export function PolizaPrintModal({
  poliza,
  onClose
}: {
  poliza: Poliza | null,
  onClose: () => void
}) {
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
            <PolizaPapelSheet poliza={poliza} />
          </motion.div>

          {/* Acciones (no imprimibles) */}
          <div className="absolute top-4 right-4 flex gap-2 poliza-print-actions">
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
