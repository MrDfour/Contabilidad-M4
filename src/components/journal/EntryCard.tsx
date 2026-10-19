/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Edit2, Trash2 } from 'lucide-react';
import type { Account, JournalEntry } from '../../types';
import { cn } from '../../lib/utils';
import { formatCurrency } from '../../lib/format';

interface EntryCardProps {
  /** `key` lo extrae el runtime de React; se declara solo para satisfacer tsc. */
  key?: React.Key;
  entry: JournalEntry;
  globalIndex: number;
  isExpanded: boolean;
  accounts: Account[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  /** Propagación en la lista global (stopPropagation ya incluido aquí). */
  onMove: (direction: 'up' | 'down') => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Fila(s) de UN asiento en la tabla del Libro Diario (Fase 4: extraído de JournalView):
 * fila principal colapsable/expandible + filas de movimientos cuando está expandido.
 */
export function EntryCard({
  entry,
  globalIndex,
  isExpanded,
  accounts,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMove,
  onEdit,
  onDelete
}: EntryCardProps) {
  const isCollapsed = !isExpanded;

  return (
    <React.Fragment>
      <tr
        className={cn(
          "group hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5",
          isCollapsed && "bg-indigo-500/5 hover:bg-indigo-500/10"
        )}
        onClick={onToggle}
      >
        <td className="px-3 md:px-6 py-4 text-center">
          <button className="text-slate-500 hover:text-white transition-colors">
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-2 md:px-6 py-4 font-mono text-[10px] md:text-xs text-indigo-400/70">{globalIndex + 1}</td>
        <td className="px-2 md:px-6 py-4 text-xs text-slate-300 whitespace-normal min-w-[70px]">{entry.date}</td>
        <td className="px-3 md:px-6 py-4" colSpan={isCollapsed ? 3 : 1}>
          <div className={cn("text-xs md:text-sm font-medium text-slate-200 leading-relaxed whitespace-normal break-words", isCollapsed ? "line-clamp-1" : "")} title={entry.description}>
            {entry.description}
          </div>
        </td>
        {!isCollapsed && (
          <>
            <td className="px-3 md:px-6 py-4"></td>
            <td className="px-3 md:px-6 py-4 text-right"></td>
            <td className="px-3 md:px-6 py-4 text-right"></td>
          </>
        )}
        {isCollapsed && (
          <td className="px-3 md:px-6 py-4 text-right">
             <span className="text-[9px] md:text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded uppercase font-bold whitespace-nowrap">
               {entry.movements.length} Mov.
             </span>
          </td>
        )}
        <td className="px-2 md:px-6 py-4 text-center">
          <div className="flex items-center justify-center gap-0.5 md:gap-1">
            <div className="flex flex-col gap-0.5 mr-1 hidden md:flex">
              <button
                onClick={(e) => { e.stopPropagation(); onMove('up'); }}
                disabled={!canMoveUp}
                className="p-0.5 text-slate-500 hover:text-indigo-400 disabled:opacity-20"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMove('down'); }}
                disabled={!canMoveDown}
                className="p-0.5 text-slate-500 hover:text-indigo-400 disabled:opacity-20"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1 md:p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"
            >
              <Edit2 className="w-3.5 h-3.5 md:w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 md:p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
            >
              <Trash2 className="w-3.5 h-3.5 md:w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
      {!isCollapsed && entry.movements.map((mov, mIdx) => (
        <tr key={`${entry.id}-${mIdx}`} className="bg-white/[0.02] hover:bg-white/5 transition-colors border-l-2 border-indigo-500/20">
          <td className="px-3 md:px-6 py-3"></td>
          <td className="px-3 md:px-6 py-3"></td>
          <td className="px-3 md:px-6 py-3"></td>
          <td className="px-3 md:px-6 py-3"></td>
          <td className="px-3 md:px-6 py-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] md:text-[10px] bg-indigo-500/10 text-indigo-300 px-1 py-0.5 rounded border border-indigo-500/20">
                {accounts.find(a => a.id === mov.accountId)?.code}
              </span>
              <span className={cn("text-slate-300 text-[11px] md:text-xs whitespace-normal break-words", mov.type === 'credit' && "ml-3 md:ml-4 italic text-slate-400")}>
                {accounts.find(a => a.id === mov.accountId)?.name}
              </span>
            </div>
          </td>
          <td className="px-3 md:px-6 py-3 text-right font-mono tabular-nums text-emerald-400 text-[11px] md:text-xs">
            {mov.type === 'debit' ? formatCurrency(mov.amount) : ""}
          </td>
          <td className="px-3 md:px-6 py-3 text-right font-mono tabular-nums text-rose-400 text-[11px] md:text-xs">
            {mov.type === 'credit' ? formatCurrency(mov.amount) : ""}
          </td>
          <td className="px-3 md:px-6 py-3"></td>
        </tr>
      ))}
    </React.Fragment>
  );
}
