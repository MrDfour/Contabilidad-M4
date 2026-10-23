/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Pencil, Printer, Trash2, UserCheck, UserPen } from 'lucide-react';
import type { Poliza, TipoPoliza } from '../../types';
import { formatCurrency } from '../../lib/format';
import { formatPolizaFolio } from '../../lib/accounting';

/** `key` lo extrae el runtime de React; se declara solo para satisfacer tsc (patrón de EntryCard). */
interface PolizaCardProps {
  key?: React.Key;
  poliza: Poliza;
  onEdit: (p: Poliza) => void;
  onDelete: (p: Poliza) => void;
  onPrint: (p: Poliza) => void;
}

const TIPO_STYLES: Record<TipoPoliza, { label: string; badge: string }> = {
  ingreso: { label: 'Ingreso', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  egreso: { label: 'Egreso', badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  diario: { label: 'Diario', badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  cheque: { label: 'Cheque', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30' }
};

/** Tarjeta individual de póliza con desglose de partidas y acciones (editar/imprimir/eliminar). */
export function PolizaCard({
  poliza,
  onEdit,
  onDelete,
  onPrint
}: PolizaCardProps) {
  const tipo = TIPO_STYLES[poliza.tipo];
  const fecha = new Date(`${poliza.fecha}T00:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl"
    >
      {/* Encabezado de la póliza */}
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${tipo.badge}`}>
              {tipo.label}
            </span>
            <span className="font-mono text-sm font-bold text-white">{formatPolizaFolio(poliza)}</span>
            <span className="text-xs text-slate-500">·</span>
            <time className="text-xs text-slate-400">{fecha}</time>
          </div>
          <p className="text-sm text-slate-200">{poliza.concepto}</p>
          {/* CH-4 de PLAN_CHEQUES.md: la hoja cheque muestra sus datos del cheque. */}
          {poliza.tipo === 'cheque' && poliza.cheque && (poliza.cheque.numero || poliza.cheque.banco || poliza.cheque.beneficiario) && (
            <p className="text-[11px] text-amber-300/90">
              Cheque Nº {poliza.cheque.numero || '—'}{poliza.cheque.banco ? ` · ${poliza.cheque.banco}` : ''}
              {poliza.cheque.beneficiario ? ` · ${poliza.cheque.beneficiario}` : ''}
            </p>
          )}
          {(poliza.elaboro || poliza.reviso || poliza.autorizo) && (
            <div className="flex gap-4 pt-1 text-[10px] text-slate-500">
              {poliza.elaboro && (
                <span className="inline-flex items-center gap-1"><UserPen className="w-3 h-3" /> Elaboró: {poliza.elaboro}</span>
              )}
              {poliza.reviso && (
                <span>Revisó: {poliza.reviso}</span>
              )}
              {poliza.autorizo && (
                <span className="inline-flex items-center gap-1"><UserCheck className="w-3 h-3" /> Autorizó: {poliza.autorizo}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end mr-1">
            <span className="font-mono text-base text-emerald-400">{formatCurrency(poliza.totalDebe)}</span>
            <span className="font-mono text-base text-rose-400">{formatCurrency(poliza.totalHaber)}</span>
          </div>
          <button
            type="button"
            aria-label={`Editar póliza ${formatPolizaFolio(poliza)}`}
            onClick={() => onEdit(poliza)}
            className="p-2 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label={`Imprimir póliza ${formatPolizaFolio(poliza)}`}
            onClick={() => onPrint(poliza)}
            className="p-2 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label={`Eliminar póliza ${formatPolizaFolio(poliza)}`}
            onClick={() => onDelete(poliza)}
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Desglose de partidas */}
      <table className="w-full text-sm border-t border-white/10">
        <thead>
          <tr className="text-[9px] uppercase text-slate-500 border-b border-white/10">
            <th className="text-left px-5 py-2 font-bold tracking-wider">Cuenta</th>
            <th className="text-left px-3 py-2 font-bold tracking-wider">Concepto</th>
            <th className="text-right px-3 py-2 font-bold tracking-wider text-emerald-500/80">Debe</th>
            <th className="text-right px-5 py-2 font-bold tracking-wider text-rose-500/80">Haber</th>
          </tr>
        </thead>
        <tbody>
          {poliza.partidas.map(p => (
            <tr key={p.id} className="border-b border-white/5 last:border-0">
              <td className="px-5 py-2">
                <span className="font-mono text-xs text-slate-400">{p.accountCode}</span>
                <span className="ml-2 text-slate-200">{p.accountName}</span>
              </td>
              <td className="px-3 py-2 text-slate-400 text-xs">{p.concept && <span>{p.concept}</span>}</td>
              <td className="px-3 py-2 text-right font-mono text-emerald-400">{p.debit > 0 ? formatCurrency(p.debit) : ''}</td>
              <td className="px-5 py-2 text-right font-mono text-rose-400">{p.credit > 0 ? formatCurrency(p.credit) : ''}</td>
            </tr>
          ))}
          <tr className="bg-white/5">
            <td colSpan={2} className="px-5 py-2 text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Sumas iguales
            </td>
            <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">{formatCurrency(poliza.totalDebe)}</td>
            <td className="px-5 py-2 text-right font-mono font-bold text-rose-400">{formatCurrency(poliza.totalHaber)}</td>
          </tr>
        </tbody>
      </table>
    </motion.article>
  );
}
