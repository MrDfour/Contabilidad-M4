/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useJournals } from './useJournals';
import type { Journal, JournalEntry } from '../types';

/** Fábrica de diario con un asiento cuya fecha/desc/movimientos son irrelevantes para estos tests. */
const journalWithEntries = (id: string, name: string, entryIds: string[]): Journal => ({
  id,
  name,
  entries: entryIds.map(eid => ({ id: eid, date: '2024-01-01', description: eid, movements: [] }))
});

const base = (journal: Journal): Journal[] => [journal];

describe('useJournals (dominio `contasis_journals`, regla anti-R1)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sin diario ni storage: no persiste nada al montar (protege R2: lista vacía no se guarda)', () => {
    renderHook(() => useJournals());
    expect(localStorage.getItem('contasis_journals')).toBeNull();
  });

  it('moveEntry intercambia en medio; en extremos es no-op (confirmación de UI de EntryList)', () => {
    const j = journalWithEntries('j1', 'Diario A', ['e1', 'e2', 'e3']);

    const { result } = renderHook(() => useJournals());
    act(() => {
      result.current.setJournals(base(j));
      result.current.setActiveJournalId('j1');
    });

    // centro: e2 hacia arriba → [e2, e1, e3]
    act(() => { result.current.moveEntry('e2', 'up'); });
    expect(result.current.journals[0].entries.map(e => e.id)).toEqual(['e2', 'e1', 'e3']);

    // extremo arriba con el nuevo primero: no-op
    act(() => { result.current.moveEntry('e2', 'up'); });
    expect(result.current.journals[0].entries.map(e => e.id)).toEqual(['e2', 'e1', 'e3']);

    // extremo abajo con el último: no-op
    act(() => { result.current.moveEntry('e3', 'down'); });
    expect(result.current.journals[0].entries.map(e => e.id)).toEqual(['e2', 'e1', 'e3']);

    // id inexistente: no-op sin crash
    act(() => { result.current.moveEntry('no-existe', 'up'); });
    expect(result.current.journals[0].entries).toHaveLength(3);
  });

  it('moveEntry sin diario activo: defensivo sin crash ni cambio', () => {
    const j = journalWithEntries('j1', 'Diario A', ['e1', 'e2']);
    const { result } = renderHook(() => useJournals());
    act(() => { result.current.setJournals(base(j)); });
    act(() => { result.current.moveEntry('e1', 'down'); });
    expect(result.current.journals[0].entries.map(e => e.id)).toEqual(['e1', 'e2']);
  });

  it('addEntry agrega al diario activo generando su propio id; importEntries concatena', () => {
    const j = journalWithEntries('j1', 'Diario A', []);
    const { result } = renderHook(() => useJournals());
    act(() => {
      result.current.setJournals(base(j));
      result.current.setActiveJournalId('j1');
    });

    const newEntry = { date: '2024-02-01', description: 'Venta', movements: [] } as Omit<JournalEntry, 'id'>;
    act(() => { result.current.addEntry(newEntry); });
    expect(result.current.journals[0].entries).toHaveLength(1);
    expect(result.current.journals[0].entries[0].id).toBeTruthy();
    expect(result.current.journals[0].entries[0].description).toBe('Venta');

    const imported: JournalEntry = { id: 'imp-1', date: '2024-02-02', description: 'Importada', movements: [] };
    act(() => { result.current.importEntries([imported]); });
    expect(result.current.journals[0].entries.map(e => e.id)).toEqual([result.current.journals[0].entries[0].id, 'imp-1']);
  });

  it('deleteEntry y updateEntry operan sobre el diario activo', () => {
    const j = journalWithEntries('j1', 'Diario A', ['e1', 'e2']);
    const { result } = renderHook(() => useJournals());
    act(() => {
      result.current.setJournals(base(j));
      result.current.setActiveJournalId('j1');
    });

    const updated = { date: '2024-03-03', description: 'Editada', movements: [] } as Omit<JournalEntry, 'id'>;
    act(() => { result.current.updateEntry('e1', updated); });
    expect(result.current.journals[0].entries.find(e => e.id === 'e1')?.description).toBe('Editada');

    act(() => { result.current.deleteEntry('e2'); });
    expect(result.current.journals[0].entries.map(e => e.id)).toEqual(['e1']);
  });

  it('deleteJournal redirige al primer diario restante SOLO si el eliminado era el activo', () => {
    const j1 = journalWithEntries('j1', 'Diario A', []);
    const j2 = journalWithEntries('j2', 'Diario B', []);
    const { result } = renderHook(() => useJournals());
    act(() => {
      result.current.setJournals([j1, j2]);
      result.current.setActiveJournalId('j1');
    });

    // eliminar NO activo: activo se mantiene
    act(() => { result.current.deleteJournal('j2'); });
    expect(result.current.activeJournalId).toBe('j1');

    // eliminar el activo con otros diarios restantes: al primero
    const jj1 = journalWithEntries('k1', 'A', []);
    const jj2 = journalWithEntries('k2', 'B', []);
    act(() => {
      result.current.setJournals([jj1, jj2]);
      result.current.setActiveJournalId('k1');
    });
    act(() => { result.current.deleteJournal('k1'); });
    expect(result.current.activeJournalId).toBe('k2');

    // eliminar el último: activeJournalId queda APUNTANDO al id borrado (stale, idéntico
    // al original: solo redirige si quedan diarios). La vista lo neutraliza: find() da
    // undefined → hasActiveJournal=false y entries=[]. NO cambiar en refactor.
    act(() => {
      result.current.setJournals([journalWithEntries('z1', 'Único', [])]);
      result.current.setActiveJournalId('z1');
    });
    act(() => { result.current.deleteJournal('z1'); });
    expect(result.current.journals).toHaveLength(0);
    expect(result.current.activeJournalId).toBe('z1'); // id colgante, comportamiento original
    expect(result.current.activeJournal).toBeNull();   // la vista lo ve como "sin diario"
  });

  it('createJournal genera nombre único con sufijo "(1)" y lo deja activo', () => {
    const j = journalWithEntries('j1', 'Diario A', []);
    const { result } = renderHook(() => useJournals());
    act(() => {
      result.current.setJournals(base(j));
      result.current.setActiveJournalId('j1');
    });

    const todayName = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    act(() => { result.current.createJournal(); });
    act(() => { result.current.createJournal(); });

    const names = result.current.journals.map(jj => jj.name);
    expect(names.filter(n => n === todayName)).toHaveLength(1);
    expect(names).toContain(`${todayName} (1)`);
    // El último creado queda activo
    expect(result.current.activeJournalId).toBe(result.current.journals[result.current.journals.length - 1].id);
  });

  it('hydrate persiste explícitamente lo que recibe (comportamiento original de applyRemoteSyncState)', async () => {
    const j = journalWithEntries('j1', 'Diario A', []);
    const { result } = renderHook(() => useJournals());
    await act(async () => { result.current.hydrate([j], 'j1'); });

    expect(result.current.journals).toEqual([j]);
    expect(result.current.activeJournalId).toBe('j1');
    await waitFor(() => {
      const saved = localStorage.getItem('contasis_journals');
      expect(saved).not.toBeNull();
      expect(JSON.parse(saved as string)).toEqual([j]);
    });
  });

  it('hydrate escribe SIEMPRE, incluso array vacío: contasis_journals queda "[]" (anti-R1, sync remoto)', async () => {
    const { result } = renderHook(() => useJournals());
    await act(async () => { result.current.hydrate([], null); });
    // Decisión de diseño documentada: sync remoto CON diarios vacíos borra la clave,
    // el efecto de persistencia la hubiese omitido. hydrate manda por encima del efecto.
    expect(localStorage.getItem('contasis_journals')).toBe('[]');
    expect(result.current.journals).toEqual([]);
    expect(result.current.activeJournalId).toBeNull();
  });

  it('setSubAccounts escribe subcuentas SOLO en el diario objetivo', () => {
    const j1 = journalWithEntries('j1', 'A', []);
    const j2 = journalWithEntries('j2', 'B', []);
    const { result } = renderHook(() => useJournals());
    act(() => { result.current.setJournals([j1, j2]); });

    const locals = [
      { id: 'sub-1', code: '9999', name: 'Subcuenta', type: 'expense' as const }
    ];
    act(() => { result.current.setSubAccounts('j2', locals); });

    expect(result.current.journals.find(j => j.id === 'j1')?.subAccounts).toBeUndefined();
    expect(result.current.journals.find(j => j.id === 'j2')?.subAccounts).toEqual(locals);
  });
});
