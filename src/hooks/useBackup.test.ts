/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBackup } from './useBackup';

const LAST_BACKUP_KEY = 'contasis_last_backup';

const EIGHT_DAYS_AGO = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

/** Evento sintético medio como el que produce un <input type="file"> controlado. */
type FileInputEvent = { target: { files: File[] | null; value: string } };

const asChangeEvent = (file: File) =>
  ({ target: { files: [file], value: 'input-value' } }) as unknown as Parameters<ReturnType<typeof useBackup>['handleImportBackup']>[0];

const renderUseBackup = () => {
  const notify = vi.fn();
  const restore = vi.fn();
  const snapshot = {
    polizas: [{ id: 'p1', folio: 1, tipo: 'diario' as const, fecha: '2025-01-01', concepto: 'X', partidas: [], totalDebe: 0, totalHaber: 0 }],
    accounts: [{ id: 'a1', code: '1101', name: 'Caja', type: 'asset' as const }],
    fixedAssets: [],
    finalInventories: { general: 100 },
    journals: [] as any[]
  };
  const rendered = renderHook(() => useBackup({
    getSnapshot: () => snapshot,
    notify,
    restore,
    canSuggest: () => true
  }));
  return { ...rendered, notify, restore, snapshot };
};

const v2EmptySnapshot = () => ({ polizas: [], journals: [], accounts: [], fixedAssets: [], finalInventories: {} });

describe('useBackup (dominio `contasis_last_backup` — vigilante + respaldo/restauración)', () => {
  beforeEach(() => { localStorage.clear(); });

  it('primer arranque sin respaldo previo: estampa timestamp y NO sugiere', () => {
    const notify = vi.fn();
    renderHook(() => useBackup({
      getSnapshot: v2EmptySnapshot as never,
      notify,
      restore: vi.fn(),
      canSuggest: () => true
    }));

    expect(localStorage.getItem(LAST_BACKUP_KEY)).toBeTruthy();
    expect(notify).not.toHaveBeenCalled();
  });

  it('respaldo con más de 7 días: sugiere respaldo semanal (título dedicado)', () => {
    localStorage.setItem(LAST_BACKUP_KEY, EIGHT_DAYS_AGO);
    const notify = vi.fn();

    renderHook(() => useBackup({
      getSnapshot: v2EmptySnapshot as never,
      notify,
      restore: vi.fn(),
      canSuggest: () => true
    }));

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Sugerencia de Respaldo' })
    );
  });

  it('vigilante respeta canSuggest=false (un modal abierto lo silencia)', () => {
    localStorage.setItem(LAST_BACKUP_KEY, EIGHT_DAYS_AGO);
    const notify = vi.fn();

    renderHook(() => useBackup({
      getSnapshot: v2EmptySnapshot as never,
      notify,
      restore: vi.fn(),
      canSuggest: () => false
    }));

    expect(notify).not.toHaveBeenCalled();
  });

  describe('handleExportBackup', () => {
    it('descarga un JSON con {version, timestamp, data} y refresca su timestamp', async () => {
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL');
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
      const { result, notify, snapshot } = renderUseBackup();

      await act(async () => { result.current.handleExportBackup(); });

      const blobPayload = createObjectURLSpy.mock.calls[0][0] as Blob;
      const parsed = JSON.parse(await blobPayload.text());

      expect(parsed.version).toBe('2.0.0');
      expect(parsed.timestamp).toBeTruthy();
      expect(parsed.data).toEqual(snapshot);
      expect(parsed.data.polizas).toEqual(snapshot.polizas); // D-14: v2 captura en pólizas
      expect(parsed.data.journals).toEqual([]); // compat: journals vacío en v2
      expect(revokeSpy).toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', title: 'Respaldo Exitoso' })
      );
      // La clave propia del hook quedó recién estampada
      const stamped = new Date(localStorage.getItem(LAST_BACKUP_KEY) as string).getTime();
      expect(stamped).toBeGreaterThan(Date.now() - 60_000);
    });
  });

  describe('handleImportBackup (restauración delegada al orquestador de App — R1)', () => {
    it('archivo válido v2 ({data:} con polizas): restaura el payload y no notifica error', async () => {
      const { result, restore, notify } = renderUseBackup();

      const payload = {
        polizas: [{ id: 'p1', folio: 1, tipo: 'diario', fecha: '2025-01-01', concepto: 'X', partidas: [], totalDebe: 0, totalHaber: 0 }],
        accounts: [], fixedAssets: [], finalInventories: {}, journals: []
      };
      const file = new File([JSON.stringify({ version: '2.0.0', data: payload })], 'b.json', { type: 'application/json' });
      await act(async () => { await result.current.handleImportBackup(asChangeEvent(file)); });

      expect(restore).toHaveBeenCalledWith(payload);
      expect(notify).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    });

    it('archivo v1.0.0 (solo journals/accounts): sigue aceptado para restauración (D-14)', async () => {
      const { result, restore } = renderUseBackup();

      const legacy = { journals: [{ id: 'j1', name: 'D', entries: [] }], accounts: [] };
      const file = new File([JSON.stringify(legacy)], 'legacy.json', { type: 'application/json' });
      await act(async () => { await result.current.handleImportBackup(asChangeEvent(file)); });

      expect(restore).toHaveBeenCalledWith(legacy);
    });

    it('JSON corrupto (R5): notifica error y NO muta ningún dominio (restore no llamado)', async () => {
      const { result, restore, notify } = renderUseBackup();

      const file = new File(['esto-no-es-json'], 'roto.json', { type: 'application/json' });
      await act(async () => { await result.current.handleImportBackup(asChangeEvent(file)); });

      expect(restore).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Error de Restauración' })
      );
    });

    it('estructura falsa (sin arrays de journals/accounts): error y no restaura', async () => {
      const { result, restore, notify } = renderUseBackup();

      const file = new File([JSON.stringify({ journals: 'no-es-array', accounts: 42 })], 'falso.json', { type: 'application/json' });
      await act(async () => { await result.current.handleImportBackup(asChangeEvent(file)); });

      expect(restore).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    });

    it('sin archivo seleccionado: no lanza, no restaura, no notifica', async () => {
      const { result, restore, notify } = renderUseBackup();

      await act(async () => {
        await result.current.handleImportBackup(
          ({ target: { files: [], value: '' } }) as Parameters<ReturnType<typeof useBackup>['handleImportBackup']>[0]
        );
      });

      expect(restore).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    });
  });

  it('el hook expone ambos handlers y el vigía queda limpio al desmontar', () => {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()); // fresco: no sugiere
    const { result, notify, unmount } = renderUseBackup();

    expect(result.current.handleExportBackup).toBeTypeOf('function');
    expect(result.current.handleImportBackup).toBeTypeOf('function');
    unmount();

    expect(notify).not.toHaveBeenCalled();
  });
});
