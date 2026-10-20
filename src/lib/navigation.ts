/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  BookOpen,
  FileText,
  Table as TableIcon,
  Briefcase,
  TrendingUp,
  Settings,
  Monitor,
  FileCode
} from 'lucide-react';

export type AppMode = 'basic' | 'fiscal';
export type AppTab =
  | 'polizas'
  | 'journal'
  | 't-accounts'
  | 'balance'
  | 'profit-loss'
  | 'assets'
  | 'electronic'
  | 'catalog';

/** Pestaña inicial de la app: Pólizas es el módulo principal de captura (Fase 3 PLAN_POLIZAS.md). */
export const DEFAULT_TAB: AppTab = 'polizas';

export interface NavigationTab {
  id: AppTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Pestañas base (modo Básico). Pólizas va PRIMERA (módulo de captura principal);
 * el Libro Diario queda como captura legacy en coexistencia hasta su
 * reconstrucción como reporte (Fase 4).
 */
export const BASIC_NAV_TABS: NavigationTab[] = [
  { id: 'polizas', label: 'Pólizas Contables', shortLabel: 'Pólizas', icon: BookOpen },
  { id: 'journal', label: 'Libro Diario', shortLabel: 'Diario', icon: FileText },
  { id: 't-accounts', label: 'Cuentas T', shortLabel: 'Cuentas T', icon: TableIcon },
  { id: 'balance', label: 'Balance General', shortLabel: 'Balance', icon: Briefcase },
  { id: 'profit-loss', label: 'Estado de Resultados', shortLabel: 'Resultados', icon: TrendingUp },
  { id: 'catalog', label: 'Catálogo de Cuentas', shortLabel: 'Catálogo', icon: Settings }
];

/** Pestañas exclusivas del modo fiscal (se agregan al final de la navegación). */
export const FISCAL_NAV_TABS: NavigationTab[] = [
  { id: 'assets', label: 'Activos Fijos', shortLabel: 'Activos', icon: Monitor },
  { id: 'electronic', label: 'Cont. Electrónica', shortLabel: 'SAT XML', icon: FileCode }
];
