/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';import { motion, AnimatePresence } from 'motion/react';
import { saltarVersion, useCheckForUpdates } from './hooks/useCheckForUpdates';
import { useUpdateProgress } from './hooks/useUpdateProgress';
import type { Account, FixedAsset, Poliza } from './types';
import { buildTAccountsData, computeAccountBalances, formatPolizaFolio, flattenPolizasToJournalEntries, entryToPolizaInput } from './lib/accounting';
import { clavePorEmpresa, arrayDe, objetoDe } from './lib/empresas';
import { esBackupV3, type BackupSnapshotV3, type EmpresaWorkspace } from './hooks/useBackup';
import { VaultSyncEngine, type EventoMotor } from './services/vaultSyncEngine';
import { obtenerCredenciales, obtenerRelayUrl } from './services/vaultService';
import FeedbackModal from './components/FeedbackModal';
import SyncModal from './components/SyncModal';
import { GlobalInfoModal, type ModalInfo } from './components/modals/GlobalInfoModal';
import { ConfirmDeleteModal, type ConfirmDeleteData } from './components/modals/ConfirmDeleteModal';
import { ConflictoBovedaModal, type ConflictoBovedaVista } from './components/modals/ConflictoBovedaModal';
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
import { saveToStorage, loadFromStorage } from './services/storageService';
import { useAppData } from './hooks/useAppData';
import { usePolizas } from './hooks/usePolizas';
import { useCatalog } from './hooks/useCatalog';
import { useInventories, inventoriesToGeneral } from './hooks/useInventories';
import { useEmpresas } from './hooks/useEmpresas';
import { useBackup } from './hooks/useBackup';
import { migrateJournalsToPolizas } from './lib/migrateJournalsToPolizas';
import { migrateCatalogToGlobal } from './lib/migrateCatalogToGlobal';
import { BASIC_NAV_TABS, DEFAULT_TAB, FISCAL_NAV_TABS, type AppMode, type AppTab, type NavigationTab } from './lib/navigation';
import { EmpresasModal } from './components/EmpresasModal';
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
  const { isUpdateAvailable, latestVersion, downloadUrl, changelog } = useCheckForUpdates();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showEmpresas, setShowEmpresas] = useState(false);
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

  // --- Dominios como hooks (Fases 2-3 de PLAN_POLIZAS.md + PLAN_MULTI_CLIENTE.md) ---
  // Pólizas: fuente de TODAS las derivaciones. Dominios POR CLIENTE: los datos
  // de RAM son SIEMPRE los del cliente activo (C-4).
  const empresasState = useEmpresas({ canSave: hasLoaded });
  const { activaId, activa: empresaActiva, crearEmpresa, actualizarEmpresa, eliminarEmpresa, setActiva, hydrate: hydrateEmpresas, markMigrated: markEmpresasMigrated } = empresasState;

  const polizasState = usePolizas({ canSave: hasLoaded, empresaId: activaId });
  const { polizas, createPoliza, updatePoliza, deletePoliza, createProgrammaticPoliza, importPolizas, setPolizas, hydrate } = polizasState;

  const inventoriesState = useInventories({ empresaId: activaId });
  const { finalInventories, setFinalInventories, finalInventory, handleSetFinalInventory, hydrateFromRemote } = inventoriesState;

  // activos fijos permanecen en App (dueño del dominio): clave POR CLIENTE + puerta canSave (C-4)
  useEffect(() => {
    if (!hasLoaded || !activaId) return;
    saveToStorage(clavePorEmpresa('contasis_fixed_assets', activaId), fixedAssets).catch(console.error);
  }, [fixedAssets, hasLoaded, activaId]);
  // Escritura de la clave de activos de UN cliente concreto (boot-migración / respaldo; anti-R1: App es dueña).
  const hydrateAssetsEmpresa = (empresaDestinoId: string, assets: FixedAsset[]): void => {
    if (empresaDestinoId === activaId) setFixedAssets(assets);
    saveToStorage(clavePorEmpresa('contasis_fixed_assets', empresaDestinoId), assets).catch(console.error);
  };

  // Catálogo global consolidado del cliente activo (D-12 heredada; claves por cliente C-2)
  const catalogState = useCatalog({
    canSave: hasLoaded,
    onSaveError: setModalInfo,
    empresaId: activaId
  });
  const { accounts, combinedAccounts, handleCombinedAccountsUpdate, setAccounts } = catalogState;

  // Carga inicial (hidratación) — al final de la cadena: ve los setters ya creados.
  // El tercer parámetro (activaId) dispara la recarga orquestada al cambiar cliente (C-4).
  useAppData({
    hydrateEmpresas,
    markEmpresasMigrated,
    setPolizas: polizasState.setPolizas,
    setFinalInventories: setFinalInventories,
    setFixedAssets: setFixedAssets,
    setAccounts: setAccounts,
    hydratePolizasEmpresa: polizasState.hydrateEmpresa,
    hydrateInventoriesEmpresa: inventoriesState.hydrateEmpresa,
    hydrateAccountsEmpresa: catalogState.hydrateEmpresa,
    hydrateAssetsEmpresa
  }, setHasLoaded, activaId);

  // Snapshot completo v3 (C-5): solo lectura de TODAS las empresas; el activo
  // sale de RAM y el resto de su clave. COMPARTIDO por la exportación de
  // respaldos y por la bóveda (K-11: única puerta; el motor no toca hooks).
  const obtenerSnapshotCompleto = async (): Promise<BackupSnapshotV3> => {
    const workspaces: EmpresaWorkspace[] = await Promise.all(
      empresasState.empresas.map(async (empresa) => {
        if (empresa.id === activaId) {
          return {
            id: empresa.id,
            nombre: empresa.nombre,
            rfc: empresa.rfc,
            polizas,
            accounts,
            fixedAssets,
            finalInventories
          };
        }
        const [otrasPolizas, otrasAccounts, otrosAssets, otrosInventories] = await Promise.all([
          loadFromStorage(clavePorEmpresa('contasis_polizas', empresa.id)),
          loadFromStorage(clavePorEmpresa('contasis_accounts', empresa.id)),
          loadFromStorage(clavePorEmpresa('contasis_fixed_assets', empresa.id)),
          loadFromStorage(clavePorEmpresa('contasis_final_inventories', empresa.id))
        ]);
        return {
          id: empresa.id,
          nombre: empresa.nombre,
          rfc: empresa.rfc,
          polizas: arrayDe(otrasPolizas) as Poliza[],
          accounts: arrayDe(otrasAccounts) as Account[],
          fixedAssets: arrayDe(otrosAssets) as FixedAsset[],
          finalInventories: objetoDe(otrosInventories) as Record<string, number>
        };
      })
    );
    return { empresas: workspaces, activaId: activaId ?? '' };
  };

  // Aplicador v3 compartido: importación de respaldo y remoto de bóveda usan
  // el MISMO camino (DV-C-3 restaura TODAS las empresas). La cantidad de
  // clientes válidos decide el éxito; el feedback (modal) lo agrega cada
  // llamador. Orquestador anti-R1: cada hook dueño recibe SU parte; nadie
  // escribe claves ajenas. Composición atómica en el mismo evento.
  const aplicarSnapshotV3 = (backup: BackupSnapshotV3): number => {
    const validos = backup.empresas.filter(e => e && typeof e.id === 'string');
    const activaRestaurada = validos.some(e => e.id === backup.activaId)
      ? backup.activaId
      : validos[0]?.id ?? '';
    hydrateEmpresas({
      activaId: activaRestaurada,
      empresas: validos.map(({ id, nombre, rfc }) => ({ id, nombre, rfc }))
    });
    validos.forEach(ws => {
      polizasState.hydrateEmpresa(ws.id, ws.polizas ?? []);
      catalogState.hydrateEmpresa(ws.id, ws.accounts ?? []);
      inventoriesState.hydrateEmpresa(ws.id, inventoriesToGeneral(ws.finalInventories ?? {}));
      hydrateAssetsEmpresa(ws.id, ws.fixedAssets ?? []);
    });
    return validos.length;
  };

  // Vigilante de Respaldo Semanal + lógica de respaldo (hook propio)
  const { handleExportBackup, handleImportBackup } = useBackup({
    getSnapshot: obtenerSnapshotCompleto,
    notify: setModalInfo,
    canSuggest: () => !modalInfoRef.current,
    restore: (backup) => {
      // C-5: v3 hidrata a TODOS los clientes con sus datos.
      if (esBackupV3(backup)) {
        const restaurados = aplicarSnapshotV3(backup);
        setModalInfo({ type: 'success', title: 'Restauración Exitosa', message: `Se restauraron ${restaurados} cliente(s). Las claves viejas quedaron reemplazadas con el contenido del respaldo.` });
        return;
      }

      // C-5: respaldos v2 (polizas) y v1 (journals) sobrescriben SOLO el cliente ACTIVO.
      // D-14: v1 MIGRA AL VUELO para no romper la carga de archivos viejos.
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
      setModalInfo({ type: 'success', title: 'Restauración Exitosa', message: `Se restauraron los datos del cliente "${empresaActiva?.nombre ?? 'Activo'}". Los demás clientes quedaron intactos.` });
    }
  });

  // --- Motor de bóveda E2EE (Fase 5 de PLAN_SYNC_KV.md) ------------------------
  // Única puerta con el dominio (K-11): el motor solo consume el snapshot v3 y
  // pide restauración por el applier compartido; NUNCA toca claves de dominio.
  const [indicadorBoveda, setIndicadorBoveda] = useState<'sin' | 'ok' | 'pendiente' | 'conflicto' | 'error'>('sin');
  /** Último error del motor (evento 'error'): lo muestra el SyncModal en bruto. */
  const [falloBoveda, setFalloBoveda] = useState<string | null>(null);
  const [conflictoBoveda, setConflictoBoveda] = useState<ConflictoBovedaVista | null>(null);
  const hasLoadedRef = useRef(false);
  hasLoadedRef.current = hasLoaded; // fresco por render (recarga C-4)
  const snapshotBovedaRef = useRef(obtenerSnapshotCompleto);
  snapshotBovedaRef.current = obtenerSnapshotCompleto;
  const restaurarBovedaRef = useRef<(snapshot: unknown) => Promise<boolean>>(async () => false);
  restaurarBovedaRef.current = async (snapshot) => {
    try {
      return aplicarSnapshotV3(snapshot as BackupSnapshotV3) > 0;
    } catch (error) {
      console.error('No se pudo aplicar el estado remoto de la bóveda:', error);
      return false;
    }
  };

  const motorRef = useRef<VaultSyncEngine | null>(null);
  if (!motorRef.current) {
    motorRef.current = new VaultSyncEngine({
      getSnapshot: () => snapshotBovedaRef.current(),
      restaurar: (snapshot) => restaurarBovedaRef.current(snapshot),
      puedeEscribir: () => hasLoadedRef.current,
      credenciales: () => obtenerCredenciales(),
      relayUrl: () => obtenerRelayUrl()
    });
  }

  // Suscripción única: estado para el punto del AppHeader + conflicto a modal.
  useEffect(() => {
    const motor = motorRef.current;
    if (!motor) return;
    return motor.suscribir((evento: EventoMotor) => {
      if (evento.tipo === 'conflicto') {
        setConflictoBoveda({ version: evento.version, deviceLabel: evento.deviceLabel, updatedAt: evento.updatedAt });
        setIndicadorBoveda('conflicto');
        return;
      }
      if (evento.tipo === 'error') {
        // El detalle real (HTTP status, snapshot inválido…) sobrevive hasta el
        // modal de sincronización: el genérico "El relay no respondió" escondía
        // la causa. console.error para trazabilidad en consola.
        console.error('[bóveda] fallo del motor:', evento.detalle);
        setFalloBoveda(evento.detalle);
        setIndicadorBoveda('error');
        return;
      }
      if (evento.tipo === 'publicado') {
        setFalloBoveda(null);
      }
      if (evento.tipo === 'cambio') {
        const detalle = evento.detalle ?? '';
        if (detalle === 'sin bóveda' || detalle === 'inactivo') setIndicadorBoveda('sin');
        else if (detalle === 'al dia') setIndicadorBoveda('ok');
        else if (detalle === 'conflicto') setIndicadorBoveda('conflicto');
        else if (detalle === 'error') setIndicadorBoveda('error');
        else if (detalle === 'sucio' || detalle === 'publicando' || detalle === 'aplicando') setIndicadorBoveda('pendiente');
      }
    });
  }, []);

  // Montaje tras el boot + desmontaje en la recarga C-4 (K-11): mientras
  // canSave es falso nada entra ni aplica; al volver el verde se reactiva y
  // se despacha lo que quedó en cola.
  useEffect(() => {
    const motor = motorRef.current;
    if (!motor) return;
    if (hasLoaded) {
      void motor.activar();
      void motor.aplicarPendiente();
    } else {
      motor.parar();
    }
  }, [hasLoaded]);

  // K-5: cada persistencia confirmada de dominio agenda la publicación. El
  // dedupe por huella dentro del motor descarta el eco de la restauración.
  useEffect(() => {
    if (!hasLoaded) return;
    motorRef.current?.schedulePublicacion();
  }, [polizas, accounts, fixedAssets, finalInventories, empresasState.empresas, hasLoaded]);

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
    } else if (confirmDelete.type === 'empresa') {
      // C-8: el hook prohíbe eliminar el último cliente (defensa extra en UI).
      const eliminada = eliminarEmpresa(confirmDelete.id);
      if (eliminada) {
        setModalInfo({ type: 'success', title: 'Cliente eliminado', message: 'El cliente salió de la lista. Sus claves por cliente quedan como archivo histórico en el almacenamiento.' });
      } else {
        setModalInfo({ type: 'error', title: 'No se pudo eliminar', message: 'Siempre debe existir al menos un cliente.' });
      }
    }
    setConfirmDelete(null);
  };

  // El orquestador C-6 de sync remoto (vía Redis/PeerJS) se retiró con la
  // limpieza de PLAN_SYNC_KV.md: el remoto de la bóveda se aplica por el
  // mismo camino de restauración v3 de los respaldos (App/restore).
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
            empresaActivaNombre={empresaActiva?.nombre ?? null}
            onOpenEmpresas={() => setShowEmpresas(true)}
            indicadorBoveda={indicadorBoveda}
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
                      polizas={polizasCronologicas}
                      tAccountsData={tAccountsData}
                      onSetModal={setModalInfo}
                      rfcInicial={empresaActiva?.rfc ?? ''}
                      onGuardarRfc={(rfc) => {
                        if (activaId) actualizarEmpresa(activaId, { rfc });
                      }}
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
        changelog={changelog}
        downloadUrl={downloadUrl}
        onDismiss={() => setUpdateDismissed(true)}
        onSkipVersion={(v) => saltarVersion(v)}
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
        onNotify={(type, title, message) => setModalInfo({ type, title, message })}
        onPublicar={async () => (motorRef.current ? motorRef.current.publicarAhora() : false)}
        onRestaurarHistorial={async (entrada) =>
          motorRef.current ? motorRef.current.restaurarVersionHistorica(entrada) : false
        }
        detalleFallo={falloBoveda}
      />

      <ConflictoBovedaModal
        conflicto={conflictoBoveda}
        onResolver={(mantenerLocal) => {
          setConflictoBoveda(null);
          void motorRef.current?.resolverConflicto(mantenerLocal);
        }}
      />

      {/* Gestor de clientes (C-1): switch + alta + edición + baja confirmada */}
      <EmpresasModal
        isOpen={showEmpresas}
        onClose={() => setShowEmpresas(false)}
        empresas={empresasState.empresas}
        activaId={activaId}
        onSetActiva={setActiva}
        onCrear={(nombre) => {
          crearEmpresa(nombre);
          setModalInfo({ type: 'success', title: 'Cliente agregado', message: `Se creó el cliente "${nombre}". Usa "Usar" para cambiar a su contabilidad.` });
        }}
        onEditar={(id, cambios) => actualizarEmpresa(id, cambios)}
        onEliminarSolicitud={(empresa) => {
          setShowEmpresas(false);
          setConfirmDelete({
            type: 'empresa',
            id: empresa.id,
            title: 'Eliminar Cliente',
            message: `¿Seguro que deseas eliminar a "${empresa.nombre}" de la lista? Sus datos ya no estarán accesibles. Esta acción no se puede deshacer.`
          });
        }}
      />
    </div>
  );
}
