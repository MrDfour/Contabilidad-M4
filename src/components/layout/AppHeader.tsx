/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, Menu, Shield, Smartphone, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import { APP_VERSION } from '../../lib/appMeta';
import type { AppMode } from '../../lib/navigation';

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
  indicadorBoveda = 'sin'
}: AppHeaderProps) {
  return (
    <header className="relative overflow-visible border-b border-white/10 bg-white/5 backdrop-blur-xl sticky top-0 z-50" style={{ paddingTop: 'calc(env(safe-area-inset-top))' }}>
      <div className="px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {isMobile && (
            <button
              onClick={onOpenMobileMenu}
              className="p-2 -ml-2 text-slate-400 hover:text-white"
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

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenEmpresas}
            title="Gestionar clientes"
            className="inline-flex items-center gap-1.5 max-w-[13rem] px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors text-xs font-semibold"
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {empresaActivaNombre || 'Clientes'}
            </span>
          </button>
          <div className="hidden sm:grid grid-cols-2 items-center rounded-lg border border-white/10 bg-white/5 p-1 relative">
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-colors text-xs font-semibold"
          >
            <Smartphone className="w-3.5 h-3.5" />
            Sync
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
          <button
            onClick={() => onSetAppMode(prev => (prev === 'basic' ? 'fiscal' : 'basic'))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 transition-colors text-xs font-semibold"
          >
            <Shield className="w-3.5 h-3.5" />
            {appMode === 'basic' ? 'Modo Fiscal' : 'Modo Básico'}
          </button>
          {isMobile && (
            <div className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-1 rounded border border-indigo-500/30 uppercase">
              {activeMobileTabLabel}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
