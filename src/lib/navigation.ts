/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
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
  | 'journal'
  | 't-accounts'
  | 'balance'
  | 'profit-loss'
  | 'assets'
  | 'electronic'
  | 'catalog';

export interface NavigationTab {
  id: AppTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** Pestañas exclusivas del modo fiscal (se agregan al final de la navegación). */
export const FISCAL_NAV_TABS: NavigationTab[] = [
  { id: 'assets', label: 'Activos Fijos', shortLabel: 'Activos', icon: Monitor },
  { id: 'electronic', label: 'Cont. Electrónica', shortLabel: 'SAT XML', icon: FileCode }
];
