/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Plus,
  FileText,
  Download,
  Upload,
  FileUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Account, Journal, JournalEntry } from '../types';
import {
  exportToExcel,
  exportTableToPDF,
  readExcel
} from '../lib/utils';
import { formatCurrency } from '../lib/format';
import type { AppMode } from '../lib/navigation';
import { parseJournalImport } from '../lib/importEntriesFromExcel';
import { JournalTabs } from './journal/JournalTabs';
import { EntryList } from './journal/EntryList';
import { JournalEntryForm } from './journal/EntryForm';

/**
 * Vista del Libro Diario (Fase 4: compositor de components/journal/).
 * Retiene: toolbar de exportaciones/importación, wrappers de animación del
 * formulario y el flujo de edición (nuevo asiento vs editar existente).
 * El estado de expandir/colapsar vive en EntryList; el renombrado en JournalTabs.
 */
export function JournalView({
  journals,
  activeJournalId,
  appMode,
  onSelectJournal,
  onCreateJournal,
  onRenameJournal,
  onDeleteJournal,
  entries,
  accounts,
  onAdd,
  onUpdate,
  onMove,
  onDelete,
  onImport,
  onSetModal
}: {
  journals: Journal[],
  activeJournalId: string | null,
  appMode: AppMode,
  onSelectJournal: (id: string) => void,
  onCreateJournal: () => void,
  onRenameJournal: (id: string, name: string) => void,
  onDeleteJournal: (id: string) => void,
  entries: JournalEntry[],
  accounts: Account[],
  onAdd: (e: Omit<JournalEntry, 'id'>) => void,
  onUpdate: (id: string, e: Omit<JournalEntry, 'id'>) => void,
  onMove: (id: string, direction: 'up' | 'down') => void,
  onDelete: (id: string) => void,
  onImport: (entries: JournalEntry[]) => void,
  onSetModal: (info: { type: 'success' | 'error', title: string, message: string } | null) => void
}) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);

  const activeJournal = journals.find(j => j.id === activeJournalId);

  const handleExportExcel = async () => {
    const data = entries.flatMap((entry, idx) =>
      entry.movements.map(m => {
        const account = accounts.find(a => a.id === m.accountId);
        return {
          'ID_MOVIMIENTO': idx + 1,
          'FECHA': entry.date,
          'GLOSA_DESCRIPCION': entry.description,
          'CUENTA': account?.name || 'N/A',
          'CODIGO': account?.code || '',
          'DEBE': m.type === 'debit' ? m.amount : 0,
          'HABER': m.type === 'credit' ? m.amount : 0
        };
      })
    );
    await exportToExcel(data, `Libro_Diario_${activeJournal?.name || 'General'}`, 'Movimientos');
  };

  const handleExportPDF = async () => {
    const headers = [['ID', 'FECHA', 'CUENTA', 'DESCRIPCIÓN / GLOSA', 'DEBE', 'HABER']];
    const body = entries.flatMap((entry, idx) =>
      entry.movements.map((m) => [
        idx + 1,
        entry.date,
        accounts.find(a => a.id === m.accountId)?.name || '',
        entry.description,
        m.type === 'debit' ? formatCurrency(m.amount) : '',
        m.type === 'credit' ? formatCurrency(m.amount) : ''
      ])
    );
    await exportTableToPDF(headers, body, `Libro_Diario_${activeJournal?.name || 'General'}`, `Libro Diario - ${activeJournal?.name || 'Resumen General'}`, activeJournal?.name || '');
  };

  const handleDownloadTemplate = async () => {
    const templateData = [
      { 'ASIENTO_ID': '1', 'FECHA': '2024-05-01', 'GLOSA': 'Apertura de caja', 'CUENTA': 'Caja', 'DEBE': 1000, 'HABER': 0 },
      { 'ASIENTO_ID': '1', 'FECHA': '2024-05-01', 'GLOSA': 'Apertura de caja', 'CUENTA': 'Capital Social', 'DEBE': 0, 'HABER': 1000 },
      { 'ASIENTO_ID': '2', 'FECHA': '2024-05-02', 'GLOSA': 'Compra de mercadería', 'CUENTA': 'Caja', 'DEBE': 0, 'HABER': 500 },
      { 'ASIENTO_ID': '2', 'FECHA': '2024-05-02', 'GLOSA': 'Compra de mercadería', 'CUENTA': 'Mercaderías', 'DEBE': 500, 'HABER': 0 },
    ];
    await exportToExcel(templateData, 'Plantilla_Importacion_M4', 'Guia_Carga');
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await readExcel(file);
      // Lógica de parseo/validación contra el catálogo vive en lib/importEntriesFromExcel.ts
      const { entries: parsedEntries, unmatchedAccounts } = parseJournalImport(data, accounts);

      if (parsedEntries.length === 0) {
        let msg = 'No encontramos asientos válidos para importar. Revisa que el archivo contenga cuentas y montos correctos (la suma de debe y haber debe coincidir).';
        if (unmatchedAccounts.length > 0) {
          msg = `Las siguientes cuentas no están en tu catálogo de cuentas: ${unmatchedAccounts.slice(0, 5).join(', ')}. Verifica que los nombres sean idénticos en ambos lados.`;
        }
        onSetModal({
          type: 'error',
          title: 'Error de Importación',
          message: msg
        });
        return;
      }

      onImport(parsedEntries);
      onSetModal({
        type: 'success',
        title: '¡Importación Lista!',
        message: `Hemos cargado con éxito ${parsedEntries.length} asientos a tu libro de diario desde el archivo Excel.`
      });
      e.target.value = '';
    } catch (err) {
      onSetModal({
        type: 'error',
        title: 'Formato no soportado',
        message: 'No pudimos leer el archivo correctamente. Asegúrate de que sea un archivo Excel válido (.xlsx) y utiliza la plantilla proporcionada.'
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Libro Diario</h2>
          <p className="text-slate-400 text-sm mt-1">Registra aquí todos los movimientos económicos de tu empresa.</p>
        </div>
        <div className="flex flex-wrap gap-2 md:gap-3">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-emerald-600/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-600/20 transition-colors text-xs md:text-sm text-emerald-400 font-medium"
            title="Descargar plantilla de Excel para importación"
          >
            <FileUp className="w-4 h-4" /> Plantilla
          </button>
          <div className="relative">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={handleImportExcel}
            />
            <button
              className="flex items-center gap-2 px-3 md:px-4 py-2 bg-indigo-600/10 border border-indigo-500/20 rounded-lg hover:bg-indigo-600/20 transition-colors text-xs md:text-sm text-indigo-400 font-medium"
            >
              <Upload className="w-4 h-4" /> Importar
            </button>
          </div>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-xs md:text-sm text-slate-200"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-xs md:text-sm text-slate-200"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-xs md:text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Nuevo Asiento
          </button>
        </div>
      </div>

      {/* Journal Tabs */}
      <JournalTabs
        journals={journals}
        activeJournalId={activeJournalId}
        onSelectJournal={onSelectJournal}
        onCreateJournal={onCreateJournal}
        onRenameJournal={onRenameJournal}
        onDeleteJournal={onDeleteJournal}
      />

      <AnimatePresence>
        {(isFormOpen || editingEntry) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <JournalEntryForm
              accounts={accounts}
              appMode={appMode}
              initialData={editingEntry || undefined}
              onCancel={() => {
                setIsFormOpen(false);
                setEditingEntry(null);
              }}
              onAdd={(e) => {
                if (editingEntry) {
                  onUpdate(editingEntry.id, e);
                  setEditingEntry(null);
                } else {
                  onAdd(e);
                  setIsFormOpen(false);
                }
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <EntryList
        entries={entries}
        accounts={accounts}
        onMove={onMove}
        onDelete={onDelete}
        onEdit={(entry) => {
          setEditingEntry(entry);
          setIsFormOpen(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}
