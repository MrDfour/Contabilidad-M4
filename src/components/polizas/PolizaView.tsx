/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import type { Account, Poliza } from '../../types';
import type { PolizaInput } from '../../hooks/usePolizas';
import type { AppMode } from '../../lib/navigation';
import type { ModalInfo } from '../modals/GlobalInfoModal';
import { normalizeString } from '../../lib/format';
import { formatPolizaFolio } from '../../lib/accounting';
import { PolizaFilter, type FiltroTipo } from './PolizaFilter';
import { PolizaList } from './PolizaList';
import { PolizaForm } from './PolizaForm';
import { PolizaPrintModal } from './PolizaPrintModal';

/**
 * Contenedor del módulo de Pólizas Contables (Fase 3 de PLAN_POLIZAS.md):
 * módulo principal de captura. Dueño del estado de filtro/búsqueda y de los
 * modales de captura e impresión; la eliminación se confirma vía App
 * (ConfirmDeleteModal). Los datos viven en usePolizas (anti-R1).
 */

const esFolioBuscado = (termino: string, poliza: Poliza) => {
  const limpio = termino.trim();
  if (/^\d+$/.test(limpio)) return String(poliza.folio) === limpio;
  return formatPolizaFolio(poliza).toLowerCase().includes(limpio.toLowerCase());
};

export function PolizaView({
  polizas,
  accounts,
  appMode,
  onCreate,
  onUpdate,
  onDeleteRequest,
  onSetModal
}: {
  polizas: Poliza[],
  accounts: Account[],
  appMode: AppMode,
  onCreate: (data: PolizaInput) => void,
  /** Recibe (id, datos) — el folio y tipo los preserva el hook (D-8). */
  onUpdate: (id: string, data: PolizaInput) => void,
  /** Pide confirmación a App (ConfirmDeleteModal); no elimina directo. */
  onDeleteRequest: (p: Poliza) => void,
  onSetModal: (m: ModalInfo) => void
}) {
  const [filtro, setFiltro] = useState<FiltroTipo>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPoliza, setEditingPoliza] = useState<Poliza | null>(null);
  const [printPoliza, setPrintPoliza] = useState<Poliza | null>(null);

  const termino = normalizeString(busqueda);
  const filtradas = polizas.filter(p => {
    if (filtro !== 'todas' && p.tipo !== filtro) return false;
    if (!termino) return true;
    return (
      normalizeString(p.concepto).includes(termino) ||
      esFolioBuscado(busqueda, p)
    );
  });

  const contarPorTipo: Record<FiltroTipo, number> = {
    todas: filtradas.length,
    ingreso: filtradas.filter(p => p.tipo === 'ingreso').length,
    egreso: filtradas.filter(p => p.tipo === 'egreso').length,
    diario: filtradas.filter(p => p.tipo === 'diario').length
  };

  const handleSavePoliza = (data: PolizaInput) => {
    try {
      if (editingPoliza) onUpdate(editingPoliza.id, data);
      else onCreate(data);
      setIsFormOpen(false);
      setEditingPoliza(null);
    } catch (error) {
      onSetModal({
        type: 'error',
        title: 'Póliza no guardada',
        message: error instanceof Error ? error.message : 'Ocurrió un error al guardar la póliza.'
      });
    }
  };

  const openNueva = () => {
    setEditingPoliza(null);
    setIsFormOpen(true);
  };

  const openEditar = (p: Poliza) => {
    setEditingPoliza(p);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingPoliza(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Pólizas Contables</h1>
          <p className="text-sm text-slate-400 mt-1">
            Captura principal: ingresos, egresos y diarios con partida doble validada.
          </p>
        </div>
        <button
          type="button"
          onClick={openNueva}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Nueva Póliza
        </button>
      </div>

      <PolizaFilter
        filtro={filtro}
        busqueda={busqueda}
        onSetFiltro={setFiltro}
        onSetBusqueda={setBusqueda}
        contarPorTipo={contarPorTipo}
      />

      <PolizaList
        polizas={filtradas}
        hayFiltroActivo={filtro !== 'todas' || termino.length > 0}
        onEdit={openEditar}
        onDelete={onDeleteRequest}
        onPrint={setPrintPoliza}
      />

      {isFormOpen && (
        <PolizaForm
          accounts={accounts}
          appMode={appMode}
          initialData={editingPoliza ?? undefined}
          onSave={handleSavePoliza}
          onCancel={closeForm}
        />
      )}

      <PolizaPrintModal poliza={printPoliza} onClose={() => setPrintPoliza(null)} />
    </div>
  );
}
