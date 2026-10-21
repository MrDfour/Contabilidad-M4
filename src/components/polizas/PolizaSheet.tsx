/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Poliza, TipoPoliza } from '../../types';
import { formatCurrency } from '../../lib/format';
import { formatPolizaFolio } from '../../lib/accounting';

const TIPO_LABEL: Record<TipoPoliza, string> = {
  ingreso: 'Ingresos',
  egreso: 'Egresos',
  diario: 'Diario'
};

/** Renglones en blanco al final de la tabla (como el papel físico, para notas a mano). */
export const RENGLONES_BASE = 10;

/**
 * Hoja de póliza contable al formato físico mexicano clásico (solo el contenido
 * imprimible): título tipo sello, tabla Cta/Scta/Nombre/Parcial/Debe/Haber con
 * rejilla visible, fila de SUMAS IGUALES, cuadro grande de CONCEPTO y franja de
 * control (Control/Hecho por/Revisado/Autorizado/Diario) con Fecha y Nº de
 * Póliza. La envuelven PolizaPrintModal (una póliza) y DiarioPrintModal
 * (libro diario por período).
 */
export function PolizaPapelSheet({
  poliza,
  tituloOverride,
  folioOverride
}: {
  poliza: Poliza,
  /** P.ej. "Póliza Diaria" para los consolidados del libro diario. */
  tituloOverride?: string,
  /** P.ej. "DIARIA 19/10/2026" para consolidados sin folio propio. */
  folioOverride?: string
}) {
  const fechaCorta = new Date(`${poliza.fecha}T00:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  // Renglones vacíos para conservar la altura del formato de papel.
  const relleno = Math.max(0, RENGLONES_BASE - poliza.partidas.length);

  // Datos de la franja de control: el nombre viaja si existe; si no, la celda
  // queda en blanco para firmar a mano (como el papel real).
  const franjaControl: Array<{ label: string; valor?: string }> = [
    { label: 'Control' },
    { label: 'Hecho por', valor: poliza.elaboro },
    { label: 'Revisado', valor: poliza.reviso },
    { label: 'Autorizado', valor: poliza.autorizo },
    { label: 'Diario' }
  ];

  return (
    <>
      {/* Título tipo sello */}
      <div className="flex justify-center">
        <div className="border-4 border-sky-500 rounded-2xl px-8 py-2">
          <h3 className="text-xl font-extrabold tracking-wide uppercase text-sky-600">
            {tituloOverride ?? `Póliza de ${TIPO_LABEL[poliza.tipo]}`}
          </h3>
        </div>
      </div>

      {/* Cuerpo de cuentas: Cta / Scta / Nombre / Parcial / Debe / Haber */}
      <div className="mt-4 border-2 border-sky-500">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-sky-500 text-white divide-x divide-sky-300">
              <th className="px-2 py-1.5 w-16 text-left font-bold uppercase tracking-wider">Cta</th>
              <th className="px-2 py-1.5 w-16 text-left font-bold uppercase tracking-wider">Scta</th>
              <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Nombre de las cuentas</th>
              <th className="px-2 py-1.5 w-20 text-right font-bold uppercase tracking-wider">Parcial</th>
              <th className="px-3 py-1.5 w-28 text-right font-bold uppercase tracking-wider">Debe</th>
              <th className="px-3 py-1.5 w-28 text-right font-bold uppercase tracking-wider">Haber</th>
            </tr>
          </thead>
          <tbody>
            {poliza.partidas.map(p => (
              <tr key={p.id} className="border-b border-sky-200 divide-x divide-sky-200">
                <td className="px-2 py-2 font-mono">{p.accountCode}</td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2">
                  {p.accountName}
                  {p.concept && (
                    <span className="block text-[10px] text-neutral-500">{p.concept}</span>
                  )}
                </td>
                <td className="px-2 py-2" />
                <td className="px-3 py-2 text-right font-mono">{p.debit > 0 ? formatCurrency(p.debit) : ''}</td>
                <td className="px-3 py-2 text-right font-mono">{p.credit > 0 ? formatCurrency(p.credit) : ''}</td>
              </tr>
            ))}
            {Array.from({ length: relleno }, (_, i) => (
              <tr key={`relleno-${i}`} className="border-b border-sky-200 divide-x divide-sky-200">
                <td className="px-2 py-2.5">&nbsp;</td>
                <td />
                <td />
                <td />
                <td />
                <td />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-800 font-bold bg-sky-50 divide-x divide-sky-200">
              <td colSpan={4} className="py-2.5 pr-2 text-right">
                <span className="inline-block bg-sky-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-md">
                  Sumas iguales
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(poliza.totalDebe)}</td>
              <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(poliza.totalHaber)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Cuadro de concepto */}
      <div className="mt-3 border-2 border-sky-500 rounded-xl">
        <p className="px-3 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-600">Concepto</p>
        <p className="px-3 pb-3 pt-1 text-sm whitespace-pre-wrap">{poliza.concepto}</p>
      </div>

      {/* Franja de control + Fecha / Nº de Póliza */}
      <div className="mt-3 border-2 border-sky-500 rounded-xl overflow-hidden text-xs divide-y-2 divide-sky-500">
        <div className="grid grid-cols-5 divide-x-2 divide-sky-500">
          {franjaControl.map(c => (
            <div key={c.label} className="px-2 py-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-sky-600">{c.label}</p>
              <p className="pt-0.5 min-h-[1.25rem]">{c.valor || '\u00A0'}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 divide-x-2 divide-sky-500">
          <div className="px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-sky-600">Fecha</p>
            <p className="pt-0.5 font-mono">{fechaCorta}</p>
          </div>
          <div className="px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-sky-600">Nº de Póliza</p>
            <p className="pt-0.5 font-mono font-bold">{folioOverride ?? formatPolizaFolio(poliza)}</p>
          </div>
        </div>
      </div>
    </>
  );
}
