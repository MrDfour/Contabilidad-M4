/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { BarChart3, MessageSquare } from 'lucide-react';

export function AboutModal({
  isOpen,
  onClose,
  onSendFeedback
}: {
  isOpen: boolean,
  onClose: () => void,
  onSendFeedback: () => void
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-slate-900 border border-white/10 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center"
          >
            <div className="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-6">
              <BarChart3 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-6">Acerca de</h3>
            <div className="text-slate-300 space-y-2 mb-6 leading-relaxed">
              <p>Creado por Fernando Martinez</p>
              <p>Contacto: <a href="mailto:famr87@hotmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">famr87@hotmail.com</a></p>
              <p className="text-slate-400 text-sm">Derechos Reservados 2026</p>
            </div>
            <button
              onClick={() => { onClose(); onSendFeedback(); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 font-semibold transition-all mb-3 text-sm"
            >
              <MessageSquare className="w-4 h-4" />
              Enviar Feedback
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-500/20"
            >
              Cerrar
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
