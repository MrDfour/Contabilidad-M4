/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Account, JournalEntry } from '../../types';
import { cn } from '../../lib/utils';
import { EntryCard } from './EntryCard';

/**
 * Tabla del Libro Diario agrupada por período mensual (Fase 4: extraído de JournalView).
 * Dueña del estado de UI local: asientos expandidos y períodos colapsados
 * (mismo ciclo de vida que el original: se reinicia al desmontar la vista).
 */
export function EntryList({
  entries,
  accounts,
  onMove,
  onDelete,
  onEdit
}: {
  entries: JournalEntry[],
  accounts: Account[],
  onMove: (id: string, direction: 'up' | 'down') => void,
  onDelete: (id: string) => void,
  onEdit: (entry: JournalEntry) => void
}) {
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
  const [collapsedPeriods, setCollapsedPeriods] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) => {
    setExpandedEntries(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const togglePeriodCollapse = (periodKey: string) => {
    setCollapsedPeriods(prev => ({ ...prev, [periodKey]: !prev[periodKey] }));
  };

  const groupedEntriesByPeriod = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('es-ES', { month: 'long' });
    const UNKNOWN_PERIOD_KEY = '9999-99';
    const UNKNOWN_PERIOD_LABEL = 'Período desconocido';

    const getPeriod = (date: string) => {
      const trimmedDate = String(date).trim();
      const isoMatch = trimmedDate.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);

      if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]);
        if (month >= 1 && month <= 12) {
          const periodDate = new Date(year, month - 1, 1);
          const rawMonthLabel = formatter.format(periodDate);
          const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);
          return {
            key: `${year}-${String(month).padStart(2, '0')}`,
            label: `${monthLabel} ${year}`
          };
        }
      }

      const parsed = new Date(trimmedDate);
      if (!isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = parsed.getMonth() + 1;
        const rawMonthLabel = formatter.format(parsed);
        const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);
        return {
          key: `${year}-${String(month).padStart(2, '0')}`,
          label: `${monthLabel} ${year}`
        };
      }

      return {
        key: UNKNOWN_PERIOD_KEY,
        label: UNKNOWN_PERIOD_LABEL
      };
    };

    const grouped = new Map<
      string,
      { periodKey: string; periodLabel: string; items: Array<{ entry: JournalEntry; globalIndex: number }> }
    >();

    entries.forEach((entry, globalIndex) => {
      const { key, label } = getPeriod(entry.date);
      const current = grouped.get(key);
      if (current) {
        current.items.push({ entry, globalIndex });
        return;
      }
      grouped.set(key, {
        periodKey: key,
        periodLabel: label,
        items: [{ entry, globalIndex }]
      });
    });

    return Array.from(grouped.values());
  }, [entries]);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-6 py-4 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px] w-10"></th>
              <th className="px-6 py-4 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">#</th>
              <th className="px-6 py-4 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Fecha</th>
              <th className="px-6 py-4 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Descripción</th>
              <th className="px-6 py-4 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Cuenta</th>
              <th className="px-6 py-4 text-right font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Debe</th>
              <th className="px-6 py-4 text-right font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Haber</th>
              <th className="px-6 py-4 text-center font-semibold text-slate-400 uppercase tracking-wider text-[10px] w-20">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-500 italic">
                  No hay asientos registrados. Utiliza el botón "Nuevo Asiento" para comenzar.
                </td>
              </tr>
            ) : (
              groupedEntriesByPeriod.map((periodGroup) => {
                const isPeriodCollapsed = !!collapsedPeriods[periodGroup.periodKey];
                return (
                  <React.Fragment key={periodGroup.periodKey}>
                    <tr
                      className="bg-indigo-500/10 border-y border-indigo-500/20 cursor-pointer hover:bg-indigo-500/15 transition-colors"
                      onClick={() => togglePeriodCollapse(periodGroup.periodKey)}
                    >
                      <td colSpan={8} className="px-4 md:px-6 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 md:gap-3">
                            {isPeriodCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-indigo-300" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-indigo-300" />
                            )}
                            <span className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-indigo-200">
                              Período {periodGroup.periodLabel}
                            </span>
                          </div>
                          <span className="text-[10px] md:text-[11px] text-indigo-300/90 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/20">
                            {periodGroup.items.length} Asientos
                          </span>
                        </div>
                      </td>
                    </tr>

                    {!isPeriodCollapsed && periodGroup.items.map(({ entry, globalIndex }) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        globalIndex={globalIndex}
                        isExpanded={!!expandedEntries[entry.id]}
                        accounts={accounts}
                        canMoveUp={globalIndex > 0}
                        canMoveDown={globalIndex < entries.length - 1}
                        onToggle={() => toggleCollapse(entry.id)}
                        onMove={(direction) => onMove(entry.id, direction)}
                        onEdit={() => onEdit(entry)}
                        onDelete={() => onDelete(entry.id)}
                      />
                    ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
