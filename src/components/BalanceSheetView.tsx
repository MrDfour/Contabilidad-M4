import React from 'react';
import { FileText, Download } from 'lucide-react';
import type { Account } from '../types';
import { cn, formatCurrency, exportToExcel, exportToPDF, formatSatGroupCode } from '../lib/utils';

type AppMode = 'basic' | 'fiscal';
type FiscalAccount = Account & { satGroupCode?: string };
const FISCAL_BALANCE_ACCOUNT_IDS = new Set(['anc-13', 'anc-14', 'anc-15', 'anc-16', 'anc-17', 're-12', 're-13']);
const getSatGroupCode = (account: FiscalAccount) => account.satGroupCode;

export function BalanceSheetView({ accountBalances, accounts, journalName, finalInventory, appMode }: { accountBalances: Record<string, number>, accounts: FiscalAccount[], journalName: string, finalInventory: number, appMode: AppMode }) {
  const visibleAccounts = accounts.filter(a => {
    if (!accountBalances[a.id]) return false;
    if (appMode === 'basic' && FISCAL_BALANCE_ACCOUNT_IDS.has(a.id)) return false;
    return true;
  });

  const assetsAccounts = visibleAccounts.filter(a => a.type === 'asset');

  const liabilityAccounts = visibleAccounts.filter(a => a.type === 'liability');
  const equityAccounts = visibleAccounts.filter(a => a.type === 'equity');
  
  const revenueAccounts = visibleAccounts.filter(a => a.type === 'revenue');
  const expenseAccounts = visibleAccounts.filter(a => a.type === 'expense');
  const netIncome = revenueAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0) - 
                    expenseAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0) + finalInventory;

  const totalAssets = assetsAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0) + finalInventory;
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
  const totalEquity = equityAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0) + netIncome;

  const handleExportPDF = async () => {
    await exportToPDF('balance-sheet-canvas', `Balance_General_${journalName}`, 'Balance General', journalName);
  };

  const handleExportExcel = async () => {
    const data = [
      { Sección: 'ACTIVOS', Concepto: '', Monto: '' },
      ...assetsAccounts.map(a => ({ Sección: 'Activo', Concepto: a.name, Monto: accountBalances[a.id] })),
      ...(finalInventory > 0 ? [{ Sección: 'Activo', Concepto: 'Inventario Final (Almacén)', Monto: finalInventory }] : []),
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

  const groupedAssets = {
    circulante: assetsAccounts.filter(a => a.subtype === 'circulante'),
    noCirculante: assetsAccounts.filter(a => a.subtype === 'no_circulante'),
    unclassified: assetsAccounts.filter(a => !a.subtype),
  };

  const groupedLiabilities = {
    circulante: liabilityAccounts.filter(a => a.subtype === 'circulante'),
    noCirculante: liabilityAccounts.filter(a => a.subtype === 'no_circulante'),
    unclassified: liabilityAccounts.filter(a => !a.subtype),
  };

  const renderAccountLine = (account: FiscalAccount, textClass: string) => {
    const balance = accountBalances[account.id] || 0;
    return (
      <div key={account.id} className={`flex justify-between items-start text-xs md:text-sm font-mono ${textClass} gap-4`}>
        <span className="break-words py-1">
          {account.name}
          {appMode === 'fiscal' && getSatGroupCode(account) && (
            <span className="ml-2 text-[10px] text-slate-500">({formatSatGroupCode(getSatGroupCode(account) || '')})</span>
          )}
        </span>
        <span className={cn("whitespace-nowrap pt-1", balance < 0 && "text-rose-300")}>
          {balance < 0 ? `(${formatCurrency(Math.abs(balance))})` : formatCurrency(balance)}
        </span>
      </div>
    );
  };

  const renderGroup = (
    title: string,
    groupAccounts: FiscalAccount[],
    emptyText: string,
    textClass: string
  ) => (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">{title}</p>
      {groupAccounts.length === 0 ? (
        <p className="text-xs text-slate-500 italic">{emptyText}</p>
      ) : (
        groupAccounts.map(account => renderAccountLine(account, textClass))
      )}
    </div>
  );

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
              {assetsAccounts.length === 0 && finalInventory === 0 ? (
                <p className="text-xs text-slate-500 italic">Sin activos registrados.</p>
              ) : (
                <>
                  {renderGroup(
                    'Activo Circulante',
                    groupedAssets.circulante,
                    'Sin activo circulante registrado.',
                    'text-slate-300'
                  )}
                  {finalInventory > 0 && (
                    <div className="flex justify-between items-start text-xs md:text-sm font-mono text-slate-300 gap-4">
                      <span className="break-words py-1">Inventario Final (Almacén)</span>
                      <span className="whitespace-nowrap pt-1">{formatCurrency(finalInventory)}</span>
                    </div>
                  )}
                  <div className="pt-2">
                    {renderGroup(
                      'Activo No Circulante',
                      groupedAssets.noCirculante,
                      'Sin activo no circulante registrado.',
                      'text-slate-300'
                    )}
                  </div>
                  {groupedAssets.unclassified.length > 0 && (
                    <>
                      <h5 className="text-[11px] uppercase tracking-wider text-slate-500 pt-2">Sin Clasificación</h5>
                      {groupedAssets.unclassified.map(account => renderAccountLine(account, 'text-slate-300'))}
                    </>
                  )}
                </>
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
                <>
                  {renderGroup(
                    'Pasivo a Corto Plazo / Circulante',
                    groupedLiabilities.circulante,
                    'Sin cuentas circulantes.',
                    'text-slate-400'
                  )}
                  <div className="pt-2">
                    {renderGroup(
                      'Pasivo a Largo Plazo / No Circulante',
                      groupedLiabilities.noCirculante,
                      'Sin cuentas no circulantes.',
                      'text-slate-400'
                    )}
                  </div>
                  {groupedLiabilities.unclassified.length > 0 && (
                    <>
                      <h5 className="text-[11px] uppercase tracking-wider text-slate-500 pt-2">Sin Clasificación</h5>
                      {groupedLiabilities.unclassified.map(account => renderAccountLine(account, 'text-slate-400'))}
                    </>
                  )}
                </>
              )}
              <div className="flex justify-between items-center font-bold text-xs md:text-sm pt-2 border-t border-white/10 font-mono text-white gap-4">
                <span className="break-words">Total Pasivo</span>
                <span className="whitespace-nowrap">{formatCurrency(totalLiabilities)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-sm border-b border-white/20 pb-1 uppercase tracking-wider text-slate-300">Capital Contable</h4>
              {equityAccounts.map(account => renderAccountLine(account, 'text-slate-400'))}
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
