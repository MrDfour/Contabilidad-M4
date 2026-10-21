/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ChangeEvent, type FormEvent, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, FileScan, Plus, Trash2, X } from 'lucide-react';
import type { Account, Poliza, PartidaPoliza, TipoPoliza } from '../../types';
import type { PolizaInput } from '../../hooks/usePolizas';
import type { AppMode } from '../../lib/navigation';
import {
  formatCurrency,
  normalizeAmount,
  parseFormattedAmount,
  formatAmountForInput,
  formatAmountInput
} from '../../lib/format';
import { validatePolizaBalance } from '../../lib/accounting';
import { SearchableAccountSelect } from '../account/AccountPicker';

/**
 * Modal de captura de pólizas (Fase 3 de PLAN_POLIZAS.md).
 *
 * Valida la partida doble EN VIVO (Debe == Haber) y bloquea el guardado si no
 * cuadra o hay menos de 2 partidas con monto. El tipo de póliza queda CONGELADO
 * al editar (D-8: cambiarlo invalidaría el folio). En modo fiscal permite leer
 * UUID/RFC/Total desde un XML CFDI por partida (con resolución de discrepancias,
 * patrón de EntryForm).
 *
 * El folio y los totales los asigna el hook (usePolizas): aquí solo se compone
 * el `PolizaInput`.
 */

interface DraftPartida {
  uid: string;
  id?: string; // id final de PartidaPoliza (preservado al editar)
  accountId: string;
  side: 'debit' | 'credit';
  amount: number;
  concept: string;
  uuidCFDI?: string;
  rfcTercero?: string;
}

const nuevaFila = (accountId: string, side: 'debit' | 'credit'): DraftPartida => ({
  uid: crypto.randomUUID(),
  accountId,
  side,
  amount: 0,
  concept: ''
});

export function PolizaForm({
  accounts,
  appMode,
  initialData,
  onSave,
  onCancel
}: {
  accounts: Account[],
  appMode: AppMode,
  /** Presente SOLO en edición: bloquea el tipo (D-8) y precarga todos los campos. */
  initialData?: Poliza,
  onSave: (data: PolizaInput) => void,
  onCancel: () => void
}) {
  const [tipo, setTipo] = useState<TipoPoliza>(initialData?.tipo ?? 'diario');
  const [fecha, setFecha] = useState(initialData?.fecha ?? new Date().toISOString().split('T')[0]);
  const [concepto, setConcepto] = useState(initialData?.concepto ?? '');
  const [elaboro, setElaboro] = useState(initialData?.elaboro ?? '');
  const [autorizo, setAutorizo] = useState(initialData?.autorizo ?? '');
  const [rows, setRows] = useState<DraftPartida[]>(
    initialData
      ? initialData.partidas.map(p => ({
          uid: crypto.randomUUID(),
          id: p.id,
          accountId: p.accountId,
          side: p.debit > 0 ? 'debit' as const : 'credit' as const,
          amount: p.debit > 0 ? p.debit : p.credit,
          concept: p.concept ?? '',
          uuidCFDI: p.uuidCFDI,
          rfcTercero: p.rfcTercero
        }))
      : [
          nuevaFila(accounts[0].id, 'debit'),
          nuevaFila((accounts[1] ?? accounts[0]).id, 'credit')
        ]
  );
  const [amountInputs, setAmountInputs] = useState<string[]>(
    initialData
      ? initialData.partidas.map(p => formatAmountForInput(p.debit > 0 ? p.debit : p.credit))
      : ['', '']
  );
  const [cfdiDiscrepancia, setCfdiDiscrepancia] = useState<{
    idx: number;
    xmlTotal: number;
    uuid: string;
    rfc: string;
  } | null>(null);
  const [cfdiError, setCfdiError] = useState<string | null>(null);

  // --- Partida doble EN VIVO (D-9) ---
  const partidasFinales = useMemo((): PartidaPoliza[] => {
    return rows
      .filter(r => r.amount > 0)
      .map(r => {
        const cuenta = accounts.find(a => a.id === r.accountId);
        return {
          id: r.id ?? crypto.randomUUID(),
          accountId: r.accountId,
          accountCode: cuenta?.code || '',
          accountName: cuenta?.name || '',
          debit: r.side === 'debit' ? r.amount : 0,
          credit: r.side === 'credit' ? r.amount : 0,
          concept: r.concept || undefined,
          uuidCFDI: r.uuidCFDI || undefined,
          rfcTercero: r.rfcTercero || undefined
        };
      });
  }, [rows, accounts]);

  const balance = useMemo(() => validatePolizaBalance(partidasFinales), [partidasFinales]);
  const isDeshabilitado = !balance.isBalanced || partidasFinales.length < 2;
  // Texto del motivo de bloqueo, con el desbalance priorizado (un solo nodo de texto).
  const motivoDeshabilitado = Math.abs(balance.difference) > 0.01
    ? `Diferencia: ${formatCurrency(Math.abs(balance.difference))}`
    : 'Se requieren al menos 2 partidas con monto';

  // --- Lectura de XML CFDI (modo fiscal) — lógica idéntica a EntryForm ---
  const updateRow = (idx: number, updates: Partial<DraftPartida>) => {
    setRows(rows.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, ...updates };
      if (typeof updates.amount === 'number') {
        next.amount = normalizeAmount(updates.amount);
      }
      return next;
    }));
  };

  const handleCFDIUpload = async (idx: number, e: ChangeEvent<HTMLInputElement>) => {
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

      const rfc = tipo === 'ingreso' ? receptorRfc : emisorRfc;
      if (!uuid || !rfc || Number.isNaN(xmlTotal)) {
        throw new Error('No se pudo extraer UUID, RFC o Total válidos del XML CFDI.');
      }

      const currentTotal = rows[idx].amount;
      const isCurrentZero = Math.abs(currentTotal) <= 0.01;
      const matchesXml = Math.abs(currentTotal - xmlTotal) <= 0.01;

      if (isCurrentZero) {
        setAmountWithInput(idx, xmlTotal);
        updateRow(idx, { uuidCFDI: uuid, rfcTercero: rfc });
      } else if (matchesXml) {
        updateRow(idx, { uuidCFDI: uuid, rfcTercero: rfc });
      } else {
        setCfdiDiscrepancia({ idx, xmlTotal, uuid, rfc });
      }
    } catch (error) {
      console.error('Error leyendo CFDI:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido.';
      setCfdiError(`No se pudo leer el CFDI XML: ${errorMessage}`);
    }

    e.target.value = '';
  };

  const setAmountWithInput = (idx: number, numeric: number) => {
    setAmountInputs(amountInputs.map((val, i) => i === idx ? formatAmountForInput(numeric) : val));
    updateRow(idx, { amount: numeric });
  };

  const resolverDiscrepancia = (usarMontoXml: boolean) => {
    if (!cfdiDiscrepancia) return;
    const { idx, xmlTotal, uuid, rfc } = cfdiDiscrepancia;
    if (usarMontoXml) {
      setAmountWithInput(idx, xmlTotal);
      updateRow(idx, { uuidCFDI: uuid, rfcTercero: rfc });
    } else {
      updateRow(idx, { uuidCFDI: uuid, rfcTercero: rfc });
    }
    setCfdiDiscrepancia(null);
  };

  const addRow = () => {
    setRows([...rows, nuevaFila(accounts[0].id, 'debit')]);
    setAmountInputs([...amountInputs, '']);
  };

  const removeRow = (idx: number) => {
    setRows(rows.filter((_, i) => i !== idx));
    setAmountInputs(amountInputs.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isDeshabilitado) return;
    if (!concepto.trim()) return;
    onSave({
      tipo,
      fecha,
      concepto: concepto.trim(),
      partidas: partidasFinales,
      elaboro: elaboro.trim() || undefined,
      autorizo: autorizo.trim() || undefined
    });
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 bg-noche/80 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl my-8"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 className="font-semibold text-white">
            {initialData ? 'Editar Póliza' : 'Nueva Póliza Contable'}
          </h3>
          <button type="button" onClick={onCancel} aria-label="Cerrar formulario"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Datos generales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tipo de Póliza</label>
              <select
                value={tipo}
                disabled={Boolean(initialData)} // D-8: congelado al editar
                onChange={e => setTipo(e.target.value as TipoPoliza)}
                aria-label="Tipo de Póliza"
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white appearance-none disabled:opacity-50"
              >
                <option value="diario" className="bg-slate-800">Diario</option>
                <option value="ingreso" className="bg-slate-800">Ingreso</option>
                <option value="egreso" className="bg-slate-800">Egreso</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fecha</label>
              <input
                type="date"
                required
                aria-label="Fecha de la póliza"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Concepto general</label>
              <input
                type="text"
                required
                placeholder="Ej: Cobro de cliente Factura A-12..."
                value={concepto}
                onChange={e => setConcepto(e.target.value)}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white placeholder-slate-600"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Elaboró</label>
              <input
                type="text"
                aria-label="Elaboró"
                value={elaboro}
                onChange={e => setElaboro(e.target.value)}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Autorizó</label>
              <input
                type="text"
                aria-label="Autorizó"
                value={autorizo}
                onChange={e => setAutorizo(e.target.value)}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white"
              />
            </div>
          </div>

          {/* Partidas */}
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
              <h4 className="font-semibold text-sm text-indigo-300">Partidas</h4>
              <button
                type="button"
                onClick={addRow}
                className="text-xs flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20"
              >
                <Plus className="w-3.5 h-3.5" /> Añadir partida
              </button>
            </div>

            {rows.map((r, idx) => (
              <div key={r.uid} className="grid grid-cols-12 gap-4 items-end animate-in fade-in slide-in-from-left-2 transition-all">
                <div className="col-span-12 md:col-span-3 space-y-1">
                  <label className="text-[9px] uppercase font-bold text-slate-500">Cuenta contable</label>
                  <SearchableAccountSelect
                    accounts={accounts}
                    value={r.accountId}
                    onChange={(newId) => updateRow(idx, { accountId: newId })}
                  />
                </div>
                <div className="col-span-3 md:col-span-2 space-y-1">
                  <label className="text-[9px] uppercase font-bold text-slate-500">Columna</label>
                  <select
                    value={r.side}
                    onChange={e => updateRow(idx, { side: e.target.value as 'debit' | 'credit' })}
                    aria-label={`Columna de partida ${idx + 1}`}
                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none text-white appearance-none"
                  >
                    <option value="debit" className="bg-slate-800">Debe</option>
                    <option value="credit" className="bg-slate-800">Haber</option>
                  </select>
                </div>
                <div className="col-span-5 md:col-span-2 space-y-1">
                  <label className="text-[9px] uppercase font-bold text-slate-500">Monto</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1.5 text-slate-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Monto de partida ${idx + 1}`}
                      value={amountInputs[idx] || ''}
                      onChange={e => {
                        const formattedValue = formatAmountInput(e.target.value);
                        const numericValue = parseFormattedAmount(formattedValue);
                        setAmountInputs(amountInputs.map((val, i) => i === idx ? formattedValue : val));
                        updateRow(idx, { amount: numericValue });
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                      className="w-full pl-6 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none font-mono text-white"
                    />
                  </div>
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1">
                  <label className="text-[9px] uppercase font-bold text-slate-500">Concepto de la partida</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={r.concept}
                    onChange={e => updateRow(idx, { concept: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none text-white placeholder-slate-600"
                  />
                </div>
                <div className="col-span-1 md:col-span-1 pb-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={partidasFinales.length < 2}
                    aria-label={`Eliminar partida ${idx + 1}`}
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
                        value={r.uuidCFDI || ''}
                        onChange={e => updateRow(idx, { uuidCFDI: e.target.value })}
                        onBlur={e => updateRow(idx, { uuidCFDI: e.target.value.trim() })}
                        className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none text-white placeholder-slate-600"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-6 space-y-1">
                      <label className="text-[9px] uppercase font-bold text-slate-500">RFC Tercero</label>
                      <input
                        type="text"
                        maxLength={13}
                        placeholder="XAXX010101000"
                        value={r.rfcTercero || ''}
                        onChange={e => updateRow(idx, { rfcTercero: e.target.value })}
                        onBlur={e => updateRow(idx, { rfcTercero: e.target.value.toUpperCase().trim() })}
                        className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none text-white placeholder-slate-600"
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Totales en vivo + guardado */}
          <div className="flex flex-col md:flex-row items-center justify-between pt-6 border-t border-white/10 gap-6">
            <div className="flex gap-8 text-sm">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Total Debe</span>
                <span className="font-mono text-lg text-emerald-400">{formatCurrency(balance.totalDebe)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Total Haber</span>
                <span className="font-mono text-lg text-rose-400">{formatCurrency(balance.totalHaber)}</span>
              </div>
              {isDeshabilitado && (
                <div className="flex items-center gap-2 text-rose-400 italic animate-pulse text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                  {motivoDeshabilitado}
                </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={onCancel}
                className="px-6 py-2.5 rounded-lg font-bold bg-white/5 text-slate-300 hover:bg-white/10 transition-all border border-white/10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isDeshabilitado}
                className={
                  'px-6 py-2.5 rounded-lg font-bold transition-all w-full md:w-auto shadow-lg ' +
                  (isDeshabilitado
                    ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-500/20 active:scale-95')
                }
              >
                {initialData ? 'Guardar Cambios' : 'Registrar Póliza'}
              </button>
            </div>
          </div>
        </form>

        {/* Resolución de discrepancia CFDI (patrón de EntryForm) */}
        <AnimatePresence>
          {cfdiDiscrepancia && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-noche/80 backdrop-blur-sm">
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
                  <span className="font-mono text-emerald-400 font-bold">{formatCurrency(cfdiDiscrepancia.xmlTotal)}</span>, pero la partida tiene{' '}
                  <span className="font-mono text-rose-400 font-bold">{formatCurrency(rows[cfdiDiscrepancia.idx].amount)}</span>.
                  <br />
                  <br />
                  ¿Qué monto deseas conservar?
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => resolverDiscrepancia(true)}
                    className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors text-sm shadow-lg shadow-emerald-500/20"
                  >
                    Usar monto del XML
                  </button>
                  <button
                    type="button"
                    onClick={() => resolverDiscrepancia(false)}
                    className="w-full py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-medium transition-colors text-sm"
                  >
                    Conservar actual
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
