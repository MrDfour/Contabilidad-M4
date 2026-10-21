/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, type ChangeEvent } from 'react';
import { motion } from 'motion/react';
import { Plus, Upload, FileUp, Hash } from 'lucide-react';
import type { Account, Poliza } from '../../types';
import type { PolizaInput } from '../../hooks/usePolizas';
import type { AppMode } from '../../lib/navigation';
import type { ModalInfo } from '../modals/GlobalInfoModal';
import { normalizeString } from '../../lib/format';
import { formatPolizaFolio, entriesToPolizasDiarias, esFolioPendiente } from '../../lib/accounting';
import { readExcel, exportToExcel } from '../../lib/utils';
import { parseJournalImport } from '../../lib/importEntriesFromExcel';
import { PolizaFilter, type FiltroTipo } from './PolizaFilter';
import { PolizaList } from './PolizaList';
import { PolizaForm } from './PolizaForm';
import { PolizaPrintModal } from './PolizaPrintModal';
import { AsignarFoliosPendientesModal } from './AsignarFoliosPendientesModal';

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
  onImportPolizas,
  onAsignarFoliosPendientes,
  onDeleteRequest,
  onSetModal
}: {
  polizas: Poliza[],
  accounts: Account[],
  appMode: AppMode,
  onCreate: (data: PolizaInput) => void,
  /** Recibe (id, datos) — el folio y tipo los preserva el hook (D-8). */
  onUpdate: (id: string, data: PolizaInput) => void,
  /** Importación Excel (D-11): el hook asigna folios ausentes/colisionantes. */
  onImportPolizas: (nuevas: Poliza[]) => void,
  /** F-6: asigna folios pendientes (folio 0 del merge) y devuelve las tocadas. */
  onAsignarFoliosPendientes: () => Poliza[],
  /** Pide confirmación a App (ConfirmDeleteModal); no elimina directo. */
  onDeleteRequest: (p: Poliza) => void,
  onSetModal: (m: ModalInfo) => void
}) {
  const [filtro, setFiltro] = useState<FiltroTipo>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPoliza, setEditingPoliza] = useState<Poliza | null>(null);
  const [printPoliza, setPrintPoliza] = useState<Poliza | null>(null);
  const [modalFoliosOpen, setModalFoliosOpen] = useState(false);

  /** Centinela folio 0 = pendiente del merge (F-2); la acción SOLO existe si hay. */
  const pendientesFolio = polizas.filter(p => esFolioPendiente(p));

  const termino = normalizeString(busqueda);
  // Los conteos de los chips salen de la lista filtrada SOLO por búsqueda
  // (sin filtro de tipo): los chips deben mostrar siempre el total por tipo.
  const conBusqueda = polizas.filter(p => {
    if (!termino) return true;
    return normalizeString(p.concepto).includes(termino) || esFolioBuscado(busqueda, p);
  });
  const filtradas = filtro === 'todas'
    ? conBusqueda
    : conBusqueda.filter(p => p.tipo === filtro);

  const contarPorTipo: Record<FiltroTipo, number> = {
    todas: conBusqueda.length,
    ingreso: conBusqueda.filter(p => p.tipo === 'ingreso').length,
    egreso: conBusqueda.filter(p => p.tipo === 'egreso').length,
    diario: conBusqueda.filter(p => p.tipo === 'diario').length
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

  /** F-6 confirmado: el hook dueño asigna y reportamos las tocadas (toast). */
  const handleConfirmarFolios = () => {
    const afectadas = onAsignarFoliosPendientes();
    setModalFoliosOpen(false);
    if (afectadas.length === 0) {
      onSetModal({ type: 'error', title: 'Nada por asignar', message: 'No hay pólizas con folio pendiente.' });
      return;
    }
    const folios = afectadas.map(p => formatPolizaFolio(p));
    const visibles = folios.slice(0, 5).join(', ');
    const resto = afectadas.length > 5 ? ` y ${afectadas.length - 5} más` : '';
    onSetModal({
      type: 'success',
      title: 'Folios asignados',
      message: `Asignamos folio a ${afectadas.length} póliza(s) en orden de captura: ${visibles}${resto}.`
    });
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingPoliza(null);
  };

  /** Plantilla de importación (mismo formato que usaba el Diario — D-11). */
  const handleDescargarPlantilla = async () => {
    const templateData = [
      { 'ASIENTO_ID': '1', 'FECHA': '2024-05-01', 'GLOSA': 'Apertura de caja', 'CUENTA': 'Caja', 'DEBE': 1000, 'HABER': 0 },
      { 'ASIENTO_ID': '1', 'FECHA': '2024-05-01', 'GLOSA': 'Apertura de caja', 'CUENTA': 'Capital Social', 'DEBE': 0, 'HABER': 1000 },
      { 'ASIENTO_ID': '2', 'FECHA': '2024-05-02', 'GLOSA': 'Compra de mercadería', 'CUENTA': 'Caja', 'DEBE': 0, 'HABER': 500 },
      { 'ASIENTO_ID': '2', 'FECHA': '2024-05-02', 'GLOSA': 'Compra de mercadería', 'CUENTA': 'Mercaderías', 'DEBE': 500, 'HABER': 0 }
    ];
    await exportToExcel(templateData, 'Plantilla_Importacion_M4', 'Guia_Carga');
  };

  /** Importación Excel (D-11): parseJournalImport sin cambios → pólizas diario. */
  const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await readExcel(file);
      const { entries: parsedEntries, unmatchedAccounts } = parseJournalImport(data, accounts);

      if (parsedEntries.length === 0) {
        let msg = 'No encontramos pólizas válidas para importar. Revisa que el archivo contenga cuentas y montos correctos (la suma de debe y haber debe coincidir).';
        if (unmatchedAccounts.length > 0) {
          msg = `Las siguientes cuentas no están en tu catálogo de cuentas: ${unmatchedAccounts.slice(0, 5).join(', ')}. Verifica que los nombres sean idénticos en ambos lados.`;
        }
        onSetModal({ type: 'error', title: 'Error de Importación', message: msg });
        return;
      }

      onImportPolizas(entriesToPolizasDiarias(parsedEntries, accounts));
      onSetModal({
        type: 'success',
        title: '¡Importación Lista!',
        message: `Hemos cargado con éxito ${parsedEntries.length} pólizas diarias desde el archivo Excel. Los folios se asignaron automáticamente.`
      });
      e.target.value = '';
    } catch {
      // Quirk congelado (§4.5): el catch siempre muestra el mensaje genérico,
      // aunque el parser tenga mensajes específicos.
      onSetModal({
        type: 'error',
        title: 'Formato no soportado',
        message: 'No pudimos leer el archivo correctamente. Asegúrate de que sea un archivo Excel válido (.xlsx) y utiliza la plantilla proporcionada.'
      });
    }
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
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDescargarPlantilla}
            title="Descargar plantilla de Excel para importación"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600/20 transition-colors text-sm font-medium"
          >
            <FileUp className="w-4 h-4" /> Plantilla
          </button>
          <div className="relative">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={handleImportExcel}
            />
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-600/20 transition-colors text-sm font-medium"
            >
              <Upload className="w-4 h-4" /> Importar Excel
            </button>
          </div>
          {pendientesFolio.length > 0 && (
            <button
              type="button"
              onClick={() => setModalFoliosOpen(true)}
              title="Asignar el siguiente folio disponible a las pólizas que quedaron pendientes del merge"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-colors text-sm font-medium"
            >
              <Hash className="w-4 h-4" /> Asignar pendientes ({pendientesFolio.length})
            </button>
          )}
          <button
            type="button"
            onClick={openNueva}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Nueva Póliza
          </button>
        </div>
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

      {/* F-6 (PLAN_FUSION_BOVEDA.md): acción manual SOLO cuando hay pendientes; */}
      {/* la asignación en sí la ejecuta el hook dueño (App) y el toast viaja por App. */}
      {modalFoliosOpen && (
        <AsignarFoliosPendientesModal
          polizas={polizas}
          onConfirmar={handleConfirmarFolios}
          onClose={() => setModalFoliosOpen(false)}
        />
      )}
    </div>
  );
}
