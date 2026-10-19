/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileText,
  Table as TableIcon,
  Briefcase,
  TrendingUp,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCheckForUpdates } from './hooks/useCheckForUpdates';
import { useUpdateProgress } from './hooks/useUpdateProgress';
import {
  FixedAsset
} from './types';
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
import { FISCAL_NAV_TABS, type AppMode, type AppTab, type NavigationTab } from './lib/navigation';
import { MobileMenu } from './components/layout/MobileMenu';
import { Sidebar } from './components/layout/Sidebar';
import { AppHeader } from './components/layout/AppHeader';
import { AppFooter } from './components/layout/AppFooter';

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

  const navigationTabs: NavigationTab[] = [
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
      <MobileMenu
        isMobile={isMobile}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        navigationTabs={navigationTabs}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onShowAbout={() => setShowAbout(true)}
      />

      <div className="flex h-screen overflow-hidden relative z-10">
        <Sidebar
          isMobile={isMobile}
          navigationTabs={navigationTabs}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <AppHeader
            appMode={appMode}
            onSetAppMode={setAppMode}
            onOpenSync={() => setShowSyncModal(true)}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
            isMobile={isMobile}
            activeMobileTabLabel={activeMobileTabLabel}
            hasActiveJournal={hasActiveJournal}
            activeJournalName={activeJournal?.name || ''}
          />

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

            <AppFooter
              onExportBackup={handleExportBackup}
              onImportBackup={handleImportBackup}
              onShowAbout={() => setShowAbout(true)}
              onShowFeedback={() => setShowFeedback(true)}
            />
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
