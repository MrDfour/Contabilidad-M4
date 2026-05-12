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
  Check,
  X,
  Upload,
  FileUp,
  Search,
  FileScan,
  FileCode,
  ChevronDown,
  ChevronUp,
  Menu,
  RefreshCw,
  MessageSquare,
  Smartphone,
  Monitor,
  Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Browser } from '@capacitor/browser';
import { useCheckForUpdates } from './hooks/useCheckForUpdates';
import { useUpdateProgress } from './hooks/useUpdateProgress';
import { 
  INITIAL_ACCOUNTS, 
  JournalEntry, 
  Account,
  Journal,
  FixedAsset
} from './types';
import { 
  cn
} from './lib/utils';
import FeedbackModal from './components/FeedbackModal';
import SyncModal from './components/SyncModal';
import { JournalView } from './components/JournalView';
import { TAccountsView } from './components/TAccountsView';
import { ProfitLossView } from './components/ProfitLossView';
import { BalanceSheetView } from './components/BalanceSheetView';
import { FixedAssetsView } from './components/FixedAssetsView';
import { ContabilidadElectronicaView } from './components/ContabilidadElectronicaView';
import { CatalogView } from './components/CatalogView';
import type { SyncState } from './services/syncService';
import { saveToStorage, loadFromStorage, migrateFromLocalStorage } from './services/storageService';

const APP_VERSION = `v${__APP_VERSION__}`;
type AppMode = 'basic' | 'fiscal';
type AppTab = 'journal' | 't-accounts' | 'balance' | 'profit-loss' | 'assets' | 'electronic' | 'catalog';
const ACCOUNTS_SAVE_DEBOUNCE_MS = 300;
const LAST_BACKUP_STORAGE_KEY = 'contasis_last_backup';
const BACKUP_SUGGESTION_TITLE = 'Sugerencia de Respaldo';
const FISCAL_NAV_TABS = [
  { id: 'assets' as const, label: 'Activos Fijos', shortLabel: 'Activos', icon: Monitor },
  { id: 'electronic' as const, label: 'Cont. Electrónica', shortLabel: 'SAT XML', icon: FileCode }
];
const getStoredAppMode = (): AppMode => {
  if (typeof window === 'undefined') return 'basic';
  const savedMode = localStorage.getItem('contasis_app_mode');
  return savedMode === 'fiscal' ? 'fiscal' : 'basic';
};

const normalizeAmount = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>(getStoredAppMode);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [activeJournalId, setActiveJournalId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('journal');
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'entry' | 'journal', id: string, title: string, message: string } | null>(null);
  const [modalInfo, setModalInfo] = useState<{ type: 'success' | 'error', title: string, message: string } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [finalInventory, setFinalInventory] = useState<number>(0);
  const [finalInventories, setFinalInventories] = useState<Record<string, number>>({});
  const [hasLoadedAccounts, setHasLoadedAccounts] = useState(false);
  const { isUpdateAvailable, latestVersion, downloadUrl } = useCheckForUpdates();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const downloadPercent = useUpdateProgress();
  const isDesktopRuntime = typeof window !== 'undefined' && ('electronAPI' in window || navigator.userAgent.toLowerCase().includes('electron'));
  const modalInfoRef = useRef<{ type: 'success' | 'error', title: string, message: string } | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    modalInfoRef.current = modalInfo;
  }, [modalInfo]);

  // Vigilante de Respaldo Semanal (Rutina Continua)
  useEffect(() => {
    const checkBackupStatus = () => {
      // Ignorar chequeo si ya hay un modal abierto para no interrumpir
      if (modalInfoRef.current) return;

      const lastBackup = localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
      if (!lastBackup) {
        localStorage.setItem(LAST_BACKUP_STORAGE_KEY, new Date().toISOString());
        return;
      }

      const lastDate = new Date(lastBackup).getTime();
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      if (now - lastDate > sevenDaysInMs) {
        setModalInfo({
          type: 'success',
          title: BACKUP_SUGGESTION_TITLE,
          message: 'Ha pasado más de una semana desde tu último respaldo de seguridad. ¿Deseas descargar una copia de tu base de datos ahora?',
        });
      }
    };

    // 1. Chequeo inicial al cargar la app
    checkBackupStatus();

    // 2. Chequeo continuo cada 12 horas (Por si nunca cierran la app)
    const intervalId = setInterval(checkBackupStatus, 12 * 60 * 60 * 1000);

    // 3. Limpieza para evitar memory leaks
    return () => clearInterval(intervalId);
  }, []);
  
  const activeJournal = journals.find(j => j.id === activeJournalId) || null;
  const getFinalGlobals = () => {
    const currentGlobals = accounts.filter(a => a.isReadOnly);
    const missingGlobals = INITIAL_ACCOUNTS.filter(
      initial => !currentGlobals.some(current => current.code === initial.code)
    );

    if (missingGlobals.length > 0) {
      const recovered = missingGlobals.map(a => ({ ...a, isReadOnly: true }));
      return [...currentGlobals, ...recovered];
    }

    return currentGlobals;
  };
  // --- CATÁLOGO HÍBRIDO CON AUTO-RECUPERACIÓN QUIRÚRGICA ---
  const combinedAccounts = useMemo(() => {
    // Verificamos completitud: Buscamos si falta alguna cuenta base del SAT
    const finalGlobals = getFinalGlobals();

    const locals = activeJournal?.subAccounts || [];
    return [...finalGlobals, ...locals];
  }, [accounts, activeJournal?.subAccounts]); // INITIAL_ACCOUNTS es estático, se omite de forma segura.

  const handleCombinedAccountsUpdate = (action: React.SetStateAction<Account[]>) => {
    if (!activeJournalId) {
      console.warn('Cannot update subaccounts: No active journal selected. Please select a journal first.');
      return;
    }

    const finalGlobals = getFinalGlobals();
    const globalCodes = new Set(finalGlobals.map(a => a.code));
    const effectiveCombinedAccounts = [...finalGlobals, ...(activeJournal?.subAccounts || [])];

    const nextCombinedAccounts = typeof action === 'function' ? action(effectiveCombinedAccounts) : action;
    const nextLocalAccounts = nextCombinedAccounts.filter(
      a => !a.isReadOnly && !globalCodes.has(a.code)
    );

    setJournals(prev =>
      prev.map(j =>
        j.id === activeJournalId
          ? { ...j, subAccounts: nextLocalAccounts }
          : j
      )
    );
  };
  // --- FIN CATÁLOGO HÍBRIDO ---
  const hasActiveJournal = Boolean(activeJournal);
  const entries = activeJournal?.entries || [];

  // Persistence
  useEffect(() => {
    const loadData = async () => {
      try {
        await migrateFromLocalStorage();

        const saved = await loadFromStorage('contasis_journals');
        if (saved) {
          const parsed = Array.isArray(saved) ? saved : JSON.parse(saved);
          setJournals(parsed);
          if (parsed.length > 0) setActiveJournalId(parsed[0].id);
        } else {
          // Crear diario inicial si no existe nada
          const initialJournal: Journal = { id: crypto.randomUUID(), name: 'Diario Inicial', entries: [] };
          setJournals([initialJournal]);
          setActiveJournalId(initialJournal.id);
        }

        const savedInventories = await loadFromStorage('contasis_final_inventories');
        if (savedInventories) {
          const parsed = typeof savedInventories === 'string' ? JSON.parse(savedInventories) : savedInventories;
          setFinalInventories(parsed);
        }
 

        const savedFixedAssets = await loadFromStorage('contasis_fixed_assets');
        if (savedFixedAssets) {
          const parsed = typeof savedFixedAssets === 'string' ? JSON.parse(savedFixedAssets) : savedFixedAssets;
          setFixedAssets(parsed);
        }

        const savedAccounts = await loadFromStorage('contasis_accounts');
        if (savedAccounts) {
          const parsed = typeof savedAccounts === 'string' ? JSON.parse(savedAccounts) : savedAccounts;
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAccounts(parsed);
          } else {
            setAccounts(INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true })));
          }
        } else {
          setAccounts(INITIAL_ACCOUNTS.map(a => ({ ...a, isReadOnly: true })));
        }
        setHasLoadedAccounts(true);
      } catch (error) {
        console.error("Error crítico al cargar datos desde el almacenamiento:", error);
        // Fallback seguro
        const initialJournal: Journal = { id: crypto.randomUUID(), name: 'Diario Inicial', entries: [] };
        setJournals([initialJournal]);
        setActiveJournalId(initialJournal.id);
        setAccounts(INITIAL_ACCOUNTS);
        setHasLoadedAccounts(true);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    if (journals.length > 0) {
      saveToStorage('contasis_journals', journals).catch(console.error);
    }
  }, [journals]);

  useEffect(() => {
    saveToStorage('contasis_fixed_assets', fixedAssets).catch(console.error);
  }, [fixedAssets]);

  useEffect(() => {
    if (!hasLoadedAccounts) return;
    const timeoutId = window.setTimeout(() => {
      saveToStorage('contasis_accounts', accounts).catch((error) => {
        console.error('Failed to save accounts:', error);
        setModalInfo({
          type: 'error',
          title: 'Error al guardar',
          message: 'No se pudo guardar el catálogo de cuentas. Intenta nuevamente o contacta soporte si el problema persiste.'
        });
      });
    }, ACCOUNTS_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [accounts, hasLoadedAccounts, setModalInfo]);

  useEffect(() => {
    localStorage.setItem('contasis_app_mode', appMode);
  }, [appMode]);

  // Redireccionar al Diario si se cambia a modo básico estando en una pestaña fiscal
  useEffect(() => {
    if (appMode === 'basic' && FISCAL_NAV_TABS.some(tab => tab.id === activeTab)) {
      setActiveTab('journal');
    }
  }, [appMode, activeTab]);

  // Sync finalInventory when active journal changes
  useEffect(() => {
    if (activeJournalId) {
      setFinalInventory(finalInventories[activeJournalId] ?? 0);
    }
  }, [activeJournalId, finalInventories]);

  const handleSetFinalInventory = (value: number) => {
    const normalizedValue = normalizeAmount(value);
    setFinalInventory(normalizedValue);
    if (activeJournalId) {
      const updated = { ...finalInventories, [activeJournalId]: normalizedValue };
      setFinalInventories(updated);
      saveToStorage('contasis_final_inventories', updated).catch(console.error);
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
          accountData.debits.push({ amount: normalizeAmount(mov.amount), ref: index + 1 });
        } else {
          accountData.credits.push({ amount: normalizeAmount(mov.amount), ref: index + 1 });
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
      const totalDebit = normalizeAmount(typedData.debits.reduce((sum, d) => sum + d.amount, 0));
      const totalCredit = normalizeAmount(typedData.credits.reduce((sum, c) => sum + c.amount, 0));
      const account = combinedAccounts.find(a => a.id === accountId);
      
      // Standard balance side
      if (account?.type === 'asset' || account?.type === 'expense') {
        balances[accountId] = normalizeAmount(totalDebit - totalCredit);
      } else {
        balances[accountId] = normalizeAmount(totalCredit - totalDebit);
      }
    });
    return balances;
  }, [tAccountsData, combinedAccounts]);

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
    
    // Usar la persistencia segura en lugar de localStorage
    saveToStorage('contasis_journals', nextJournals).catch(console.error);
    saveToStorage('contasis_final_inventories', nextInventories).catch(console.error);

    if (nextJournals.length > 0) {
      const nextActiveId = nextJournals[0].id;
      setActiveJournalId(nextActiveId);
      setFinalInventory(nextInventories[nextActiveId] ?? 0);
    } else {
      setActiveJournalId(null);
      setFinalInventory(0);
    }
  };

  // --- LÓGICA DE RESPALDO LOCAL ---
  const handleExportBackup = () => {
    const backupData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      data: {
        journals,
        accounts,
        fixedAssets,
        finalInventories
      }
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Contabilidad_M4_Respaldo_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem(LAST_BACKUP_STORAGE_KEY, new Date().toISOString());
    setModalInfo({ type: 'success', title: 'Respaldo Exitoso', message: 'Se ha descargado el archivo JSON con toda tu base de datos.' });
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const backup = parsed.data || parsed; // Soporte para formato nuevo o legacy
      
      if (Array.isArray(backup.journals) && Array.isArray(backup.accounts)) {
        setJournals(backup.journals);
        setAccounts(backup.accounts);
        if (backup.fixedAssets) setFixedAssets(backup.fixedAssets);
        if (backup.finalInventories) setFinalInventories(backup.finalInventories);
        
        if (backup.journals.length > 0) setActiveJournalId(backup.journals[0].id);
        
        setModalInfo({ type: 'success', title: 'Restauración Exitosa', message: 'Toda la información ha sido restaurada correctamente.' });
      } else {
        throw new Error('Formato inválido');
      }
    } catch (err) {
      setModalInfo({ type: 'error', title: 'Error de Restauración', message: 'El archivo JSON está corrupto o no tiene el formato correcto de Contabilidad M4.' });
    }
    e.target.value = ''; // Resetear input
  };
  // --- FIN LÓGICA DE RESPALDO ---

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
                {modalInfo.title === BACKUP_SUGGESTION_TITLE
                  ? <AlertCircle className="w-8 h-8" />
                  : modalInfo.type === 'success'
                    ? <Check className="w-8 h-8" />
                    : <AlertCircle className="w-8 h-8" />}
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">{modalInfo.title}</h3>
              <p className="text-slate-400 mb-8 leading-relaxed">
                {modalInfo.message}
              </p>
              {modalInfo.title === BACKUP_SUGGESTION_TITLE ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => {
                      setModalInfo(null);
                      handleExportBackup();
                    }}
                    className="flex-1 py-3 rounded-xl font-semibold transition-all shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                  >
                    Sí, descargar respaldo
                  </button>
                  <button
                    onClick={() => setModalInfo(null)}
                    className="flex-1 py-3 rounded-xl font-semibold transition-all shadow-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    Más tarde
                  </button>
                </div>
              ) : (
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
              )}
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
