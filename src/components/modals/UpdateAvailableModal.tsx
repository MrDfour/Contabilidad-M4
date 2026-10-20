/**
 * Modal de actualizacion in-app estilo Mihon: maquina de estados
 * Descargar -> Descargando % -> Instalar / Reintentar, changelog y opcion
 * de saltar la version. En APK Android usa el plugin nativo AppUpdater;
 * fuera de el, cae al navegador (comportamiento anterior).
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, PackageCheck, RefreshCw, CircleX } from 'lucide-react';
import { Browser } from '@capacitor/browser';
import type { ModalInfo } from './GlobalInfoModal';
import { AppUpdater, descargarApkConProgreso, esAndroidNativo } from '../../services/appUpdater';
import { cn } from '../../lib/utils';

type Etapa = 'disponible' | 'descargando' | 'descargado' | 'fallo';

export function UpdateAvailableModal({
  isOpen,
  latestVersion,
  changelog,
  downloadUrl,
  onDismiss,
  onSkipVersion,
  onNotify
}: {
  isOpen: boolean,
  latestVersion: string,
  changelog: string,
  downloadUrl: string | null,
  onDismiss: () => void,
  onSkipVersion: (version: string) => void,
  onNotify: (info: ModalInfo) => void
}) {
  const [etapa, setEtapa] = useState<Etapa>('disponible');
  const [progreso, setProgreso] = useState(0);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const descargaEnCurso = useRef(false);

  // Reset del estado cada vez que se abre el modal (version nueva, reintento).
  useEffect(() => {
    if (isOpen) {
      setEtapa('disponible');
      setProgreso(0);
    }
  }, [isOpen]);

  // Si el usuario cierra el modal durante una descarga, se cancela.
  useEffect(() => {
    if (!isOpen && descargaEnCurso.current) {
      void AppUpdater.cancelarDescarga();
      descargaEnCurso.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function accionPrincipal() {
    if (etapa === 'descargando') return;
    if (etapa === 'descargado') {
      try {
        const { valor } = await AppUpdater.puedeInstalar();
        if (!valor) {
          await AppUpdater.solicitarPermisoInstalacion();
          return;
        }
        await AppUpdater.instalarApk();
      } catch (e) {
        onNotify({
          type: 'error',
          title: 'Error',
          message: e instanceof Error ? e.message : 'No se pudo iniciar la instalación.'
        });
      }
      return;
    }
    // 'disponible' o 'fallo': descargar / reintentar
    if (!downloadUrl) return;
    if (!esAndroidNativo) {
      // Fallback web: abrir el enlace en el navegador (comportamiento anterior).
      try {
        await Browser.open({ url: downloadUrl });
      } catch {
        onNotify({ type: 'error', title: 'Error', message: 'No se pudo abrir el enlace de descarga. Por favor, inténtalo de nuevo.' });
      }
      return;
    }
    descargaEnCurso.current = true;
    setEtapa('descargando');
    setProgreso(0);
    try {
      await descargarApkConProgreso(downloadUrl, (p) => setProgreso(p));
      descargaEnCurso.current = false;
      setEtapa('descargado');
    } catch {
      descargaEnCurso.current = false;
      setEtapa('fallo');
    }
  }

  const textoBoton = (() => {
    switch (etapa) {
      case 'disponible': return 'Descargar';
      case 'descargando': return `Descargando… ${progreso}%`;
      case 'descargado': return 'Instalar';
      case 'fallo': return 'Reintentar';
    }
  })();

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={cn(
            "bg-slate-900 border-indigo-500/30 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center flex flex-col",
            "border max-h-[90vh]"
          )}
        >
          <div className="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4 shrink-0">
            {etapa === 'descargado' ? <PackageCheck className="w-8 h-8" /> : <RefreshCw className="w-8 h-8" />}
          </div>
          <h3 className="text-2xl font-bold text-white mb-1">Nueva versión disponible</h3>
          <p className="text-indigo-300 font-semibold mb-4">
            v{latestVersion}
          </p>

          {changelog ? (
            <div className="text-left mb-6 overflow-y-auto min-h-0 flex-1 bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Novedades</p>
              <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap break-words">
                {changelog}
              </div>
            </div>
          ) : null}

          {etapa === 'descargando' ? (
            <div className="mb-6">
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progreso}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">{progreso}% descargado</p>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <button
              onClick={() => void accionPrincipal()}
              disabled={etapa === 'descargando' || !downloadUrl}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-500/20",
                (etapa === 'descargando' || !downloadUrl) && "opacity-60 cursor-not-allowed"
              )}
            >
              <Download className="w-4 h-4" /> {textoBoton}
            </button>
            <button
              onClick={onDismiss}
              className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-medium transition-colors text-sm"
            >
              Más tarde
            </button>
          </div>

          <button
            onClick={() => setShowSkipDialog(true)}
            className="mt-4 text-xs text-slate-500 hover:text-slate-400 flex items-center justify-center gap-1.5 transition-colors shrink-0"
          >
            <CircleX className="w-3.5 h-3.5" /> Saltar esta versión
          </button>

          {showSkipDialog ? (
            <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60" onClick={() => setShowSkipDialog(false)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full"
              >
                <h4 className="text-lg font-bold text-white mb-2">¿Saltar la versión {latestVersion}?</h4>
                <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                  No se te volverá a avisar sobre esta versión, solo cuando salga una posterior.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowSkipDialog(false)}
                    className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      setShowSkipDialog(false);
                      onSkipVersion(latestVersion);
                      onDismiss();
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
                  >
                    Saltar versión
                  </button>
                </div>
              </motion.div>
            </div>
          ) : null}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
