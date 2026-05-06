import React, { useState } from 'react';
import { X, MessageSquare, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import pkgJson from '../../package.json';

const FEEDBACK_URL =
  'https://script.google.com/macros/s/AKfycbzqqTtoQ7fx-F494O-g4y6GE-OvNgUxk7bnW7s0_m_Obs48wAI0xMndwX2VkQBXfxus/exec';

function detectPlatform(): string {
  if (typeof window !== 'undefined' && 'electronAPI' in window) {
    return 'Electron';
  }
  return 'Capacitor/Android';
}

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (title: string, message: string) => void;
  onError: (title: string, message: string) => void;
}

export default function FeedbackModal({ isOpen, onClose, onSuccess, onError }: FeedbackModalProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSending(true);

    const payload = {
      feedback: message.trim(),
      appVersion: pkgJson.version,
      platform: detectPlatform(),
      osInfo: navigator.userAgent,
      screenRes: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language,
    };

    try {
      // Google Apps Script does not support CORS, so 'no-cors' is required.
      // The response will always be opaque; we assume success if no network error is thrown.
      await fetch(FEEDBACK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setMessage('');
      onClose();
      onSuccess('¡Gracias por tu feedback!', 'Tu mensaje fue enviado correctamente. Lo revisaremos a la brevedad.');
    } catch {
      onError('Error al enviar', 'No se pudo enviar el mensaje. Por favor, inténtalo de nuevo más tarde.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-slate-900 border border-white/10 p-8 rounded-2xl shadow-2xl max-w-md w-full"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-white">Enviar Feedback</h3>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-400 text-sm mb-4 leading-relaxed">
              ¿Tienes una sugerencia, encontraste un error o simplemente quieres dejarnos un comentario?
              Escríbenos a continuación.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe tu mensaje aquí..."
                rows={5}
                disabled={isSending}
                className={cn(
                  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200',
                  'placeholder:text-slate-500 resize-none',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50',
                  'transition-colors disabled:opacity-50'
                )}
              />

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSending}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSending || !message.trim()}
                  className={cn(
                    'flex items-center gap-2 px-5 py-2 rounded-xl font-semibold text-sm transition-all shadow-lg',
                    'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isSending ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Enviar
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
