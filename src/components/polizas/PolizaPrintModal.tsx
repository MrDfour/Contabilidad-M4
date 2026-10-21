/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { Printer, X } from 'lucide-react';
import type { Poliza, TipoPoliza } from '../../types';
import { formatCurrency } from '../../lib/format';
import { formatPolizaFolio } from '../../lib/accounting';

const TIPO_LABEL: Record<TipoPoliza, string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  diario: 'Diario'
};

/**
 * Vista de formato físico de la póliza contable (Fase 3 de PLAN_POLIZAS.md):
 * encabezado (folio/tipo/fecha/elaboró/autorizó), cuerpo de cuentas, línea de
 * SUMAS IGUALES y tres renglones de firma (Elaboró / Revisó / Autorizó).
 * El botón "Imprimir" aísla la hoja vía estilos @media print.
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
            className="w-full max-w-3xl my-8 bg-white text-neutral-900 rounded-2xl shadow-2xl poliza-print-sheet"
          >
            {/* Encabezado */}
            <div className="flex items-start justify-between border-b-2 border-neutral-800 px-8 pt-6 pb-4">
              <div>
                <h3 className="text-xl font-bold tracking-tight">
                  Póliza de {TIPO_LABEL[poliza.tipo]}
                </h3>
                <p className="text-sm text-neutral-500">Contabilidad M4 Pro</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-bold text-lg">{formatPolizaFolio(poliza)}</p>
                <p className="text-sm text-neutral-600">
                  {new Date(`${poliza.fecha}T00:00:00`).toLocaleDateString('es-MX', {
                    day: '2-digit', month: 'long', year: 'numeric'
                  })}
                </p>
              </div>
            </div>

            {/* Datos generales */}
            <div className="px-8 py-4 space-y-1 text-sm">
              <p>
                <span className="font-semibold uppercase text-[10px] text-neutral-500 mr-2">Concepto:</span>
                {poliza.concepto}
              </p>
              {(poliza.elaboro || poliza.autorizo) && (
                <p className="text-xs text-neutral-500">
                  {poliza.elaboro && <span className="mr-4">Elaboró: {poliza.elaboro}</span>}
                  {poliza.autorizo && <span>Autorizó: {poliza.autorizo}</span>}
                </p>
              )}
            </div>

            {/* Cuerpo de cuentas */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-neutral-300 text-[10px] uppercase text-neutral-600">
                  <th className="text-left px-8 py-2 w-16 font-bold tracking-wider">Cta</th>
                  <th className="text-left px-3 py-2 font-bold tracking-wider">Nombre de cuenta</th>
                  <th className="text-left px-3 py-2 font-bold tracking-wider">Concepto</th>
                  <th className="text-right px-3 py-2 font-bold tracking-wider">Debe</th>
                  <th className="text-right px-8 py-2 font-bold tracking-wider">Haber</th>
                </tr>
              </thead>
              <tbody>
                {poliza.partidas.map(p => (
                  <tr key={p.id} className="border-b border-neutral-100">
                    <td className="px-8 py-2 font-mono text-xs">{p.accountCode}</td>
                    <td className="px-3 py-2">{p.accountName}</td>
                    <td className="px-3 py-2 text-neutral-500">{p.concept}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.debit > 0 ? formatCurrency(p.debit) : ''}</td>
                    <td className="px-8 py-2 text-right font-mono">{p.credit > 0 ? formatCurrency(p.credit) : ''}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-neutral-800 font-bold bg-neutral-50">
                  <td colSpan={3} className="px-8 py-3 text-right text-xs uppercase tracking-widest">
                    Sumas iguales
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{formatCurrency(poliza.totalDebe)}</td>
                  <td className="px-8 py-3 text-right font-mono">{formatCurrency(poliza.totalHaber)}</td>
                </tr>
              </tbody>
            </table>

            {/* Renglones de firma */}
            <div className="grid grid-cols-3 gap-8 px-8 pt-16 pb-10 text-center text-xs text-neutral-600">
              {['Elaboró', 'Revisó', 'Autorizó'].map(firma => (
                <div key={firma} className="space-y-1">
                  <div className="border-t border-neutral-400 mx-4" />
                  <p className="pt-1">{firma}</p>
                </div>
              ))}
            </div>
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
