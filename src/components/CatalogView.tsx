import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import type { Account, JournalEntry } from '../types';
import { formatSatGroupCode } from '../lib/utils';

type AppMode = 'basic' | 'fiscal';

export function CatalogView({ 
  accounts, 
  setAccounts, 
  entries, 
  appMode, 
  onSetModal 
}: { 
  accounts: Account[], 
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>, 
  entries: JournalEntry[], 
  appMode: AppMode, 
  onSetModal: (info: any) => void 
}) {
  // Estados para Creación
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  // Estados para Edición
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');

  const parentAccounts = accounts.filter(a => !a.parentId);

  // Auto-generar código secuencial cuando se selecciona un padre
  React.useEffect(() => {
    if (parentId) {
      const parent = accounts.find(a => a.id === parentId);
      if (parent) {
        const children = accounts.filter(a => a.parentId === parentId);
        let maxSuffix = 0;
        children.forEach(c => {
          if (!c.code.startsWith(`${parent.code}.`)) {
            return;
          }
          const parts = c.code.split('.');
          if (parts.length > 1) {
            const suffix = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(suffix) && suffix > maxSuffix) {
              maxSuffix = suffix;
            }
          }
        });
        const nextSuffix = (maxSuffix + 1).toString().padStart(2, '0');
        setCode(`${parent.code}.${nextSuffix}`);
      }
    } else {
      setCode('');
    }
  }, [parentId, accounts]);

  // --- LÓGICA DE CREACIÓN ---
  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const parent = accounts.find(a => a.id === parentId);
    if (!parent) {
      onSetModal({ type: 'error', title: 'Error', message: 'Debes seleccionar una Cuenta Padre.' });
      return;
    }
    if (!name.trim() || !code.trim()) {
      onSetModal({ type: 'error', title: 'Error', message: 'El nombre y el código son obligatorios.' });
      return;
    }
    if (accounts.some(a => a.code === code.trim())) {
      onSetModal({ type: 'error', title: 'Código duplicado', message: 'Ese código de cuenta ya existe.' });
      return;
    }

    const newAccount: Account = {
      id: crypto.randomUUID(),
      code: code.trim(),
      name: name.trim(),
      type: parent.type,
      subtype: parent.subtype,
      satGroupCode: parent.satGroupCode,
      parentId: parent.id,
      isReadOnly: false
    };

    setAccounts(prev => [...prev, newAccount]);
    setName('');
    setCode('');
    setParentId('');
    onSetModal({ type: 'success', 
    title: 'Subcuenta Creada', 
    message: `La cuenta "${newAccount.name}" ha heredado las propiedades de "${parent.name}".` });
  };

  // --- LÓGICA DE EDICIÓN ---
  const handleStartEdit = (account: Account) => {
    setEditingId(account.id);
    setEditName(account.name);
    setEditCode(account.code);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditCode('');
  };

  const handleSaveEdit = (id: string) => {
    if (!editName.trim() || !editCode.trim()) {
      onSetModal({ type: 'error', title: 'Campos vacíos', message: 'El nombre y el código no pueden estar vacíos.' });
      return;
    }
    if (accounts.some(a => a.code === editCode.trim() && a.id !== id)) {
      onSetModal({ type: 'error', title: 'Código duplicado', message: 'Ese código ya está asignado a otra cuenta.' });
      return;
    }

    setAccounts(prev => prev.map(a => a.id === id ? { ...a, name: editName.trim(), code: editCode.trim() } : a));
    setEditingId(null);
    onSetModal({ type: 'success', title: 'Cuenta Actualizada', message: 'Los cambios se han guardado correctamente.' });
  };

  // --- LÓGICA DE BORRADO ---
  const handleDelete = (id: string) => {
    const isUsed = entries.some(entry => entry.movements.some(m => m.accountId === id));
    if (isUsed) {
      onSetModal({ type: 'error', title: 'Acción bloqueada', message: 'No puedes eliminar una cuenta que ya tiene movimientos en el Libro Diario.' });
      return;
    }
    setAccounts(prev => prev.filter(a => a.id !== id));
    onSetModal({ type: 'success', title: 'Cuenta eliminada', message: 'La subcuenta ha sido eliminada del catálogo.' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">Catálogo de Cuentas</h2>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Gestiona las cuentas y subcuentas de tu empresa.</p>
        </div>
      </div>

      <form onSubmit={handleAddAccount} className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl shadow-2xl space-y-4">
        <h3 className="text-base font-semibold text-indigo-300">Crear Subcuenta (Heredada)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500">Cuenta Padre (Obligatorio)</label>
            <select required value={parentId} onChange={e => setParentId(e.target.value)} className="w-full bg-[#1e293b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              <option value="">-- Selecciona Cuenta Mayor --</option>
              {parentAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} - {a.name} ({a.type})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500">Código Interno</label>
            <input readOnly type="text" value={code} placeholder="Ej: 1102.01" className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-400 placeholder-slate-600 focus:outline-none focus:ring-0 font-mono cursor-not-allowed" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500">Nombre de Subcuenta</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Banorte Cta 1234" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium">
            <Plus className="w-4 h-4" /> Crear Cuenta
          </button>
        </div>
      </form>

      <div className="bg-white/5 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-6 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Código</th>
              <th className="px-6 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Nombre</th>
              <th className="px-6 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Naturaleza</th>
              {appMode === 'fiscal' && <th className="px-6 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Cód. SAT</th>}
              <th className="px-6 py-3 text-right font-semibold text-slate-400 uppercase tracking-wider text-[10px]">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {parentAccounts.map(parent => (
              <React.Fragment key={parent.id}>
                <tr className="bg-white/[0.02] hover:bg-white/5 transition-colors">
                  <td className="px-6 py-3 font-mono text-xs text-indigo-300 font-bold">{parent.code}</td>
                  <td className="px-6 py-3 text-slate-200 font-bold">{parent.name}</td>
                  <td className="px-6 py-3 text-xs text-slate-400 uppercase">{parent.type} {parent.subtype ? `(${parent.subtype})` : ''}</td>
                  {appMode === 'fiscal' && <td className="px-6 py-3 font-mono text-xs text-slate-500">{formatSatGroupCode(parent.satGroupCode || '')}</td>}
                  <td className="px-6 py-3 text-right">
                    <span className="text-[9px] text-slate-600 uppercase font-bold tracking-wider px-2 py-1 rounded bg-black/20">Protegida</span>
                  </td>
                </tr>
                {accounts.filter(a => a.parentId === parent.id).map(child => (
                  <tr key={child.id} className="hover:bg-white/5 transition-colors border-l-2 border-indigo-500/30">
                    <td className="px-6 py-3 font-mono text-xs text-slate-400 pl-10">
                      {editingId === child.id ? (
                        <input className="w-24 bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-400" value={editCode} onChange={e => setEditCode(e.target.value)} aria-label="Editar código" />
                      ) : (
                        child.code
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-300 pl-10">
                      {editingId === child.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">↳</span>
                          <input className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-400" value={editName} onChange={e => setEditName(e.target.value)} aria-label="Editar nombre" />
                        </div>
                      ) : (
                        <span>↳ {child.name}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500 uppercase">{child.type}</td>
                    {appMode === 'fiscal' && <td className="px-6 py-3 font-mono text-xs text-slate-600">{formatSatGroupCode(child.satGroupCode || '')}</td>}
                    <td className="px-6 py-3 text-right">
                      {!child.isReadOnly && (
                        <div className="flex items-center justify-end gap-2">
                          {editingId === child.id ? (
                            <>
                              <button onClick={() => handleSaveEdit(child.id)} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all" title="Guardar">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={handleCancelEdit} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all" title="Cancelar">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => handleStartEdit(child)} className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all" title="Editar">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(child.id)} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all" title="Eliminar">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
