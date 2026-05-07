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
  ChevronDown,
  ChevronUp,
  Menu,
  RefreshCw,
  MessageSquare,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Browser } from '@capacitor/browser';
import { useCheckForUpdates } from './hooks/useCheckForUpdates';
import { useUpdateProgress } from './hooks/useUpdateProgress';
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
  exportTAccountsStyleToExcel,
  exportTableToPDF,
  exportToPDF,
  readExcel,
  normalizeString
} from './lib/utils';
import FeedbackModal from './components/FeedbackModal';
import SyncModal from './components/SyncModal';
import type { SyncState } from './services/syncService';

const APP_VERSION = `v${__APP_VERSION__}`;

export default function App() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [activeJournalId, setActiveJournalId] = useState<string | null>(null);
  const [accounts] = useState<Account[]>(INITIAL_ACCOUNTS);
  const [activeTab, setActiveTab] = useState<'journal' | 't-accounts' | 'balance' | 'profit-loss'>('journal');
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'entry' | 'journal', id: string, title: string, message: string } | null>(null);
  const [modalInfo, setModalInfo] = useState<{ type: 'success' | 'error', title: string, message: string } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [finalInventory, setFinalInventory] = useState<number>(0);
  const [finalInventories, setFinalInventories] = useState<Record<string, number>>({});
  const { isUpdateAvailable, latestVersion, downloadUrl } = useCheckForUpdates();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const downloadPercent = useUpdateProgress();
  const isDesktopRuntime = typeof window !== 'undefined' && ('electronAPI' in window || navigator.userAgent.toLowerCase().includes('electron'));

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
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

    const savedInventories = localStorage.getItem('contasis_final_inventories');
    if (savedInventories) {
      try {
        setFinalInventories(JSON.parse(savedInventories));
      } catch (e) {
        console.error("Failed to load final inventories. Data will be reset to defaults.", e);
      }
    }
  }, []);

  useEffect(() => {
    if (journals.length > 0) {
      localStorage.setItem('contasis_journals', JSON.stringify(journals));
    }
  }, [journals]);

  // Sync finalInventory when active journal changes
  useEffect(() => {
    if (activeJournalId) {
      setFinalInventory(finalInventories[activeJournalId] ?? 0);
    }
  }, [activeJournalId, finalInventories]);

  const handleSetFinalInventory = (value: number) => {
    setFinalInventory(value);
    if (activeJournalId) {
      const updated = { ...finalInventories, [activeJournalId]: value };
      setFinalInventories(updated);
      localStorage.setItem('contasis_final_inventories', JSON.stringify(updated));
    }
  };

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

  const applyRemoteSyncState = (state: SyncState) => {
    const nextJournals = Array.isArray(state.journals) ? state.journals : [];
    const nextInventories = state.finalInventories ?? {};

    setJournals(nextJournals);
    setFinalInventories(nextInventories);
    localStorage.setItem('contasis_journals', JSON.stringify(nextJournals));
    localStorage.setItem('contasis_final_inventories', JSON.stringify(nextInventories));

    if (nextJournals.length > 0) {
      const nextActiveId = nextJournals[0].id;
      setActiveJournalId(nextActiveId);
      setFinalInventory(nextInventories[nextActiveId] ?? 0);
    } else {
      setActiveJournalId(null);
      setFinalInventory(0);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-100 font-sans selection:bg-indigo-500 selection:text-white relative overflow-x-hidden">
      {/* Background Gradients */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_30%,#1e293b_0%,transparent_50%),radial-gradient(circle_at_80%_70%,#334155_0%,transparent_50%)] pointer-events-none"></div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobile && isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-[#0a0f1d] border-r border-white/10 z-[70] p-6 flex flex-col gap-8 shadow-2xl"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-600 flex items-center justify-center rounded-lg shadow-lg">
                  <BarChart3 className="text-white w-5 h-5" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight">Contabilidad M4<span className="text-indigo-400">Pro</span></h1>
                <span className="text-[10px] font-mono text-slate-500">{APP_VERSION}</span>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase font-bold text-slate-500 mb-2 pl-1 tracking-widest">Navegación</p>
                <MobileNavItem 
                  active={activeTab === 'journal'} 
                  onClick={() => { setActiveTab('journal'); setIsMobileMenuOpen(false); }}
                  icon={<FileText className="w-5 h-5" />}
                  label="Libro Diario"
                />
                <MobileNavItem 
                  active={activeTab === 't-accounts'} 
                  onClick={() => { setActiveTab('t-accounts'); setIsMobileMenuOpen(false); }}
                  icon={<TableIcon className="w-5 h-5" />}
                  label="Cuentas T"
                />
                <MobileNavItem 
                  active={activeTab === 'balance'} 
                  onClick={() => { setActiveTab('balance'); setIsMobileMenuOpen(false); }}
                  icon={<Briefcase className="w-5 h-5" />}
                  label="Balance General"
                />
                <MobileNavItem 
                  active={activeTab === 'profit-loss'} 
                  onClick={() => { setActiveTab('profit-loss'); setIsMobileMenuOpen(false); }}
                  icon={<TrendingUp className="w-5 h-5" />}
                  label="Estado de Resultados"
                />
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-[10px] uppercase font-bold text-slate-500 mb-2 pl-1 tracking-widest">Información</p>
                <MobileNavItem
                  active={false}
                  onClick={() => { setShowAbout(true); setIsMobileMenuOpen(false); }}
                  icon={<AlertCircle className="w-5 h-5" />}
                  label="Acerca de"
                />
              </div>

              <div className="mt-auto">
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                  <p className="text-xs text-indigo-300 font-medium leading-relaxed">
                    Gestiona tu contabilidad de manera profesional con herramientas avanzadas de exportación y visualización.
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-xl sticky top-0 z-50" style={{ paddingTop: 'calc(env(safe-area-inset-top))' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 -ml-2 text-slate-400 hover:text-white"
              >
                <Menu className="w-6 h-6" />
              </button>
            )}
            <div className="w-8 h-8 bg-indigo-600 hidden sm:flex items-center justify-center rounded-lg shadow-lg shadow-indigo-500/20">
              <BarChart3 className="text-white w-5 h-5" />
            </div>
            <h1 className="text-lg md:text-xl font-semibold tracking-tight">Contabilidad M4<span className="text-indigo-400">Pro</span></h1>
            <span className="text-[10px] font-mono text-slate-500 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded hidden sm:inline">{APP_VERSION}</span>
          </div>
          
          {!isMobile && (
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
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSyncModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-colors text-xs font-semibold"
            >
              <Smartphone className="w-3.5 h-3.5" />
              Sync
            </button>
            {isMobile && (
              <div className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-1 rounded border border-indigo-500/30 uppercase">
                {activeTab === 'journal' ? 'Diario' : activeTab === 't-accounts' ? 'Cuentas T' : activeTab === 'balance' ? 'Balance' : 'Resultados'}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 relative z-10">
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
                onUpdate={updateEntry}
                onMove={moveEntry}
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
                onSetModal={setModalInfo}
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
                finalInventory={finalInventory}
                setFinalInventory={handleSetFinalInventory}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>


      <footer className="mt-auto border-t border-white/10 py-8 bg-white/5 backdrop-blur-md relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <p>© 2026 Contabilidad M4. Sistema de Gestión Contable.</p>
          <div className="flex gap-6 items-center">
            <span className="flex items-center gap-2 italic">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              Precisión • Integridad • Transparencia
            </span>
            <button
              onClick={() => setShowAbout(true)}
              className="hidden lg:inline-flex items-center gap-1.5 text-slate-400 hover:text-indigo-300 transition-colors text-sm"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Acerca de
            </button>
            <button
              onClick={() => setShowFeedback(true)}
              className="hidden lg:inline-flex items-center gap-1.5 text-slate-500 hover:text-indigo-300 transition-colors text-xs"
            >
              <MessageSquare className="w-3 h-3" />
              Feedback
            </button>
          </div>
        </div>
      </footer>

      {/* Global Information Modal */}
      <AnimatePresence>
        {modalInfo && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-white/10 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center"
            >
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6",
                modalInfo.type === 'success' ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
              )}>
                {modalInfo.type === 'success' ? <Check className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">{modalInfo.title}</h3>
              <p className="text-slate-400 mb-8 leading-relaxed">
                {modalInfo.message}
              </p>
              <button
                onClick={() => setModalInfo(null)}
                className={cn(
                  "w-full py-3 rounded-xl font-semibold transition-all shadow-lg",
                  modalInfo.type === 'success' 
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20" 
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                )}
              >
                Entendido
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

      {/* Download Progress Bar */}
      <AnimatePresence>
        {downloadPercent !== null && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="fixed top-0 left-0 right-0 z-[200] h-1 bg-slate-800"
          >
            <motion.div
              className="h-full bg-indigo-500"
              initial={{ width: '0%' }}
              animate={{ width: `${downloadPercent}%` }}
              transition={{ ease: 'linear', duration: 0.3 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Update Available Modal */}
      <AnimatePresence>
        {isUpdateAvailable && !updateDismissed && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-indigo-500/30 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center"
            >
              <div className="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-6">
                <RefreshCw className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Nueva versión disponible</h3>
              <p className="text-slate-400 mb-8 leading-relaxed">
                La versión <span className="text-indigo-300 font-semibold">{latestVersion}</span> está disponible.
                Actualiza ahora para obtener las últimas mejoras y correcciones.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                {downloadUrl ? (
                  <button
                    onClick={async () => {
                      try {
                        await Browser.open({ url: downloadUrl });
                      } catch {
                        setModalInfo({ type: 'error', title: 'Error', message: 'No se pudo abrir el enlace de descarga. Por favor, inténtalo de nuevo.' });
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-500/20"
                  >
                    <RefreshCw className="w-4 h-4" /> Actualizar ahora
                  </button>
                ) : null}
                <button
                  onClick={() => setUpdateDismissed(true)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-medium transition-colors text-sm"
                >
                  Más tarde
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* About Modal */}
      <AnimatePresence>
        {showAbout && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-white/10 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-6">
                <BarChart3 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-6">Acerca de</h3>
              <div className="text-slate-300 space-y-2 mb-6 leading-relaxed">
                <p>Creado por Fernando Martinez</p>
                <p>Contacto: <a href="mailto:famr87@hotmail.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">famr87@hotmail.com</a></p>
                <p className="text-slate-400 text-sm">Derechos Reservados 2026</p>
              </div>
              <button
                onClick={() => { setShowAbout(false); setShowFeedback(true); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 font-semibold transition-all mb-3 text-sm"
              >
                <MessageSquare className="w-4 h-4" />
                Enviar Feedback
              </button>
              <button
                onClick={() => setShowAbout(false)}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-500/20"
              >
                Cerrar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
        onSuccess={(title, message) => setModalInfo({ type: 'success', title, message })}
        onError={(title, message) => setModalInfo({ type: 'error', title, message })}
      />

      <SyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        isDesktop={isDesktopRuntime}
        localState={{ journals, finalInventories }}
        onApplyRemoteState={applyRemoteSyncState}
        onNotify={(type, title, message) => setModalInfo({ type, title, message })}
      />
    </div>
  );
}

function MobileNavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 px-4 py-3 rounded-xl transition-all w-full text-left",
        active 
          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 font-semibold" 
          : "text-slate-400 hover:text-white hover:bg-white/5"
      )}
    >
      <div className={cn("transition-colors", active ? "text-white" : "text-slate-500")}>
        {icon}
      </div>
      <span className="text-sm tracking-tight">{label}</span>
    </button>
  );
}

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
  onUpdate,
  onMove,
  onDelete,
  onImport,
  onSetModal
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
  onUpdate: (id: string, e: Omit<JournalEntry, 'id'>) => void,
  onMove: (id: string, direction: 'up' | 'down') => void,
  onDelete: (id: string) => void,
  onImport: (entries: JournalEntry[]) => void,
  onSetModal: (info: { type: 'success' | 'error', title: string, message: string } | null) => void
}) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) => {
    setExpandedEntries(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
      
      const requiredColumns = ['FECHA', 'GLOSA', 'CUENTA', 'DEBE', 'HABER'];
      if (data.length === 0) throw new Error('El archivo está vacío o no tiene el formato correcto.');
      
      // Handle potential case sensitivity in header
      const firstRow = data[0];
      const actualKeys = Object.keys(firstRow).map(k => k.toUpperCase());
      const hasRequiredColumns = requiredColumns.every(col => actualKeys.includes(col));
      
      if (!hasRequiredColumns) {
        throw new Error('Formato inválido. Asegúrate de usar la plantilla descargada con las columnas: ' + requiredColumns.join(', '));
      }

      // Map keys to normalized uppercase for reliable access and handle common variants
      const normalizedData = data.map(row => {
        const newRow: any = {};
        Object.keys(row).forEach(key => {
          const k = key.toUpperCase().trim()
            .replace(/\s+/g, '_')
            .replace('CONCEPTO', 'GLOSA')
            .replace('MOVIMIENTO', 'ASIENTO_ID')
            .replace('NO._DE_MOVIMIENTO', 'ASIENTO_ID')
            .replace('NO_DE_MOVIMIENTO', 'ASIENTO_ID');
          newRow[k] = row[key];
        });
        return newRow;
      });

      const groupedEntries: Record<string, any> = {};
      const unmatchedAccounts = new Set<string>();
      
      let lastId = "";
      let lastDate: any = null;
      let lastGlosa = "";

      normalizedData.forEach((row: any, index: number) => {
        // Skip truly empty rows (no account and no values)
        if (!row.CUENTA && !row.DEBE && !row.HABER) return;

        // Carry-forward logic for empty cells
        const currentId = (row.ASIENTO_ID !== undefined && row.ASIENTO_ID !== null && row.ASIENTO_ID !== "") ? String(row.ASIENTO_ID) : "";
        
        if (currentId !== "") lastId = currentId;
        if (row.FECHA) lastDate = row.FECHA;
        if (row.GLOSA) lastGlosa = row.GLOSA;

        // Determine which movement this row belongs to
        const groupKey = lastId || `INITIAL_GROUP_${index}`;
        
        if (!groupedEntries[groupKey]) {
          // Format date if it's a Date object
          let dateVal = lastDate || new Date().toISOString().split('T')[0];
          if (dateVal instanceof Date) {
            dateVal = dateVal.toISOString().split('T')[0];
          } else if (typeof dateVal === 'number') {
            // Excel serial date 
            const date = new Date((dateVal - 25569) * 86400 * 1000);
            dateVal = date.toISOString().split('T')[0];
          }

          groupedEntries[groupKey] = {
            date: dateVal,
            description: lastGlosa || "Asiento Importado",
            movements: []
          };
        }
        
        const accountSearch = String(row.CUENTA || "").trim();
        if (!accountSearch) return;

        const account = accounts.find(a => 
          normalizeString(a.name) === normalizeString(accountSearch) || 
          a.code === accountSearch
        );

        if (account) {
          const debe = parseFloat(String(row.DEBE || "0").replace(/[^0-9.-]/g, '')) || 0;
          const haber = parseFloat(String(row.HABER || "0").replace(/[^0-9.-]/g, '')) || 0;
          
          if (debe > 0) {
            groupedEntries[groupKey].movements.push({ accountId: account.id, type: 'debit', amount: debe });
          }
          if (haber > 0) {
            groupedEntries[groupKey].movements.push({ accountId: account.id, type: 'credit', amount: haber });
          }
        } else {
          unmatchedAccounts.add(accountSearch);
        }
      });

      const finalEntries: JournalEntry[] = Object.values(groupedEntries)
        .filter((entry: any) => entry.movements.length > 0)
        .map(entry => ({
          ...entry,
          id: crypto.randomUUID(),
        }));

      if (finalEntries.length === 0) {
        let msg = 'No encontramos asientos válidos para importar. Revisa que el archivo contenga cuentas y montos correctos (la suma de debe y haber debe coincidir).';
        if (unmatchedAccounts.size > 0) {
          msg = `Las siguientes cuentas no están en tu catálogo de cuentas: ${Array.from(unmatchedAccounts).slice(0, 5).join(', ')}. Verifica que los nombres sean idénticos en ambos lados.`;
        }
        onSetModal({
          type: 'error',
          title: 'Error de Importación',
          message: msg
        });
        return;
      }

      onImport(finalEntries);
      onSetModal({
        type: 'success',
        title: '¡Importación Lista!',
        message: `Hemos cargado con éxito ${finalEntries.length} asientos a tu libro de diario desde el archivo Excel.`
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
        {(isFormOpen || editingEntry) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <JournalEntryForm 
              accounts={accounts} 
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
                entries.map((entry, idx) => {
                  const isExpanded = expandedEntries[entry.id];
                  const isCollapsed = !isExpanded;
                  return (
                    <React.Fragment key={entry.id}>
                      <tr 
                        className={cn(
                          "group hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5",
                          isCollapsed && "bg-indigo-500/5 hover:bg-indigo-500/10"
                        )}
                        onClick={() => toggleCollapse(entry.id)}
                      >
                        <td className="px-3 md:px-6 py-4 text-center">
                          <button className="text-slate-500 hover:text-white transition-colors">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-2 md:px-6 py-4 font-mono text-[10px] md:text-xs text-indigo-400/70">{idx + 1}</td>
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
                                onClick={(e) => { e.stopPropagation(); onMove(entry.id, 'up'); }}
                                disabled={idx === 0}
                                className="p-0.5 text-slate-500 hover:text-indigo-400 disabled:opacity-20"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); onMove(entry.id, 'down'); }}
                                disabled={idx === entries.length - 1}
                                className="p-0.5 text-slate-500 hover:text-indigo-400 disabled:opacity-20"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingEntry(entry);
                                setIsFormOpen(false);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="p-1 md:p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"
                            >
                              <Edit2 className="w-3.5 h-3.5 md:w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
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
                })
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

function JournalEntryForm({ 
  accounts, 
  onAdd, 
  initialData, 
  onCancel 
}: { 
  accounts: Account[], 
  onAdd: (e: Omit<JournalEntry, 'id'>) => void,
  initialData?: JournalEntry,
  onCancel?: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [movements, setMovements] = useState<Movement[]>([
    { accountId: accounts[0].id, type: 'debit', amount: 0 },
    { accountId: accounts[1].id, type: 'credit', amount: 0 }
  ]);

  useEffect(() => {
    if (initialData) {
      setDate(initialData.date);
      setDescription(initialData.description);
      setMovements(initialData.movements);
    }
  }, [initialData]);

  const totalDebit = movements.filter(m => m.type === 'debit').reduce((sum, m) => sum + m.amount, 0);
  const totalCredit = movements.filter(m => m.type === 'credit').reduce((sum, m) => sum + m.amount, 0);
  const isOutOfBalance = Math.abs(totalDebit - totalCredit) > 0.01 || (totalDebit === 0 && totalCredit === 0);

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
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-lg overflow-hidden h-7">
              <input 
                type="number" 
                min="1" 
                max="20"
                defaultValue="1"
                id="batch-rows-input"
                onWheel={(e) => e.currentTarget.blur()}
                onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                className="w-10 px-2 text-xs bg-transparent border-none outline-none text-white text-center font-mono"
              />
            </div>
            <button 
              type="button" 
              onClick={() => {
                const count = parseInt((document.getElementById('batch-rows-input') as HTMLInputElement)?.value || "1");
                const newMovs = Array(count).fill(null).map(() => ({ accountId: accounts[0].id, type: 'debit' as const, amount: 0 }));
                setMovements([...movements, ...newMovs]);
              }}
              className="text-xs flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20"
            >
              <Plus className="w-3.5 h-3.5" /> Añadir partida(s)
            </button>
          </div>
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
                  onWheel={(e) => e.currentTarget.blur()}
                  onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
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

        <div className="flex items-center gap-3 w-full md:w-auto">
          {onCancel && (
            <button 
              type="button" 
              onClick={onCancel}
              className="px-6 py-2.5 rounded-lg font-bold bg-white/5 text-slate-300 hover:bg-white/10 transition-all border border-white/10"
            >
              Cancelar
            </button>
          )}
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
            {initialData ? 'Guardar Cambios' : 'Registrar Asiento'}
          </button>
        </div>
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
  const handleExportPDF = async () => {
    await exportToPDF('t-accounts-canvas', `Libro_Mayor_Cuentas_T_${journalName}`, 'Libro Mayor - Cuentas T', journalName);
  };

  const handleExportExcel = async () => {
    await exportTAccountsStyleToExcel(tAccountsData, accounts, `Libro_Mayor_Cuentas_T_${journalName}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">Cuentas T</h2>
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs font-mono rounded border border-indigo-500/30 mt-1">{journalName}</span>
          </div>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Representiva visual del flujo de cada cuenta referenciada al diario.</p>
        </div>
        <div className="flex gap-2 md:gap-3">
          <button 
            onClick={handleExportExcel}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-xs md:text-sm text-slate-200"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-xs md:text-sm font-medium"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      <div id="t-accounts-canvas" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 pb-10">
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
              <div key={accountId} className="t-account-card bg-white/5 border border-white/10 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden flex flex-col h-fit transition-transform hover:scale-[1.02]">
                <div className="t-account-header bg-white/5 px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
                  <span className="font-bold text-sm tracking-tight text-indigo-300 break-words line-clamp-2 md:line-clamp-none" title={acc?.name}>{acc?.name}</span>
                  <span className="text-[10px] font-mono text-slate-500 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">{acc?.code}</span>
                </div>
                
                {/* The T Structure */}
                <div className="t-account-content flex flex-col flex-1 divide-y divide-white/10">
                  <div className="flex min-h-[140px] divide-x divide-white/20">
                    {/* Debit Column */}
                    <div className="t-account-column-debit flex-1 p-3 space-y-1.5">
                      <div className="text-[9px] font-bold text-slate-500 uppercase mb-1 flex justify-between uppercase">
                        <span>Debe</span>
                      </div>
                      {typedData.debits.map((d, i) => (
                        <div key={i} className="flex justify-between items-center text-xs font-mono text-emerald-400/90">
                          <span className="text-[9px] text-slate-500 pr-2">({d.ref})</span>
                          <span>{formatCurrency(d.amount)}</span>
                        </div>
                      ))}
                    </div>
                    {/* Divider for PDF consistency */}
                    <div className="t-account-divider w-0"></div>
                    {/* Credit Column */}
                    <div className="t-account-column-credit flex-1 p-3 space-y-1.5">
                      <div className="text-[9px] font-bold text-slate-500 uppercase mb-1 text-right uppercase">
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
                  <div className="t-account-totals flex divide-x divide-white/20 border-t-2 border-white/20">
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
function ProfitLossView({ accountBalances, accounts, journalName, finalInventory, setFinalInventory }: { accountBalances: Record<string, number>, accounts: Account[], journalName: string, finalInventory: number, setFinalInventory: (v: number) => void }) {

  // Helper to get balance by code or name using absolute value
  const getBal = (name: string) => {
    const acc = accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
    return acc ? Math.abs(accountBalances[acc.id] || 0) : 0;
  };

  // 1. Ingresos
  const ventasTotales = getBal('Ventas');
  const devolucionesVentas = getBal('Devoluciones sobre Ventas');
  const rebajasVentas = getBal('Descuentos sobre Ventas'); 
  const ventasNetas = ventasTotales - devolucionesVentas - rebajasVentas;

  // 2. Costo de lo Vendido
  const inventarioInicial = getBal('Inventario Inicial');
  const compras = getBal('Compras');
  const gastosCompra = getBal('Gastos de Compra');
  const comprasTotales = compras + gastosCompra;
  
  const devolucionesCompras = getBal('Devoluciones sobre Compras');
  const rebajasCompras = getBal('Descuentos sobre Compras');
  const comprasNetas = comprasTotales - devolucionesCompras - rebajasCompras;
  
  const sumaMercancias = inventarioInicial + comprasNetas;
  const costoVendido = sumaMercancias - Math.abs(finalInventory);

  // 3. Resultados
  const utilidadBruta = ventasNetas - costoVendido;

  // Gastos Operativos (rest of expense accounts)
  const opExpenseAccounts = accounts.filter(a => 
    a.type === 'expense' && 
    !['Compras', 'Gastos de Compra', 'Devoluciones sobre Compras', 'Descuentos sobre Compras', 'Inventario Inicial', 'Inventario Final', 'Costo de Ventas'].includes(a.name) &&
    accountBalances[a.id]
  );
  const totalOpExpenses = opExpenseAccounts.reduce((sum, a) => sum + Math.abs(accountBalances[a.id] || 0), 0);
  const netIncome = utilidadBruta - totalOpExpenses;

  const handleExportPDF = async () => {
    await exportToPDF('profit-loss-canvas', `Estado_de_Resultados_${journalName}`, 'Estado de Resultados', journalName);
  };

  const handleExportExcel = async () => {
    const data = [
      { Concepto: 'ESTADO DE RESULTADOS', Monto: '' },
      { Concepto: 'Ventas Totales', Monto: ventasTotales },
      { Concepto: '(-) Devoluciones sobre Ventas', Monto: -devolucionesVentas },
      { Concepto: '(-) Rebajas sobre Ventas', Monto: -rebajasVentas },
      { Concepto: 'VENTAS NETAS', Monto: ventasNetas },
      { Concepto: '', Monto: '' },
      { Concepto: 'Inventario Inicial', Monto: inventarioInicial },
      { Concepto: 'Compras', Monto: compras },
      { Concepto: '(+) Gastos de Compra', Monto: gastosCompra },
      { Concepto: '(=) Compras Totales', Monto: comprasTotales },
      { Concepto: '(-) Devoluciones sobre Compras', Monto: -devolucionesCompras },
      { Concepto: '(-) Rebajas sobre Compras', Monto: -rebajasCompras },
      { Concepto: '(=) Compras Netas', Monto: comprasNetas },
      { Concepto: '(=) Suma de Mercancías', Monto: sumaMercancias },
      { Concepto: '(-) Inventario Final', Monto: -finalInventory },
      { Concepto: 'COSTO DE LO VENDIDO', Monto: costoVendido },
      { Concepto: '', Monto: '' },
      { Concepto: 'UTILIDAD BRUTA', Monto: utilidadBruta },
      { Concepto: '', Monto: '' },
      { Concepto: 'GASTOS OPERATIVOS', Monto: '' },
      ...opExpenseAccounts.map(a => ({ Concepto: a.name, Monto: -Math.abs(accountBalances[a.id]) })),
      { Concepto: 'UTILIDAD NETA', Monto: netIncome }
    ];
    await exportToExcel(data, `Estado_Resultados_${journalName}`, 'P&L');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">Estado de Resultados</h2>
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs font-mono rounded border border-indigo-500/30 mt-1">{journalName}</span>
          </div>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Método Analítico - Desglose detallado.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 ml-1">Inventario Final</label>
            <input 
              type="number"
              value={finalInventory || ''}
              onChange={(e) => setFinalInventory(Number(e.target.value))}
              onWheel={(e) => e.currentTarget.blur()}
              onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
              placeholder="0.00"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-full sm:w-32 font-mono"
            />
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleExportExcel}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-sm text-slate-200"
            >
              <Download className="w-4 h-4" /> Excel
            </button>
            <button 
              onClick={handleExportPDF}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium"
            >
              <FileText className="w-4 h-4" /> PDF
            </button>
          </div>
        </div>
      </div>

      <div id="profit-loss-canvas" className="bg-white/5 border border-white/10 p-4 md:p-8 rounded-2xl shadow-2xl backdrop-blur-xl max-w-3xl mx-auto overflow-x-auto">
        <div className="text-center mb-8 pb-4 border-b border-white/10">
          <h3 className="text-xl font-bold uppercase tracking-widest text-indigo-300">Estado de Resultados</h3>
          <p className="text-[10px] text-slate-500 mt-1 uppercase font-mono tracking-tighter">Método Analítico</p>
        </div>

        <div className="space-y-6 text-sm">
          {/* 1. SECCION VENTAS */}
          <section className="space-y-2">
            <div className="flex justify-between font-bold border-b border-white/10 pb-1 text-slate-300 uppercase tracking-wider">
              <span>Ingresos por Ventas</span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="pl-4 space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Ventas Totales</span>
                <span className="font-mono">{formatCurrency(ventasTotales)}</span>
              </div>
              <div className="flex justify-between text-rose-400/80 italic pl-4 text-xs">
                <span>(-) Devoluciones sobre Ventas</span>
                <span className="font-mono">({formatCurrency(devolucionesVentas)})</span>
              </div>
              <div className="flex justify-between text-rose-400/80 italic pl-4 text-xs">
                <span>(-) Rebajas sobre Ventas</span>
                <span className="font-mono">({formatCurrency(rebajasVentas)})</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-1 font-bold text-slate-200">
                <span>Ventas Netas</span>
                <span className="font-mono text-emerald-400">{formatCurrency(ventasNetas)}</span>
              </div>
            </div>
          </section>

          {/* 2. SECCION COSTO DE VENTAS */}
          <section className="space-y-2">
            <div className="flex justify-between font-bold border-b border-white/10 pb-1 text-slate-300 uppercase tracking-wider">
              <span>Costo de lo Vendido</span>
              <TrendingDown className="w-4 h-4 text-rose-400" />
            </div>
            <div className="pl-4 space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Inventario Inicial</span>
                <span className="font-mono">{formatCurrency(inventarioInicial)}</span>
              </div>
              <div className="flex justify-between text-slate-400 pl-4 text-xs">
                <span>Compras</span>
                <span className="font-mono">{formatCurrency(compras)}</span>
              </div>
              <div className="flex justify-between text-slate-400 pl-4 text-xs">
                <span>(+) Gastos de Compra</span>
                <span className="font-mono">{formatCurrency(gastosCompra)}</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-0.5 text-slate-300 pl-4 font-semibold text-xs">
                <span>(=) Compras Totales</span>
                <span className="font-mono">{formatCurrency(comprasTotales)}</span>
              </div>
              <div className="flex justify-between text-rose-400/80 italic pl-8 text-xs">
                <span>(-) Devoluciones sobre Compras</span>
                <span className="font-mono">({formatCurrency(devolucionesCompras)})</span>
              </div>
              <div className="flex justify-between text-rose-400/80 italic pl-8 text-xs">
                <span>(-) Rebajas sobre Compras</span>
                <span className="font-mono">({formatCurrency(rebajasCompras)})</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-0.5 text-slate-200 pl-4 font-bold text-xs">
                <span>(=) Compras Netas</span>
                <span className="font-mono">{formatCurrency(comprasNetas)}</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1 text-slate-200 font-bold">
                <span>(=) Suma Total de Mercancías</span>
                <span className="font-mono ml-2 whitespace-nowrap">{formatCurrency(sumaMercancias)}</span>
              </div>
              <div className="flex justify-between text-emerald-400/80 italic pl-4 text-xs gap-2">
                <span className="break-words">(-) Inventario Final</span>
                <span className="font-mono whitespace-nowrap">({formatCurrency(finalInventory)})</span>
              </div>
              <div className="flex justify-between border-t border-white/20 pt-1 font-bold text-slate-100 bg-white/5 px-2 rounded gap-2">
                <span className="break-words">Costo de lo Vendido</span>
                <span className="font-mono text-rose-400 whitespace-nowrap">{formatCurrency(costoVendido)}</span>
              </div>
            </div>
          </section>

          {/* 3. UTILIDAD BRUTA */}
          <div className={cn(
            "p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center border shadow-lg transition-colors gap-4",
            utilidadBruta >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"
          )}>
            <div className="flex flex-col">
              <span className="font-black uppercase tracking-widest text-white text-base md:text-lg break-words">Utilidad / Pérdida Bruta</span>
              <span className="text-[10px] text-slate-500 font-mono">Ventas Netas - Costo de lo Vendido</span>
            </div>
            <span className={cn("text-2xl md:text-3xl font-black font-mono tabular-nums", utilidadBruta >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {formatCurrency(utilidadBruta)}
            </span>
          </div>

          {/* 4. GASTOS OPERATIVOS */}
          <section className="space-y-2 opacity-80">
            <div className="flex justify-between font-bold border-b border-white/10 pb-1 text-slate-400 uppercase tracking-wider text-xs">
              <span>Gastos Operativos y Otros</span>
            </div>
            {opExpenseAccounts.length === 0 ? (
              <p className="text-[10px] text-slate-500 italic pl-4">No hay otros gastos registrados.</p>
            ) : (
              <div className="pl-4 space-y-1">
                {opExpenseAccounts.map(a => (
                  <div key={a.id} className="flex justify-between text-[11px] text-slate-400 font-mono gap-2">
                    <span className="break-words">{a.name}</span>
                    <span className="whitespace-nowrap">({formatCurrency(Math.abs(accountBalances[a.id] || 0))})</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-white/5 pt-1 font-bold text-slate-300 text-xs gap-2">
                  <span className="break-words">Total Gastos Operativos</span>
                  <span className="whitespace-nowrap">({formatCurrency(totalOpExpenses)})</span>
                </div>
              </div>
            )}
          </section>

          {/* 5. UTILIDAD NETA */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-4 border-t border-white/20 gap-4">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Utilidad / Pérdida Neta del Periodo</span>
            <span className={cn("text-lg font-bold font-mono", netIncome >= 0 ? "text-emerald-500/70" : "text-rose-500/70")}>
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

  const handleExportPDF = async () => {
    await exportToPDF('balance-sheet-canvas', `Balance_General_${journalName}`, 'Balance General', journalName);
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">Balance General</h2>
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs font-mono rounded border border-indigo-500/30 mt-1">{journalName}</span>
          </div>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Situación financiera al momento actual.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-sm text-slate-200"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      <div id="balance-sheet-canvas" className="bg-white/5 border border-white/10 p-4 md:p-8 rounded-2xl shadow-2xl backdrop-blur-xl overflow-x-auto">
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
                  <div key={a.id} className="flex justify-between items-start text-xs md:text-sm font-mono text-slate-300 gap-4">
                    <span className="break-words py-1">{a.name}</span>
                    <span className="whitespace-nowrap pt-1">{formatCurrency(accountBalances[a.id] || 0)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between items-center font-bold text-xs md:text-sm pt-4 border-t-2 border-white/20 font-mono text-emerald-400 gap-4">
                <span className="break-words">Suma el Activo</span>
                <span className="whitespace-nowrap">{formatCurrency(totalAssets)}</span>
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
                  <div key={a.id} className="flex justify-between items-start text-xs md:text-sm font-mono text-slate-400 gap-4">
                    <span className="break-words py-1">{a.name}</span>
                    <span className="whitespace-nowrap pt-1">{formatCurrency(accountBalances[a.id] || 0)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between items-center font-bold text-xs md:text-sm pt-2 border-t border-white/10 font-mono text-white gap-4">
                <span className="break-words">Total Pasivo</span>
                <span className="whitespace-nowrap">{formatCurrency(totalLiabilities)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-sm border-b border-white/20 pb-1 uppercase tracking-wider text-slate-300">Capital Contable</h4>
              {equityAccounts.map(a => (
                <div key={a.id} className="flex justify-between items-start text-xs md:text-sm font-mono text-slate-400 gap-4">
                  <span className="break-words py-1">{a.name}</span>
                  <span className="whitespace-nowrap pt-1">{formatCurrency(accountBalances[a.id] || 0)}</span>
                </div>
              ))}
              <div className="flex justify-between items-start text-xs md:text-sm font-mono italic text-slate-500 gap-4">
                <span className="break-words">Utilidad del Ejercicio (Calculada)</span>
                <span className="whitespace-nowrap">{formatCurrency(netIncome)}</span>
              </div>
              <div className="flex justify-between items-center font-bold text-xs md:text-sm pt-2 border-t border-white/10 font-mono text-white gap-4">
                <span className="break-words">Total Capital</span>
                <span className="whitespace-nowrap">{formatCurrency(totalEquity)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center font-bold text-xs md:text-sm pt-4 border-t-2 border-white/20 font-mono bg-white/5 p-3 rounded-lg gap-4">
              <span className="text-slate-300 break-words">Pasivo + Capital</span>
              <span className={cn(
                "px-2 rounded whitespace-nowrap",
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
