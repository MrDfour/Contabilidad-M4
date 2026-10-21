/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Fragment } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarRange, Printer, X } from 'lucide-react';
import type { Poliza } from '../../types';
import { formatCurrency, normalizeAmount } from '../../lib/format';
import { consolidarPolizasDiaria, formatPolizaFolio } from '../../lib/accounting';
import { PolizaPapelSheet } from './PolizaSheet';

/**
 * Impresión del Libro Diario en formato papel, con TRES disposiciones:
 *
 * - 'polizas': una hoja clásica (PolizaPapelSheet) por cada póliza del rango,
 *   con salto de página entre pólizas y suma general al cierre.
 * - 'diaria': una PÓLIZA DIARIA consolidada por cada día del rango (todas las
 *   pólizas del día agregadas por cuenta y lado, vía consolidarPolizasDiaria),
 *   con su propia SUMAS IGUALES por hoja y suma general al cierre.
 * - 'continuo': TODAS las operaciones del período en una sola tabla libro
 *   diario tradicional (fecha/folio/cuenta/glosa por renglón, fecha y folio
 *   solo en el primer renglón de cada grupo), con SUMA DEL DÍA por fecha y
 *   SUMAS IGUALES del período al cierre. El thead se repite solo en cada
 *   página impresa y los renglones no se parten (break-inside: avoid), así
 *   el libro fluye en tantas páginas A4 como operaciones haya.
 *
 * El rango se ajusta en el modal (presets Hoy / Este mes + fechas libres) y
 * ambas preferencias persisten en localStorage.
 */

type FormatoImpresion = 'polizas' | 'diaria' | 'continuo';

const CLAVE_FORMATO = 'contasis_diario_formato';

const leerFormato = (): FormatoImpresion => {
  try {
    const guardado = localStorage.getItem(CLAVE_FORMATO);
    if (guardado === 'continuo' || guardado === 'diaria') return guardado;
    return 'polizas';
  } catch {
    return 'polizas';
  }
};

/** Franja de suma general del período (compartida por los formatos 'polizas' y 'diaria'). */
function SumaGeneral({
  etiqueta,
  sumaDebe,
  sumaHaber
}: {
  etiqueta: string,
  sumaDebe: number,
  sumaHaber: number
}) {
  return (
    <div className="mt-8 border-2 border-sky-500 rounded-xl bg-sky-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm font-bold">
      <span className="uppercase tracking-widest text-sky-700 text-xs">{etiqueta}</span>
      <span className="flex gap-8 font-mono">
        <span>{formatCurrency(sumaDebe)}</span>
        <span>{formatCurrency(sumaHaber)}</span>
      </span>
    </div>
  );
}

/** Renglón del libro continuo: una partida con su contexto de póliza. */
interface FilaContinua {
  key: string;
  /** dd/mm corto; solo en el primer renglón del día (estilo libro tradicional). */
  fechaCorta: string;
  folio: string;
  /** Solo en el primer renglón de la póliza (estilo libro tradicional). */
  folioVisible: boolean;
  codigo: string;
  cuenta: string;
  concepto: string;
  debe: number;
  haber: number;
}

/** Grupo de renglones de un mismo día, con sus sumas. */
interface GrupoDia {
  fecha: string;
  filas: FilaContinua[];
  sumaDebe: number;
  sumaHaber: number;
}

export function DiarioPrintModal({
  polizas,
  onClose
}: {
  /** Pólizas YA ordenadas cronológicamente por el dueño (JournalView). */
  polizas: Poliza[],
  onClose: () => void
}) {
  const hoyISO = () => new Date().toISOString().split('T')[0];
  const inicioMesISO = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  };
  // Valor inicial: el día de la póliza más reciente (o hoy si no hay).
  const fechaInicial = polizas.length > 0
    ? polizas[polizas.length - 1].fecha
    : hoyISO();

  const [desde, setDesde] = useState(fechaInicial);
  const [hasta, setHasta] = useState(fechaInicial);
  const [formato, setFormato] = useState<FormatoImpresion>(leerFormato);

  const cambiarFormato = (f: FormatoImpresion) => {
    setFormato(f);
    try {
      localStorage.setItem(CLAVE_FORMATO, f);
    } catch {
      // Sin persistencia disponible: el formato vive solo en esta sesión.
    }
  };

  const enRango = polizas.filter(p => p.fecha >= desde && p.fecha <= hasta);
  // Defensa: orden cronológico garantizado aunque el dueño no ordene.
  const ordenadas = [...enRango].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) ||
    a.folio - b.folio ||
    (a.capturadoEn ?? '').localeCompare(b.capturadoEn ?? ''));
  const sumaDebe = normalizeAmount(enRango.reduce((s, p) => s + p.totalDebe, 0));
  const sumaHaber = normalizeAmount(enRango.reduce((s, p) => s + p.totalHaber, 0));

  // --- Agrupar pólizas del rango por fecha (ordenadas) ---
  const porDia: Array<{ fecha: string; polizas: Poliza[] }> = [];
  ordenadas.forEach(p => {
    const ultimo = porDia[porDia.length - 1];
    if (ultimo && ultimo.fecha === p.fecha) ultimo.polizas.push(p);
    else porDia.push({ fecha: p.fecha, polizas: [p] });
  });

  // --- Libro continuo: renglones por partida con suma del día ---
  const gruposDia: GrupoDia[] = porDia.map(g => {
    const filas: FilaContinua[] = [];
    let sumaDiaDebe = 0;
    let sumaDiaHaber = 0;
    g.polizas.forEach(p => {
      const folio = formatPolizaFolio(p);
      let primeraDelDia = true;
      p.partidas.forEach(partida => {
        if (partida.debit <= 0 && partida.credit <= 0) return; // partida 0/0 no aparece
        filas.push({
          key: partida.id,
          fechaCorta: primeraDelDia
            ? new Date(`${p.fecha}T00:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' })
            : '',
          folio,
          folioVisible: primeraDelDia,
          codigo: partida.accountCode,
          cuenta: partida.accountName,
          concepto: partida.concept?.trim() || p.concepto,
          debe: partida.debit,
          haber: partida.credit
        });
        sumaDiaDebe += partida.debit;
        sumaDiaHaber += partida.credit;
        primeraDelDia = false;
      });
    });
    return { fecha: g.fecha, filas, sumaDebe: sumaDiaDebe, sumaHaber: sumaDiaHaber };
  });

  // --- Póliza diaria: un consolidado por cada día con pólizas ---
  const diarias = porDia
    .map(g => consolidarPolizasDiaria(g.fecha, g.polizas))
    .filter((p): p is Poliza => p !== null);

  const rangoTexto = desde === hasta
    ? new Date(`${desde}T00:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    : `${desde} al ${hasta}`;

  return (
    <div className="fixed inset-0 z-[115] flex items-start justify-center p-4 bg-noche/80 backdrop-blur-sm overflow-y-auto">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          .poliza-print-sheet, .poliza-print-sheet * { visibility: visible !important; }
          .poliza-print-sheet {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
          }
          .poliza-print-actions { display: none !important; }
          .poliza-print-break { page-break-after: always; }
        }
      `}</style>

      <div className="w-full max-w-3xl my-8 space-y-4">
        {/* Controles de rango y formato (no imprimibles) */}
        <div className="poliza-print-actions bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold mr-1">
            <CalendarRange className="w-4 h-4 text-indigo-400" /> Imprimir pólizas del Libro Diario
          </div>
          <button
            type="button"
            onClick={() => { setDesde(hoyISO()); setHasta(hoyISO()); }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => { setDesde(inicioMesISO()); setHasta(hoyISO()); }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
          >
            Este mes
          </button>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={e => setDesde(e.target.value)}
              aria-label="Fecha inicial del rango"
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
            />
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={e => setHasta(e.target.value)}
              aria-label="Fecha final del rango"
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
            />
          </div>

          <span className="text-xs text-slate-400">
            {enRango.length} póliza(s) en el rango
          </span>
          <div className="flex-1" />

          <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
            <button
              type="button"
              aria-pressed={formato === 'polizas'}
              onClick={() => cambiarFormato('polizas')}
              title="Una hoja de póliza clásica por cada póliza del rango"
              className={
                'px-3 py-1 rounded-md text-xs font-bold transition-colors ' +
                (formato === 'polizas'
                  ? 'bg-indigo-600 text-white shadow shadow-indigo-500/30'
                  : 'text-slate-400 hover:text-white')
              }
            >
              Hoja por póliza
            </button>
            <button
              type="button"
              aria-pressed={formato === 'diaria'}
              onClick={() => cambiarFormato('diaria')}
              title="Un consolidado del día por cada fecha: todas las pólizas del día agregadas por cuenta"
              className={
                'px-3 py-1 rounded-md text-xs font-bold transition-colors ' +
                (formato === 'diaria'
                  ? 'bg-indigo-600 text-white shadow shadow-indigo-500/30'
                  : 'text-slate-400 hover:text-white')
              }
            >
              Póliza diaria
            </button>
            <button
              type="button"
              aria-pressed={formato === 'continuo'}
              onClick={() => cambiarFormato('continuo')}
              title="Todas las operaciones del período en un solo libro continuo"
              className={
                'px-3 py-1 rounded-md text-xs font-bold transition-colors ' +
                (formato === 'continuo'
                  ? 'bg-indigo-600 text-white shadow shadow-indigo-500/30'
                  : 'text-slate-400 hover:text-white')
              }
            >
              Libro continuo
            </button>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={enRango.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-slate-500 text-white text-sm font-medium shadow-lg shadow-indigo-500/20 transition-all"
          >
            <Printer className="w-4 h-4" /> Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista de impresión"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hoja del libro (imprimible) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 12 }}
          className="bg-white text-neutral-900 rounded-2xl shadow-2xl poliza-print-sheet px-6 pt-6 pb-8"
        >
          {/* Encabezado del libro */}
          <div className="flex items-start justify-between border-b-2 border-sky-500 pb-3">
            <div>
              <h3 className="text-xl font-extrabold uppercase tracking-wide text-sky-600">Libro Diario</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Contabilidad M4 Pro</p>
            </div>
            <div className="text-right text-xs">
              <p className="font-bold uppercase tracking-widest text-sky-600">Período</p>
              <p className="font-mono text-sm text-neutral-800">{rangoTexto}</p>
            </div>
          </div>

          {enRango.length === 0 ? (
            <p className="py-16 text-center text-sm text-neutral-500">
              No hay pólizas registradas en el período seleccionado.
              Ajusta las fechas (Desde/Hasta) en el panel superior.
            </p>
          ) : formato === 'polizas' ? (
            <>
              {enRango.map((p, i) => (
                <div
                  key={p.id}
                  className={i < enRango.length - 1 ? 'poliza-print-break' : undefined}
                  style={i < enRango.length - 1 ? { pageBreakAfter: 'always' } : undefined}
                >
                  <div className={i > 0 ? 'mt-10 pt-8 border-t-2 border-dashed border-sky-200' : 'mt-4'}>
                    <PolizaPapelSheet poliza={p} />
                  </div>
                </div>
              ))}

              {/* Suma general del período */}
              <SumaGeneral
                etiqueta={`Suma general del período (${enRango.length} póliza${enRango.length === 1 ? '' : 's'})`}
                sumaDebe={sumaDebe}
                sumaHaber={sumaHaber}
              />
            </>
          ) : formato === 'diaria' ? (
            <>
              {diarias.map((pd, i) => (
                <div
                  key={pd.id}
                  className={i < diarias.length - 1 ? 'poliza-print-break' : undefined}
                  style={i < diarias.length - 1 ? { pageBreakAfter: 'always' } : undefined}
                >
                  <div className={i > 0 ? 'mt-10 pt-8 border-t-2 border-dashed border-sky-200' : 'mt-4'}>
                    <PolizaPapelSheet
                      poliza={pd}
                      tituloOverride="Póliza Diaria"
                      folioOverride={`DIARIA ${new Date(`${pd.fecha}T00:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
                    />
                  </div>
                </div>
              ))}

              {/* Suma general del período */}
              <SumaGeneral
                etiqueta={`Suma general del período (${diarias.length} día${diarias.length === 1 ? '' : 's'})`}
                sumaDebe={sumaDebe}
                sumaHaber={sumaHaber}
              />
            </>
          ) : (
            /* --- LIBRO CONTINUO: una sola tabla, suma del día por fecha --- */
            <div className="mt-4 border-2 border-sky-500">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-sky-500 text-white divide-x divide-sky-300">
                    <th className="px-2 py-1.5 w-16 text-left font-bold uppercase tracking-wider">Fecha</th>
                    <th className="px-2 py-1.5 w-24 text-left font-bold uppercase tracking-wider">Póliza</th>
                    <th className="px-2 py-1.5 w-16 text-left font-bold uppercase tracking-wider">Cta</th>
                    <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Nombre de las cuentas</th>
                    <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Concepto</th>
                    <th className="px-3 py-1.5 w-24 text-right font-bold uppercase tracking-wider">Debe</th>
                    <th className="px-3 py-1.5 w-24 text-right font-bold uppercase tracking-wider">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {gruposDia.map(g => (
                    <Fragment key={g.fecha}>
                      {g.filas.map(f => (
                        <tr key={f.key} className="border-b border-sky-200 divide-x divide-sky-200 break-inside-avoid">
                          <td className="px-2 py-1.5 font-mono">{f.fechaCorta}</td>
                          <td className="px-2 py-1.5 font-mono whitespace-nowrap">{f.folioVisible ? f.folio : ''}</td>
                          <td className="px-2 py-1.5 font-mono">{f.codigo}</td>
                          <td className="px-2 py-1.5">{f.cuenta}</td>
                          <td className="px-2 py-1.5 text-neutral-600">{f.concepto}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{f.debe > 0 ? formatCurrency(f.debe) : ''}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{f.haber > 0 ? formatCurrency(f.haber) : ''}</td>
                        </tr>
                      ))}
                      <tr className="border-b-2 border-sky-300 bg-sky-50 font-bold divide-x divide-sky-200 break-inside-avoid">
                        <td colSpan={5} className="px-2 py-1.5 text-right text-[10px] uppercase tracking-widest text-sky-700">
                          Suma del día
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(normalizeAmount(g.sumaDebe))}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatCurrency(normalizeAmount(g.sumaHaber))}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-neutral-800 font-bold bg-sky-100 divide-x divide-sky-200 break-inside-avoid">
                    <td colSpan={5} className="px-2 py-2.5 pr-2 text-right text-[10px] uppercase tracking-widest text-sky-700">
                      Sumas iguales del período
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(sumaDebe)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(sumaHaber)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
