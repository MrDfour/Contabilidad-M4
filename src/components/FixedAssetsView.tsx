import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Account, FixedAsset, JournalEntry, Movement } from '../types';
import { cn, formatCurrency, calculateMonthlyDepreciation, calculateFiscalDeduction } from '../lib/utils';
import { SearchableAccountSelect } from './JournalView';

const normalizeAmount = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

const parseFormattedAmount = (value: string) => {
  const parsed = Number(value.replace(/,/g, ''));
  return normalizeAmount(parsed);
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

export function FixedAssetsView({
  accounts,
  fixedAssets,
  onSetFixedAssets,
  activeJournalId,
  onAdd,
  onSetModal
}: {
  accounts: Account[],
  fixedAssets: FixedAsset[],
  onSetFixedAssets: React.Dispatch<React.SetStateAction<FixedAsset[]>>,
  activeJournalId: string | null,
  onAdd: (e: Omit<JournalEntry, 'id'>) => void,
  onSetModal: (info: { type: 'success' | 'error', title: string, message: string } | null) => void
}) {
  const assetAccounts = useMemo(() => accounts.filter(a => a.type === 'asset'), [accounts]);
  const expenseAccounts = useMemo(() => accounts.filter(a => a.type === 'expense'), [accounts]);

  const [name, setName] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().split('T')[0]);
  const [originalAmountInput, setOriginalAmountInput] = useState('');
  const [fiscalRatePercentInput, setFiscalRatePercentInput] = useState('30');
  const [assetAccountId, setAssetAccountId] = useState(assetAccounts[0]?.id || '');
  const [accumulatedDeprAccountId, setAccumulatedDeprAccountId] = useState(assetAccounts[0]?.id || '');
  const [expenseAccountId, setExpenseAccountId] = useState(expenseAccounts[0]?.id || '');
  const getDefaultDepreciationDate = () => {
    const now = new Date();
    // Día 0 del mes siguiente = último día del mes actual.
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  };
  const getDefaultDepreciationDescription = (dateStr: string) => {
    const [year, month] = dateStr.split('-').map(Number);
    if (!year || !month) return 'Depreciación mensual de activos fijos';
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-MX', { month: 'long' });
    return `Depreciación del mes de ${monthName}`;
  };
  const initialDepreciationDate = getDefaultDepreciationDate();
  const [showDepreciationModal, setShowDepreciationModal] = useState(false);
  const [depreciationDate, setDepreciationDate] = useState(initialDepreciationDate);
  const [depreciationDescription, setDepreciationDescription] = useState(getDefaultDepreciationDescription(initialDepreciationDate));
  const [isDepreciationDescriptionManuallyEdited, setIsDepreciationDescriptionManuallyEdited] = useState(false);
  const [selectedFiscalAssetId, setSelectedFiscalAssetId] = useState('');
  const [inpcUltimoMesMitadPeriodo, setInpcUltimoMesMitadPeriodo] = useState('');
  const [inpcMesAdquisicion, setInpcMesAdquisicion] = useState('');

  useEffect(() => {
    if (!selectedFiscalAssetId && fixedAssets.length > 0) {
      setSelectedFiscalAssetId(fixedAssets[0].id);
    }
  }, [fixedAssets, selectedFiscalAssetId]);

  useEffect(() => {
    if (!isDepreciationDescriptionManuallyEdited) {
      setDepreciationDescription(getDefaultDepreciationDescription(depreciationDate));
    }
  }, [depreciationDate, isDepreciationDescriptionManuallyEdited]);

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    const originalAmount = parseFormattedAmount(originalAmountInput);
    const fiscalRate = normalizeAmount(Number(fiscalRatePercentInput) / 100);
    if (!name.trim() || !acquisitionDate || originalAmount <= 0 || fiscalRate <= 0 || !assetAccountId || !accumulatedDeprAccountId || !expenseAccountId) {
      onSetModal({
        type: 'error',
        title: 'Datos incompletos',
        message: 'Completa todos los campos del activo fijo con valores válidos.'
      });
      return;
    }

    onSetFixedAssets(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        acquisitionDate,
        originalAmount,
        assetAccountId,
        accumulatedDeprAccountId,
        expenseAccountId,
        fiscalRate,
        isDisposed: false
      }
    ]);

    setName('');
    setOriginalAmountInput('');
    setFiscalRatePercentInput('30');
    onSetModal({
      type: 'success',
      title: 'Activo registrado',
      message: 'El activo fijo se registró correctamente.'
    });
  };

  const handleRunMonthlyDepreciation = () => {
    if (!activeJournalId) {
      onSetModal({
        type: 'error',
        title: 'Sin diario activo',
        message: 'Selecciona un libro diario antes de ejecutar la depreciación.'
      });
      return;
    }

    const activeAssets = fixedAssets.filter(a => !a.isDisposed);
    if (activeAssets.length === 0) {
      onSetModal({
        type: 'error',
        title: 'Sin activos disponibles',
        message: 'No hay activos en operación para depreciar.'
      });
      return;
    }

    // Tratamiento contable NIF C-6: cargo al gasto por depreciación y abono a depreciación acumulada.
    const assetsWithMovement = activeAssets.filter(asset => normalizeAmount(calculateMonthlyDepreciation(asset)) > 0);
    const movements: Movement[] = assetsWithMovement.flatMap(asset => {
      const monthlyAmount = normalizeAmount(calculateMonthlyDepreciation(asset));
      return monthlyAmount > 0 ? [
        { accountId: asset.expenseAccountId, type: 'debit' as const, amount: monthlyAmount },
        { accountId: asset.accumulatedDeprAccountId, type: 'credit' as const, amount: monthlyAmount }
      ] : [];
    });

    if (movements.length === 0) {
      onSetModal({
        type: 'error',
        title: 'Sin montos por depreciar',
        message: 'No se generaron movimientos de depreciación con los activos actuales.'
      });
      return;
    }

    onAdd({
      date: depreciationDate,
      description: depreciationDescription.trim() || 'Depreciación mensual de activos fijos',
      movements
    });

    setShowDepreciationModal(false);
    onSetModal({
      type: 'success',
      title: 'Depreciación aplicada',
      message: `Se registró un asiento con ${assetsWithMovement.length} ${assetsWithMovement.length === 1 ? 'activo depreciado' : 'activos depreciados'}.`
    });
  };

  const selectedFiscalAsset = fixedAssets.find(a => a.id === selectedFiscalAssetId);
  const updatedDeduction = selectedFiscalAsset && Number(inpcUltimoMesMitadPeriodo) > 0 && Number(inpcMesAdquisicion) > 0
    // Tratamiento fiscal Art. 31 LISR: deducción de inversiones actualizada por factor INPC truncado.
    ? calculateFiscalDeduction(selectedFiscalAsset, Number(inpcUltimoMesMitadPeriodo), Number(inpcMesAdquisicion))
    : null;

  return (
    <div className="space-y-6">
      <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">Activos Fijos</h2>
            <p className="text-slate-400 text-xs md:text-sm mt-1">Control de MOI, depreciación mensual y deterioro.</p>
          </div>
          <button
            onClick={() => setShowDepreciationModal(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium"
          >
            <Monitor className="w-4 h-4" />
            Ejecutar Depreciación Mensual
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left py-2 font-semibold">Activo</th>
                <th className="text-left py-2 font-semibold">Fecha</th>
                <th className="text-right py-2 font-semibold" title="Monto Original de la Inversión">MOI</th>
                <th className="text-right py-2 font-semibold" title="Tasa fiscal anual">Tasa</th>
                <th className="text-right py-2 font-semibold">Estado</th>
                <th className="text-right py-2 font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody>
              {fixedAssets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500 italic">Sin activos registrados.</td>
                </tr>
              ) : (
                fixedAssets.map(asset => (
                  <tr key={asset.id} className="border-b border-white/5 last:border-b-0">
                    <td className="py-3">{asset.name}</td>
                    <td className="py-3 font-mono text-slate-300">{asset.acquisitionDate}</td>
                    <td className="py-3 text-right font-mono text-slate-200">{formatCurrency(asset.originalAmount)}</td>
                    <td className="py-3 text-right font-mono text-slate-300">{(asset.fiscalRate * 100).toFixed(2)}%</td>
                    <td className={cn("py-3 text-right", asset.isDisposed ? "text-rose-300" : "text-emerald-300")}>
                      {asset.isDisposed ? 'Dado de baja' : 'En operación'}
                    </td>
                    <td className="py-3 text-right">
                      {asset.isDisposed ? (
                        <button
                          onClick={() => onSetFixedAssets(prev => prev.filter(a => a.id !== asset.id))}
                          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300"
                        >
                          Eliminar
                        </button>
                      ) : (
                        <button
                          onClick={() => onSetFixedAssets(prev => prev.map(a => a.id === asset.id ? { ...a, isDisposed: true } : a))}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-300"
                        >
                          Dar de baja
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={handleAddAsset} className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-indigo-300">Registrar Activo Fijo</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nombre del Activo</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Equipo de cómputo Dell"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha de Adquisición</label>
            <input
              type="date"
              value={acquisitionDate}
              onChange={e => setAcquisitionDate(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">MOI</label>
            <input
              type="text"
              inputMode="decimal"
              value={originalAmountInput}
              onChange={e => setOriginalAmountInput(formatAmountInput(e.target.value))}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tasa Fiscal Anual (%)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={fiscalRatePercentInput}
              onChange={e => setFiscalRatePercentInput(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cuenta de Activo</label>
            <SearchableAccountSelect accounts={assetAccounts} value={assetAccountId} onChange={setAssetAccountId} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Depreciación Acumulada</label>
            <SearchableAccountSelect accounts={assetAccounts} value={accumulatedDeprAccountId} onChange={setAccumulatedDeprAccountId} />
          </div>
          <div className="space-y-1 md:col-span-2 lg:col-span-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cuenta de Gasto</label>
            <SearchableAccountSelect accounts={expenseAccounts} value={expenseAccountId} onChange={setExpenseAccountId} />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Guardar Activo
          </button>
        </div>
      </form>

      <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl shadow-2xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-indigo-300">Cálculo Fiscal (INPC)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Activo</label>
            <select
              value={selectedFiscalAssetId}
              onChange={e => setSelectedFiscalAssetId(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none"
            >
              <option value="" className="bg-[#1e293b]">Selecciona un activo</option>
              {fixedAssets.map(asset => (
                <option key={asset.id} value={asset.id} className="bg-[#1e293b]">{asset.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">INPC Mes Adquisición</label>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={inpcMesAdquisicion}
              onChange={e => setInpcMesAdquisicion(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">INPC Último Mes 1ra Mitad</label>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={inpcUltimoMesMitadPeriodo}
              onChange={e => setInpcUltimoMesMitadPeriodo(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white font-mono"
            />
          </div>
        </div>
        <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Deducción de Inversiones Actualizada</span>
          <span className="text-lg font-mono text-emerald-300">
            {updatedDeduction === null ? '—' : formatCurrency(updatedDeduction)}
          </span>
        </div>
      </div>

      <AnimatePresence>
        {showDepreciationModal && (
          <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4"
            >
              <h4 className="text-lg font-semibold text-white">Ejecutar Depreciación Mensual</h4>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha de Asiento</label>
                <input
                  type="date"
                  value={depreciationDate}
                  onChange={e => setDepreciationDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Descripción</label>
                <input
                  type="text"
                  value={depreciationDescription}
                  onChange={e => {
                    setDepreciationDescription(e.target.value);
                    setIsDepreciationDescriptionManuallyEdited(true);
                  }}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-600"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowDepreciationModal(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRunMonthlyDepreciation}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20"
                >
                  Registrar Asiento
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
