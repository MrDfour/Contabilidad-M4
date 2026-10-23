/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle, Download, MessageSquare, Upload } from 'lucide-react';

interface AppFooterProps {
  onExportBackup: () => void;
  onImportBackup: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onShowAbout: () => void;
  onShowFeedback: () => void;
}

export function AppFooter({
  onExportBackup,
  onImportBackup,
  onShowAbout,
  onShowFeedback
}: AppFooterProps) {
  return (
    <footer className="border-t border-white/10 py-8 bg-white/5 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-400">
        <p>© 2026 Contabilidad M4. Sistema de Gestión Contable.</p>
        <div className="flex gap-6 items-center">
          <button
            onClick={onExportBackup}
            /* CH-12 de PLAN_CHEQUES.md: metadatos de anexos sí, imágenes no. */
            title="Los respaldos incluyen los METADATOS de los anexos de cheques (peso/fecha/hash); las IMÁGENES no viajan — viven solo en el equipo original."
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-indigo-300 transition-colors text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Respaldo
          </button>
          <label className="inline-flex items-center gap-1.5 text-slate-400 hover:text-indigo-300 transition-colors text-xs cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Restaurar
            <input
              type="file"
              accept=".json,application/json"
              onChange={onImportBackup}
              className="hidden"
              title="La restauración trae los metadatos de los anexos; las imágenes de cheques siguen viviendo solo en su equipo original (CH-12)."
            />
          </label>
          <span className="flex items-center gap-2 italic">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            Precisión • Integridad • Transparencia
          </span>
          <button
            onClick={onShowAbout}
            className="hidden lg:inline-flex items-center gap-1.5 text-slate-400 hover:text-indigo-300 transition-colors text-sm"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Acerca de
          </button>
          <button
            onClick={onShowFeedback}
            className="hidden lg:inline-flex items-center gap-1.5 text-slate-500 hover:text-indigo-300 transition-colors text-xs"
          >
            <MessageSquare className="w-3 h-3" />
            Feedback
          </button>
        </div>
      </div>
    </footer>
  );
}
