/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Check, Edit2, Plus, Trash2, X } from 'lucide-react';
import type { Journal } from '../../types';
import { cn } from '../../lib/utils';

/**
 * Pestañas de diarios con renombrado inline (Fase 4: extraído de JournalView.tsx).
 * El borrado aquí no pide confirmación: delega al orquestador de App (que levanta
 * el modal de confirmación vía onDeleteJournal).
 */
export function JournalTabs({
  journals,
  activeJournalId,
  onSelectJournal,
  onCreateJournal,
  onRenameJournal,
  onDeleteJournal
}: {
  journals: Journal[],
  activeJournalId: string | null,
  onSelectJournal: (id: string) => void,
  onCreateJournal: () => void,
  onRenameJournal: (id: string, name: string) => void,
  onDeleteJournal: (id: string) => void
}) {
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const startEditing = (id: string, name: string) => {
    setEditingJournalId(id);
    setEditingName(name);
  };

  const saveRename = () => {
    if (editingJournalId && editingName.trim()) {
      onRenameJournal(editingJournalId, editingName.trim());
      setEditingJournalId(null);
    }
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {journals.map(journal => (
        <div
          key={journal.id}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg transition-all border whitespace-nowrap group shrink-0",
            activeJournalId === journal.id
              ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 shadow-lg shadow-indigo-500/5"
              : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-white"
          )}
        >
          {editingJournalId === journal.id ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                className="bg-transparent border-none outline-none text-white text-sm w-32"
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveRename();
                  if (e.key === 'Escape') setEditingJournalId(null);
                }}
              />
              <button onClick={saveRename} className="p-1 hover:text-emerald-400">
                <Check className="w-3 h-3" />
              </button>
              <button onClick={() => setEditingJournalId(null)} className="p-1 hover:text-rose-400">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => onSelectJournal(journal.id)}
                className="text-sm font-medium"
              >
                {journal.name}
              </button>
              <div className={cn(
                "flex items-center gap-1 transition-opacity",
                activeJournalId === journal.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}>
                <button
                  onClick={() => startEditing(journal.id, journal.name)}
                  className="p-1 hover:text-white"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                {journals.length > 1 && (
                  <button
                    onClick={() => onDeleteJournal(journal.id)}
                    className="p-1 hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ))}
      <button
        onClick={onCreateJournal}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-dashed border-white/20 text-slate-500 hover:text-white hover:border-white/40 transition-all text-sm shrink-0"
      >
        <Plus className="w-4 h-4" /> Nuevo Diario
      </button>
    </div>
  );
}
