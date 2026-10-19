/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { Browser } from '@capacitor/browser';
import type { ModalInfo } from './GlobalInfoModal';
import { cn } from '../../lib/utils';

export function UpdateAvailableModal({
  isOpen,
  latestVersion,
  downloadUrl,
  onDismiss,
  onNotify
}: {
  isOpen: boolean,
  latestVersion: string,
  downloadUrl: string | null,
  onDismiss: () => void,
  onNotify: (info: ModalInfo) => void
}) {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={cn(
            "bg-slate-900 border-indigo-500/30 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center",
            "border"
          )}
        >
          <div className="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-6">
            <RefreshCw className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Nueva versión disponible</h3>
          <p className="text-slate-400 mb-8 leading-relaxed">
            La versión <span className="text-indigo-300 font-semibold">{latestVersion}</span> está disponible.
            Actualiza ahora para obtener las últimas mejoras y correcciones.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            {downloadUrl ? (
              <button
                onClick={async () => {
                  try {
                    await Browser.open({ url: downloadUrl });
                  } catch {
                    onNotify({ type: 'error', title: 'Error', message: 'No se pudo abrir el enlace de descarga. Por favor, inténtalo de nuevo.' });
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-500/20"
              >
                <RefreshCw className="w-4 h-4" /> Actualizar ahora
              </button>
            ) : null}
            <button
              onClick={onDismiss}
              className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-medium transition-colors text-sm"
            >
              Más tarde
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
