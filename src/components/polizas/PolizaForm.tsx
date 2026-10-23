/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ChangeEvent, Fragment, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, FileScan, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import type { Account, Poliza, PartidaPoliza, TipoPoliza, ChequeDatos } from '../../types';
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
 * Modal de captura de pólizas (Fase 3 de PLAN_POLIZAS.md · rework CH-8 de
 * PLAN_CHEQUES.md).
 *
 * Valida la partida doble EN VIVO (Debe == Haber) y bloquea el guardado si no
 * cuadra o hay menos de 2 partidas con monto. El tipo de póliza queda CONGELADO
 * al editar (D-8: cambiarlo invalidaría el folio). En modo fiscal permite leer
 * UUID/RFC/Total desde un XML CFDI por partida (con resolución de discrepancias,
 * patrón de EntryForm).
 *
 * CH-8: la captura EN PAPEL es la primera opción. Modo papel: un control único
 * FORMATO ▾ (Ingresos/Egresos/Diario/Cheque — cada uno es su hoja) con entrada
 * secundaria "usar captura clásica (campos)". La ÚLTIMA hoja usada se recuerda
 * en `contasis_hoja_papel` (default Diario; CH-8). En clásico, el TIPO de
 * póliza gana el valor "Cheque". La preferencia de modo la persiste PolizaView
 * (`contasis_modo_captura`, default 'papel').
 *
 * El folio y los totales los asigna el hook (usePolizas): aquí solo se compone
 * el `PolizaInput`. De tipo 'cheque': datos del cheque (CH-4) + UI del anexo de
 * imagen (CH-6; la PERSISTENCIA del binario llega con attachmentService en
 * Fase 4 — la UI guarda el metadato y el archivo vive solo en esta sesión).
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

/**
 * Modo de captura de partidas:
 * - 'clasica': columna única de monto + selector Debe/Haber (la alternativa).
 * - 'papel': grid tipo póliza física mexicana (importes escritos directo en
 *   las columnas DEBE/HABER, footer de SUMAS IGUALES y franja de firmas).
 */
export type ModoCaptura = 'clasica' | 'papel';

/** CH-8: la última hoja usada en captura papel se recuerda GLOBAL por dispositivo. */
const CLAVE_HOJA_PAPEL = 'contasis_hoja_papel';

const HOJAS_VALIDAS: TipoPoliza[] = ['ingreso', 'egreso', 'diario', 'cheque'];

const leerHojaPapel = (): TipoPoliza => {
  let guardada: string | null = null;
  try {
    guardada = localStorage.getItem(CLAVE_HOJA_PAPEL);
  } catch {
    // Sin persistencia: default Diario (CH-8).
  }
  return HOJAS_VALIDAS.includes(guardada as TipoPoliza) ? (guardada as TipoPoliza) : 'diario';
};

export function PolizaForm({
  accounts,
  appMode,
  modo = 'clasica',
  onModoChange,
  initialData,
  onSave,
  onAnexoPendiente,
  onCancel
}: {
  accounts: Account[],
  appMode: AppMode,
  /** Estilo de captura; la preferencia vive en PolizaView (localStorage). */
  modo?: ModoCaptura,
  /** Presente solo si el dueño puede persistir el modo → muestra el enlace alterno. */
  onModoChange?: (m: ModoCaptura) => void,
  /** Presente SOLO en edición: bloquea el tipo (D-8) y precarga todos los campos. */
  initialData?: Poliza,
  onSave: (data: PolizaInput) => void,
  /** Fase 2 (CH-6): archivo de anexo del cheque elegido en el picker. NADIE lo
   *  persiste todavía — Fase 4 (attachmentService) lo recibe al construir. */
  onAnexoPendiente?: (archivo: File) => void,
  onCancel: () => void
}) {
  const [tipo, setTipo] = useState<TipoPoliza>(initialData?.tipo ?? leerHojaPapel());
  const [fecha, setFecha] = useState(initialData?.fecha ?? new Date().toISOString().split('T')[0]);
  const [concepto, setConcepto] = useState(initialData?.concepto ?? '');
  const [elaboro, setElaboro] = useState(initialData?.elaboro ?? '');
  const [reviso, setReviso] = useState(initialData?.reviso ?? '');
  const [autorizo, setAutorizo] = useState(initialData?.autorizo ?? '');
  // CH-4: datos del cheque (solo visualizados/compuestos cuando tipo === 'cheque').
  const [chequeNumero, setChequeNumero] = useState(initialData?.cheque?.numero ?? '');
  const [chequeBanco, setChequeBanco] = useState(initialData?.cheque?.banco ?? '');
  const [chequeBeneficiario, setChequeBeneficiario] = useState(initialData?.cheque?.beneficiario ?? '');
  // CH-6 (Fase 2): preview LOCAL del anexo elegido; el binario no se persiste aquí.
  const [anexoPicked, setAnexoPicked] = useState<{ nombre: string; url: string } | null>(null);
  const archivoAnexoRef = useRef<File | null>(null);
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

  /** CH-8: cambiar la hoja (papel) también PERSISTE la última usada
   *  (`contasis_hoja_papel`, global por dispositivo; default Diario). */
  const alCambiarHoja = (nuevo: TipoPoliza) => {
    setTipo(nuevo);
    try {
      localStorage.setItem(CLAVE_HOJA_PAPEL, nuevo);
    } catch {
      // Sin persistencia: la hoja vive solo en esta sesión.
    }
  };

  /** Anexo del cheque (CH-6, Fase 2): preview local; el binario NO se guarda aquí. */
  const alElegirAnexo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    archivoAnexoRef.current = file;
    setAnexoPicked(prev => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { nombre: file.name, url: URL.createObjectURL(file) };
    });
  };

  const quitarAnexo = () => {
    archivoAnexoRef.current = null;
    setAnexoPicked(null); // el useEffect revoca la URL del objeto
    const label = document.querySelector<HTMLInputElement>('input[type=file][accept="image/*"]');
    if (label) label.value = '';
  };

  useEffect(() => {
    return () => {
      if (anexoPicked) URL.revokeObjectURL(anexoPicked.url);
    };
  }, [anexoPicked]);

  // --- Modo PAPEL: importes escritos directo en la columna DEBE o HABER ---
  // El valor visible de cada columna sale del lado activo de la fila; teclear
  // en una columna mueve el importe a ese lado (equivalente al papel, donde el
  // importe "pertenece" a la columna en la que se escribe).
  const valorPapel = (idx: number, col: 'debit' | 'credit') =>
    rows[idx].side === col ? (amountInputs[idx] ?? '') : '';

  const cambiarImportePapel = (idx: number, col: 'debit' | 'credit', raw: string) => {
    const formatted = formatAmountInput(raw);
    const numeric = parseFormattedAmount(formatted);
    setAmountInputs(amountInputs.map((val, i) => i === idx ? formatted : val));
    setRows(rows.map((r, i) => i !== idx ? r : { ...r, side: col, amount: numeric }));
  };


  const removeRow = (idx: number) => {
    setRows(rows.filter((_, i) => i !== idx));
    setAmountInputs(amountInputs.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isDeshabilitado) return;
    if (!concepto.trim()) return;
    // CH-4: metadatos del cheque solo si la póliza ES de cheque; al editar se
    // PRESERVAN los anexos previos (su binario lo gestiona attachmentService, Fase 4).
    const anexosPrevios = initialData?.cheque?.anexos;
    const cheque: ChequeDatos | undefined = tipo === 'cheque'
      ? {
          numero: chequeNumero.trim() || undefined,
          banco: chequeBanco.trim() || undefined,
          beneficiario: chequeBeneficiario.trim() || undefined,
          ...(anexosPrevios && anexosPrevios.length > 0 ? { anexos: anexosPrevios } : {})
        }
      : undefined;
    if (tipo === 'cheque' && archivoAnexoRef.current) onAnexoPendiente?.(archivoAnexoRef.current);
    onSave({
      tipo,
      fecha,
      concepto: concepto.trim(),
      partidas: partidasFinales,
      elaboro: elaboro.trim() || undefined,
      reviso: reviso.trim() || undefined,
      autorizo: autorizo.trim() || undefined,
      ...(cheque ? { cheque } : {})
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
          <div className="flex items-center gap-3">
            {onModoChange && modo === 'clasica' && (
              <button
                type="button"
                onClick={() => onModoChange('papel')}
                className="hidden sm:inline-flex text-[10px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 transition-colors"
              >
                usar captura en papel (hoja)
              </button>
            )}
            <button type="button" onClick={onCancel} aria-label="Cerrar formulario"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* CH-8 — modo papel: control FORMATO único al frente (es el tipo/hoja);
              la ÚLTIMA hoja usada se persiste en contasis_hoja_papel al elegir. */}
          {modo === 'papel' && (
            <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Formato</span>
              <select
                value={tipo}
                disabled={Boolean(initialData)} // D-8: congelado al editar
                onChange={e => alCambiarHoja(e.target.value as TipoPoliza)}
                aria-label="Formato de la póliza"
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white appearance-none disabled:opacity-50"
              >
                <option value="ingreso">Póliza de Ingresos</option>
                <option value="egreso">Póliza de Egresos</option>
                <option value="diario">Póliza de Diario</option>
                <option value="cheque">Póliza de Cheque</option>
              </select>
              {onModoChange && (
                <button
                  type="button"
                  onClick={() => onModoChange('clasica')}
                  className="text-xs underline decoration-dotted underline-offset-2 text-slate-400 hover:text-white transition-colors"
                >
                  usar captura clásica (campos)
                </button>
              )}
            </div>
          )}
          {/* Datos generales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modo === 'clasica' && (
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
                  <option value="cheque" className="bg-slate-800">Cheque</option>
                </select>
              </div>
            )}
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
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Revisó</label>
              <input
                type="text"
                aria-label="Revisó"
                value={reviso}
                onChange={e => setReviso(e.target.value)}
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

          {/* CH-4 — Datos del cheque: SOLO cuando la hoja es de cheque. Campos de
              texto libre; `numero` es el folio BANCARIO (otro que el folio CHE-). */}
          {tipo === 'cheque' && (
            <div className="border border-amber-500/20 bg-amber-500/[0.06] rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">Datos del cheque</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Número de cheque</label>
                  <input
                    type="text"
                    aria-label="Número de cheque"
                    placeholder="Ej: 1042 (folio del banco)"
                    value={chequeNumero}
                    onChange={e => setChequeNumero(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none text-white placeholder-slate-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Banco</label>
                  <input
                    type="text"
                    aria-label="Banco del cheque"
                    placeholder="Ej: Banorte"
                    value={chequeBanco}
                    onChange={e => setChequeBanco(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none text-white placeholder-slate-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Beneficiario</label>
                  <input
                    type="text"
                    aria-label="Beneficiario del cheque"
                    placeholder="Ej: Juan Pérez"
                    value={chequeBeneficiario}
                    onChange={e => setChequeBeneficiario(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm outline-none text-white placeholder-slate-600"
                  />
                </div>
              </div>
              {/* CH-6 (Fase 2): picker + preview LOCAL. El binario se persiste con
                  attachmentService en la Fase 4 (no viaja en la bóveda, CH-11). */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 cursor-pointer transition-colors text-xs font-semibold">
                  <ImagePlus className="w-4 h-4" />
                  Adjuntar imagen del cheque
                  <input type="file" accept="image/*" onChange={alElegirAnexo} className="hidden" />
                </label>
                {anexoPicked && (
                  <>
                    <img
                      src={anexoPicked.url}
                      alt={`Anexo elegido: ${anexoPicked.nombre}`}
                      className="h-16 w-24 object-cover rounded-lg border border-white/10 bg-white"
                    />
                    <span className="text-xs text-slate-400 max-w-[16rem] truncate">{anexoPicked.nombre}</span>
                    <button type="button" onClick={quitarAnexo} className="text-xs text-rose-400 hover:text-rose-300 underline">
                      Quitar
                    </button>
                  </>
                )}
              </div>
              <p className="text-[10px] text-slate-500">
                El anexo vive SOLO en este equipo (la imagen no viaja en la bóveda, CH-11); la hoja impresa reserva su zona de calca en blanco (CH-5).
              </p>
            </div>
          )}

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

            {modo === 'clasica' && rows.map((r, idx) => (
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

            {/* Modo PAPEL: póliza física mexicana — importes directos en DEBE/HABER.
                Grid responsive (4.2 de PLAN_CHEQUES.md): en escritorio imita las
                columnas de la hoja física; en móvil TODO se apila. Un solo DOM:
                los aria-labels NO se duplican (jsdom/tests siguen únicos). */}
            {modo === 'papel' && (
              <div className="border border-white/10 rounded-xl overflow-hidden">
                {/* Encabezado de columnas: SOLO escritorio (móvil usa etiquetas por celda) */}
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_9rem_9rem_minmax(0,1fr)_2.5rem] gap-2 items-center bg-white/5 text-[10px] uppercase tracking-wider text-slate-400 border-b border-white/10 px-3 py-2">
                  <span className="text-left font-bold">Cta / Scta</span>
                  <span className="text-right font-bold text-emerald-400">Debe</span>
                  <span className="text-right font-bold text-rose-400">Haber</span>
                  <span className="text-left font-bold pl-2">Concepto</span>
                  <span />
                </div>
                <div className="divide-y divide-white/5">
                  {rows.map((r, idx) => (
                    <Fragment key={r.uid}>
                      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_9rem_9rem_minmax(0,1fr)_2.5rem] gap-2 items-center px-3 py-2">
                        {/* Cuenta contable (etiqueta visible SOLO en móvil) */}
                        <div className="space-y-1">
                          <span className="md:hidden text-[9px] uppercase font-bold text-slate-500">Cuenta contable</span>
                          <SearchableAccountSelect
                            accounts={accounts}
                            value={r.accountId}
                            onChange={(newId) => updateRow(idx, { accountId: newId })}
                          />
                        </div>
                        {/* Debe (teclear fija el lado, igual que el papel) */}
                        <div className="space-y-1">
                          <span className="md:hidden text-[9px] uppercase font-bold text-slate-500">Debe</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`Debe de partida ${idx + 1}`}
                            value={valorPapel(idx, 'debit')}
                            onChange={e => cambiarImportePapel(idx, 'debit', e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                            placeholder="0.00"
                            className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-right outline-none font-mono text-emerald-300 placeholder-slate-700"
                          />
                        </div>
                        {/* Haber */}
                        <div className="space-y-1">
                          <span className="md:hidden text-[9px] uppercase font-bold text-slate-500">Haber</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`Haber de partida ${idx + 1}`}
                            value={valorPapel(idx, 'credit')}
                            onChange={e => cambiarImportePapel(idx, 'credit', e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()}
                            onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                            placeholder="0.00"
                            className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-right outline-none font-mono text-rose-300 placeholder-slate-700"
                          />
                        </div>
                        {/* Concepto de la partida */}
                        <div className="space-y-1 md:pl-2">
                          <span className="md:hidden text-[9px] uppercase font-bold text-slate-500">Concepto de la partida</span>
                          <input
                            type="text"
                            placeholder="Opcional"
                            value={r.concept}
                            onChange={e => updateRow(idx, { concept: e.target.value })}
                            className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg outline-none text-white placeholder-slate-600"
                          />
                        </div>
                        {/* Eliminar partida */}
                        <div className="flex justify-end">
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
                      </div>
                      {appMode === 'fiscal' && (
                        <div className="px-3 py-2 bg-white/[0.02]">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div className="flex items-center gap-2">
                              <label className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 cursor-pointer transition-colors text-[10px] font-semibold uppercase tracking-wide">
                                <FileScan className="w-3.5 h-3.5" />
                                Leer XML
                                <input
                                  type="file"
                                  accept=".xml,text/xml,application/xml"
                                  onChange={(e) => handleCFDIUpload(idx, e)}
                                  className="hidden"
                                />
                              </label>
                              <input
                                type="text"
                                maxLength={36}
                                placeholder="UUID CFDI: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                                value={r.uuidCFDI || ''}
                                onChange={e => updateRow(idx, { uuidCFDI: e.target.value })}
                                onBlur={e => updateRow(idx, { uuidCFDI: e.target.value.trim() })}
                                className="flex-1 min-w-0 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg outline-none text-white placeholder-slate-600 text-xs"
                              />
                            </div>
                            <input
                              type="text"
                              maxLength={13}
                              placeholder="RFC Tercero (XAXX010101000)"
                              value={r.rfcTercero || ''}
                              onChange={e => updateRow(idx, { rfcTercero: e.target.value })}
                              onBlur={e => updateRow(idx, { rfcTercero: e.target.value.toUpperCase().trim() })}
                              className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg outline-none text-white placeholder-slate-600 text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Totales en vivo + guardado */}
          <div className="flex flex-col md:flex-row items-center justify-between pt-6 border-t border-white/10 gap-6">
            {modo === 'papel' ? (
              <div className="flex items-center gap-6 text-sm">
                <span className="px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-[10px] font-bold uppercase tracking-widest text-indigo-300">Sumas iguales</span>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Debe</span>
                  <span className="font-mono text-lg text-emerald-400">{formatCurrency(balance.totalDebe)}</span>
                </div>
                <span className={'font-mono text-xl ' + (balance.isBalanced ? 'text-emerald-400' : 'text-rose-400')}>
                  {balance.isBalanced ? '=' : '≠'}
                </span>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Haber</span>
                  <span className="font-mono text-lg text-rose-400">{formatCurrency(balance.totalHaber)}</span>
                </div>
                {isDeshabilitado && (
                  <div className="flex items-center gap-2 text-rose-400 italic animate-pulse text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{motivoDeshabilitado}</span>
                  </div>
                )}
              </div>
            ) : (
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
            )}

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
