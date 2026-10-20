/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScrollText } from 'lucide-react';
import type { Poliza } from '../../types';
import { PolizaCard } from './PolizaCard';/** Listado de pólizas (desplegado de PolizaCard) con estados vacíos diferenciados. */
export function PolizaList({
  polizas,
  hayFiltroActivo,
  onEdit,
  onDelete,
  onPrint
}: {
  polizas: Poliza[],
  hayFiltroActivo: boolean,
  onEdit: (p: Poliza) => void,
  onDelete: (p: Poliza) => void,
  onPrint: (p: Poliza) => void
}) {
  if (polizas.length === 0) {
    return (
      <div className="bg-white/5 border border-dashed border-white/15 rounded-2xl p-10 flex flex-col items-center text-center gap-3">
        <ScrollText className="w-10 h-10 text-slate-600" />
        {hayFiltroActivo ? (
          <>
            <p className="text-slate-300 text-sm font-medium">No hay pólizas para el filtro actual</p>
            <p className="text-slate-500 text-xs">Ajusta el tipo o el término de búsqueda para ver más resultados.</p>
          </>
        ) : (
          <>
            <p className="text-slate-300 text-sm font-medium">Aún no hay pólizas registradas</p>
            <p className="text-slate-500 text-xs">Crea tu primera póliza con el botón "Nueva Póliza" del toolbar.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {polizas.map(p => (
        <PolizaCard key={p.id} poliza={p} onEdit={onEdit} onDelete={onDelete} onPrint={onPrint} />
      ))}
    </div>
  );
}
