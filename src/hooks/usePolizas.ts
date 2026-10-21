/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Poliza } from '../types';
import { saveToStorage } from '../services/storageService';
import { validatePolizaBalance, nextPolizaFolio, asignarFoliosPendientes as aplicarAsignacionFolios } from '../lib/accounting';
import { clavePorEmpresa } from '../lib/empresas';

/**
 * Hook del dominio PÓLIZAS (Fase 3 del plan PLAN_MULTI_CLIENTE.md).
 *
 * Dueño EXCLUSIVO de la clave POR CLIENTE `contasis_polizas_<empresaId>` (C-2);
 * la clave global sin sufijo quedó como ARCHIVO histórico tras la migración
 * one-shot de clientes (C-2, flag `contasis_empresas_migrated` del boot).
 *
 * Regla anti-R1: ninguna otra pieza ESCRIBE esta clave por su cuenta; las
 * escrituras multi-dominio (respaldo, sync, boot) viajan por el orquestador
 * de App vía `hydrate` (cliente activo) / `hydrateEmpresa` (cualquier cliente).
 *
 * Persistencia: el efecto persiste CON puerta `canSave`. Luego de la carga
 * persiste SIEMPRE, incluso con [] (sin eso, borrar todas las pólizas las
 * resucitaría). `hydrate` persiste explícitamente SIEMPRE.
 */
const POLIZAS_KEY = 'contasis_polizas';

/** Payload de alta/edición: el folio lo asigna el hook, los totales se recalculan (D-7). */
export type PolizaInput = Omit<Poliza, 'id' | 'folio' | 'totalDebe' | 'totalHaber'>;

export function usePolizas({ canSave, empresaId }: { canSave: boolean; empresaId: string | null }) {
  const [polizas, setPolizas] = useState<Poliza[]>([]);

  /** Clave del cliente activo (null antes del boot: el efecto no escribe). */
  const storageKey = empresaId ? clavePorEmpresa(POLIZAS_KEY, empresaId) : null;

  // Persistencia con puerta canSave (ver JSDoc del hook). Persiste incluso [].
  useEffect(() => {
    if (!canSave || !storageKey) return;
    saveToStorage(storageKey, polizas).catch(console.error);
  }, [polizas, canSave, storageKey]);

  /** D-9: línea final de defensa — al menos 2 partidas y Debe = Haber. Lanza si inválida. */
  const validarGuardar = (partidas: PolizaInput['partidas']) => {
    if (partidas.length < 2) {
      throw new Error('La póliza requiere al menos 2 partidas.');
    }
    const balance = validatePolizaBalance(partidas);
    if (!balance.isBalanced) {
      throw new Error('La póliza no cuadra: el Debe y el Haber deben ser iguales.');
    }
    return balance;
  };

  /** Fecha ISO con hora (estampados silenciosos del merge futuro); fallback: ahora. */
  const ahoraIso = () => new Date().toISOString();

  const createPoliza = (data: PolizaInput): Poliza => {
    const balance = validarGuardar(data.partidas);
    const nueva: Poliza = {
      ...data,
      id: crypto.randomUUID(),
      folio: nextPolizaFolio(polizas, data.tipo),
      totalDebe: balance.totalDebe,
      totalHaber: balance.totalHaber,
      capturadoEn: ahoraIso(),
      editadoEn: ahoraIso()
    };
    setPolizas(prev => [...prev, nueva]);
    return nueva;
  };

  /** D-10: alta programática sin UI (cierre de resultados, depreciación de activos). */
  const createProgrammaticPoliza = (data: PolizaInput): Poliza => createPoliza(data);

  /** D-8: tipo y folio congelados en edición; los totales SIEMPRE se recalculan.
   *  El estampado editadoEn es silencioso: solo sirve al futuro merge (gana la última). */
  const updatePoliza = (id: string, data: PolizaInput): void => {
    const balance = validarGuardar(data.partidas);
    setPolizas(prev => prev.map(p =>
      p.id === id
        ? {
            ...p,
            ...data,
            tipo: p.tipo,
            folio: p.folio,
            totalDebe: balance.totalDebe,
            totalHaber: balance.totalHaber,
            editadoEn: ahoraIso()
          }
        : p
    ));
  };

  const deletePoliza = (id: string): void => {
    setPolizas(prev => prev.filter(p => p.id !== id));
  };

  /** F-6 (PLAN_FUSION_BOVEDA.md): asignación MANUAL de folios pendientes
   *  (folio 0 del merge) en orden capturadoEn. Devuelve las tocadas para el
   *  reporte del usuario. NADA automático: solo corre cuando la acción se pide. */
  const asignarFoliosPendientes = (): Poliza[] => {
    const { polizas: futuras, afectadas } = aplicarAsignacionFolios(polizas);
    setPolizas(futuras);
    return afectadas;
  };

  /** Importación masiva (Excel / respaldos): folio ausente o colisionante → se reasigna por tipo.
   *  Si la póliza no trae capturadoEn se ESTIMA con su fecha contable (respaldos viejos importan
   *  de golpe; estamparlos todos "ahora" guardaría un orden falso — la fecha fiscal la conserva). */
  const importPolizas = (nuevas: Poliza[]): void => {
    setPolizas(prev => {
      const working = [...prev];
      const procesadas = nuevas.map(nueva => {
        let folio = nueva.folio;
        if (!folio || working.some(w => w.tipo === nueva.tipo && w.folio === folio)) {
          folio = nextPolizaFolio(working, nueva.tipo);
        }
        const captura = nueva.capturadoEn
          ?? (Number.isNaN(Date.parse(nueva.fecha)) ? ahoraIso() : new Date(nueva.fecha).toISOString());
        const polizaFinal: Poliza = { ...nueva, folio, capturadoEn: captura };
        working.push(polizaFinal);
        return polizaFinal;
      });
      return procesadas.length > 0 ? working : prev;
    });
  };

  /**
   * Reemplazo atómico + persistencia explícita SIEMPRE en la clave del
   * cliente ACTIVO (boot, sync, respaldo). Persiste incluso con []
   * (contrato original del hydrate). Con boot sin cliente activo
   * (storageKey null) solo escribe RAM.
   */
  const hydrate = (nextPolizas: Poliza[]): void => {
    setPolizas(nextPolizas);
    if (storageKey) {
      saveToStorage(storageKey, nextPolizas).catch(console.error);
    }
  };

  /**
   * C-5 (PLAN_MULTI_CLIENTE.md): escritura de la clave de UN cliente concreto
   * (boot-migración y restauración de respaldos de otros clientes). Anti-R1:
   * el hook dueño escribe SU clave sea cual sea el cliente; la RAM solo
   * cambia si el cliente objetivo es el activo.
   */
  const hydrateEmpresa = (empresaDestinoId: string, valor: Poliza[]): void => {
    if (empresaDestinoId === empresaId) {
      setPolizas(valor);
    }
    saveToStorage(clavePorEmpresa(POLIZAS_KEY, empresaDestinoId), valor).catch(console.error);
  };

  return {
    polizas,
    /** Escritura cruda en RAM (solo orquestador de App para carga por cliente — anti-R1). */
    setPolizas,
    createPoliza,
    createProgrammaticPoliza,
    updatePoliza,
    deletePoliza,
    asignarFoliosPendientes,
    importPolizas,
    hydrate,
    hydrateEmpresa
  };
}
