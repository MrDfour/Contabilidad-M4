/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import type { Poliza, TipoPoliza } from '../../types';
import { formatCurrency } from '../../lib/format';
import { formatPolizaFolio } from '../../lib/accounting';
import { cargarAnexo } from '../../services/attachmentService';

const TIPO_LABEL: Record<TipoPoliza, string> = {
  ingreso: 'Ingresos',
  egreso: 'Egresos',
  diario: 'Diario',
  cheque: 'Cheques'
};

/** Renglones en blanco al final de la tabla (como el papel físico, para notas a mano). */
export const RENGLONES_BASE = 10;

/**
 * La imagen anexa DENTRO de la zona de calcado (solo con la opción
 * "Con imagen del cheque" encendida). El binario local lo trae
 * `cargarAnexo` (attachmentService, owner anti-R1); si este equipo no lo
 * tiene (CH-11), la zona simplemente queda en blanco — nunca rompe el
 * impreso. La URL del objeto se revoca al desmontar.
 */
function ImagenCalcado({ empresaId, sha }: { empresaId: string | null; sha: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let propia = true;
    let objectUrl: string | null = null;
    (async () => {
      const blob = await cargarAnexo(empresaId ?? '', sha);
      if (!propia) return;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
    })();
    return () => {
      propia = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [empresaId, sha]);

  if (!url) return null;
  return (
    <img
      src={url}
      alt="Imagen del cheque anexa"
      className="max-w-full max-h-full object-contain"
    />
  );
}

/**
 * Hoja IMPRIMIBLE de una póliza de CHEQUE (CH-5/CH-15 de PLAN_CHEQUES.md):
 * - título sello "Póliza de Cheque";
 * - zona superior para el calcado del cheque con papel carbón: EN BLANCO por
 *   default (CH-5); con la opción "Con imagen del cheque" (decisión del
 *   usuario, 2026-10-23) imprime ahí la imagen anexa si este equipo la tiene;
 * - datos del cheque + Fecha + Nº de Póliza;
 * - tabla de partidas con pie "SUMAS IGUALES" (ver comentario CH-15 más abajo);
 * - cuadro "CONCEPTO DEL PAGO" + casilla "FIRMA (CHEQUE) RECIBIDO".
 * La alcanzan PolizaPrintModal (impresión individual) y DiarioPrintModal en el
 * formato "Hoja por póliza" (vía HojaPolizaImprimible).
 */
export function PolizaChequeSheet({
  poliza,
  conImagen = false,
  empresaId = null,
  renglones = RENGLONES_BASE
}: {
  poliza: Poliza,
  /** Opción "Con imagen del cheque": imprime el anexo en la zona de calcado. */
  conImagen?: boolean,
  /** Contexto del anexo (el binario vive local por cliente). */
  empresaId?: string | null,
  /** Renglones totales de la tabla (física: deja hueco para notas a mano). */
  renglones?: number
}) {
  const fechaCorta = new Date(`${poliza.fecha}T00:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
  const cheque = poliza.cheque;
  /** CH-5: la zona de calcado se reserva EN BLANCO (con opción de imagen). */
  const relleno = Math.max(0, renglones - poliza.partidas.length);
  const shaAnexo = conImagen ? cheque?.anexos?.[0]?.sha256 : undefined;

  return (
    <>
      {/* Título tipo sello */}
      <div className="flex justify-center">
        <div className="border-4 border-sky-500 rounded-2xl px-8 py-2">
          <h3 className="text-xl font-extrabold tracking-wide uppercase text-sky-600">
            Póliza de Cheque
          </h3>
        </div>
      </div>

      {/* Zona de calcado: EN BLANCO por default (CH-5); con la opción
          "Con imagen del cheque" imprime ahí el anexo local si existe. */}
      <div className="mt-4">
        <div
          data-testid="zona-calcado-cheque"
          title={conImagen
            ? 'Zona del cheque — imprime la imagen anexa si este equipo la tiene; en blanco si no'
            : 'Zona para calcar el cheque con papel carbón — queda en blanco'}
          className="border-2 border-sky-500 rounded-xl h-[16rem] flex items-center justify-center overflow-hidden"
        >
          {shaAnexo ? <ImagenCalcado empresaId={empresaId} sha={shaAnexo} /> : null}
        </div>
      </div>

      {/* Datos del cheque + Fecha + Nº de Póliza */}
      <div className="mt-3 border-2 border-sky-500 rounded-xl text-xs divide-y-2 divide-sky-500">
        <div className="grid grid-cols-3 divide-x-2 divide-sky-500">
          <div className="px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-sky-600">Nº de cheque</p>
            <p className="pt-0.5 font-mono font-bold">{cheque?.numero || '\u00A0'}</p>
          </div>
          <div className="px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-sky-600">Banco</p>
            <p className="pt-0.5">{cheque?.banco || '\u00A0'}</p>
          </div>
          <div className="px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-sky-600">Beneficiario</p>
            <p className="pt-0.5">{cheque?.beneficiario || '\u00A0'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x-2 divide-sky-500">
          <div className="px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-sky-600">Fecha</p>
            <p className="pt-0.5 font-mono">{fechaCorta}</p>
          </div>
          <div className="px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-sky-600">Nº de Póliza</p>
            <p className="pt-0.5 font-mono font-bold">{formatPolizaFolio(poliza)}</p>
          </div>
        </div>
      </div>

      {/* Cuerpo de cuentas: Cta / Scta / Nombre / Parcial / Debe / Haber */}
      <div className="mt-3 border-2 border-sky-500">
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
                <td className="px-2 py-2">{p.accountName}</td>
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
            {/* CH-15 de PLAN_CHEQUES.md: la leyenda "SUMAS IGUALES" quedó DECIDIDA
                por uniformidad con las otras 3 hojas, pero queda PENDIENTE de
                futuros cambios según la práctica contable real del contador
                (el cheque normalmente NO se pega a la contabilidad con partidas
                tradicionales). Si el contador la cambia, toca SOLO aquí. */}
            <tr className="border-t-2 border-neutral-800 font-bold bg-sky-50 divide-x divide-sky-200">
              <td colSpan={4} className="py-2.5 pr-2 text-right">
                <span className="inline-block bg-sky-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-md">
                  Sumas iguales
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(poliza.totalDebe)}</td>
              <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(poliza.totalHaber)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cuadros finales: concepto del pago + recepción del cheque */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-3">
        <div className="border-2 border-sky-500 rounded-xl">
          <p className="px-3 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-600">
            Concepto del pago
          </p>
          <p className="px-3 pb-3 pt-1 text-sm whitespace-pre-wrap">{poliza.concepto}</p>
        </div>
        <div className="border-2 border-sky-500 rounded-xl">
          <p className="px-3 pt-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-600">
            Firma (cheque) recibido
          </p>
          {/* En blanco físicamente: la celda queda vacía para firmar a mano,
              igual que las firmas de las demás hojas. */}
          <p className="px-3 pb-8 pt-1">&#160;</p>
        </div>
      </div>
    </>
  );
}

/**
 * Despachador de hoja imprimible: la póliza de CHEQUE lleva su hoja propia
 * (PolizaChequeSheet) y las demás la hoja clásica mexicana. Lo usan la
 * impresión individual (PolizaPrintModal) y el diario en formato
 * "Hoja por póliza" (DiarioPrintModal). La opción "Con imagen del cheque"
 * (y su contexto `empresaId`) solo afecta a la hoja del cheque.
 */
export function HojaPolizaImprimible({
  poliza,
  conImagen = false,
  empresaId = null
}: {
  poliza: Poliza,
  /** Opción "Con imagen del cheque": imprime el anexo en la zona de calcado. */
  conImagen?: boolean,
  /** Contexto del anexo (el binario vive local por cliente). */
  empresaId?: string | null
}) {
  return poliza.tipo === 'cheque'
    ? <PolizaChequeSheet poliza={poliza} conImagen={conImagen} empresaId={empresaId} />
    : <PolizaPapelSheet poliza={poliza} />;
}

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
