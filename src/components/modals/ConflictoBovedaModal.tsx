/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ConflictoBovedaModal — resolución del conflicto "manos sucias" (K-7 de
 * PLAN_SYNC_KV.md). Aparece cuando el remoto es más nuevo Y el local está
 * sucio: la decisión del usuario define la única publicación posterior
 * (el que gana deja una sola versión arriba para ambos dispositivos).
 */

import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle } from 'lucide-react';

export interface ConflictoBovedaVista {
  version: number;
  deviceLabel: string;
  updatedAt: string;
}

export function ConflictoBovedaModal({
  conflicto,
  onResolver,
}: {
  conflicto: ConflictoBovedaVista | null;
  /** 'local' | 'remoto' | 'fusionar' (Fase C de PLAN_FUSION_BOVEDA.md). */
  onResolver: (camino: 'local' | 'remoto' | 'fusionar') => void;
}) {
  return (
    <AnimatePresence>
      {conflicto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-noche/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full"
          >
            <div className="flex items-center gap-3 text-amber-400 mb-4">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-xl font-semibold">Conflicto de bóveda</h3>
            </div>
            <p className="text-slate-300 mb-2 leading-relaxed">
              {`Hay cambios locales sin publicar y el dispositivo "${conflicto.deviceLabel}" publicó una versión más reciente (v${conflicto.version}, ${new Date(conflicto.updatedAt).toLocaleString()}).`}
            </p>
            <p className="text-slate-400 text-sm mb-4 leading-relaxed">
              Elige qué datos se quedan: la versión ganadora queda vigente para
              todos los dispositivos de la bóveda. Si capturaste cosas distintas
              en cada lado sin conexión, "Fusionar ambos" conserva las pólizas
              de los DOS lados con una revisión previa.
            </p>
            <p className="text-slate-500 text-xs mb-8 leading-relaxed">
              El lado que NO se conserve queda como versión en el historial de la
              nube (hasta 5, vigencia 30 días) y puede restaurarse después desde
              el modal de sincronización (Historial → Restaurar).
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => onResolver('fusionar')}
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-500/20 text-sm font-semibold text-left"
              >
                Fusionar ambos
                <span className="block text-[11px] font-normal opacity-90 mt-0.5">
                  Recomendado si capturaste en paralelo sin conexión: conserva las pólizas de los DOS lados con revisión previa.
                </span>
              </button>
              <button
                onClick={() => onResolver('local')}
                className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium"
              >
                Conservar solo datos locales
              </button>
              <button
                onClick={() => onResolver('remoto')}
                className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-sm font-medium"
              >
                Sobrescribir con datos remotos
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
