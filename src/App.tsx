/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  FileText, 
  Table as TableIcon, 
  BarChart3, 
  Download, 
  Trash2, 
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Briefcase,
  AlertCircle,
  Settings,
  Edit2,
  Check,
  X,
  Upload,
  FileUp,
  Search,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  INITIAL_ACCOUNTS, 
  JournalEntry, 
  Movement, 
  Account,
  Journal
} from './types';
import { 
  cn, 
  formatCurrency, 
  exportToExcel, 
  exportTableToPDF,
  exportToPDF,
  readExcel,
  normalizeString
} from './lib/utils';

export default function App() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [activeJournalId, setActiveJournalId] = useState<string | null>(null);
  const [accounts] = useState<Account[]>(INITIAL_ACCOUNTS);
  const [activeTab, setActiveTab] = useState<'journal' | 't-accounts' | 'balance' | 'profit-loss'>('journal');
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'entry' | 'journal', id: string, title: string, message: string } | null>(null);
  
  const activeJournal = journals.find(j => j.id === activeJournalId) || null;
  const entries = activeJournal?.entries || [];

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('contasis_journals');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setJournals(parsed);
        if (parsed.length > 0) {
          setActiveJournalId(parsed[0].id);
        }
      } catch (e) {
        console.error("Failed to load journals", e);
      }
    } else {
      // Create initial journal if none exists
      const initialJournal: Journal = {
        id: crypto.randomUUID(),
        name: 'Diario Inicial',
        entries: []
      };
      setJournals([initialJournal]);
      setActiveJournalId(initialJournal.id);
    }
  }, []);

  useEffect(() => {
    if (journals.length > 0) {
      localStorage.setItem('contasis_journals', JSON.stringify(journals));
    }
  }, [journals]);

  // Derived Data: T-Accounts
  const tAccountsData = useMemo(() => {
    const data: Record<string, { debits: { amount: number, ref: number }[], credits: { amount: number, ref: number }[] }> = {};
    
    entries.forEach((entry, index) => {
      entry.movements.forEach(mov => {
        if (!data[mov.accountId]) {
          data[mov.accountId] = { debits: [], credits: [] };
        }
        const accountData = data[mov.accountId];
        if (mov.type === 'debit') {
          accountData.debits.push({ amount: mov.amount, ref: index + 1 });
        } else {
          accountData.credits.push({ amount: mov.amount, ref: index + 1 });
        }
      });
    });
    
    return data;
  }, [entries]);

  // Derived Data: Balances
  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    Object.entries(tAccountsData).forEach(([accountId, data]) => {
      const typedData = data as { debits: { amount: number, ref: number }[], credits: { amount: number, ref: number }[] };
      const totalDebit = typedData.debits.reduce((sum, d) => sum + d.amount, 0);
      const totalCredit = typedData.credits.reduce((sum, c) => sum + c.amount, 0);
      const account = accounts.find(a => a.id === accountId);
      
      // Standard balance side
      if (account?.type === 'asset' || account?.type === 'expense') {
        balances[accountId] = totalDebit - totalCredit;
      } else {
        balances[accountId] = totalCredit - totalDebit;
      }
    });
    return balances;
  }, [tAccountsData, accounts]);

  const addEntry = (newEntry: Omit<JournalEntry, 'id'>) => {
    if (!activeJournalId) return;
    setJournals(prev => prev.map(j => 
      j.id === activeJournalId 
        ? { ...j, entries: [...j.entries, { ...newEntry, id: crypto.randomUUID() }] }
        : j
    ));
  };

  const deleteEntry = (id: string) => {
    if (!activeJournalId) return;
    setJournals(prev => prev.map(j => 
      j.id === activeJournalId 
        ? { ...j, entries: j.entries.filter(e => e.id !== id) }
        : j
    ));
  };

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

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'entry') {
      if (!activeJournalId) return;
      setJournals(prev => prev.map(j => 
        j.id === activeJournalId 
          ? { ...j, entries: j.entries.filter(e => e.id !== confirmDelete.id) }
          : j
      ));
    } else {
      const nextJournals = journals.filter(j => j.id !== confirmDelete.id);
      setJournals(nextJournals);
      if (activeJournalId === confirmDelete.id && nextJournals.length > 0) {
        setActiveJournalId(nextJournals[0].id);
      }
    }
    setConfirmDelete(null);
  };

  const importEntries = (newEntries: JournalEntry[]) => {
    if (!activeJournalId) return;
    setJournals(prev => prev.map(j => 
      j.id === activeJournalId 
        ? { ...j, entries: [...j.entries, ...newEntries] }
        : j
    ));
  };

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-100 font-sans selection:bg-indigo-500 selection:text-white relative overflow-x-hidden">
      {/* Background Gradients */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_30%,#1e293b_0%,transparent_50%),radial-gradient(circle_at_80%_70%,#334155_0%,transparent_50%)] pointer-events-none"></div>

      {/* Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 flex items-center justify-center rounded-lg shadow-lg shadow-indigo-500/20">
              <BarChart3 className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Contabilidad M4<span className="text-indigo-400">Pro</span></h1>
          </div>
          <nav className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
            <TabButton 
              active={activeTab === 'journal'} 
              onClick={() => setActiveTab('journal')}
              icon={<FileText className="w-4 h-4" />}
              label="Libro Diario"
            />
            <TabButton 
              active={activeTab === 't-accounts'} 
              onClick={() => setActiveTab('t-accounts')}
              icon={<TableIcon className="w-4 h-4" />}
              label="Cuentas T"
            />
            <TabButton 
              active={activeTab === 'balance'} 
              onClick={() => setActiveTab('balance')}
              icon={<Briefcase className="w-4 h-4" />}
              label="Balance General"
            />
            <TabButton 
              active={activeTab === 'profit-loss'} 
              onClick={() => setActiveTab('profit-loss')}
              icon={<TrendingUp className="w-4 h-4" />}
              label="E. de Resultados"
            />
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'journal' && (
            <motion.div
              key="journal"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <JournalView 
                journals={journals}
                activeJournalId={activeJournalId}
                onSelectJournal={setActiveJournalId}
                onCreateJournal={createJournal}
                onRenameJournal={renameJournal}
                onDeleteJournal={(id) => {
                  const j = journals.find(journal => journal.id === id);
                  setConfirmDelete({
                    type: 'journal',
                    id,
                    title: 'Eliminar Libro de Diario',
                    message: `¿Estás seguro de que deseas eliminar "${j?.name}"? Esta acción no se puede deshacer.`
                  });
                }}
                entries={entries} 
                accounts={accounts} 
                onAdd={addEntry} 
                onDelete={(id) => {
                  const e = entries.find(entry => entry.id === id);
                  setConfirmDelete({
                    type: 'entry',
                    id,
                    title: 'Eliminar Asiento',
                    message: `¿Estás seguro de que deseas eliminar el asiento "${e?.description}"?`
                  });
                }}
                onImport={importEntries}
              />
            </motion.div>
          )}

          {activeTab === 't-accounts' && (
            <motion.div
              key="t-accounts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <TAccountsView 
                tAccountsData={tAccountsData} 
                accounts={accounts} 
                journalName={activeJournal?.name || ''}
              />
            </motion.div>
          )}

          {activeTab === 'balance' && (
            <motion.div
              key="balance"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <BalanceSheetView 
                accountBalances={accountBalances} 
                accounts={accounts} 
                journalName={activeJournal?.name || ''}
              />
            </motion.div>
          )}

          {activeTab === 'profit-loss' && (
            <motion.div
              key="profit-loss"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <ProfitLossView 
                accountBalances={accountBalances} 
                accounts={accounts} 
                journalName={activeJournal?.name || ''}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>


      <footer className="mt-auto border-t border-white/10 py-8 bg-white/5 backdrop-blur-md relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <p>© 2026 Contabilidad M4. Sistema de Gestión Contable.</p>
          <div className="flex gap-6">
            <span className="flex items-center gap-2 italic">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              Precisión • Integridad • Transparencia
            </span>
          </div>
        </div>
      </footer>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-2xl max-w-sm w-full"
            >
              <div className="flex items-center gap-3 text-rose-400 mb-4">
                <AlertCircle className="w-6 h-6" />
                <h3 className="text-xl font-semibold">{confirmDelete.title}</h3>
              </div>
              <p className="text-slate-300 mb-8 leading-relaxed">
                {confirmDelete.message}
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-lg shadow-rose-500/20 text-sm font-medium"
                >
                  Confirmar Eliminación
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-Components ---

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium",
        active 
          ? "bg-white/10 text-white shadow-lg shadow-black/20 ring-1 ring-white/20" 
          : "text-slate-400 hover:text-white hover:bg-white/5"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// 1. Journal View
function JournalView({ 
  journals, 
  activeJournalId, 
  onSelectJournal, 
  onCreateJournal, 
  onRenameJournal, 
  onDeleteJournal,
  entries, 
  accounts, 
  onAdd, 
  onDelete,
  onImport
}: { 
  journals: Journal[],
  activeJournalId: string | null,
  onSelectJournal: (id: string) => void,
  onCreateJournal: () => void,
  onRenameJournal: (id: string, name: string) => void,
  onDeleteJournal: (id: string) => void,
  entries: JournalEntry[], 
  accounts: Account[], 
  onAdd: (e: Omit<JournalEntry, 'id'>) => void,
  onDelete: (id: string) => void,
  onImport: (entries: JournalEntry[]) => void
}) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const activeJournal = journals.find(j => j.id === activeJournalId);

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

  const handleExportExcel = async () => {
    const data = entries.flatMap((entry) => 
      entry.movements.map(m => {
        const account = accounts.find(a => a.id === m.accountId);
        return {
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

  const handleExportPDF = () => {
    const headers = [['FECHA', 'CUENTA', 'DESCRIPCIÓN / GLOSA', 'DEBE', 'HABER']];
    const body = entries.flatMap((entry) => 
      entry.movements.map((m) => [
        entry.date,
        accounts.find(a => a.id === m.accountId)?.name || '',
        entry.description,
        m.type === 'debit' ? formatCurrency(m.amount) : '',
        m.type === 'credit' ? formatCurrency(m.amount) : ''
      ])
    );
    exportTableToPDF(headers, body, `Libro_Diario_${activeJournal?.name || 'General'}`, `Libro Diario - ${activeJournal?.name || 'Resumen General'}`);
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
      
      const requiredColumns = ['FECHA', 'GLOSA', 'CUENTA', 'DEBE', 'HABER'];
      if (data.length === 0) throw new Error('El archivo está vacío o no tiene el formato correcto.');
      
      // Handle potential case sensitivity in header
      const firstRow = data[0];
      const actualKeys = Object.keys(firstRow).map(k => k.toUpperCase());
      const hasRequiredColumns = requiredColumns.every(col => actualKeys.includes(col));
      
      if (!hasRequiredColumns) {
        throw new Error('Formato inválido. Asegúrate de usar la plantilla descargada con las columnas: ' + requiredColumns.join(', '));
      }

      // Map keys to normalized uppercase for reliable access
      const normalizedData = data.map(row => {
        const newRow: any = {};
        Object.keys(row).forEach(key => {
          newRow[key.toUpperCase()] = row[key];
        });
        return newRow;
      });

      const groupedEntries: Record<string, any> = {};
      
      normalizedData.forEach((row: any, index: number) => {
        const groupKey = row.ASIENTO_ID || `${row.FECHA}_${row.GLOSA}_${index}`;
        
        if (!groupedEntries[groupKey]) {
          groupedEntries[groupKey] = {
            date: row.FECHA,
            description: row.GLOSA,
            movements: []
          };
        }
        
        const accountSearch = String(row.CUENTA);
        const account = accounts.find(a => 
          normalizeString(a.name) === normalizeString(accountSearch) || 
          a.code === accountSearch
        );

        if (account) {
          const debe = Number(row.DEBE) || 0;
          const haber = Number(row.HABER) || 0;
          
          if (debe > 0) {
            groupedEntries[groupKey].movements.push({ accountId: account.id, type: 'debit', amount: debe });
          }
          if (haber > 0) {
            groupedEntries[groupKey].movements.push({ accountId: account.id, type: 'credit', amount: haber });
          }
        }
      });

      const finalEntries: JournalEntry[] = Object.values(groupedEntries)
        .filter((entry: any) => entry.movements.length > 0)
        .map(entry => ({
          ...entry,
          id: crypto.randomUUID(),
        }));

      if (finalEntries.length === 0) {
        throw new Error('No se encontraron asientos válidos para importar. Verifica que los nombres de las cuentas coincidan con los del sistema.');
      }

      onImport(finalEntries);
      e.target.value = ''; 
    } catch (err) {
      alert('Error de Importación: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Libro Diario</h2>
          <p className="text-slate-400 text-sm mt-1">Registra aquí todos los movimientos económicos de tu empresa.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-600/20 transition-colors text-sm text-emerald-400 font-medium"
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
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600/10 border border-indigo-500/20 rounded-lg hover:bg-indigo-600/20 transition-colors text-sm text-indigo-400 font-medium"
            >
              <Upload className="w-4 h-4" /> Importar
            </button>
          </div>
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-sm text-slate-200"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-sm text-slate-200"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button 
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Nuevo Asiento
          </button>
        </div>
      </div>

      {/* Journal Tabs */}
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

      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <JournalEntryForm accounts={accounts} onAdd={(e) => { onAdd(e); setIsFormOpen(false); }} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
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
                entries.map((entry, idx) => (
                  <React.Fragment key={entry.id}>
                    {entry.movements.map((mov, mIdx) => (
                      <tr key={`${entry.id}-${mIdx}`} className="group hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-indigo-400/70">{mIdx === 0 ? idx + 1 : ""}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-300">{mIdx === 0 ? entry.date : ""}</td>
                        <td className="px-6 py-4">
                          {mIdx === 0 && (
                            <div className="max-w-[200px] truncate font-medium text-slate-200" title={entry.description}>
                              {entry.description}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20">
                              {accounts.find(a => a.id === mov.accountId)?.code}
                            </span>
                            <span className={cn("text-slate-300", mov.type === 'credit' && "ml-4 italic text-slate-400")}>
                              {accounts.find(a => a.id === mov.accountId)?.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono tabular-nums text-emerald-400">
                          {mov.type === 'debit' ? formatCurrency(mov.amount) : ""}
                        </td>
                        <td className="px-6 py-4 text-right font-mono tabular-nums text-rose-400">
                          {mov.type === 'credit' ? formatCurrency(mov.amount) : ""}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {mIdx === 0 && (
                            <button 
                              onClick={() => onDelete(entry.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SearchableAccountSelect({ 
  accounts, 
  value, 
  onChange, 
  className 
}: { 
  accounts: Account[], 
  value: string, 
  onChange: (accountId: string) => void,
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const selectedAccount = accounts.find(a => a.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredAccounts = useMemo(() => {
    const term = normalizeString(searchTerm);
    if (!term) return accounts;
    return accounts.filter(acc => 
      normalizeString(acc.name).includes(term) || 
      acc.code.includes(term)
    );
  }, [accounts, searchTerm]);

  return (
    <div className={cn("relative", className)} ref={wrapperRef}>
      <div 
        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 group hover:border-white/20 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Search className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
        <input
          type="text"
          className="flex-1 bg-transparent outline-none text-white placeholder-slate-500 min-w-0"
          placeholder={selectedAccount ? `${selectedAccount.code} - ${selectedAccount.name}` : "Buscar cuenta..."}
          value={isOpen ? searchTerm : (selectedAccount ? `${selectedAccount.code} - ${selectedAccount.name}` : '')}
          onChange={(e) => {
            e.stopPropagation();
            setSearchTerm(e.target.value);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchTerm('');
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <ChevronDown className={cn("w-3.5 h-3.5 text-slate-500 transition-transform", isOpen && "rotate-180")} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-1 scrollbar-hide"
          >
            {filteredAccounts.length > 0 ? (
              filteredAccounts.map(acc => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    onChange(acc.id);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors",
                    acc.id === value ? "bg-indigo-600/20 text-indigo-300" : "hover:bg-white/5 text-slate-300"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{acc.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{acc.code} • {acc.type.toUpperCase()}</span>
                  </div>
                  {acc.id === value && <Check className="w-3.5 h-3.5" />}
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-slate-500 text-xs italic">
                No se encontraron cuentas
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function JournalEntryForm({ accounts, onAdd }: { accounts: Account[], onAdd: (e: Omit<JournalEntry, 'id'>) => void }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [movements, setMovements] = useState<Movement[]>([
    { accountId: accounts[0].id, type: 'debit', amount: 0 },
    { accountId: accounts[1].id, type: 'credit', amount: 0 }
  ]);

  const totalDebit = movements.filter(m => m.type === 'debit').reduce((sum, m) => sum + m.amount, 0);
  const totalCredit = movements.filter(m => m.type === 'credit').reduce((sum, m) => sum + m.amount, 0);
  const isOutOfBalance = Math.abs(totalDebit - totalCredit) > 0.01 || totalDebit === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isOutOfBalance) return;
    onAdd({ date, description, movements: movements.filter(m => m.amount > 0) });
  };

  const addMovement = () => setMovements([...movements, { accountId: accounts[0].id, type: 'debit', amount: 0 }]);
  const removeMovement = (idx: number) => setMovements(movements.filter((_, i) => i !== idx));

  const updateMovement = (idx: number, updates: Partial<Movement>) => {
    setMovements(movements.map((m, i) => i === idx ? { ...m, ...updates } : m));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl shadow-2xl mb-10 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha del Asiento</label>
          <input 
            type="date" 
            required 
            value={date} 
            onChange={e => setDate(e.target.value)}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Concepto / Glosa</label>
          <input 
            type="text" 
            placeholder="Ej: Pago de renta mensual..."
            required 
            value={description} 
            onChange={e => setDescription(e.target.value)}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white placeholder-slate-600"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="font-semibold text-sm text-indigo-300">Movimientos</h3>
          <button 
            type="button" 
            onClick={addMovement}
            className="text-xs flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Añadir partida
          </button>
        </div>

        {movements.map((m, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-4 items-end animate-in fade-in slide-in-from-left-2 transition-all">
            <div className="col-span-12 md:col-span-5 space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-500">Cta Contable</label>
              <SearchableAccountSelect 
                accounts={accounts} 
                value={m.accountId} 
                onChange={(newId) => updateMovement(idx, { accountId: newId })} 
              />
            </div>
            <div className="col-span-6 md:col-span-3 space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-500">Tipo</label>
              <select 
                value={m.type} 
                onChange={e => updateMovement(idx, { type: e.target.value as 'debit' | 'credit' })}
                className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none text-white appearance-none"
              >
                <option value="debit" className="bg-[#1e293b]">Debe (Cargo)</option>
                <option value="credit" className="bg-[#1e293b]">Haber (Abono)</option>
              </select>
            </div>
            <div className="col-span-6 md:col-span-3 space-y-1">
              <label className="text-[9px] uppercase font-bold text-slate-500">Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-1.5 text-slate-400">$</span>
                <input 
                  type="number" 
                  min="0" 
                  step="0.01" 
                  required
                  value={m.amount || ''} 
                  onChange={e => updateMovement(idx, { amount: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-6 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none font-mono text-white"
                />
              </div>
            </div>
            <div className="col-span-12 md:col-span-1 pb-1">
              <button 
                type="button" 
                onClick={() => removeMovement(idx)}
                disabled={movements.length <= 2}
                className="p-2 text-slate-500 hover:text-rose-400 disabled:opacity-30"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between pt-6 border-t border-white/10 gap-6">
        <div className="flex gap-8 text-sm">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-bold">Total Debe</span>
            <span className="font-mono text-lg text-emerald-400">{formatCurrency(totalDebit)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-bold">Total Haber</span>
            <span className="font-mono text-lg text-rose-400">{formatCurrency(totalCredit)}</span>
          </div>
          {isOutOfBalance && totalDebit > 0 && (
            <div className="flex items-center gap-2 text-rose-400 italic animate-pulse">
              <AlertCircle className="w-4 h-4" />
              <span>Diferencia: {formatCurrency(Math.abs(totalDebit - totalCredit))}</span>
            </div>
          )}
        </div>

        <button 
          type="submit" 
          disabled={isOutOfBalance}
          className={cn(
            "px-6 py-2.5 rounded-lg font-bold transition-all w-full md:w-auto shadow-lg",
            isOutOfBalance 
              ? "bg-white/5 text-slate-500 cursor-not-allowed border border-white/5" 
              : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-500/20 active:scale-95"
          )}
        >
          Guardar Asiento
        </button>
      </div>
    </form>
  );
}

// 2. T-Accounts View
function TAccountsView({ tAccountsData, accounts, journalName }: { 
  tAccountsData: Record<string, { debits: { amount: number, ref: number }[], credits: { amount: number, ref: number }[] }>, 
  accounts: Account[],
  journalName: string
}) {
  const handleExportPDF = () => {
    exportToPDF('t-accounts-canvas', `Libro_Mayor_Cuentas_T_${journalName}`);
  };

  const handleExportExcel = async () => {
    const data = Object.entries(tAccountsData).map(([accountId, data]) => {
      const acc = accounts.find(a => a.id === accountId);
      const typedData = data as { debits: { amount: number, ref: number }[], credits: { amount: number, ref: number }[] };
      const totalDebit = typedData.debits.reduce((sum, d) => sum + d.amount, 0);
      const totalCredit = typedData.credits.reduce((sum, c) => sum + c.amount, 0);
      const balanceSide = (acc?.type === 'asset' || acc?.type === 'expense') ? 'Deudor' : 'Acreedor';
      const balance = balanceSide === 'Deudor' ? totalDebit - totalCredit : totalCredit - totalDebit;
      
      return {
        'Código': acc?.code,
        'Cuenta': acc?.name,
        'Tipo': acc?.type,
        'Total Debe': totalDebit,
        'Total Haber': totalCredit,
        'Naturaleza': balanceSide,
        'Saldo Final': balance
      };
    });
    await exportToExcel(data, `Libro_Mayor_Saldos_${journalName}`, 'Cuentas_T');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-white">Cuentas T</h2>
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs font-mono rounded border border-indigo-500/30 mt-1">{journalName}</span>
          </div>
          <p className="text-slate-400 text-sm mt-1">Representiva visual del flujo de cada cuenta referenciada al diario.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-sm text-slate-200"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      <div id="t-accounts-canvas" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-10">
        {Object.entries(tAccountsData).length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate-500 italic bg-white/5 border border-dashed border-white/10 rounded-2xl font-mono backdrop-blur-sm">
            No hay movimientos generados para mostrar cuentas T.
          </div>
        ) : (
          Object.entries(tAccountsData).map(([accountId, data]) => {
            const acc = accounts.find(a => a.id === accountId);
            const typedData = data as { debits: { amount: number, ref: number }[], credits: { amount: number, ref: number }[] };
            const totalD = typedData.debits.reduce((s, d) => s + d.amount, 0);
            const totalC = typedData.credits.reduce((s, c) => s + c.amount, 0);
            const balanceSide = (acc?.type === 'asset' || acc?.type === 'expense') ? 'left' : 'right';
            const balance = balanceSide === 'left' ? totalD - totalC : totalC - totalD;

            return (
              <div key={accountId} className="bg-white/5 border border-white/10 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden flex flex-col h-fit transition-transform hover:scale-[1.02]">
                <div className="bg-white/5 px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <span className="font-bold text-sm tracking-tight text-indigo-300">{acc?.name}</span>
                  <span className="text-[10px] font-mono text-slate-500">{acc?.code}</span>
                </div>
                
                {/* The T Structure */}
                <div className="flex flex-col flex-1 divide-y divide-white/10">
                  <div className="flex min-h-[140px] divide-x divide-white/20">
                    {/* Debit Column */}
                    <div className="flex-1 p-3 space-y-1.5">
                      <div className="text-[9px] font-bold text-slate-500 uppercase mb-1 flex justify-between">
                        <span>Debe</span>
                      </div>
                      {typedData.debits.map((d, i) => (
                        <div key={i} className="flex justify-between items-center text-xs font-mono text-emerald-400/90">
                          <span className="text-[9px] text-slate-500 pr-2">({d.ref})</span>
                          <span>{formatCurrency(d.amount)}</span>
                        </div>
                      ))}
                    </div>
                    {/* Credit Column */}
                    <div className="flex-1 p-3 space-y-1.5">
                      <div className="text-[9px] font-bold text-slate-500 uppercase mb-1 text-right">
                        <span>Haber</span>
                      </div>
                      {typedData.credits.map((c, i) => (
                        <div key={i} className="flex justify-between items-center text-xs font-mono text-rose-400/90">
                          <span>{formatCurrency(c.amount)}</span>
                          <span className="text-[9px] text-slate-500 pl-2">({c.ref})</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="flex divide-x divide-white/20 border-t-2 border-white/20">
                    <div className="flex-1 p-2 text-right font-mono font-bold text-xs text-emerald-400">
                      {formatCurrency(totalD)}
                    </div>
                    <div className="flex-1 p-2 text-right font-mono font-bold text-xs text-rose-400">
                      {formatCurrency(totalC)}
                    </div>
                  </div>

                  {/* Balance Result */}
                  <div className="flex bg-white/5">
                    <div className={cn(
                      "flex-1 p-2 font-mono font-bold text-xs",
                      balanceSide === 'left' ? "text-left pl-3 text-emerald-400 underline decoration-emerald-400/30" : "text-right pr-3 text-rose-400 underline decoration-rose-400/30"
                    )}>
                      {balanceSide === 'left' ? (
                        <div className="flex items-center gap-2">
                          <ChevronRight className="w-3 h-3 text-slate-500" />
                          <span>{formatCurrency(balance)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <span>{formatCurrency(balance)}</span>
                          <ChevronRight className="w-3 h-3 text-slate-500" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// 3. Profit & Loss View
function ProfitLossView({ accountBalances, accounts, journalName }: { accountBalances: Record<string, number>, accounts: Account[], journalName: string }) {
  const revenueAccounts = accounts.filter(a => a.type === 'revenue' && accountBalances[a.id]);
  const expenseAccounts = accounts.filter(a => a.type === 'expense' && accountBalances[a.id]);

  const totalRevenue = revenueAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
  const totalExpense = expenseAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
  const netIncome = totalRevenue - totalExpense;

  const handleExportPDF = () => {
    exportToPDF('profit-loss-canvas', `Estado_de_Resultados_${journalName}`);
  };

  const handleExportExcel = async () => {
    const data = [
      { Concepto: 'INGRESOS', Monto: '' },
      ...revenueAccounts.map(a => ({ Concepto: a.name, Monto: accountBalances[a.id] })),
      { Concepto: 'TOTAL INGRESOS', Monto: totalRevenue },
      { Concepto: '', Monto: '' },
      { Concepto: 'EGRESOS / GASTOS', Monto: '' },
      ...expenseAccounts.map(a => ({ Concepto: a.name, Monto: -accountBalances[a.id] })),
      { Concepto: 'TOTAL EGRESOS', Monto: -totalExpense },
      { Concepto: '', Monto: '' },
      { Concepto: 'UTILIDAD / PERDIDA NETA', Monto: netIncome }
    ];
    await exportToExcel(data, `Estado_Resultados_${journalName}`, 'P&L');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-white">Estado de Resultados</h2>
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs font-mono rounded border border-indigo-500/30 mt-1">{journalName}</span>
          </div>
          <p className="text-slate-400 text-sm mt-1">Ingresos vs Egresos del periodo.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-sm text-slate-200"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      <div id="profit-loss-canvas" className="bg-white/5 border border-white/10 p-8 rounded-2xl shadow-2xl backdrop-blur-xl max-w-3xl mx-auto">
        <div className="text-center mb-8 pb-4 border-b border-white/10">
          <h3 className="text-xl font-bold uppercase tracking-widest text-indigo-300">Estado de Resultados</h3>
          <p className="text-[10px] text-slate-500 mt-1 uppercase font-mono tracking-tighter">Resumen Operativo</p>
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <div className="flex justify-between font-bold text-sm border-b border-white/20 pb-1 uppercase tracking-wider text-slate-300">
              <span>Ingresos</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            {revenueAccounts.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No hay ingresos registrados.</p>
            ) : (
              revenueAccounts.map(a => (
                <div key={a.id} className="flex justify-between items-center text-sm font-mono leading-none text-slate-300">
                  <span>{a.name}</span>
                  <span className="text-emerald-400">{formatCurrency(accountBalances[a.id] || 0)}</span>
                </div>
              ))
            )}
            <div className="flex justify-between items-center font-bold text-sm pt-2 border-t border-white/10 font-mono text-white">
              <span>Total de Ingresos</span>
              <span className="text-emerald-400 underline decoration-double">{formatCurrency(totalRevenue)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between font-bold text-sm border-b border-white/20 pb-1 uppercase tracking-wider text-slate-300">
              <span>Egresos / Gastos</span>
              <TrendingDown className="w-4 h-4 text-rose-400" />
            </div>
            {expenseAccounts.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No hay gastos registrados.</p>
            ) : (
              expenseAccounts.map(a => (
                <div key={a.id} className="flex justify-between items-center text-sm font-mono leading-none text-slate-400">
                  <span>{a.name}</span>
                  <span className="text-rose-400">({formatCurrency(accountBalances[a.id] || 0)})</span>
                </div>
              ))
            )}
            <div className="flex justify-between items-center font-bold text-sm pt-2 border-t border-white/10 font-mono text-white">
              <span>Total de Egresos</span>
              <span className="text-rose-400">({formatCurrency(totalExpense)})</span>
            </div>
          </div>

          <div className={cn(
            "p-6 rounded-2xl flex justify-between items-center border shadow-inner",
            netIncome >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"
          )}>
            <span className="font-bold uppercase tracking-tight text-white">Utilidad / Pérdida Neta</span>
            <span className={cn("text-2xl font-bold font-mono tabular-nums", netIncome >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {formatCurrency(netIncome)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 4. Balance Sheet View
function BalanceSheetView({ accountBalances, accounts, journalName }: { accountBalances: Record<string, number>, accounts: Account[], journalName: string }) {
  const assetsAccounts = accounts.filter(a => a.type === 'asset' && accountBalances[a.id]);
  const liabilityAccounts = accounts.filter(a => a.type === 'liability' && accountBalances[a.id]);
  const equityAccounts = accounts.filter(a => a.type === 'equity' && accountBalances[a.id]);
  
  const revenueAccounts = accounts.filter(a => a.type === 'revenue' && accountBalances[a.id]);
  const expenseAccounts = accounts.filter(a => a.type === 'expense' && accountBalances[a.id]);
  const netIncome = revenueAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0) - 
                    expenseAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);

  const totalAssets = assetsAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
  const totalEquity = equityAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0) + netIncome;

  const handleExportPDF = () => {
    exportToPDF('balance-sheet-canvas', `Balance_General_${journalName}`);
  };

  const handleExportExcel = async () => {
    const data = [
      { Sección: 'ACTIVOS', Concepto: '', Monto: '' },
      ...assetsAccounts.map(a => ({ Sección: 'Activo', Concepto: a.name, Monto: accountBalances[a.id] })),
      { Sección: 'TOTAL ACTIVOS', Concepto: '', Monto: totalAssets },
      { Sección: '', Concepto: '', Monto: '' },
      { Sección: 'PASIVOS', Concepto: '', Monto: '' },
      ...liabilityAccounts.map(a => ({ Sección: 'Pasivo', Concepto: a.name, Monto: accountBalances[a.id] })),
      { Sección: 'TOTAL PASIVOS', Concepto: '', Monto: totalLiabilities },
      { Sección: '', Concepto: '', Monto: '' },
      { Sección: 'PATRIMONIO', Concepto: '', Monto: '' },
      ...equityAccounts.map(a => ({ Sección: 'Capital', Concepto: a.name, Monto: accountBalances[a.id] })),
      { Sección: 'Capital', Concepto: 'Utilidad del Ejercicio', Monto: netIncome },
      { Sección: 'TOTAL PATRIMONIO', Concepto: '', Monto: totalEquity },
      { Sección: '', Concepto: '', Monto: '' },
      { Sección: 'PASIVO + CAPITAL', Concepto: '', Monto: totalLiabilities + totalEquity }
    ];
    await exportToExcel(data, `Balance_General_${journalName}`, 'Situacion_Financiera');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-white">Balance General</h2>
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs font-mono rounded border border-indigo-500/30 mt-1">{journalName}</span>
          </div>
          <p className="text-slate-400 text-sm mt-1">Situación financiera al momento actual.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-sm text-slate-200"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      <div id="balance-sheet-canvas" className="bg-white/5 border border-white/10 p-8 rounded-2xl shadow-2xl backdrop-blur-xl">
        <div className="text-center mb-8 pb-4 border-b border-white/10">
          <h3 className="text-xl font-bold uppercase tracking-widest text-emerald-300">Balance General</h3>
          <p className="text-[10px] text-slate-500 mt-1 uppercase font-mono tracking-tighter">Estructura Financiera</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-6">
            <div className="space-y-3">
              <h4 className="font-bold text-sm border-b border-white/20 pb-1 uppercase tracking-wider text-slate-300">Activo</h4>
              {assetsAccounts.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Sin activos registrados.</p>
              ) : (
                assetsAccounts.map(a => (
                  <div key={a.id} className="flex justify-between items-center text-sm font-mono leading-none text-slate-300">
                    <span>{a.name}</span>
                    <span>{formatCurrency(accountBalances[a.id] || 0)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between items-center font-bold text-sm pt-4 border-t-2 border-white/20 font-mono text-emerald-400">
                <span>Suma el Activo</span>
                <span>{formatCurrency(totalAssets)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-3">
              <h4 className="font-bold text-sm border-b border-white/20 pb-1 uppercase tracking-wider text-slate-300">Pasivo</h4>
              {liabilityAccounts.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Sin pasivos registrados.</p>
              ) : (
                liabilityAccounts.map(a => (
                  <div key={a.id} className="flex justify-between items-center text-sm font-mono leading-none text-slate-400">
                    <span>{a.name}</span>
                    <span>{formatCurrency(accountBalances[a.id] || 0)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between items-center font-bold text-sm pt-2 border-t border-white/10 font-mono text-white">
                <span>Total Pasivo</span>
                <span>{formatCurrency(totalLiabilities)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-sm border-b border-white/20 pb-1 uppercase tracking-wider text-slate-300">Capital Contable</h4>
              {equityAccounts.map(a => (
                <div key={a.id} className="flex justify-between items-center text-sm font-mono leading-none text-slate-400">
                  <span>{a.name}</span>
                  <span>{formatCurrency(accountBalances[a.id] || 0)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center text-sm font-mono leading-none italic text-slate-500">
                <span>Utilidad del Ejercicio (Calculada)</span>
                <span>{formatCurrency(netIncome)}</span>
              </div>
              <div className="flex justify-between items-center font-bold text-sm pt-2 border-t border-white/10 font-mono text-white">
                <span>Total Capital</span>
                <span>{formatCurrency(totalEquity)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center font-bold text-sm pt-4 border-t-2 border-white/20 font-mono bg-white/5 p-3 rounded-lg">
              <span className="text-slate-300">Pasivo + Capital</span>
              <span className={cn(
                "px-2 rounded",
                Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01 
                  ? "text-indigo-400 border border-indigo-400/20 bg-indigo-400/5" 
                  : "text-rose-400 border border-rose-400/20 bg-rose-400/5 underline decoration-double"
              )}>
                {formatCurrency(totalLiabilities + totalEquity)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

