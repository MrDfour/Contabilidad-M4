/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, BarChart3, Contrast, Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/utils';
import { APP_VERSION } from '../../lib/appMeta';
import type { AppTab, NavigationTab } from '../../lib/navigation';
import { TEMAS_APP, type TemaApp } from '../../lib/temas';

/** Icono por tema (MobileMenu lista las 4 opciones de TEMAS_APP). */
const ICONO_TEMA: Record<TemaApp, React.ReactNode> = {
  oscuro: <Moon className="w-5 h-5" />,
  claro: <Sun className="w-5 h-5" />,
  contrasteOscuro: <Contrast className="w-5 h-5" />,
  contrasteClaro: <Contrast className="w-5 h-5" />
};

interface MobileNavItemProps {
  /** `key` lo extrae el runtime de React; se declara solo para satisfacer tsc. */
  key?: React.Key;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function MobileNavItem({ active, onClick, icon, label }: MobileNavItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 px-4 py-3 rounded-xl transition-all w-full text-left",
        active
          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 font-semibold"
          : "text-slate-400 hover:text-white hover:bg-white/5"
      )}
    >
      <div className={cn("transition-colors", active ? "text-white" : "text-slate-500")}>
        {icon}
      </div>
      <span className="text-sm tracking-tight">{label}</span>
    </button>
  );
}

interface MobileMenuProps {
  /** Mismo gate del original: el menú solo puede mostrarse en pantallas móviles (< 1024px). */
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
  navigationTabs: NavigationTab[];
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onShowAbout: () => void;
  /** Tema de la UI (v0.9.9) + setter (persistente por dispositivo). */
  tema: TemaApp;
  onSetTema: (t: TemaApp) => void;
}

export function MobileMenu({
  isMobile,
  isOpen,
  onClose,
  navigationTabs,
  activeTab,
  onSelectTab,
  onShowAbout,
  tema,
  onSetTema
}: MobileMenuProps) {
  return (
    <AnimatePresence>
      {isMobile && isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 w-72 bg-noche border-r border-white/10 z-[70] p-6 flex flex-col gap-8 shadow-2xl"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-600 flex items-center justify-center rounded-lg shadow-lg">
                <BarChart3 className="text-white w-5 h-5" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight">Contabilidad M4<span className="text-indigo-400">Pro</span></h1>
              <span className="text-[10px] font-mono text-slate-500">{APP_VERSION}</span>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-2 pl-1 tracking-widest">Navegación</p>
              {navigationTabs.map(tab => (
                <MobileNavItem
                  key={tab.id}
                  active={activeTab === tab.id}
                  onClick={() => { onSelectTab(tab.id); onClose(); }}
                  icon={React.createElement(tab.icon, { className: 'w-5 h-5' })}
                  label={tab.label}
                />
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-2 pl-1 tracking-widest">Tema de la interfaz</p>
              {TEMAS_APP.map(opcion => (
                <MobileNavItem
                  key={opcion.id}
                  active={tema === opcion.id}
                  onClick={() => { onSetTema(opcion.id); onClose(); }}
                  icon={ICONO_TEMA[opcion.id]}
                  label={opcion.etiqueta}
                />
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-2 pl-1 tracking-widest">Información</p>
              <MobileNavItem
                active={false}
                onClick={() => { onShowAbout(); onClose(); }}
                icon={<AlertCircle className="w-5 h-5" />}
                label="Acerca de"
              />
            </div>

            <div className="mt-auto">
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                <p className="text-xs text-indigo-300 font-medium leading-relaxed">
                  Gestiona tu contabilidad de manera profesional con herramientas avanzadas de exportación y visualización.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
