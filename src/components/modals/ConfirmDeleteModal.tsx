/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle } from 'lucide-react';

export interface ConfirmDeleteData {
  type: 'entry' | 'journal',
  id: string,
  title: string,
  message: string
}

export function ConfirmDeleteModal({
  data,
  onCancel,
  onConfirm
}: {
  data: ConfirmDeleteData | null,
  onCancel: () => void,
  onConfirm: () => void
}) {
  return (
    <AnimatePresence>
      {data && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full"
          >
            <div className="flex items-center gap-3 text-rose-400 mb-4">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-xl font-semibold">{data.title}</h3>
            </div>
            <p className="text-slate-300 mb-8 leading-relaxed">
              {data.message}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-lg shadow-rose-500/20 text-sm font-medium"
              >
                Confirmar Eliminación
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
