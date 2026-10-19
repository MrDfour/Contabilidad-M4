/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { Check, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ModalInfo {
  type: 'success' | 'error',
  title: string,
  message: string
}

/** Título que dispara la variante de sugerencia de respaldo (usado también por el vigilante semanal en App). */
export const BACKUP_SUGGESTION_TITLE = 'Sugerencia de Respaldo';

export function GlobalInfoModal({
  info,
  onDismiss,
  onConfirmBackup
}: {
  info: ModalInfo | null,
  onDismiss: () => void,
  onConfirmBackup?: () => void
}) {
  return (
    <AnimatePresence>
      {info && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-slate-900 border border-white/10 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center"
          >
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6",
              info.type === 'success' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
            )}>
              {info.title === BACKUP_SUGGESTION_TITLE
                ? <AlertCircle className="w-8 h-8" />
                : info.type === 'success'
                  ? <Check className="w-8 h-8" />
                  : <AlertCircle className="w-8 h-8" />}
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">{info.title}</h3>
            <p className="text-slate-400 mb-8 leading-relaxed">
              {info.message}
            </p>
            {info.title === BACKUP_SUGGESTION_TITLE ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={onConfirmBackup}
                  className="flex-1 py-3 rounded-xl font-semibold transition-all shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                >
                  Sí, descargar respaldo
                </button>
                <button
                  onClick={onDismiss}
                  className="flex-1 py-3 rounded-xl font-semibold transition-all shadow-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Más tarde
                </button>
              </div>
            ) : (
              <button
                onClick={onDismiss}
                className={cn(
                  "w-full py-3 rounded-xl font-semibold transition-all shadow-lg",
                  info.type === 'success'
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                )}
              >
                Entendido
              </button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
