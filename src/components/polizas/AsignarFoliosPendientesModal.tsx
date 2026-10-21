/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AsignarFoliosPendientesModal — previsualización de la acción F-6 de
 * PLAN_FUSION_BOVEDA.md: asigna a cada póliza con folio pendiente (el
 * centinela `folio === 0` que pudo traer el merge, decisión "pendiente") el
 * siguiente folio disponible de su tipo, en orden `capturadoEn` ascendente.
 *
 * El modal es puro (mismo cambio re-calculado que en el hook): la ESCRITURA
 * la hace usePolizas vía App — aquí solo se lista y se confirma.
 */

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Hash, X } from 'lucide-react';
import type { Poliza } from '../../types';
import { asignarFoliosPendientes, esFolioPendiente, formatPolizaFolio } from '../../lib/accounting';

const ETIQUETA_TIPO: Record<Poliza['tipo'], string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  diario: 'Diario'
};

export function AsignarFoliosPendientesModal({
  polizas,
  onConfirmar,
  onClose
}: {
  polizas: Poliza[];
  onConfirmar: () => void;
  onClose: () => void;
}) {
  const pendientes = useMemo(
    () => polizas.filter(esFolioPendiente),
    [polizas]
  );

  const asignadaCon = useMemo(() => {
    const mapa = new Map<string, Poliza>();
    for (const a of asignarFoliosPendientes(polizas).afectadas) mapa.set(a.id, a);
    return mapa;
  }, [polizas]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg"
        >
          <div className="p-6 pb-0">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 text-amber-400 mb-2">
                <Hash className="w-6 h-6" />
                <h3 className="text-xl font-semibold">Asignar folios pendientes</h3>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              {pendientes.length === 1
                ? '1 póliza entró sin folio (pendiente del merge).'
                : `${pendientes.length} pólizas entraron sin folio (pendientes del merge).`}{' '}
              Cada una tomará el siguiente folio disponible de su tipo, en orden de captura:
            </p>
          </div>

          <div className="px-6 py-4 max-h-[50vh] overflow-y-auto space-y-2">
            {pendientes.map((p) => {
              const propuesta = asignadaCon.get(p.id);
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 bg-white/5 rounded-xl p-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      {ETIQUETA_TIPO[p.tipo]}
                    </p>
                    <p className="text-sm text-slate-200 truncate">{p.concepto}</p>
                    <p className="text-[11px] text-slate-500">
                      capturada {p.capturadoEn ? new Date(p.capturadoEn).toLocaleString() : 'sin hora registrada'}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold text-emerald-400 shrink-0">
                    {propuesta ? formatPolizaFolio(propuesta) : '—'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 p-6 border-t border-white/10">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-sm font-medium"
            >
              Más tarde
            </button>
            <button
              onClick={onConfirmar}
              className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-500/20 text-sm font-semibold"
            >
              Asignar {pendientes.length} folio{pendientes.length !== 1 ? 's' : ''}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
