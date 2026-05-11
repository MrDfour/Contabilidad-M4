import React from 'react';
import { FileText, Download, ChevronRight } from 'lucide-react';
import type { Account } from '../types';
import { cn, formatCurrency, exportTAccountsStyleToExcel, exportToPDF } from '../lib/utils';

const normalizeAmount = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export function TAccountsView({ tAccountsData, accounts, journalName }: { 
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
          <p className="text-slate-400 text-xs md:text-sm mt-1">Representación visual del flujo de cada cuenta referenciada al diario.</p>
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
            const totalD = normalizeAmount(typedData.debits.reduce((s, d) => s + d.amount, 0));
            const totalC = normalizeAmount(typedData.credits.reduce((s, c) => s + c.amount, 0));
            const balanceSide = (acc?.type === 'asset' || acc?.type === 'expense') ? 'left' : 'right';
            const balance = normalizeAmount(balanceSide === 'left' ? totalD - totalC : totalC - totalD);

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
