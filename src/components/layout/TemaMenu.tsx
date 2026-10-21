/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TemaMenu — selector de tema de la UI (v0.9.9). Botón compacto del header
 * (icono del tema ACTUAL) con popover de las 4 opciones (oscuro, claro y
 * alto contraste sobre negro/blanco). Solo lo ve escritorio: en móvil el
 * selector vive en MobileMenu.
 */

import { useState, type ReactNode } from 'react';
import { Check, Contrast, Moon, Sun } from 'lucide-react';
import { TEMAS_APP, type TemaApp } from '../../lib/temas';

const ICONO_TEMA: Record<TemaApp, ReactNode> = {
  oscuro: <Moon className="w-4 h-4" />,
  claro: <Sun className="w-4 h-4" />,
  contrasteOscuro: <Contrast className="w-4 h-4" />,
  contrasteClaro: <Contrast className="w-4 h-4" />
};

export function TemaMenu({
  tema,
  onSetTema
}: {
  tema: TemaApp;
  onSetTema: (t: TemaApp) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const activo = TEMAS_APP.find(o => o.id === tema);

  return (
    <>
      {abierto && (
        <button
          aria-label="Cerrar selector de tema"
          onClick={() => setAbierto(false)}
          className="fixed inset-0 z-[59] cursor-default"
        />
      )}
      <div className="relative">
        <button
          onClick={() => setAbierto(v => !v)}
          title={`Tema de la interfaz: ${activo?.etiqueta ?? ''}`}
          aria-haspopup="menu"
          aria-expanded={abierto}
          className={`p-2 rounded-lg border border-white/10 bg-white/5 transition-colors ${
            abierto ? 'text-white bg-white/10' : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          {ICONO_TEMA[tema]}
        </button>
        {abierto && (
          <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-[60] p-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 px-2 py-1.5">Tema de la interfaz</p>
            {TEMAS_APP.map(opcion => (
              <button
                key={opcion.id}
                onClick={() => { onSetTema(opcion.id); setAbierto(false); }}
                className={`w-full flex items-start gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                  tema === opcion.id ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <span className="mt-0.5 text-indigo-300">{ICONO_TEMA[opcion.id]}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-200">{opcion.etiqueta}</span>
                  <span className="block text-[11px] text-slate-500 leading-snug">{opcion.detalle}</span>
                </span>
                {tema === opcion.id && <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
