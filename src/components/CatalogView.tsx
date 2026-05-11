import React from 'react';
import type { Account } from '../types';
import { formatSatGroupCode } from '../lib/utils';

type AppMode = 'basic' | 'fiscal';
type FiscalAccount = Account & { satGroupCode?: string };

export function CatalogView({ accounts, appMode }: { accounts: FiscalAccount[]; appMode: AppMode }) {
  const typeLabels: Record<Account['type'], string> = {
    asset: 'Activo',
    liability: 'Pasivo',
    equity: 'Capital',
    revenue: 'Ingreso',
    expense: 'Gasto'
  };

  return (
    <section className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
        <h2 className="text-2xl font-bold text-white">Catálogo de Cuentas</h2>
        <p className="text-slate-400 text-sm mt-1">Consulta de cuentas disponibles en el sistema.</p>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Código</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Cuenta</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Tipo</th>
                {appMode === 'fiscal' && (
                  <th className="px-4 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">SAT</th>
                )}
                <th className="px-4 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {accounts.map(account => (
                <tr key={account.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-indigo-300">{account.code}</td>
                  <td className="px-4 py-3 text-slate-200">{account.name}</td>
                  <td className="px-4 py-3 text-slate-400">{typeLabels[account.type]}</td>
                  {appMode === 'fiscal' && (
                    <td className="px-4 py-3 text-slate-500">{account.satGroupCode ? formatSatGroupCode(account.satGroupCode) : '—'}</td>
                  )}
                  <td className="px-4 py-3">
                    {account.isReadOnly ? (
                      <span className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider bg-slate-700/60 text-slate-200 border border-slate-500/40">
                        Protegida
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Editable
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
