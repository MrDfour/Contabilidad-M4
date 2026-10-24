/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, Menu, Play, Smartphone, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import { APP_VERSION } from '../../lib/appMeta';
import type { AppMode } from '../../lib/navigation';
import type { TemaApp } from '../../lib/temas';
import { TemaMenu } from './TemaMenu';

interface AppHeaderProps {
  appMode: AppMode;
  /** Acepta updater funcional (el modo puede alternarse con `prev => ...`). */
  onSetAppMode: React.Dispatch<React.SetStateAction<AppMode>>;
  onOpenSync: () => void;
  onOpenMobileMenu: () => void;
  isMobile: boolean;
  activeMobileTabLabel: string;
  /** Nombre del cliente activo (null antes del boot o sin clientes). */
  empresaActivaNombre: string | null;
  onOpenEmpresas: () => void;
  /** Estado de la bóveda para el punto del botón Sync (Fase 5 de PLAN_SYNC_KV.md). */
  indicadorBoveda?: 'sin' | 'ok' | 'pendiente' | 'conflicto' | 'error';
  /** Tema de la UI (v0.9.9) + setter (persistente por dispositivo). */
  tema: TemaApp;
  onSetTema: (t: TemaApp) => void;
  /** Abre el tour guiado interactivo (reemplaza al viejo toggle de Modo Básico/Fiscal duplicado). */
  onOpenTour: () => void;
}

export function AppHeader({
  appMode,
  onSetAppMode,
  onOpenSync,
  onOpenMobileMenu,
  isMobile,
  activeMobileTabLabel,
  empresaActivaNombre,
  onOpenEmpresas,
  indicadorBoveda = 'sin',
  tema,
  onSetTema,
  onOpenTour
}: AppHeaderProps) {
  return (
    <header data-testid="app-header" className="relative overflow-visible border-b border-white/10 bg-white/5 backdrop-blur-xl sticky top-0 z-50" style={{ paddingTop: 'calc(env(safe-area-inset-top))' }}>
      <div className="px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {isMobile && (
            <button
              onClick={onOpenMobileMenu}
              aria-label="Abrir menú de navegación"
              data-testid="mobile-menu-btn"
              className="p-2 -ml-2 text-slate-400 hover:text-white shrink-0"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}
          <div className="w-8 h-8 bg-indigo-600 hidden sm:flex items-center justify-center rounded-lg shadow-lg shadow-indigo-500/20">
            <BarChart3 className="text-white w-5 h-5" />
          </div>
          <h1 className="text-lg md:text-xl font-semibold tracking-tight truncate">Contabilidad M4<span className="text-indigo-400">Pro</span></h1>
          <span className="text-[10px] font-mono text-slate-500 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded hidden sm:inline">{APP_VERSION}</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={onOpenEmpresas}
            title="Gestionar clientes"
            data-testid="header-clientes"
            className="inline-flex items-center gap-1.5 max-w-[7rem] sm:max-w-[13rem] px-2 sm:px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors text-xs font-semibold"
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {empresaActivaNombre || 'Clientes'}
            </span>
          </button>
          <div data-testid="app-modo" className="hidden sm:grid grid-cols-2 items-center rounded-lg border border-white/10 bg-white/5 p-1 relative">
            <button
              onClick={() => onSetAppMode('basic')}
              className={cn(
                "relative z-10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-md transition-colors",
                appMode === 'basic' ? "text-white" : "text-slate-300 hover:text-white"
              )}
            >
              {appMode === 'basic' && (
                <motion.span
                  layoutId="app-mode-indicator"
                  className="absolute inset-0 rounded-md bg-indigo-600"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10">Básico</span>
            </button>
            <button
              onClick={() => onSetAppMode('fiscal')}
              className={cn(
                "relative z-10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-md transition-colors",
                appMode === 'fiscal' ? "text-white" : "text-slate-300 hover:text-white"
              )}
            >
              {appMode === 'fiscal' && (
                <motion.span
                  layoutId="app-mode-indicator"
                  className="absolute inset-0 rounded-md bg-indigo-600"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10">Fiscal</span>
            </button>
          </div>
          <button
            onClick={onOpenSync}
            data-testid="header-sync"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-colors text-xs font-semibold"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sync</span>
            <span
              title={
                indicadorBoveda === 'sin' ? 'Sin bóveda' :
                indicadorBoveda === 'ok' ? 'Bóveda al día' :
                indicadorBoveda === 'pendiente' ? 'Cambios pendientes de publicar' :
                indicadorBoveda === 'conflicto' ? 'Conflicto de bóveda' :
                'Error de bóveda'
              }
              className={cn(
                'w-2 h-2 rounded-full',
                indicadorBoveda === 'ok' && 'bg-emerald-400',
                indicadorBoveda === 'pendiente' && 'bg-amber-400',
                indicadorBoveda === 'conflicto' && 'bg-rose-400 animate-pulse',
                indicadorBoveda === 'error' && 'bg-rose-400',
                indicadorBoveda === 'sin' && 'bg-slate-600'
              )}
            />
          </button>
          {/* BOTÓN TOUR: reemplaza al antiguo toggle "Modo Básico/Fiscal" que era
              DUPLICADO del segmented toggle de Basic↔Fiscal (ver §2 PLAN_TOUR.md). */}
          <button
            onClick={onOpenTour}
            aria-label="Iniciar recorrido por la aplicación"
            title="Recorrido interactivo por todas las funciones (tutorial)"
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors text-xs font-semibold shrink-0"
          >
            <Play className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Tour</span>
          </button>
          {isMobile && (
            <div data-testid="mobile-tab-badge" className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-1 rounded border border-indigo-500/30 uppercase shrink-0">
              {activeMobileTabLabel}
            </div>
          )}
          <TemaMenu tema={tema} onSetTema={onSetTema} />
        </div>
      </div>
    </header>
  );
}
