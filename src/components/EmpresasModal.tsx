/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Building2, Plus, Trash2, Users } from 'lucide-react';
import { Empresa } from '../types';

/**
 * Gestor de CLIENTES (C-1 de PLAN_MULTI_CLIENTE.md): selector + alta/renombre/
 * RFC/baja. El switch dispara la recarga orquestada de useAppData (C-4); la
 * baja pide confirmación en App vía ConfirmDeleteData tipo 'empresa' (C-8) y
 * el botón de eliminar queda deshabilitado si es el último cliente.
 */
export function EmpresasModal({
  isOpen,
  onClose,
  empresas,
  activaId,
  onSetActiva,
  onCrear,
  onEditar,
  onEliminarSolicitud
}: {
  isOpen: boolean,
  onClose: () => void,
  empresas: Empresa[],
  activaId: string | null,
  onSetActiva: (id: string) => void,
  onCrear: (nombre: string) => void,
  onEditar: (id: string, cambios: { nombre?: string; rfc?: string }) => void,
  onEliminarSolicitud: (empresa: Empresa) => void
}) {
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nombreEnEdicion, setNombreEnEdicion] = useState('');
  const [rfcEnEdicion, setRfcEnEdicion] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const esClienteUnico = useMemo(() => empresas.length <= 1, [empresas.length]);

  // Edición con borrador local; el RFC se normaliza en mayúsculas al comitear.
  const activarEdicion = (empresa: Empresa) => {
    setEditandoId(empresa.id);
    setNombreEnEdicion(empresa.nombre);
    setRfcEnEdicion(empresa.rfc ?? '');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-noche/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
        data-testid="empresas-modal"
      >
        {/* Encabezado */}
        <div className="px-6 pt-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3 text-indigo-300">
            <Users className="w-6 h-6" />
            <h3 className="text-xl font-semibold">Clientes</h3>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Cada cliente tiene su propio catálogo, activos fijos, inventario, pólizas y RFC.
          </p>
        </div>

        {/* Lista de clientes */}
        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          {empresas.map(empresa => {
            const esActiva = empresa.id === activaId;
            const enEdicion = editandoId === empresa.id;
            return (
              <div
                key={empresa.id}
                className={
                  enEdicion
                    ? 'p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10'
                    : 'p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors'
                }
              >
                {enEdicion ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={nombreEnEdicion}
                        onChange={e => setNombreEnEdicion(e.target.value)}
                        placeholder="Nombre del cliente"
                        aria-label="Nombre del cliente"
                        className="flex-1 bg-slate-950/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <input
                      type="text"
                      value={rfcEnEdicion}
                      onChange={e => setRfcEnEdicion(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                      placeholder="RFC del cliente (para los XML SAT)"
                      aria-label="RFC del cliente"
                      className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditandoId(null)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => {
                          const nombre = nombreEnEdicion.trim();
                          onEditar(empresa.id, {
                            ...(nombre ? { nombre } : {}),
                            rfc: rfcEnEdicion.trim().toUpperCase() || undefined
                          });
                          setEditandoId(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {empresa.nombre}
                        {esActiva && (
                          <span className="ml-2 text-[10px] font-mono text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.5 rounded align-middle">Activo</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate font-mono">{empresa.rfc || 'Sin RFC'}</p>
                    </div>
                    {!esActiva && (
                      <button
                        onClick={() => onSetActiva(empresa.id)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                      >
                        Usar
                      </button>
                    )}
                    <button
                      onClick={() => activarEdicion(empresa)}
                      className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors"
                      data-testid={`editar-empresa-${empresa.id}`}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => onEliminarSolicitud(empresa)}
                      disabled={esClienteUnico}
                      title={esClienteUnico ? 'No puedes eliminar el último cliente' : 'Eliminar cliente'}
                      aria-label={`Eliminar cliente ${empresa.nombre}`}
                      data-testid={`eliminar-empresa-${empresa.id}`}
                      className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Alta de cliente */}
        <div className="px-6 pb-6 pt-4 border-t border-white/10 flex gap-2">
          <input
            type="text"
            value={nuevoNombre}
            onChange={e => setNuevoNombre(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && nuevoNombre.trim()) {
                onCrear(nuevoNombre.trim());
                setNuevoNombre('');
              }
            }}
            placeholder="Nombre del nuevo cliente"
            aria-label="Nombre del nuevo cliente"
            className="flex-1 bg-slate-950/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => {
              if (!nuevoNombre.trim()) return;
              onCrear(nuevoNombre.trim());
              setNuevoNombre('');
            }}
            disabled={!nuevoNombre.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar Cliente
          </button>
        </div>

        <div className="px-6 pb-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-sm font-medium"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
