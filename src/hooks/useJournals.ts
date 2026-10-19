/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Account, Journal, JournalEntry } from '../types';
import { saveToStorage } from '../services/storageService';

/**
 * Hook del dominio JOURNAL (Fase 2 del plan de modularización).
 *
 * Dueño EXCLUSIVO de la clave de storage: `contasis_journals`.
 * Ningún otro hook puede escribir esa clave por su cuenta (regla anti-R1,
 * ver REFACTORING_PLAN.md §Fase 2). La escritura del catálogo híbrido en las
 * subcuentas del diario pasa por `setSubAccounts`, invocada desde `useCatalog`.
 */
const JOURNALS_KEY = 'contasis_journals';

export function useJournals() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [activeJournalId, setActiveJournalId] = useState<string | null>(null);

  // Persistencia (comportamiento original: no persiste cuando la lista está vacía).
  useEffect(() => {
    if (journals.length > 0) {
      saveToStorage(JOURNALS_KEY, journals).catch(console.error);
    }
  }, [journals]);

  const activeJournal = journals.find(j => j.id === activeJournalId) || null;

  // --- CRUD de asientos sobre el diario activo ---
  const addEntry = (newEntry: Omit<JournalEntry, 'id'>) => {
    if (!activeJournalId) return;
    setJournals(prev => prev.map(j =>
      j.id === activeJournalId
        ? { ...j, entries: [...j.entries, { ...newEntry, id: crypto.randomUUID() }] }
        : j
    ));
  };

  const updateEntry = (id: string, updatedEntry: Omit<JournalEntry, 'id'>) => {
    if (!activeJournalId) return;
    setJournals(prev => prev.map(j =>
      j.id === activeJournalId
        ? { ...j, entries: j.entries.map(e => e.id === id ? { ...updatedEntry, id } : e) }
        : j
    ));
  };

  const moveEntry = (id: string, direction: 'up' | 'down') => {
    if (!activeJournalId) return;
    setJournals(prev => prev.map(j => {
      if (j.id !== activeJournalId) return j;
      const index = j.entries.findIndex(e => e.id === id);
      if (index === -1) return j;
      if (direction === 'up' && index === 0) return j;
      if (direction === 'down' && index === j.entries.length - 1) return j;

      const newEntries = [...j.entries];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [newEntries[index], newEntries[targetIndex]] = [newEntries[targetIndex], newEntries[index]];
      return { ...j, entries: newEntries };
    }));
  };

  const deleteEntry = (id: string) => {
    if (!activeJournalId) return;
    setJournals(prev => prev.map(j =>
      j.id === activeJournalId
        ? { ...j, entries: j.entries.filter(e => e.id !== id) }
        : j
    ));
  };

  const importEntries = (newEntries: JournalEntry[]) => {
    if (!activeJournalId) return;
    setJournals(prev => prev.map(j =>
      j.id === activeJournalId
        ? { ...j, entries: [...j.entries, ...newEntries] }
        : j
    ));
  };

  // --- CRUD de diarios ---
  const createJournal = () => {
    const baseName = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    let name = baseName;
    let counter = 1;
    while (journals.some(j => j.name === name)) {
      name = `${baseName} (${counter})`;
      counter++;
    }

    const newJournal: Journal = {
      id: crypto.randomUUID(),
      name,
      entries: []
    };
    setJournals([...journals, newJournal]);
    setActiveJournalId(newJournal.id);
  };

  const renameJournal = (id: string, newName: string) => {
    setJournals(prev => prev.map(j => j.id === id ? { ...j, name: newName } : j));
  };

  /**
   * Elimina un diario completo (rama "journal" de handleConfirmDelete original).
   * Si era el activo, redirige al primer diario restante con la MISMA condición
   * original: solo si quedan diarios y el eliminado era el activo.
   */
  const deleteJournal = (id: string) => {
    const nextJournals = journals.filter(j => j.id !== id);
    setJournals(nextJournals);
    if (activeJournalId === id && nextJournals.length > 0) {
      setActiveJournalId(nextJournals[0].id);
    }
  };

  /**
   * Escribe las subcuentas locales del diario activo (canal desde useCatalog).
   * Solo asigna `subAccounts` del diario objetivo; no toca el catálogo global.
   */
  const setSubAccounts = (journalId: string, localAccounts: Account[]) => {
    setJournals(prev =>
      prev.map(j =>
        j.id === journalId
          ? { ...j, subAccounts: localAccounts }
          : j
      )
    );
  };

  /**
   * Reemplazo atómico del estado de diarios (carga inicial, respaldo, sync remoto).
   * Persiste SIEMPRE explícitamente — incluso con array vacío, preservando el
   * comportamiento de `applyRemoteSyncState` original (superior a la guarda del
   * efecto, que omite vacíos).
   */
  const hydrate = (nextJournals: Journal[], nextActiveId: string | null) => {
    setJournals(nextJournals);
    setActiveJournalId(nextActiveId);
    saveToStorage(JOURNALS_KEY, nextJournals).catch(console.error);
  };

  return {
    journals,
    setJournals,
    activeJournalId,
    setActiveJournalId,
    activeJournal,
    addEntry,
    updateEntry,
    moveEntry,
    deleteEntry,
    importEntries,
    createJournal,
    renameJournal,
    deleteJournal,
    setSubAccounts,
    hydrate
  };
}
