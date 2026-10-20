/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * FusionBovedaModal — pantalla de revisión del tercer camino del conflicto
 * K-7: "Fusionar ambos" (Fase C de PLAN_FUSION_BOVEDA.md).
 *
 * Reglas en pantalla (F-1…F-6 del plan):
 * - Ediciones cruzadas F-3: se RESUELVEN automáticas (gana editadoEn) y se
 *   LISTAN aquí para transparencia; nada se decide a mano.
 * - Folios colisionantes F-2: decisión POR ELEMENTO con tres opciones. La
 *   aplicación queda DESHABILITADA mientras falte alguna decisión.
 * - Duplicados sospechosos F-5: por defecto EXCLUIDOS; incluir requiere el
 *   checkbox explícito.
 * - Dominios no foliables F-4: se AVISA (locales ganan); no hay decisión.
 *
 * Pura con respecto a la aplicación: solo lee los dos snapshots v3 y produce
 * el snapshot fusionado con `aplicarFusion`; la publicación la hace el motor
 * (`VaultSyncEngine.aplicarSnapshotFusionado`) — nada de red aquí.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle2, GitMerge, Info } from 'lucide-react';
import type { Poliza } from '../../types';
import type { BackupSnapshotV3 } from '../../hooks/useBackup';
import {
  analizarFusion,
  aplicarFusion,
  type DecisionFolio,
  type ResumenFusion,
} from '../../lib/unionBovedas';

const PREFIJO_TIPO: Record<Poliza['tipo'], string> = { ingreso: 'ING', egreso: 'EGR', diario: 'DIA' };

/** Etiqueta de folio SIN tocar storage (solo display). */
const etiquetaFolio = (p: Poliza): string => `${PREFIJO_TIPO[p.tipo]}-${String(Math.max(p.folio, 0)).padStart(4, '0')}`;

const textoCaptura = (p: Poliza): string =>
  p.capturadoEn ? new Date(p.capturadoEn).toLocaleString() : 'sin hora de captura (legado)';

/** Edita la descripción de destino de folio (usada por los tres radios F-2). */
const OPCIONES_FOLIO: { valor: DecisionFolio; titulo: string; detalle: string }[] = [
  {
    valor: 'refoliar',
    titulo: 'Re-foliar por hora de captura',
    detalle: 'El lote del conflicto se re-ordena cronológicamente; puede renumerar la póliza local que compite por ese folio.',
  },
  {
    valor: 'pendiente',
    titulo: 'Folio pendiente',
    detalle: 'Entra sin folio (se muestra "pendiente"); se asigna después con "Asignar folios pendientes".',
  },
  {
    valor: 'final',
    titulo: 'Al final consecutivo',
    detalle: 'Toma el siguiente número disponible del tipo y se coloca al final de la serie local.',
  },
];

/** Texto del toast post-aplicación (lo consume App al concluir la fusión). */
export function narrarResumenFusion(resumen: ResumenFusion): string {
  const partes: string[] = [];
  if (resumen.sumadas > 0) partes.push(`${resumen.sumadas} póliza(s) sumadas`);
  if (resumen.edicionesRemotoGanan + resumen.edicionesLocalGanan > 0) {
    partes.push(`${resumen.edicionesRemotoGanan + resumen.edicionesLocalGanan} edición(es) cruzadas resueltas`);
  }
  if (resumen.reFoliadas > 0 || resumen.localesReFoliadas > 0) {
    partes.push(`${resumen.reFoliadas + resumen.localesReFoliadas} folio(s) re-foliado(s)`);
  }
  if (resumen.pendientes > 0) partes.push(`${resumen.pendientes} folio(s) pendiente(s)`);
  if (resumen.excluidas > 0) partes.push(`${resumen.excluidas} duplicado(s) excluido(s)`);
  if (resumen.cuentasAgregadas + resumen.activosAgregados > 0) {
    partes.push(`${resumen.cuentasAgregadas + resumen.activosAgregados} elemento(s) de catálogo sumados`);
  }
  return partes.length > 0 ? partes.join(', ') + '.' : 'No hubo cambios por aplicar.';
}

export interface FusionBovedaEntrada {
  local: BackupSnapshotV3;
  remoto: BackupSnapshotV3;
}

export function FusionBovedaModal({
  entrada,
  onAplicar,
  onCancelar,
}: {
  entrada: FusionBovedaEntrada | null;
  onAplicar: (snapshot: BackupSnapshotV3, resumen: ResumenFusion) => void;
  onCancelar: () => void;
}) {
  const [decisiones, setDecisiones] = useState<Record<string, DecisionFolio>>({});
  const [incluirDuplicados, setIncluirDuplicados] = useState<Set<string>>(new Set());
  const [seccion, setSeccion] = useState<'resumen' | 'folios' | 'duplicados'>('resumen');

  const analisis = useMemo(
    () => (entrada ? analizarFusion(entrada.local, entrada.remoto) : null),
    [entrada]
  );

  /** Faltan decisiones de folio → Aplicar deshabilitado (F-8: nada sin decisión). */
  const pendientesFolio = analisis ? analisis.colisionesFolio.filter((c) => !decisiones[c.poliza.id]) : [];

  if (!entrada || !analisis) {
    return (
      <AnimatePresence>{null}</AnimatePresence>
    );
  }

  const nombreEmpresa = (id: string): string =>
    entrada.local.empresas.find((e) => e.id === id)?.nombre ?? id;

  const aplicar = () => {
    const { snapshot, resumen } = aplicarFusion(entrada.local, entrada.remoto, {
      folios: decisiones,
      incluirDuplicados: Array.from(incluirDuplicados),
    });
    onAplicar(snapshot, resumen);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0a0f1d]/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        >
          {/* Encabezado */}
          <div className="p-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3 text-emerald-400 mb-2">
              <GitMerge className="w-6 h-6" />
              <h3 className="text-xl font-semibold">Revisar la fusión de ambos</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Se conservan las pólizas de los DOS lados. La publicación
              resultante será la única arriba para toda la bóveda.
            </p>
          </div>

          {/* Navegación de secciones */}
          <div className="px-6 pt-4 flex gap-2 text-xs">
            {([
              ['resumen', `Resumen (${analisis.entrantesDirectos.length + analisis.colisionesFolio.length})`],
              ['folios', `Folios en disputa (${analisis.colisionesFolio.length})`],
              ['duplicados', `Duplicados sospechosos (${analisis.duplicados.length})`],
            ] as const).map(([valor, texto]) => (
              <button
                key={valor}
                onClick={() => setSeccion(valor)}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  seccion === valor
                    ? 'bg-emerald-600/20 text-emerald-300 font-semibold'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
              >
                {texto}
              </button>
            ))}
          </div>

          {/* Contenido con desplazamiento */}
          <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
            {seccion === 'resumen' && (
              <>
                {analisis.ediciones.length > 0 && (
                  <div>
                    <p className="text-slate-300 text-sm font-semibold mb-2">
                      Ediciones cruzadas resueltas ({analisis.ediciones.length})
                    </p>
                    <ul className="space-y-2">
                      {analisis.ediciones.map((ed) => (
                        <li key={ed.polizaId} className="text-xs bg-white/5 rounded-lg p-3 leading-relaxed">
                          <span className="text-slate-300">
                            {PREFIJO_TIPO[ed.tipo]} · {ed.concepto} ({ed.fecha})
                          </span>
                          <span className={`ml-2 font-semibold ${ed.lado === 'local' ? 'text-indigo-300' : 'text-emerald-300'}`}>
                            gana {ed.lado === 'local' ? 'LO LOCAL' : 'LO REMOTO'}
                          </span>
                          <span className="block text-slate-500">
                            {ed.lado === 'local'
                              ? (ed.localEditadoEn ? `editado ${new Date(ed.localEditadoEn).toLocaleString()}` : 'sin edición más reciente del remoto')
                              : (ed.remotoEditadoEn ? `editado ${new Date(ed.remotoEditadoEn).toLocaleString()}` : 'sin estampado — regla de legado')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="text-xs bg-white/5 rounded-lg p-3 space-y-1.5 leading-relaxed">
                  <p className="text-slate-300 flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Se suman directo: {analisis.entrantesDirectos.length} póliza(s) con folio libre
                  </p>
                  {analisis.colisionesFolio.length > 0 && (
                    <p className="text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {analisis.colisionesFolio.length} póliza(s) entran con folio EN DISPUTA: decídelas en la pestaña "Folios en disputa".
                    </p>
                  )}
                  <p className="text-slate-400 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
                    Inventarios finales y clientes: quedan los de ESTE dispositivo. Cuentas y activos fijos se unen por id (los existentes conservan su versión local).
                  </p>
                  {analisis.empresasFaltantes.length > 0 && (
                    <p className="text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      El remoto trae pólizas de clientes que no existen aquí (NO se fusionan):
                      {analisis.empresasFaltantes.map((f) => ` "${f.nombre}" (${f.polizas})`).join(',')}.
                      Créalos primero si quieres integrarlas.
                    </p>
                  )}
                </div>
              </>
            )}

            {seccion === 'folios' && (
              <>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Estos entrantes chocan con folios ya tomados (por la serie
                  local o entre ellos). Cada uno necesita una decisión: la
                  aplicación queda bloqueada mientras falte alguna.
                </p>
                {analisis.colisionesFolio.map((col) => (
                  <div key={col.poliza.id} className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      <span className="font-semibold">{etiquetaFolio(col.poliza)}</span>
                      {' · '}{col.poliza.concepto} ({col.poliza.fecha} · {textoCaptura(col.poliza)})
                    </p>
                    <p className="text-[11px] text-amber-300 mb-2 leading-relaxed">
                      {col.contraLocalIds.length > 0
                        ? `El folio ${col.poliza.folio} de ${col.poliza.tipo} ya está tomado por ${col.contraLocalIds.length} póliza(s) local(es).`
                        : 'Dos entrantes traen este mismo folio entre sí.'}
                    </p>
                    <div className="space-y-1.5">
                      {OPCIONES_FOLIO.map((opcion) => (
                        <label
                          key={opcion.valor}
                          className={`flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                            decisiones[col.poliza.id] === opcion.valor
                              ? 'bg-emerald-600/15'
                              : 'hover:bg-white/5'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`folio-${col.poliza.id}`}
                            checked={decisiones[col.poliza.id] === opcion.valor}
                            onChange={() =>
                              setDecisiones((actuales) => ({ ...actuales, [col.poliza.id]: opcion.valor }))
                            }
                            className="mt-0.5 accent-emerald-500"
                          />
                          <span className="text-xs leading-relaxed">
                            <span className="text-slate-200 font-medium">{opcion.titulo}</span>
                            <span className="block text-slate-500">{opcion.detalle}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {analisis.colisionesFolio.length === 0 && (
                  <p className="text-slate-400 text-xs">Sin folios en disputa.</p>
                )}
              </>
            )}

            {seccion === 'duplicados' && (
              <>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Coincidentalmente iguales (mismo tipo, fecha y concepto) con
                  pólizas locales quedan EXCLUIDOS por defecto — la causa
                  habitual es capturar lo mismo desde dos dispositivos. Marca
                  "incluir" solo si son capturas genuinas distintas.
                </p>
                {analisis.duplicados.map((dup) => (
                  <label
                    key={dup.poliza.id}
                    className={`flex items-start gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
                      incluirDuplicados.has(dup.poliza.id) ? 'bg-emerald-600/15' : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={incluirDuplicados.has(dup.poliza.id)}
                      onChange={(e) =>
                        setIncluirDuplicados((actuales) => {
                          const neu = new Set(actuales);
                          if (e.target.checked) neu.add(dup.poliza.id);
                          else neu.delete(dup.poliza.id);
                          return neu;
                        })
                      }
                      className="mt-0.5 accent-emerald-500"
                    />
                    <span className="text-xs leading-relaxed">
                      <span className="text-slate-200 font-medium">
                        {etiquetaFolio(dup.poliza)} · {dup.poliza.concepto} ({dup.poliza.fecha})
                      </span>
                      <span className="block text-slate-500">
                        cliente {nombreEmpresa(dup.empresaId)} · gemela local id {dup.contraLocalId.slice(0, 8)}…
                      </span>
                    </span>
                  </label>
                ))}
                {analisis.duplicados.length === 0 && (
                  <p className="text-slate-400 text-xs">Sin duplicados sospechosos — nada que decidir.</p>
                )}
              </>
            )}
          </div>

          {/* Pie: aplicar/cancelar */}
          <div className="p-6 pt-4 border-t border-white/10">
            {pendientesFolio.length > 0 && (
              <p className="text-amber-300 text-xs mb-3 leading-relaxed">
                Faltan decisiones: {pendientesFolio.length} póliza(s) con folio
                {' '}en disputa. El botón se habilita cuando todas queden decididas.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={onCancelar}
                className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={aplicar}
                disabled={pendientesFolio.length > 0}
                className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-lg shadow-emerald-500/20 text-sm font-semibold"
              >
                Aplicar fusión
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
