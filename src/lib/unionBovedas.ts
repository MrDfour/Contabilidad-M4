/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Librería PURA de fusión de bóvedas (Fase A de PLAN_FUSION_BOVEDA.md).
 *
 * Reglas vigentes (F-1 … F-6 del plan):
 * - F-1: el merge solo une ALTAS; los borrados no viajan (snapshot sigue v3).
 * - F-2: entrantes con folio LIBRE lo conservan; los colisionantes (mismo tipo,
 *   folio tomado) reciben una decisión explícita: re-foliar por `capturadoEn`,
 *   folio pendiente (0) o al final consecutivo del tipo.
 * - F-3: mismo `id` en ambos lados con contenido distinto → gana el
 *   `editadoEn` más reciente (sin estampados: gana la local).
 * - F-4: inventarios finales y catálogo de empresas quedan del dispositivo que
 *   dispara el merge; cuentas y activos fijos se unen por `id` (id existente →
 *   gana el local).
 * - F-5: duplicados sospechosos (tipo+fecha+concepto) requieren decisión
 *   explícita; SIN decisión se excluyen.
 * - F-6: los folios pendientes (0) se asignan después con la acción de lote
 *   "Asignar folios pendientes" (no vive aquí; la librería solo produce el 0).
 *
 * Pura: ninguna función muta sus entradas ni toca storage/red/UI. La re-foliación
 * (a) solo reordena el LOTE del conflicto (el emisor local que compite por ese
 * folio más los entrantes elegidos); el resto de la serie local es sacrosanta.
 */

import type { Poliza, TipoPoliza } from '../types';
import type { BackupSnapshotV3, EmpresaWorkspace } from '../hooks/useBackup';
import { nextPolizaFolio } from './accounting';

/** Lado del que proviene la versión ganadora de una edición cruzada (F-3). */
export type LadoGanador = 'local' | 'remoto';

/** Decisión del usuario sobre un entrante colisionante de folio (F-2). */
export type DecisionFolio = 'refoliar' | 'pendiente' | 'final';

/** Edición cruzada resuelta por `editadoEn` (F-3). */
export interface EdicionGanadora {
  empresaId: string;
  polizaId: string;
  tipo: TipoPoliza;
  fecha: string;
  concepto: string;
  /** Lado cuya versión prevalece. */
  lado: LadoGanador;
  localEditadoEn?: string;
  remotoEditadoEn?: string;
}

/** Entrante con folio libre: entra tal cual (F-2). */
export interface EntranteDirecto {
  empresaId: string;
  poliza: Poliza;
}

/** Entrante en colisión de folio: requiere decisión del usuario (F-2). */
export interface ColisionFolio {
  empresaId: string;
  poliza: Poliza;
  /** Ids de pólizas LOCALES con el mismo tipo+folio. */
  contraLocalIds: string[];
  /** Ids de OTROS entrantes del mismo tipo+folio (colisión mutua). */
  contraEntrantesIds: string[];
}

/** Duplicado sospechoso: gemela local de tipo+fecha+concepto (F-5). */
export interface DuplicadoSospechoso {
  empresaId: string;
  poliza: Poliza;
  contraLocalId: string;
}

/** Cliente del REMOTO que el local no tiene: sus datos NO se fusionan (F-4). */
export interface EmpresaFaltante {
  id: string;
  nombre: string;
  polizas: number;
}

/** Diagnóstico del merge: TODO lo que la pantalla de revisión necesita. */
export interface AnalisisFusion {
  ediciones: EdicionGanadora[];
  entrantesDirectos: EntranteDirecto[];
  colisionesFolio: ColisionFolio[];
  duplicados: DuplicadoSospechoso[];
  empresasFaltantes: EmpresaFaltante[];
  totales: { local: number; remoto: number };
}

/** Decisiones del usuario tomadas en la pantalla de revisión (F-2/F-5). */
export interface DecisionesFusion {
  /** polizaId del entrante colisionante → decisión. Sin entrada: 'pendiente' (defensivo). */
  folios?: Record<string, DecisionFolio>;
  /** Ids de duplicados sospechosos que el usuario SÍ quiere incluir. Sin entrada: excluidos. */
  incluirDuplicados?: string[];
}

/** Resumen post-aplicación (para el toast y el registro). */
export interface ResumenFusion {
  sumadas: number;
  reFoliadas: number;
  localesReFoliadas: number;
  pendientes: number;
  finales: number;
  edicionesRemotoGanan: number;
  edicionesLocalGanan: number;
  excluidas: number;
  cuentasAgregadas: number;
  activosAgregados: number;
}

/** Contenido estable de una póliza (sin folio ni estampados): base de F-3. */
const contenidoEstable = (p: Poliza): string =>
  JSON.stringify([
    p.tipo,
    p.fecha,
    p.concepto,
    p.partidas,
    p.totalDebe,
    p.totalHaber,
    p.uuidSat ?? null,
    p.elaboro ?? null,
    p.reviso ?? null,
    p.autorizo ?? null,
  ]);

/** true si la póliza entrante es gemela sospechosa de una local (F-5). */
const esDuplicadoSospechoso = (entrante: Poliza, locales: Poliza[]): Poliza | null =>
  locales.find((p) => p.tipo === entrante.tipo && p.fecha === entrante.fecha && p.concepto === entrante.concepto) ?? null;

/**
 * Gana la edición con `editadoEn` más reciente. Empate o pólizas legadas sin
 * estampar: gana la local (F-3). Devuelve true solo cuando el remoto gana.
 */
const ganaRemoto = (local: Poliza, remoto: Poliza): boolean => {
  const tLocal = Date.parse(local.editadoEn ?? '') || 0;
  const tRemoto = Date.parse(remoto.editadoEn ?? '') || 0;
  return tRemoto > tLocal;
};

/** Clave de orden de captura: `capturadoEn`, con la fecha fiscal como respaldo legado. */
const claveCaptura = (p: Poliza): string => p.capturadoEn ?? `${p.fecha}T${p.id}`;

const resolverColisionesEntrantes = (
  entrantes: Poliza[],
  locales: Poliza[]
): Map<string, ColisionFolio['contraLocalIds']> => {
  // Mapa de folios ocupados por tipo en el lado local.
  const ocupadas = new Map<string, string[]>();
  for (const p of locales) {
    const k = `${p.tipo}:${p.folio}`;
    const lista = ocupadas.get(k) ?? [];
    lista.push(p.id);
    ocupadas.set(k, lista);
  }
  const cruces = new Map<string, string[]>();
  const ocurrencias = new Map<string, number>();
  for (const e of entrantes) {
    const k = `${e.tipo}:${e.folio}`;
    ocurrencias.set(k, (ocurrencias.get(k) ?? 0) + 1);
  }
  for (const e of entrantes) {
    const k = `${e.tipo}:${e.folio}`;
    const contraLocal = ocupadas.get(k) ? ocupadas.get(k)!.filter((id) => id !== e.id) : [];
    const contraEntrantes = (ocurrencias.get(k) ?? 0) > 1 ? ['mutua'] : [];
    if (contraLocal.length > 0 || contraEntrantes.length > 0) cruces.set(e.id, contraLocal.concat(contraEntrantes));
  }
  return cruces;
};

const cuentaUniones = <T extends { id: string }>(
  locales: T[],
  remotas: T[]
): { unidas: T[]; agregadas: number } => {
  const ids = new Set(locales.map((a) => a.id));
  const nuevos: T[] = [];
  for (const item of remotas) {
    if (!ids.has(item.id)) {
      ids.add(item.id);
      nuevos.push(item);
    }
  }
  return { unidas: locales.concat(nuevos.map((n) => ({ ...n }))), agregadas: nuevos.length };
};

const clonarWorkspace = (ws: EmpresaWorkspace): EmpresaWorkspace => ({
  ...ws,
  polizas: ws.polizas.map((p) => ({ ...p })),
  accounts: ws.accounts.map((a) => ({ ...a })),
  fixedAssets: ws.fixedAssets.map((f) => ({ ...f })),
  finalInventories: { ...ws.finalInventories },
});

/** Clave de grupo de re-foliación: tipo + folio en disputa. */
const claveGrupo = (tipo: TipoPoliza, folio: number): string => `${tipo}:${folio}`;

/**
 * Diagnosticar la fusión SIN tocar nada: qué se sumaría directo, qué entra en
 * colisión de folio, qué ediciones cruzadas ganaría cada lado, qué pares son
 * duplicados sospechosos y qué clientes del remoto no existen allá (F-4).
 */
export function analizarFusion(local: BackupSnapshotV3, remoto: BackupSnapshotV3): AnalisisFusion {
  const analisis: AnalisisFusion = {
    ediciones: [],
    entrantesDirectos: [],
    colisionesFolio: [],
    duplicados: [],
    empresasFaltantes: [],
    totales: { local: 0, remoto: 0 },
  };

  const idsLocal = new Set(local.empresas.map((e) => e.id));
  for (const e of remoto.empresas) {
    if (!idsLocal.has(e.id)) {
      analisis.empresasFaltantes.push({ id: e.id, nombre: e.nombre, polizas: e.polizas.length });
    }
  }

  for (const wsLocal of local.empresas) {
    const wsRemota = remoto.empresas.find((e) => e.id === wsLocal.id);
    analisis.totales.local += wsLocal.polizas.length;
    if (!wsRemota) continue;
    analisis.totales.remoto += wsRemota.polizas.length;

    const localPorId = new Map(wsLocal.polizas.map((p) => [p.id, p]));
    const remotaPorId = new Map(wsRemota.polizas.map((p) => [p.id, p]));

    // F-3: ediciones cruzadas del mismo id.
    for (const [id, remota] of remotaPorId) {
      const localP = localPorId.get(id);
      if (!localP) continue; // entrante: se clasifica abajo.
      if (contenidoEstable(localP) === contenidoEstable(remota)) continue; // idéntica: nada que decidir.
      const lado: LadoGanador = ganaRemoto(localP, remota) ? 'remoto' : 'local';
      analisis.ediciones.push({
        empresaId: wsLocal.id,
        polizaId: id,
        tipo: localP.tipo,
        fecha: localP.fecha,
        concepto: localP.concepto,
        lado,
        localEditadoEn: localP.editadoEn,
        remotoEditadoEn: remota.editadoEn,
      });
    }

    // Entrantes del remoto (ids ausentes en el local).
    const entrantes = wsRemota.polizas.filter((p) => !localPorId.has(p.id));
    const cruces = resolverColisionesEntrantes(entrantes, wsLocal.polizas);

    for (const remota of entrantes) {
      const gemela = esDuplicadoSospechoso(remota, wsLocal.polizas);
      const colision = cruces.has(remota.id);
      if (gemela) {
        analisis.duplicados.push({ empresaId: wsLocal.id, poliza: remota, contraLocalId: gemela.id });
      }
      if (colision) {
        const contra = cruces.get(remota.id)!;
        const contraLocalIds = contra.filter((x) => x !== 'mutua');
        const contraEntrantesIds =
          contra.some((x) => x === 'mutua')
            ? entrantes
                .filter((p) => p.id !== remota.id && p.tipo === remota.tipo && p.folio === remota.folio)
                .map((p) => p.id)
            : [];
        analisis.colisionesFolio.push({
          empresaId: wsLocal.id,
          poliza: remota,
          contraLocalIds,
          contraEntrantesIds,
        });
      }
      if (!gemela && !colision) {
        analisis.entrantesDirectos.push({ empresaId: wsLocal.id, poliza: remota });
      }
    }
  }

  return analisis;
}

/**
 * Aplicar la fusión con las decisiones del usuario y regresar el snapshot
 * final (v3), listo para aplicar y publicar como versión nueva (F-7; la huella
 * antieco se salta en la publicación, que es tarea de la Fase B).
 *
 * Defensa en profundidad: entrante colisionante SIN decisión → folio pendiente
 * (0); duplicado SIN inclusión explícita → excluido (F-5).
 */
export function aplicarFusion(
  local: BackupSnapshotV3,
  remoto: BackupSnapshotV3,
  decisiones: DecisionesFusion = {}
): { snapshot: BackupSnapshotV3; resumen: ResumenFusion } {
  const analisis = analizarFusion(local, remoto);
  const resumen: ResumenFusion = {
    sumadas: 0,
    reFoliadas: 0,
    localesReFoliadas: 0,
    pendientes: 0,
    finales: 0,
    edicionesRemotoGanan: 0,
    edicionesLocalGanan: 0,
    excluidas: 0,
    cuentasAgregadas: 0,
    activosAgregados: 0,
  };

  const incluirDuplicado = new Set(decisiones.incluirDuplicados ?? []);

  const empresas = local.empresas.map((wsLocal) => clonarWorkspace(wsLocal));
  const wsPorId = new Map(empresas.map((ws) => [ws.id, ws]));

  // F-3: ediciones cruzadas (ganadoras ya calculadas en el análisis).
  for (const ed of analisis.ediciones) {
    const ws = wsPorId.get(ed.empresaId);
    if (!ws) continue;
    if (ed.lado === 'remoto') {
      const wsRemota = remoto.empresas.find((e) => e.id === ed.empresaId);
      const remota = wsRemota?.polizas.find((p) => p.id === ed.polizaId);
      if (remota) {
        const i = ws.polizas.findIndex((p) => p.id === ed.polizaId);
        if (i >= 0) ws.polizas[i] = { ...remota };
        resumen.edicionesRemotoGanan += 1;
      }
    } else {
      resumen.edicionesLocalGanan += 1;
    }
  }

  // F-1/F-2/F-5: entrantes por empresa, con las tres pasadas de folios.
  for (const wsLocal of local.empresas) {
    const ws = wsPorId.get(wsLocal.id)!;
    const wsRemota = remoto.empresas.find((e) => e.id === wsLocal.id);
    if (!wsRemota) continue; // empresa sin contraparte en el remoto: nada que fusionar (F-4).

    const idsEnWorkspace = new Set(ws.polizas.map((p) => p.id));
    const entrantes = wsRemota.polizas.filter((p) => !idsEnWorkspace.has(p.id));
    const cruces = resolverColisionesEntrantes(entrantes, ws.polizas);
    const esColisionante = (remota: Poliza): boolean => cruces.has(remota.id);

    /** Clasificación de cada entrante incluido y su papel. */
    const clasificar = (
      remota: Poliza
    ): { aceptar: boolean; decision?: DecisionFolio } => {
      const dup = esDuplicadoSospechoso(remota, ws.polizas);
      if (dup && !incluirDuplicado.has(remota.id)) return { aceptar: false }; // F-5: excluido por defecto.
      if (esColisionante(remota)) {
        return { aceptar: true, decision: decisiones.folios?.[remota.id] ?? 'pendiente' };
      }
      return { aceptar: true, decision: undefined }; // folio libre: entra tal cual.
    };

    const incluidos = entrantes
      .map((p) => ({ poliza: p, destino: clasificar(p) }))
      .filter((x) => x.destino.aceptar);
    resumen.excluidas += entrantes.length - incluidos.length;

    // Pasada 1 — entrantes directos: su folio estaba libre, entra tal cual.
    for (const { poliza } of incluidos) {
      if (esColisionante(poliza)) continue;
      ws.polizas.push({ ...poliza });
      resumen.sumadas += 1;
    }

    // Pasada 2 — grupos de re-foliación (F-2a): lote = emisor local + entrantes
    // de la misma (tipo, folio) elegidos con 'refoliar', en orden de captura.
    const grupos = new Map<string, { tipo: TipoPoliza; folio: number; entrantes: Poliza[] }>();
    for (const { poliza, destino } of incluidos) {
      if (destino.decision === 'refoliar') {
        const k = claveGrupo(poliza.tipo, poliza.folio);
        const g = grupos.get(k) ?? { tipo: poliza.tipo, folio: poliza.folio, entrantes: [] };
        g.entrantes.push({ ...poliza });
        grupos.set(k, g);
      }
    }
    for (const g of grupos.values()) {
      const idsGrupo = new Set(g.entrantes.map((p) => p.id));
      const emisores = ws.polizas.filter((p) => p.tipo === g.tipo && p.folio === g.folio);
      // El lote completo en orden de captura (locales primero en empates exactos).
      const lote: { p: Poliza; esLocal: boolean }[] = emisores
        .map((p) => ({ p, esLocal: true }))
        .concat(g.entrantes.map((p) => ({ p, esLocal: false })))
        .sort((a, b) => {
          const ca = claveCaptura(a.p);
          const cb = claveCaptura(b.p);
          return ca === cb ? (a.esLocal ? -1 : 1) : ca < cb ? -1 : 1;
        });
      // Folios tomados por el resto del tipo (fuera del lote): intocables.
      const ocupados = new Set(
        ws.polizas.filter((p) => p.tipo === g.tipo && !idsGrupo.has(p.id) && !emisores.includes(p)).map((p) => p.folio)
      );
      let prev = g.folio - 1;
      for (const miembro of lote) {
        let f = prev + 1;
        while (ocupados.has(f)) f += 1;
        if (miembro.p.folio !== f) {
          if (miembro.esLocal) resumen.localesReFoliadas += 1;
          else resumen.reFoliadas += 1;
          miembro.p.folio = f;
        }
        ocupados.add(f);
        prev = f;
      }
      for (const entrante of g.entrantes) {
        ws.polizas.push(entrante);
        resumen.sumadas += 1;
      }
    }

    // Pasada 3 — 'final': siguiente consecutivo disponible del tipo (ya con los
    // re-foliados y directos dentro).
    for (const { poliza, destino } of incluidos) {
      if (destino.decision !== 'final') continue;
      const nuevo = { ...poliza, folio: nextPolizaFolio(ws.polizas, poliza.tipo) };
      ws.polizas.push(nuevo);
      resumen.finales += 1;
      resumen.sumadas += 1;
    }

    // Pasada 4 — 'pendiente': folio 0 (centinela "sin asignar", F-6).
    for (const { poliza, destino } of incluidos) {
      if (destino.decision !== 'pendiente') continue;
      ws.polizas.push({ ...poliza, folio: 0 });
      resumen.pendientes += 1;
      resumen.sumadas += 1;
    }

    // F-4: catálogos unión por id (id existente: gana el local) y saldos locales.
    const cuentas = cuentaUniones(ws.accounts, wsRemota.accounts);
    ws.accounts = cuentas.unidas;
    resumen.cuentasAgregadas += cuentas.agregadas;
    const activos = cuentaUniones(ws.fixedAssets, wsRemota.fixedAssets);
    ws.fixedAssets = activos.unidas;
    resumen.activosAgregados += activos.agregadas;
    // finalInventories, nombre y rfc quedan como están (gana el que dispara).
  }

  return { snapshot: { empresas, activaId: local.activaId }, resumen };
}
