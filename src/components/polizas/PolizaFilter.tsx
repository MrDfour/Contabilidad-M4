/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Search } from 'lucide-react';
import type { TipoPoliza } from '../../types';

export type FiltroTipo = 'todas' | TipoPoliza;

const OPCIONES: { id: FiltroTipo; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'ingreso', label: 'Ingresos' },
  { id: 'egreso', label: 'Egresos' },
  { id: 'diario', label: 'Diario' }
];

/** Control de filtrado por TipoPoliza + buscador por folio numérico y concepto. */
export function PolizaFilter({
  filtro,
  busqueda,
  onSetFiltro,
  onSetBusqueda,
  contarPorTipo
}: {
  filtro: FiltroTipo,
  busqueda: string,
  onSetFiltro: (f: FiltroTipo) => void,
  onSetBusqueda: (t: string) => void,
  /** Conteo por tipo para los chips (todos YA viene filtrado por búsqueda). */
  contarPorTipo: Record<FiltroTipo, number>
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-4">
      <div className="flex flex-wrap gap-2">
        {OPCIONES.map(op => (
          <button
            key={op.id}
            type="button"
            onClick={() => onSetFiltro(op.id)}
            className={
              'px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all border ' +
              (filtro === op.id
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10')
            }
          >
            {op.label}
            <span className="ml-2 font-mono opacity-60">{contarPorTipo[op.id]}</span>
          </button>
        ))}
      </div>

      <div className="relative flex-1 md:max-w-xs md:ml-auto">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          aria-label="Buscar póliza por folio o concepto"
          placeholder="Buscar por folio o concepto..."
          value={busqueda}
          onChange={e => onSetBusqueda(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm outline-none text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>
    </div>
  );
}
