/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  Info,
  FileText,
  Download,
  BookOpen
} from 'lucide-react';
import { exportToExcel, exportTableToPDF, cn } from '../lib/utils';
import { formatCurrency, normalizeAmount } from '../lib/format';
import { formatPolizaFolio } from '../lib/accounting';
import type { Poliza, TipoPoliza } from '../types';

/**
 * Vista del Libro Diario (Fase 4 de PLAN_POLIZAS.md): REPORT de solo lectura.
 *
 * Antes era el compositor de captura (JournalTabs + EntryList + EntryForm).
 * Desde el cutover, la captura vive en el módulo de Pólizas (components/polizas)
 * y aquí solo se muestra la póliza consolidada cronológicamente: una fila por
 * partida con FECHA / FOLIO / TIPO / CUENTA / CONCEPTO / DEBE / HABER, con las
 * mismas exportaciones Excel/PDF de antes pero alimentadas de las pólizas.
 */

const TIPO_LABEL: Record<TipoPoliza, string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  diario: 'Diario'
};

const TIPO_BADGE: Record<TipoPoliza, string> = {
  ingreso: 'bg-emerald-500/15 text-emerald-400',
  egreso: 'bg-rose-500/15 text-rose-400',
  diario: 'bg-indigo-500/15 text-indigo-400'
};

/** Fila del reporte: una partida de una póliza cronológica. */
interface FilaDiario {
  fecha: string;
  folio: string;
  tipo: TipoPoliza;
  cuenta: string;
  codigo: string;
  concepto: string;
  debe: number;
  haber: number;
}

const construirFilas = (polizas: Poliza[]): FilaDiario[] => {
  const filas: FilaDiario[] = [];
  polizas.forEach(poliza => {
    poliza.partidas.forEach(p => {
      if (p.debit <= 0 && p.credit <= 0) return; // partida 0/0 no aparece (defensa pasiva)
      const conceptoPartida = p.concept?.trim();
      filas.push({
        fecha: poliza.fecha,
        folio: formatPolizaFolio(poliza),
        tipo: poliza.tipo,
        cuenta: p.accountName,
        codigo: p.accountCode,
        concepto: conceptoPartida ? `${poliza.concepto} — ${conceptoPartida}` : poliza.concepto,
        debe: p.debit,
        haber: p.credit
      });
    });
  });
  return filas;
};

export function JournalView({
  polizas,
  onSetModal
}: {
  polizas: Poliza[],
  onSetModal: (info: { type: 'success' | 'error', title: string, message: string } | null) => void
}) {
  const [isExporting, setIsExporting] = useState(false);

  const filas = construirFilas(polizas);
  const totalDebe = normalizeAmount(filas.reduce((s, f) => s + f.debe, 0));
  const totalHaber = normalizeAmount(filas.reduce((s, f) => s + f.haber, 0));

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const data = filas.map((f, idx) => ({
        'ID_MOVIMIENTO': idx + 1,
        'FECHA': f.fecha,
        'FOLIO': f.folio,
        'TIPO': TIPO_LABEL[f.tipo],
        'CUENTA': f.cuenta,
        'CODIGO': f.codigo,
        'GLOSA_DESCRIPCION': f.concepto,
        'DEBE': f.debe,
        'HABER': f.haber
      }));
      await exportToExcel(data, 'Libro_Diario_Consolidado', 'Movimientos');
    } catch (error) {
      onSetModal({
        type: 'error',
        title: 'Error de exportación',
        message: 'No se pudo generar el archivo Excel. Inténtalo de nuevo.'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const headers = [['ID', 'FECHA', 'FOLIO', 'TIPO', 'CUENTA', 'DESCRIPCIÓN / GLOSA', 'DEBE', 'HABER']];
      const body = filas.map((f, idx) => [
        idx + 1,
        f.fecha,
        f.folio,
        TIPO_LABEL[f.tipo],
        f.codigo ? `${f.codigo} ${f.cuenta}` : f.cuenta,
        f.concepto,
        f.debe > 0 ? formatCurrency(f.debe) : '',
        f.haber > 0 ? formatCurrency(f.haber) : ''
      ]);
      await exportTableToPDF(
        headers,
        body,
        'Libro_Diario_Consolidado',
        'Libro Diario - Reporte Consolidado',
        'Pólizas Contables'
      );
    } catch (error) {
      onSetModal({
        type: 'error',
        title: 'Error de exportación',
        message: 'No se pudo generar el PDF. Inténtalo de nuevo.'
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Libro Diario</h2>
          <p className="text-slate-400 text-sm mt-1">
            Reporte consolidado de todas tus pólizas, ordenadas cronológicamente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:gap-3">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-xs md:text-sm text-slate-200 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-xs md:text-sm text-slate-200 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Aviso de coexistencia: la captura vive en Pólizas */}
      <div className="flex items-start gap-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3 text-xs md:text-sm text-indigo-200">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
        <p>
          El Libro Diario es ahora un reporte de solo lectura. La captura de movimientos
          se realiza en el módulo <span className="inline-flex items-center gap-1 font-semibold"><BookOpen className="w-3.5 h-3.5" /> Pólizas Contables</span>.
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="bg-white/5 border border-dashed border-white/15 rounded-2xl p-10 flex flex-col items-center text-center gap-3">
          <BookOpen className="w-10 h-10 text-slate-600" />
          <p className="text-slate-300 text-sm font-medium">No hay movimientos registrados</p>
          <p className="text-slate-500 text-xs">
            Crea pólizas en el módulo de Pólizas Contables para poblar este reporte.
          </p>
        </div>
      ) : (
        <div className={cn('bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-[9px] uppercase text-slate-500 border-b border-white/10 bg-white/5">
                  <th className="text-center px-3 py-3 font-bold tracking-wider w-12">Nº</th>
                  <th className="text-left px-3 py-3 font-bold tracking-wider">Fecha</th>
                  <th className="text-left px-3 py-3 font-bold tracking-wider">Folio</th>
                  <th className="text-left px-3 py-3 font-bold tracking-wider">Tipo</th>
                  <th className="text-left px-3 py-3 font-bold tracking-wider">Cuenta</th>
                  <th className="text-left px-3 py-3 font-bold tracking-wider">Concepto</th>
                  <th className="text-right px-3 py-3 font-bold tracking-wider text-emerald-500/80">Debe</th>
                  <th className="text-right px-5 py-3 font-bold tracking-wider text-rose-500/80">Haber</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, idx) => (
                  <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                    <td className="px-3 py-2 text-center font-mono text-[10px] text-indigo-400/70">{idx + 1}</td>
                    <td className="px-3 py-2 text-xs text-slate-300 whitespace-nowrap">{f.fecha}</td>
                    <td className="px-3 py-2 font-mono text-xs text-white whitespace-nowrap">{f.folio}</td>
                    <td className="px-3 py-2">
                      <span className={cn('px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider', TIPO_BADGE[f.tipo])}>
                        {TIPO_LABEL[f.tipo]}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-mono text-xs text-slate-400">{f.codigo}</span>
                      <span className="ml-2 text-slate-200">{f.cuenta}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{f.concepto}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-400">{f.debe > 0 ? formatCurrency(f.debe) : ''}</td>
                    <td className="px-5 py-2 text-right font-mono text-rose-400">{f.haber > 0 ? formatCurrency(f.haber) : ''}</td>
                  </tr>
                ))}
                <tr className="bg-white/5">
                  <td colSpan={6} className="px-3 py-3 text-[10px] uppercase font-bold tracking-widest text-slate-400 text-right">
                    Sumas iguales
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(totalDebe)}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold text-rose-400">{formatCurrency(totalHaber)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
