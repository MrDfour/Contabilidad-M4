/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  X,
  Upload,
  FileUp,
  Search,
  FileScan,
  FileCode,
  ChevronDown,
  ChevronUp,
  Menu,
  MessageSquare,
  Smartphone,
  Monitor,
  Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCheckForUpdates } from './hooks/useCheckForUpdates';
import { useUpdateProgress } from './hooks/useUpdateProgress';
import {
  FixedAsset
} from './types';
import { cn } from './lib/utils';
import { buildTAccountsData, computeAccountBalances } from './lib/accounting';
import FeedbackModal from './components/FeedbackModal';
import SyncModal from './components/SyncModal';
import { GlobalInfoModal, type ModalInfo } from './components/modals/GlobalInfoModal';
import { ConfirmDeleteModal, type ConfirmDeleteData } from './components/modals/ConfirmDeleteModal';
import { UpdateAvailableModal } from './components/modals/UpdateAvailableModal';
import { AboutModal } from './components/modals/AboutModal';
import { DownloadProgressBar } from './components/modals/DownloadProgressBar';
import { JournalView } from './components/JournalView';
import { TAccountsView } from './components/TAccountsView';
import { ProfitLossView } from './components/ProfitLossView';
import { BalanceSheetView } from './components/BalanceSheetView';
import { FixedAssetsView } from './components/FixedAssetsView';
import { ContabilidadElectronicaView } from './components/ContabilidadElectronicaView';
import { CatalogView } from './components/CatalogView';
import type { SyncState } from './services/syncService';
import { saveToStorage } from './services/storageService';
import { useAppData } from './hooks/useAppData';
import { useJournals } from './hooks/useJournals';
import { useCatalog } from './hooks/useCatalog';
import { useInventories } from './hooks/useInventories';
import { useBackup } from './hooks/useBackup';

const APP_VERSION = `v${__APP_VERSION__}`;
type AppMode = 'basic' | 'fiscal';
type AppTab = 'journal' | 't-accounts' | 'balance' | 'profit-loss' | 'assets' | 'electronic' | 'catalog';
const FISCAL_NAV_TABS = [
  { id: 'assets' as const, label: 'Activos Fijos', shortLabel: 'Activos', icon: Monitor },
  { id: 'electronic' as const, label: 'Cont. Electrónica', shortLabel: 'SAT XML', icon: FileCode }
];
const getStoredAppMode = (): AppMode => {
  if (typeof window === 'undefined') return 'basic';
  const savedMode = localStorage.getItem('contasis_app_mode');
  return savedMode === 'fiscal' ? 'fiscal' : 'basic';
};

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>(getStoredAppMode);
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('journal');
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteData | null>(null);
  const [modalInfo, setModalInfo] = useState<ModalInfo | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const { isUpdateAvailable, latestVersion, downloadUrl } = useCheckForUpdates();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const downloadPercent = useUpdateProgress();
  const isDesktopRuntime = typeof window !== 'undefined' && ('electronAPI' in window || navigator.userAgent.toLowerCase().includes('electron'));
  const modalInfoRef = useRef<ModalInfo | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    modalInfoRef.current = modalInfo;
  }, [modalInfo]);

  // --- Dominios como hooks (Fase 2) ---
  const journalsState = useJournals();
  const { journals, activeJournalId, setActiveJournalId, activeJournal } = journalsState;

  const inventoriesState = useInventories({ activeJournalId });
  const { finalInventories, setFinalInventories, finalInventory, handleSetFinalInventory } = inventoriesState;

  // activos fijos permanecen en App (Fase 3+): persistencia propia idéntica a la original
  useEffect(() => {
    saveToStorage('contasis_fixed_assets', fixedAssets).catch(console.error);
  }, [fixedAssets]);

  // Catálogo híbrido
  const catalogState = useCatalog({
    journalId: activeJournalId,
    journalSubAccounts: activeJournal?.subAccounts,
    canSave: hasLoaded,
    onSaveError: setModalInfo,
    commitSubAccounts: journalsState.setSubAccounts
  });
  const { accounts, combinedAccounts, handleCombinedAccountsUpdate, setAccounts } = catalogState;

  // Carga inicial (hidratación) — al final de la cadena: ve los setters ya creados
  useAppData({
    setJournals: journalsState.setJournals,
    setActiveJournalId: journalsState.setActiveJournalId,
    setFinalInventories: setFinalInventories,
    setFixedAssets: setFixedAssets,
    setAccounts: setAccounts
  }, setHasLoaded);

  // Vigilante de Respaldo Semanal + lógica de respaldo (hook propio)
  const { handleExportBackup, handleImportBackup } = useBackup({
    getSnapshot: () => ({
      journals,
      accounts,
      fixedAssets,
      finalInventories
    }),
    notify: setModalInfo,
    canSuggest: () => !modalInfoRef.current,
    restore: (backup) => {
      // Orquestador anti-R1: cada hook dueño recibe SU parte; nadie más
      // escribe claves ajenas. Composición atómica en el mismo evento.
      journalsState.hydrate(backup.journals, backup.journals.length > 0 ? backup.journals[0].id : null);
      setAccounts(backup.accounts);
      if (backup.fixedAssets) setFixedAssets(backup.fixedAssets);
      if (backup.finalInventories) setFinalInventories(backup.finalInventories);
      setModalInfo({ type: 'success', title: 'Restauración Exitosa', message: 'Toda la información ha sido restaurada correctamente.' });
    }
  });

  useEffect(() => {
    localStorage.setItem('contasis_app_mode', appMode);
  }, [appMode]);

  // Redireccionar al Diario si se cambia a modo básico estando en una pestaña fiscal
  useEffect(() => {
    if (appMode === 'basic' && FISCAL_NAV_TABS.some(tab => tab.id === activeTab)) {
      setActiveTab('journal');
    }
  }, [appMode, activeTab]);

  const hasActiveJournal = Boolean(activeJournal);
  const entries = activeJournal?.entries || [];

  // Derived Data: T-Accounts + Balances (funciones puras en lib/accounting.ts)
  const tAccountsData = useMemo(() => buildTAccountsData(entries), [entries]);
  const accountBalances = useMemo(
    () => computeAccountBalances(tAccountsData, combinedAccounts),
    [tAccountsData, combinedAccounts]
  );

  const {
    addEntry,
    updateEntry,
    moveEntry,
    deleteEntry,
    importEntries,
    createJournal,
    renameJournal,
    deleteJournal
  } = journalsState;

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'entry') {
      if (!activeJournalId) return;
      journalsState.deleteEntry(confirmDelete.id);
    } else {
      journalsState.deleteJournal(confirmDelete.id);
    }
    setConfirmDelete(null);
  };

  /**
   * Orquestador de sync remoto (anti-R1): una sola función compone ambos hooks.
   * `hydrate` de diarios persiste explícitamente (incluso vacío, como el original);
   * `hydrateFromRemote` persiste la clave de inventarios explícitamente.
   */
  const applyRemoteSyncState = (state: SyncState) => {
    const nextJournals = Array.isArray(state.journals) ? state.journals : [];
    const nextInventories = state.finalInventories ?? {};

    journalsState.hydrate(nextJournals, nextJournals.length > 0 ? nextJournals[0].id : null);
    inventoriesState.hydrateFromRemote(nextInventories);
  };

  const navigationTabs: { id: AppTab; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'journal', label: 'Libro Diario', shortLabel: 'Diario', icon: FileText },
    { id: 't-accounts', label: 'Cuentas T', shortLabel: 'Cuentas T', icon: TableIcon },
    { id: 'balance', label: 'Balance General', shortLabel: 'Balance', icon: Briefcase },
    { id: 'profit-loss', label: 'Estado de Resultados', shortLabel: 'Resultados', icon: TrendingUp },
    { id: 'catalog', label: 'Catálogo de Cuentas', shortLabel: 'Catálogo', icon: Settings },
    ...(appMode === 'fiscal' ? FISCAL_NAV_TABS : [])
  ];
  const activeMobileTabLabel = navigationTabs.find(tab => tab.id === activeTab)?.shortLabel ?? 'Diario';

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
                <MobileNavItem
                  active={activeTab === 'catalog'}
                  onClick={() => { setActiveTab('catalog'); setIsMobileMenuOpen(false); }}
                  icon={<Settings className="w-5 h-5" />}
                  label="Catálogo de Cuentas"
                />
                {appMode === 'fiscal' && (
                  <>
                    <MobileNavItem
                      active={activeTab === 'assets'}
                      onClick={() => { setActiveTab('assets'); setIsMobileMenuOpen(false); }}
                      icon={<Monitor className="w-5 h-5" />}
                      label="Activos Fijos"
                    />
                    <MobileNavItem
                      active={activeTab === 'electronic'}
                      onClick={() => { setActiveTab('electronic'); setIsMobileMenuOpen(false); }}
                      icon={<FileCode className="w-5 h-5" />}
                      label="Cont. Electrónica"
                    />
                  </>
                )}
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

      <div className="flex h-screen overflow-hidden relative z-10">
        {!isMobile && (
          <aside className="w-64 border-r border-white/10 bg-white/5 backdrop-blur-xl p-4 lg:p-5">
            <div className="flex items-center gap-3 mb-6 px-2">
              <div className="w-8 h-8 bg-indigo-600 flex items-center justify-center rounded-lg shadow-lg shadow-indigo-500/20">
                <BarChart3 className="text-white w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-white">Panel</p>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Navegación</p>
              </div>
            </div>
            <nav className="flex flex-col gap-1.5">
              {navigationTabs.map(tab => (
                <div key={tab.id}>
                  <SidebarTabButton
                    active={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    icon={React.createElement(tab.icon, { className: 'w-4 h-4' })}
                    label={tab.label}
                  />
                </div>
              ))}
            </nav>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="relative overflow-visible border-b border-white/10 bg-white/5 backdrop-blur-xl sticky top-0 z-50" style={{ paddingTop: 'calc(env(safe-area-inset-top))' }}>
            <div className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-1/2 z-20">
              <div className="inline-flex items-center gap-2 max-w-[min(90vw,30rem)] px-4 py-1.5 rounded-full border border-indigo-500/35 bg-[#111827]/90 text-indigo-100 shadow-lg shadow-indigo-500/20 backdrop-blur-md">
                <FileText className="w-4 h-4 text-indigo-300 shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300/90">
                  Libro Diario:
                </span>
                <span className={cn("text-xs font-medium truncate", hasActiveJournal ? "text-slate-100" : "text-slate-300 italic")}>
                  {activeJournal?.name || 'Sin diario activo'}
                </span>
              </div>
            </div>
            <div className="px-4 md:px-6 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
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
                <h1 className="text-lg md:text-xl font-semibold tracking-tight truncate">Contabilidad M4<span className="text-indigo-400">Pro</span></h1>
                <span className="text-[10px] font-mono text-slate-500 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded hidden sm:inline">{APP_VERSION}</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden sm:grid grid-cols-2 items-center rounded-lg border border-white/10 bg-white/5 p-1 relative">
                  <button
                    onClick={() => setAppMode('basic')}
                    className={cn(
                      "relative z-10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-md transition-colors",
                      appMode === 'basic' ? "text-white" : "text-slate-300 hover:text-white"
                    )}
                  >
                    {appMode === 'basic' && (
                      <motion.span
                        layoutId="app-mode-indicator"
                        className="absolute inset-0 rounded-md bg-indigo-600"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10">Básico</span>
                  </button>
                  <button
                    onClick={() => setAppMode('fiscal')}
                    className={cn(
                      "relative z-10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-md transition-colors",
                      appMode === 'fiscal' ? "text-white" : "text-slate-300 hover:text-white"
                    )}
                  >
                    {appMode === 'fiscal' && (
                      <motion.span
                        layoutId="app-mode-indicator"
                        className="absolute inset-0 rounded-md bg-indigo-600"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10">Fiscal</span>
                  </button>
                </div>
                <button
                  onClick={() => setShowSyncModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-colors text-xs font-semibold"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Sync
                </button>
                <button
                  onClick={() => setAppMode(prev => (prev === 'basic' ? 'fiscal' : 'basic'))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 transition-colors text-xs font-semibold"
                >
                  <Shield className="w-3.5 h-3.5" />
                  {appMode === 'basic' ? 'Modo Fiscal' : 'Modo Básico'}
                </button>
                {isMobile && (
                  <div className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-1 rounded border border-indigo-500/30 uppercase">
                    {activeMobileTabLabel}
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto pt-3">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
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
                      appMode={appMode}
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
                      accounts={combinedAccounts}
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
                      accounts={combinedAccounts}
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
                      accounts={combinedAccounts}
                      journalName={activeJournal?.name || ''}
                      finalInventory={finalInventory}
                      appMode={appMode}
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
                      accounts={combinedAccounts}
                      journalName={activeJournal?.name || ''}
                      finalInventory={finalInventory}
                      setFinalInventory={handleSetFinalInventory}
                      activeJournalId={activeJournalId}
                      onAdd={addEntry}
                      onSetModal={setModalInfo}
                    />
                  </motion.div>
                )}

               {activeTab === 'catalog' && (
                  <motion.div
                    key="catalog"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <CatalogView
                      accounts={combinedAccounts}
                      setAccounts={handleCombinedAccountsUpdate}
                      entries={entries}
                      appMode={appMode}
                      onSetModal={setModalInfo}
                    />
                  </motion.div>
                )}

                {activeTab === 'assets' && (
                  <motion.div
                    key="assets"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <FixedAssetsView
                      accounts={combinedAccounts}
                      fixedAssets={fixedAssets}
                      onSetFixedAssets={setFixedAssets}
                      activeJournalId={activeJournalId}
                      onAdd={addEntry}
                      onSetModal={setModalInfo}
                    />
                  </motion.div>
                )}

                {activeTab === 'electronic' && (
                  <motion.div
                    key="electronic"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <ContabilidadElectronicaView
                      accounts={combinedAccounts}
                      entries={entries}
                      tAccountsData={tAccountsData}
                      onSetModal={setModalInfo}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <footer className="border-t border-white/10 py-8 bg-white/5 backdrop-blur-md">
              <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-400">
                <p>© 2026 Contabilidad M4. Sistema de Gestión Contable.</p>
                <div className="flex gap-6 items-center">
                  <button
                    onClick={handleExportBackup}
                    className="inline-flex items-center gap-1.5 text-slate-400 hover:text-indigo-300 transition-colors text-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Respaldo
                  </button>
                  <label className="inline-flex items-center gap-1.5 text-slate-400 hover:text-indigo-300 transition-colors text-xs cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    Restaurar
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleImportBackup}
                      className="hidden"
                    />
                  </label>
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
          </main>
        </div>
      </div>

      {/* Global Information Modal */}
      <GlobalInfoModal
        info={modalInfo}
        onDismiss={() => setModalInfo(null)}
        onConfirmBackup={() => {
          setModalInfo(null);
          handleExportBackup();
        }}
      />

      {/* Confirmation Modal */}
      <ConfirmDeleteModal
        data={confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Download Progress Bar */}
      <DownloadProgressBar percent={downloadPercent} />

      {/* Update Available Modal */}
      <UpdateAvailableModal
        isOpen={isUpdateAvailable && !updateDismissed}
        latestVersion={latestVersion}
        downloadUrl={downloadUrl}
        onDismiss={() => setUpdateDismissed(true)}
        onNotify={(info) => setModalInfo(info)}
      />

      {/* About Modal */}
      <AboutModal
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        onSendFeedback={() => setShowFeedback(true)}
      />

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

function SidebarTabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium w-full text-left",
        active ? "text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-indicator"
          className="absolute inset-0 rounded-xl bg-indigo-500/15 border border-indigo-500/30"
          transition={{ type: 'spring', stiffness: 420, damping: 35 }}
        />
      )}
      <span className={cn("relative z-10", active ? "text-indigo-300" : "text-slate-500")}>{icon}</span>
      <span className="relative z-10">{label}</span>
    </button>
  );
}
