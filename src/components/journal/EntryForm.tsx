/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, FileScan, Plus, Trash2 } from 'lucide-react';
import type { Account, JournalEntry, Movement } from '../../types';
import { cn } from '../../lib/utils';
import {
  formatCurrency,
  normalizeAmount,
  parseFormattedAmount,
  formatAmountForInput,
  formatAmountInput
} from '../../lib/format';
import type { AppMode } from '../../lib/navigation';
import { SearchableAccountSelect } from './AccountPicker';

/**
 * Formulario de asiento (Fase 4: extraído de JournalView.tsx).
 * Valida partida doble en vivo y, en modo fiscal, permite leer el UUID/RFC/Total
 * desde un XML CFDI por movimiento (incluida la resolución de discrepancias).
 */
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
