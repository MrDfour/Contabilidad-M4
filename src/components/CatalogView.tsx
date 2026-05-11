import React, { useEffect, useState } from 'react';
import { Check, Edit2, Trash2, X } from 'lucide-react';
import type { Account } from '../types';
import { formatSatGroupCode } from '../lib/utils';

type AppMode = 'basic' | 'fiscal';
type FiscalAccount = Account & { satGroupCode?: string };
type ModalInfo = { type: 'success' | 'error'; title: string; message: string } | null;

export function CatalogView({ accounts, appMode }: { accounts: FiscalAccount[]; appMode: AppMode }) {
  const [localAccounts, setLocalAccounts] = useState<FiscalAccount[]>(accounts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [modalInfo, setModalInfo] = useState<ModalInfo>(null);

  useEffect(() => {
    setLocalAccounts(accounts);
  }, [accounts]);

  const typeLabels: Record<Account['type'], string> = {
    asset: 'Activo',
    liability: 'Pasivo',
    equity: 'Capital',
    revenue: 'Ingreso',
    expense: 'Gasto'
  };

  const handleSaveEdit = (id: string) => {
    if (!editName.trim() || !editCode.trim()) {
      setModalInfo({ type: 'error', title: 'Campos vacíos', message: 'El nombre y el código no pueden estar vacíos.' });
      return;
    }

    if (localAccounts.some(a => a.code === editCode.trim() && a.id !== id)) {
      setModalInfo({ type: 'error', title: 'Código duplicado', message: 'Ese código ya está asignado a otra cuenta.' });
      return;
    }

    setLocalAccounts(prev => prev.map(a => a.id === id ? { ...a, name: editName.trim(), code: editCode.trim() } : a));
    setEditingId(null);
    setModalInfo({ type: 'success', title: 'Cuenta Actualizada', message: 'Los cambios se han guardado correctamente.' });
  };

  const handleStartEdit = (account: FiscalAccount) => {
    setEditingId(account.id);
    setEditName(account.name);
    setEditCode(account.code);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditCode('');
  };

  const handleDeleteAccount = (id: string) => {
    setLocalAccounts(prev => prev.filter(account => account.id !== id));
    if (editingId === id) handleCancelEdit();
    setModalInfo({ type: 'success', title: 'Cuenta eliminada', message: 'La subcuenta se eliminó correctamente.' });
  };

  return (
    <section className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
        <h2 className="text-2xl font-bold text-white">Catálogo de Cuentas</h2>
        <p className="text-slate-400 text-sm mt-1">Consulta de cuentas disponibles en el sistema.</p>
      </div>
      {modalInfo && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${modalInfo.type === 'error' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
          <p className="font-semibold">{modalInfo.title}</p>
          <p>{modalInfo.message}</p>
        </div>
      )}
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
                <th className="px-4 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {localAccounts.map(account => (
                <tr key={account.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-indigo-300">
                    {editingId === account.id ? (
                      <input
                        value={editCode}
                        onChange={e => setEditCode(e.target.value)}
                        className="w-full rounded-md border border-white/15 bg-slate-900/50 px-2 py-1 text-indigo-200 outline-none focus:border-indigo-400"
                      />
                    ) : (
                      account.code
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-200">
                    {editingId === account.id ? (
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full rounded-md border border-white/15 bg-slate-900/50 px-2 py-1 text-slate-100 outline-none focus:border-indigo-400"
                      />
                    ) : (
                      account.name
                    )}
                  </td>
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
                  <td className="px-4 py-3">
                    {account.isReadOnly ? (
                      <span className="text-slate-500">—</span>
                    ) : editingId === account.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveEdit(account.id)}
                          className="inline-flex items-center justify-center rounded-md border border-emerald-400/40 bg-emerald-500/10 p-1.5 text-emerald-300 transition hover:bg-emerald-500/20"
                          title="Guardar"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="inline-flex items-center justify-center rounded-md border border-rose-400/40 bg-rose-500/10 p-1.5 text-rose-300 transition hover:bg-rose-500/20"
                          title="Cancelar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStartEdit(account)}
                          className="inline-flex items-center justify-center rounded-md border border-indigo-400/40 bg-indigo-500/10 p-1.5 text-indigo-300 transition hover:bg-indigo-500/20"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(account.id)}
                          className="inline-flex items-center justify-center rounded-md border border-rose-400/40 bg-rose-500/10 p-1.5 text-rose-300 transition hover:bg-rose-500/20"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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
