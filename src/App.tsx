/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useCheckForUpdates } from './hooks/useCheckForUpdates';
import { useUpdateProgress } from './hooks/useUpdateProgress';
import {
  FixedAsset
} from './types';
import { buildTAccountsData, computeAccountBalances, formatPolizaFolio, flattenPolizasToJournalEntries, entryToPolizaInput } from './lib/accounting';
import FeedbackModal from './components/FeedbackModal';
import SyncModal from './components/SyncModal';
import { GlobalInfoModal, type ModalInfo } from './components/modals/GlobalInfoModal';
import { ConfirmDeleteModal, type ConfirmDeleteData } from './components/modals/ConfirmDeleteModal';
import { UpdateAvailableModal } from './components/modals/UpdateAvailableModal';
import { AboutModal } from './components/modals/AboutModal';
import { DownloadProgressBar } from './components/modals/DownloadProgressBar';
import { JournalView } from './components/JournalView';
import { PolizaView } from './components/polizas/PolizaView';
import { TAccountsView } from './components/TAccountsView';
import { ProfitLossView } from './components/ProfitLossView';
import { BalanceSheetView } from './components/BalanceSheetView';
import { FixedAssetsView } from './components/FixedAssetsView';
import { ContabilidadElectronicaView } from './components/ContabilidadElectronicaView';
import { CatalogView } from './components/CatalogView';
import type { SyncState } from './services/syncService';
import { saveToStorage } from './services/storageService';
import { useAppData } from './hooks/useAppData';
import { usePolizas } from './hooks/usePolizas';
import { useCatalog } from './hooks/useCatalog';
import { useInventories, inventoriesToGeneral } from './hooks/useInventories';
import { useBackup } from './hooks/useBackup';
import { migrateJournalsToPolizas } from './lib/migrateJournalsToPolizas';
import { migrateCatalogToGlobal } from './lib/migrateCatalogToGlobal';
import { BASIC_NAV_TABS, DEFAULT_TAB, FISCAL_NAV_TABS, type AppMode, type AppTab, type NavigationTab } from './lib/navigation';
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
  const [activeTab, setActiveTab] = useState<AppTab>(DEFAULT_TAB);
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

  // --- Dominios como hooks (Fase 2; Fase 5 retira el dominio Journal de RAM) ---
  // Pólizas (Fases 2-4 de PLAN_POLIZAS.md): fuente de TODAS las derivaciones.
  const polizasState = usePolizas({ canSave: hasLoaded });
  const { polizas, createPoliza, updatePoliza, deletePoliza, createProgrammaticPoliza, importPolizas, setPolizas, markMigrated, hydrate } = polizasState;

  const inventoriesState = useInventories();
  const { finalInventories, setFinalInventories, finalInventory, handleSetFinalInventory, hydrateFromRemote } = inventoriesState;

  // activos fijos permanecen en App (Fase 3+): persistencia propia idéntica a la original
  useEffect(() => {
    saveToStorage('contasis_fixed_assets', fixedAssets).catch(console.error);
  }, [fixedAssets]);

  // Catálogo global consolidado (D-12: sin catálogo híbrido por diario)
  const catalogState = useCatalog({
    canSave: hasLoaded,
    onSaveError: setModalInfo
  });
  const { accounts, combinedAccounts, handleCombinedAccountsUpdate, setAccounts } = catalogState;

  // Carga inicial (hidratación) — al final de la cadena: ve los setters ya creados
  useAppData({
    setPolizas: polizasState.setPolizas,
    markPolizasMigrated: polizasState.markMigrated,
    setFinalInventories: setFinalInventories,
    setFixedAssets: setFixedAssets,
    setAccounts: setAccounts,
    markCatalogMigrated: catalogState.markMigrated
  }, setHasLoaded);

  // Vigilante de Respaldo Semanal + lógica de respaldo (hook propio)
  const { handleExportBackup, handleImportBackup } = useBackup({
    getSnapshot: () => ({
      polizas,
      accounts,
      fixedAssets,
      finalInventories,
      // D-14: journals vacío por compatibilidad de formato v2 (el archivo `contasis_journals` queda intacto)
      journals: []
    }),
    notify: setModalInfo,
    canSuggest: () => !modalInfoRef.current,
    restore: (backup) => {
      // Orquestador anti-R1: cada hook dueño recibe SU parte; nadie más
      // escribe claves ajenas. Composición atómica en el mismo evento.
      // D-14: respaldo v2 trae polizas; v1 (solo journals) MIGRA AL VUELO.
      const esFormatoV2 = 'polizas' in backup && Array.isArray(backup.polizas);
      const nextPolizas = esFormatoV2
        ? backup.polizas
        : migrateJournalsToPolizas(backup.journals, backup.accounts);
      // Catálogo: v1 puede traer subcuentas por diario → consolidación (D-12).
      const nextAccounts = esFormatoV2
        ? backup.accounts
        : migrateCatalogToGlobal(backup.accounts, backup.journals);

      hydrate(nextPolizas);
      setAccounts(nextAccounts);
      if (backup.fixedAssets) setFixedAssets(backup.fixedAssets);
      if (backup.finalInventories) setFinalInventories(inventoriesToGeneral(backup.finalInventories));
      setModalInfo({ type: 'success', title: 'Restauración Exitosa', message: 'Toda la información ha sido restaurada correctamente.' });
    }
  });

  useEffect(() => {
    localStorage.setItem('contasis_app_mode', appMode);
  }, [appMode]);

  // Redireccionar si se cambia a modo básico estando en una pestaña fiscal
  useEffect(() => {
    if (appMode === 'basic' && FISCAL_NAV_TABS.some(tab => tab.id === activeTab)) {
      setActiveTab(DEFAULT_TAB);
    }
  }, [appMode, activeTab]);

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'poliza') {
      deletePoliza(confirmDelete.id);
    }
    setConfirmDelete(null);
  };

  /**
   * Orquestador de sync remoto (anti-R1): una sola función compone ambos hooks.
   * `hydrate` de pólizas persiste explícitamente (incluso vacío); 
   * `hydrateFromRemote` persiste la clave de inventarios explícitamente.
   * D-14: estado remoto de formato viejo (solo journals) MIGRA al vuelo.
   */
  const applyRemoteSyncState = (state: SyncState) => {
    const nextInventories = state.finalInventories ?? {};
    const nextPolizas = Array.isArray(state.polizas)
      ? state.polizas
      : migrateJournalsToPolizas(Array.isArray(state.journals) ? state.journals : [], accounts);

    hydrate(nextPolizas);
    inventoriesState.hydrateFromRemote(nextInventories);
  };

  /**
   * CUTOVER (Fase 4 de PLAN_POLIZAS.md): TODAS las derivaciones se alimentan
   * de las pólizas, NO del diario activo. Proyección aplanada de las pólizas
   * ordenadas cronológicamente (fecha + folio, desempate determinista).
   */
  const polizasCronologicas = useMemo(
    () => [...polizas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.folio - b.folio),
    [polizas]
  );
  const proyeccion = useMemo(
    () => flattenPolizasToJournalEntries(polizasCronologicas),
    [polizasCronologicas]
  );

  // Derived Data: T-Accounts + Balances (funciones puras en lib/accounting.ts)
  const tAccountsData = useMemo(() => buildTAccountsData(proyeccion), [proyeccion]);
  const accountBalances = useMemo(
    () => computeAccountBalances(tAccountsData, combinedAccounts),
    [tAccountsData, combinedAccounts]
  );

  const navigationTabs: NavigationTab[] = [
    ...BASIC_NAV_TABS,
    ...(appMode === 'fiscal' ? FISCAL_NAV_TABS : [])
  ];
  const activeMobileTabLabel = navigationTabs.find(tab => tab.id === activeTab)?.shortLabel ?? 'Pólizas';

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
          />

          <main className="flex-1 overflow-y-auto pt-3">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
              <AnimatePresence mode="wait">
                {activeTab === 'polizas' && (
                  <motion.div
                    key="polizas"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <PolizaView
                      polizas={polizas}
                      accounts={combinedAccounts}
                      appMode={appMode}
                      onCreate={createPoliza}
                      onUpdate={updatePoliza}
                      onImportPolizas={importPolizas}
                      onDeleteRequest={(p) => {
                        setConfirmDelete({
                          type: 'poliza',
                          id: p.id,
                          title: 'Eliminar Póliza',
                          message: `¿Estás seguro de que deseas eliminar la póliza "${formatPolizaFolio(p)}" (${p.concepto})? Esta acción no se puede deshacer.`
                        });
                      }}
                      onSetModal={setModalInfo}
                    />
                  </motion.div>
                )}

                {activeTab === 'journal' && (
                  <motion.div
                    key="journal"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <JournalView
                      polizas={polizasCronologicas}
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
                      journalName="Consolidado"
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
                      journalName="Consolidado"
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
                      journalName="Consolidado"
                      finalInventory={finalInventory}
                      setFinalInventory={handleSetFinalInventory}
                      onAdd={(e) => createProgrammaticPoliza(entryToPolizaInput(e, combinedAccounts))}
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
                      entries={proyeccion}
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
                      onAdd={(e) => createProgrammaticPoliza(entryToPolizaInput(e, combinedAccounts))}
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
                      entries={proyeccion}
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
        localState={{ journals: [], polizas, finalInventories }}
        onApplyRemoteState={applyRemoteSyncState}
        onNotify={(type, title, message) => setModalInfo({ type, title, message })}
      />
    </div>
  );
}
