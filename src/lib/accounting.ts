/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { JournalEntry, Account, FixedAsset, TAccountsData, TAccountColumns, Poliza, PartidaPoliza, TipoPoliza } from '../types';
import { normalizeAmount } from './format';

/**
 * Cálculos contables como funciones puras (sin React, sin storage, sin DOM).
 * Fuente ÚNICA de la derivación: Cuentas T y saldos por naturaleza de la cuenta.
 * Ver REFACTORING_PLAN.md, Fase 1 — habilita pruebas unitarias en Node (Fase 5).
 */

/** Agrupa los movimientos de un diario en Cuentas T (debe/haber con ref del asiento, 1-index). */
export const buildTAccountsData = (entries: JournalEntry[]): TAccountsData => {
  const data: TAccountsData = {};

  entries.forEach((entry, index) => {
    entry.movements.forEach(mov => {
      if (!data[mov.accountId]) {
        data[mov.accountId] = { debits: [], credits: [] };
      }
      const accountData: TAccountColumns = data[mov.accountId];
      if (mov.type === 'debit') {
        accountData.debits.push({ amount: normalizeAmount(mov.amount), ref: index + 1 });
      } else {
        accountData.credits.push({ amount: normalizeAmount(mov.amount), ref: index + 1 });
      }
    });
  });

  return data;
};

/**
 * Saldos por cuenta con su natureza estándar:
 * deudora para activo/gasto (debe − haber), acreedora para pasivo/capital/ingreso (haber − debe).
 */
export const computeAccountBalances = (
  tAccountsData: TAccountsData,
  accounts: Account[]
): Record<string, number> => {
  const balances: Record<string, number> = {};
  Object.entries(tAccountsData).forEach(([accountId, data]) => {
    const totalDebit = normalizeAmount(data.debits.reduce((sum, d) => sum + d.amount, 0));
    const totalCredit = normalizeAmount(data.credits.reduce((sum, c) => sum + c.amount, 0));
    const account = accounts.find(a => a.id === accountId);

    if (account?.type === 'asset' || account?.type === 'expense') {
      balances[accountId] = normalizeAmount(totalDebit - totalCredit);
    } else {
      balances[accountId] = normalizeAmount(totalCredit - totalDebit);
    }
  });
  return balances;
};

/** Depreciación mensual fiscal: MOI × tasa anual ÷ 12. */
export const calculateMonthlyDepreciation = (asset: FixedAsset): number => {
  return (asset.originalAmount * asset.fiscalRate) / 12;
};

/**
 * Deducción fiscal de inversiones (Art. 31 LISR): MOI × tasa × factor de actualización INPC,
 * con el factor TRUNCADO (no redondeado) a 4 decimales.
 */
export const calculateFiscalDeduction = (
  asset: FixedAsset,
  inpcUltimoMesMitadPeriodo: number,
  inpcMesAdquisicion: number
): number => {
  const factorActualizacion = inpcUltimoMesMitadPeriodo / inpcMesAdquisicion;
  const factorTruncado = Math.trunc(factorActualizacion * 10000) / 10000;
  return (asset.originalAmount * asset.fiscalRate) * factorTruncado;
};

/**
 * Valida la partida doble de una póliza (Fase 1 módulo Pólizas).
 * Función pura: no toca estado. Tolerante a ambas columnas en 0.
 * Una póliza sin partidas NO se considera balanceada.
 */
export const validatePolizaBalance = (
  partidas: PartidaPoliza[]
): { isBalanced: boolean; totalDebe: number; totalHaber: number; difference: number } => {
  const totalDebe = normalizeAmount(partidas.reduce((sum, p) => sum + p.debit, 0));
  const totalHaber = normalizeAmount(partidas.reduce((sum, p) => sum + p.credit, 0));
  const difference = normalizeAmount(totalDebe - totalHaber);
  return {
    isBalanced: partidas.length > 0 && difference === 0,
    totalDebe,
    totalHaber,
    difference
  };
};

/**
 * Proyección de lectura: Poliza[] → JournalEntry[] (D-6: NO ordena — respeta el
 * orden de entrada; el orden cronológico lo aplica el consumidor).
 * Partida 0/0 no genera movimiento (defensa pasiva contra pólizas inválidas).
 */
export const flattenPolizasToJournalEntries = (polizas: Poliza[]): JournalEntry[] => {
  return polizas.map(poliza => ({
    id: poliza.id,
    date: poliza.fecha,
    description: poliza.concepto,
    policyType: poliza.tipo,
    movements: poliza.partidas
      .filter(p => p.debit > 0 || p.credit > 0)
      .map(p => ({
        accountId: p.accountId,
        type: p.debit > 0 ? ('debit' as const) : ('credit' as const),
        amount: p.debit > 0 ? p.debit : p.credit,
        uuidCFDI: p.uuidCFDI,
        rfcTercero: p.rfcTercero
      }))
  }));
};

/** Siguiente folio disponible para un tipo: max(folio) + 1, 1 si el tipo no tiene pólizas. */
export const nextPolizaFolio = (polizas: Poliza[], tipo: TipoPoliza): number => {
  const max = polizas.reduce(
    (acc, p) => (p.tipo === tipo && p.folio > acc ? p.folio : acc),
    0
  );
  return max + 1;
};

/**
 * Centinela de folio PENDIENTE (Fase A de PLAN_FUSION_BOVEDA.md): una póliza
 * entrante con folio en disputa puede entrar con `folio === 0` (decisión
 * "pendiente", F-2). `folio <= 0` no es un folio real: se muestra "PENDIENTE"
 * y se espera a la acción manual F-6 para cerrar la serie.
 */
export const esFolioPendiente = (poliza: Poliza): boolean => poliza.folio <= 0;

/**
 * F-6 — asignación MANUAL de folios pendientes (pura y sin estampados): a cada
 * póliza con `folio <= 0` le asigna el siguiente folio disponible de su tipo
 * (nextPolizaFolio), procesadas por `capturadoEn` ASCENDENTE (el orden en que
 * se capturaron cierra la serie cronológicamente; sin estampado, orden por
 * defección = primero). Devuelve la lista MUTADA en folio y las afectadas
 * (mismos ids, solo cambia `folio`) para reportarlas al usuario.
 */
export const asignarFoliosPendientes = (polizas: Poliza[]): {
  polizas: Poliza[];
  afectadas: Poliza[];
} => {
  const pendientes = polizas
    .filter(esFolioPendiente)
    .sort((a, b) => (a.capturadoEn ?? '').localeCompare(b.capturadoEn ?? ''));
  const working = [...polizas];
  const afectadas: Poliza[] = [];
  for (const p of pendientes) {
    const actualizada: Poliza = { ...p, folio: nextPolizaFolio(working, p.tipo) };
    working[working.indexOf(p)] = actualizada;
    afectadas.push(actualizada);
  }
  return { polizas: working, afectadas };
};

/** Folio para presentación: "ING-0001" | "EGR-0001" | "DIA-0001" (solo display, no storage).
 *  Un folio pendiente (centinela folio 0 del merge, F-2) se muestra "PENDIENTE". */
export const formatPolizaFolio = (poliza: Poliza): string => {
  if (esFolioPendiente(poliza)) return 'PENDIENTE';
  const prefix = { ingreso: 'ING', egreso: 'EGR', diario: 'DIA' }[poliza.tipo];
  return `${prefix}-${String(poliza.folio).padStart(4, '0')}`;
};

/**
 * Proyección de CAPTURA (D-10): un asiento emitido por las rutas programáticas
 * (depreciación de activos fijos, cierre de resultados) → PolizaInput que
 * consume usePolizas.createProgrammaticPoliza. Las capturas programáticas son
 * SIEMPRE tipo 'diario' y el concepto de partida queda vacío (los pointers
 * emiten la glosa general en description).
 */
export const entryToPolizaInput = (
  entry: Omit<JournalEntry, 'id'>,
  accounts: Account[]
): { tipo: TipoPoliza; fecha: string; concepto: string; partidas: PartidaPoliza[] } => ({
  tipo: 'diario',
  fecha: entry.date,
  concepto: entry.description,
  partidas: entry.movements
    .filter(m => m.amount > 0)
    .map(m => {
      const cuenta = accounts.find(a => a.id === m.accountId);
      return {
        id: crypto.randomUUID(),
        accountId: m.accountId,
        accountCode: cuenta?.code || '',
        accountName: cuenta?.name || '',
        debit: m.type === 'debit' ? normalizeAmount(m.amount) : 0,
        credit: m.type === 'credit' ? normalizeAmount(m.amount) : 0,
        concept: undefined,
        uuidCFDI: m.uuidCFDI,
        rfcTercero: m.rfcTercero
      };
    })
});

/**
 * Proyección de IMPORTACIÓN (D-11): los asientos de `parseJournalImport`
 * (reutilizado sin cambios — conserva el quirk de CONCEPTO/GLOSA) se convierten
 * a Pólizas tipo 'diario' para `usePolizas.importPolizas`, que asigna el folio
 * por tipo a las que llegan sin él (folio: 0 = "sin folio" → reasigna).
 * `validatePolizaBalance` alimenta totalDebe/totalHaber (D-7).
 */
export const entriesToPolizasDiarias = (entries: JournalEntry[], accounts: Account[]): Poliza[] => {
  return entries.map(entry => {
    const partidas = entryToPolizaInput(
      { date: entry.date, description: entry.description, movements: entry.movements },
      accounts
    ).partidas;
    const balance = validatePolizaBalance(partidas);
    return {
      id: entry.id, // el parser ya genera ids estables con crypto.randomUUID
      folio: 0,     // "sin folio": importPolizas reasigna por tipo (skip colisiones)
      tipo: 'diario' as const,
      fecha: entry.date,
      concepto: entry.description,
      partidas,
      totalDebe: balance.totalDebe,
      totalHaber: balance.totalHaber
    };
  });
};

/**
 * PÓLIZA DIARIA (formato clásico mexicano): consolida TODAS las pólizas de un
 * mismo día en una sola póliza tipo 'diario', agregando los importes por
 * cuenta Y lado (una cuenta cargada en varias pólizas del día sale con su
 * total del día en un solo renglón; si la misma cuenta fue cargada Y abonada
 * conserva dos renglones, cargo y abono). Los conceptos de partida agregados
 * se unen con " · ". El concepto general lista los conceptos de las pólizas
 * incluidas. Devuelve null si el día no tiene partidas con monto.
 * Solo para impresión/reportes: nunca se persiste (no entra al flujo usePolizas).
 */
export const consolidarPolizasDiaria = (fecha: string, polizasDelDia: Poliza[]): Poliza | null => {
  const agregadas = new Map<string, PartidaPoliza>();

  for (const p of polizasDelDia) {
    for (const part of p.partidas) {
      if (part.debit <= 0 && part.credit <= 0) continue;
      const lado: 'debit' | 'credit' = part.debit > 0 ? 'debit' : 'credit';
      const clave = `${part.accountId}|${lado}`;
      const previa = agregadas.get(clave);

      if (previa) {
        if (lado === 'debit') previa.debit = normalizeAmount(previa.debit + part.debit);
        else previa.credit = normalizeAmount(previa.credit + part.credit);
        // Merge de glosas únicas (agregación de renglones con el mismo destino).
        const glosas = new Set((previa.concept ?? '').split(' · ').filter(Boolean));
        if (part.concept?.trim()) glosas.add(part.concept.trim());
        previa.concept = glosas.size > 0 ? [...glosas].join(' · ') : undefined;
      } else {
        agregadas.set(clave, {
          id: `diaria-${fecha}-${part.accountId}-${lado}`,
          accountId: part.accountId,
          accountCode: part.accountCode,
          accountName: part.accountName,
          debit: lado === 'debit' ? normalizeAmount(part.debit) : 0,
          credit: lado === 'credit' ? normalizeAmount(part.credit) : 0,
          concept: part.concept?.trim() || undefined
        });
      }
    }
  }

  const partidas = [...agregadas.values()];
  if (partidas.length === 0) return null;

  const conceptos = polizasDelDia.map(p => p.concepto.trim()).filter(Boolean);
  const fechaLarga = new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  return {
    id: `diaria-${fecha}`,
    folio: 0, // sin folio: es un consolidado de impresión (la franja usa folioOverride)
    tipo: 'diario',
    fecha,
    concepto: `Póliza diaria del ${fechaLarga}. Incluye: ${conceptos.join(' · ')}`,
    partidas,
    totalDebe: normalizeAmount(partidas.reduce((s, p) => s + p.debit, 0)),
    totalHaber: normalizeAmount(partidas.reduce((s, p) => s + p.credit, 0))
  };
};
