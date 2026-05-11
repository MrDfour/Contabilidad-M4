import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  FileText,
  Download,
  Trash2,
  ChevronRight,
  Edit2,
  Check,
  X,
  Upload,
  FileUp,
  Search,
  FileScan,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Account, Journal, JournalEntry, Movement } from '../types';
import {
  cn,
  formatCurrency,
  exportToExcel,
  exportTableToPDF,
  readExcel,
  normalizeString
} from '../lib/utils';

type AppMode = 'basic' | 'fiscal';

const normalizeAmount = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

const parseFormattedAmount = (value: string) => {
  const parsed = Number(value.replace(/,/g, ''));
  return normalizeAmount(parsed);
};

const parseImportedAmount = (value: unknown) => {
  const raw = String(value ?? '0').replace(/,/g, '');
  const isNegative = raw.includes('-');
  const numericOnly = raw.replace(/[^0-9.]/g, '');
  const [integerPartRaw, ...decimalParts] = numericOnly.split('.');
  const integerPart = integerPartRaw || '0';
  const decimalPart = decimalParts.join('');
  const normalized = `${isNegative ? '-' : ''}${integerPart}${decimalPart ? `.${decimalPart}` : ''}`;
  return normalizeAmount(parseFloat(normalized) || 0);
};

const formatAmountForInput = (amount: number) => {
  const normalized = normalizeAmount(amount);
  if (normalized === 0) return '';
  return new Intl.NumberFormat('en-US', {
    useGrouping: true,
    maximumFractionDigits: 2
  }).format(normalized);
};

const formatAmountInput = (value: string) => {
  const sanitized = value.replace(/[^0-9.]/g, '');
  if (!sanitized) return '';

  const [integerPartRaw, ...decimalParts] = sanitized.split('.');
  const hasDecimalPoint = sanitized.includes('.');
  const normalizedInteger = (integerPartRaw || '0').replace(/^0+(?=\d)/, '') || '0';
  const formattedInteger = normalizedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimalPart = decimalParts.join('').slice(0, 2);

  if (!hasDecimalPoint) return formattedInteger;
  return `${formattedInteger}.${decimalPart}`;
};

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
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});
  const [collapsedPeriods, setCollapsedPeriods] = useState<Record<string, boolean>>({});

  const groupedEntriesByPeriod = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('es-ES', { month: 'long' });

    const getPeriod = (date: string) => {
      const normalizedDate = date.length >= 10 ? date.slice(0, 10) : date;
      const parsed = new Date(`${normalizedDate}T00:00:00`);

      if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = parsed.getMonth() + 1;
        const monthLabel = formatter.format(parsed).replace(/^\w/, (char) => char.toUpperCase());
        return {
          key: `${year}-${String(month).padStart(2, '0')}`,
          label: `${monthLabel} ${year}`
        };
      }

      const [year = 'Sin', month = 'Periodo'] = normalizedDate.split('-');
      return {
        key: `${year}-${month}`,
        label: `${year}-${month}`
      };
    };

    const grouped = new Map<
      string,
      { periodKey: string; periodLabel: string; items: Array<{ entry: JournalEntry; globalIndex: number }> }
    >();

    entries.forEach((entry, globalIndex) => {
      const { key, label } = getPeriod(entry.date);
      const current = grouped.get(key);
      if (current) {
        current.items.push({ entry, globalIndex });
        return;
      }
      grouped.set(key, {
        periodKey: key,
        periodLabel: label,
        items: [{ entry, globalIndex }]
      });
    });

    return Array.from(grouped.values());
  }, [entries]);

  const toggleCollapse = (id: string) => {
    setExpandedEntries(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const togglePeriodCollapse = (periodKey: string) => {
    setCollapsedPeriods(prev => ({ ...prev, [periodKey]: !prev[periodKey] }));
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
          const debe = parseImportedAmount(row.DEBE);
          const haber = parseImportedAmount(row.HABER);
          
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
                groupedEntriesByPeriod.map((periodGroup) => {
                  const isPeriodCollapsed = !!collapsedPeriods[periodGroup.periodKey];
                  return (
                    <React.Fragment key={periodGroup.periodKey}>
                      <tr
                        className="bg-indigo-500/10 border-y border-indigo-500/20 cursor-pointer hover:bg-indigo-500/15 transition-colors"
                        onClick={() => togglePeriodCollapse(periodGroup.periodKey)}
                      >
                        <td colSpan={8} className="px-4 md:px-6 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 md:gap-3">
                              {isPeriodCollapsed ? (
                                <ChevronRight className="w-4 h-4 text-indigo-300" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-indigo-300" />
                              )}
                              <span className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-indigo-200">
                                Periodo {periodGroup.periodLabel}
                              </span>
                            </div>
                            <span className="text-[10px] md:text-[11px] text-indigo-300/90 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/20">
                              {periodGroup.items.length} Asientos
                            </span>
                          </div>
                        </td>
                      </tr>

                      {!isPeriodCollapsed && periodGroup.items.map(({ entry, globalIndex }) => {
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
                              <td className="px-2 md:px-6 py-4 font-mono text-[10px] md:text-xs text-indigo-400/70">{globalIndex + 1}</td>
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
                                      disabled={globalIndex === 0}
                                      className="p-0.5 text-slate-500 hover:text-indigo-400 disabled:opacity-20"
                                    >
                                      <ChevronUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); onMove(entry.id, 'down'); }}
                                      disabled={globalIndex === entries.length - 1}
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
                      })}
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

export function SearchableAccountSelect({ 
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

export function JournalEntryForm({ 
  accounts, 
  appMode,
  onAdd, 
  initialData, 
  onCancel 
}: { 
  accounts: Account[], 
  appMode: AppMode,
  onAdd: (e: Omit<JournalEntry, 'id'>) => void,
  initialData?: JournalEntry,
  onCancel?: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [policyType, setPolicyType] = useState<'diario' | 'ingreso' | 'egreso'>('diario');
  const [movements, setMovements] = useState<Movement[]>([
    { accountId: accounts[0].id, type: 'debit', amount: 0 },
    { accountId: accounts[1].id, type: 'credit', amount: 0 }
  ]);
  const [amountInputs, setAmountInputs] = useState<string[]>(['', '']);
  const [cfdiDiscrepancy, setCfdiDiscrepancy] = useState<{
    idx: number;
    xmlTotal: number;
    currentTotal: number;
    uuid: string;
    rfc: string;
  } | null>(null);
  const [cfdiError, setCfdiError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setDate(initialData.date);
      setDescription(initialData.description);
      setPolicyType(initialData.policyType ?? 'diario');
      setMovements(initialData.movements);
      setAmountInputs(initialData.movements.map(m => formatAmountForInput(m.amount)));
    }
  }, [initialData]);

  const totalDebit = normalizeAmount(movements.filter(m => m.type === 'debit').reduce((sum, m) => sum + m.amount, 0));
  const totalCredit = normalizeAmount(movements.filter(m => m.type === 'credit').reduce((sum, m) => sum + m.amount, 0));
  const isOutOfBalance = Math.abs(totalDebit - totalCredit) > 0.01 || (totalDebit === 0 && totalCredit === 0);

  const handleCFDIUpload = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCfdiError(null);

    try {
      const text = await file.text();
      const uuid = text.match(/<(?:tfd:)?TimbreFiscalDigital\b[^>]*\bUUID="([^"]+)"/i)?.[1] || '';
      const emisorRfc = text.match(/<(?:cfdi:)?Emisor\b[^>]*\bRfc="([^"]+)"/i)?.[1] || '';
      const receptorRfc = text.match(/<(?:cfdi:)?Receptor\b[^>]*\bRfc="([^"]+)"/i)?.[1] || '';
      const totalStr = text.match(/<(?:cfdi:)?Comprobante\b[^>]*\bTotal="([^"]+)"/i)?.[1];
      const xmlTotal = totalStr ? parseFloat(totalStr) : 0;

      const rfc = policyType === 'ingreso' ? receptorRfc : emisorRfc;
      if (!uuid || !rfc || Number.isNaN(xmlTotal)) {
        throw new Error('No se pudo extraer UUID, RFC o Total válidos del XML CFDI.');
      }

      const currentTotal = movements[idx].amount;
      const isCurrentZero = Math.abs(currentTotal) <= 0.01;
      const matchesXml = Math.abs(currentTotal - xmlTotal) <= 0.01;

      if (isCurrentZero) {
        updateMovement(idx, { uuidCFDI: uuid, rfcTercero: rfc, amount: xmlTotal });
        const newInputs = [...amountInputs];
        newInputs[idx] = formatAmountForInput(xmlTotal);
        setAmountInputs(newInputs);
      } else if (matchesXml) {
        updateMovement(idx, { uuidCFDI: uuid, rfcTercero: rfc });
      } else {
        setCfdiDiscrepancy({ idx, xmlTotal, currentTotal, uuid, rfc });
      }
    } catch (error) {
      console.error('Error leyendo CFDI:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
      setCfdiError(`No se pudo leer el CFDI XML: ${errorMessage}`);
    }

    e.target.value = '';
  };

  const resolveDiscrepancy = (useXmlAmount: boolean) => {
    if (!cfdiDiscrepancy) return;
    const { idx, xmlTotal, uuid, rfc } = cfdiDiscrepancy;

    if (useXmlAmount) {
      updateMovement(idx, { uuidCFDI: uuid, rfcTercero: rfc, amount: xmlTotal });
      const newInputs = [...amountInputs];
      newInputs[idx] = formatAmountForInput(xmlTotal);
      setAmountInputs(newInputs);
    } else {
      updateMovement(idx, { uuidCFDI: uuid, rfcTercero: rfc });
    }
    setCfdiDiscrepancy(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isOutOfBalance) return;
    onAdd({
      date,
      description,
      movements: movements.filter(m => m.amount > 0),
      policyType: appMode === 'fiscal' ? policyType : initialData?.policyType
    });
  };

  const addMovement = () => {
    setMovements([...movements, { accountId: accounts[0].id, type: 'debit', amount: 0 }]);
    setAmountInputs([...amountInputs, '']);
  };
  const removeMovement = (idx: number) => {
    setMovements(movements.filter((_, i) => i !== idx));
    setAmountInputs(amountInputs.filter((_, i) => i !== idx));
  };

  const updateMovement = (idx: number, updates: Partial<Movement>) => {
    setMovements(movements.map((m, i) => {
      if (i !== idx) return m;
      const next = { ...m, ...updates };
      if (typeof updates.amount === 'number') {
        next.amount = normalizeAmount(updates.amount);
      }
      return next;
    }));
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
        {appMode === 'fiscal' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tipo de Póliza</label>
            <select
              value={policyType}
              onChange={e => setPolicyType(e.target.value as 'diario' | 'ingreso' | 'egreso')}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white appearance-none"
            >
              <option value="diario" className="bg-[#1e293b]">Diario</option>
              <option value="ingreso" className="bg-[#1e293b]">Ingreso</option>
              <option value="egreso" className="bg-[#1e293b]">Egreso</option>
            </select>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <AnimatePresence>
          {cfdiError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center gap-2 text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{cfdiError}</span>
            </motion.div>
          )}
        </AnimatePresence>
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
                setAmountInputs([...amountInputs, ...Array(count).fill('')]);
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
                  type="text" 
                  inputMode="decimal"
                  aria-label={`Monto de movimiento ${idx + 1}`}
                  required
                  value={amountInputs[idx] || ''} 
                  onChange={e => {
                    const formattedValue = formatAmountInput(e.target.value);
                    const numericValue = parseFormattedAmount(formattedValue);
                    setAmountInputs(amountInputs.map((val, i) => i === idx ? formattedValue : val));
                    updateMovement(idx, { amount: numericValue });
                  }}
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
            {appMode === 'fiscal' && (
              <>
                <div className="col-span-12 md:col-span-6 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[9px] uppercase font-bold text-slate-500">UUID CFDI</label>
                    <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 cursor-pointer transition-colors text-[10px] font-semibold uppercase tracking-wide">
                      <FileScan className="w-3.5 h-3.5" />
                      Leer XML
                      <input
                        type="file"
                        accept=".xml,text/xml,application/xml"
                        onChange={(e) => handleCFDIUpload(idx, e)}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    maxLength={36}
                    placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                    value={m.uuidCFDI || ''}
                    onChange={e => updateMovement(idx, { uuidCFDI: e.target.value })}
                    onBlur={e => updateMovement(idx, { uuidCFDI: e.target.value.trim() })}
                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none text-white placeholder-slate-600"
                  />
                </div>
                <div className="col-span-12 md:col-span-6 space-y-1">
                  <label className="text-[9px] uppercase font-bold text-slate-500">RFC Tercero</label>
                  <input
                    type="text"
                    maxLength={13}
                    placeholder="XAXX010101000"
                    value={m.rfcTercero || ''}
                    onChange={e => updateMovement(idx, { rfcTercero: e.target.value })}
                    onBlur={e => updateMovement(idx, { rfcTercero: e.target.value.toUpperCase().trim() })}
                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none text-white placeholder-slate-600"
                  />
                </div>
              </>
            )}
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
      <AnimatePresence>
        {cfdiDiscrepancy && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-slate-900 border border-amber-500/30 p-6 rounded-2xl shadow-2xl max-w-sm w-full"
            >
              <div className="flex items-center gap-3 text-amber-400 mb-4">
                <AlertCircle className="w-6 h-6" />
                <h3 className="text-lg font-semibold">Discrepancia detectada</h3>
              </div>
              <p className="text-sm text-slate-300 mb-6 leading-relaxed">
                El XML tiene un total de{' '}
                <span className="font-mono text-emerald-400 font-bold">{formatCurrency(cfdiDiscrepancy.xmlTotal)}</span>, pero la partida tiene{' '}
                <span className="font-mono text-rose-400 font-bold">{formatCurrency(cfdiDiscrepancy.currentTotal)}</span>.
                <br />
                <br />
                ¿Qué monto deseas conservar?
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => resolveDiscrepancy(true)}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors text-sm shadow-lg shadow-emerald-500/20"
                >
                  Usar monto del XML
                </button>
                <button
                  type="button"
                  onClick={() => resolveDiscrepancy(false)}
                  className="w-full py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-medium transition-colors text-sm"
                >
                  Conservar actual
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </form>
  );
}

// 2. T-Accounts View
