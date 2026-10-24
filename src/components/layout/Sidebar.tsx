/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { BarChart3 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AppTab, NavigationTab } from '../../lib/navigation';

interface SidebarTabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function SidebarTabButton({ active, onClick, icon, label, tabId }: SidebarTabButtonProps & { tabId: AppTab }) {
  return (
    <button
      data-testid={`sidebar-tab-${tabId}`}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium w-full text-left",
        active ? "text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-indicator"
          className="absolute inset-0 rounded-xl bg-indigo-500/15 border border-indigo-500/30"
          transition={{ type: 'spring', stiffness: 420, damping: 35 }}
        />
      )}
      <span className={cn("relative z-10", active ? "text-indigo-300" : "text-slate-500")}>{icon}</span>
      <span className="relative z-10">{label}</span>
    </button>
  );
}

interface SidebarProps {
  /**
   * El componente se monta SIEMPRE (en móvil se oculta con CSS, no desmontando)
   * para no romper la animación compartida `layoutId="sidebar-active-indicator"`.
   */
  isMobile: boolean;
  navigationTabs: NavigationTab[];
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
}

export function Sidebar({ isMobile, navigationTabs, activeTab, onSelectTab }: SidebarProps) {
  return (
    <aside
      className={cn(
        "w-64 border-r border-white/10 bg-white/5 backdrop-blur-xl p-4 lg:p-5",
        isMobile && "hidden"
      )}
    >
      <div className="flex items-center gap-3 mb-6 px-2">
        <div className="w-8 h-8 bg-indigo-600 flex items-center justify-center rounded-lg shadow-lg shadow-indigo-500/20">
          <BarChart3 className="text-white w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">Panel</p>
          <p className="text-[10px] uppercase tracking-widest text-slate-500">Navegación</p>
        </div>
      </div>
      <nav className="flex flex-col gap-1.5">
        {navigationTabs.map(tab => (
          <div key={tab.id}>
            <SidebarTabButton
              tabId={tab.id}
              active={activeTab === tab.id}
              onClick={() => onSelectTab(tab.id)}
              icon={React.createElement(tab.icon, { className: 'w-4 h-4' })}
              label={tab.label}
            />
          </div>
        ))}
      </nav>
    </aside>
  );
}
