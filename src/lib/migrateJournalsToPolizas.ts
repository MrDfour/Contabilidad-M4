/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Account, Journal, Poliza, PartidaPoliza, TipoPoliza } from '../types';
import { validatePolizaBalance } from './accounting';

/**
 * Migración ONE-SHOT de diarios legacy → pólizas (D-2/D-3/D-4 de PLAN_POLIZAS.md).
 * Función PURA: no toca storage ni estado de hooks.
 *
 * Determinismo (congelado por tests):
 * - Recorre journals y entries EN ORDEN DE ALMACENAMIENTO.
 * - Folio: contador consecutivo INDEPENDIENTE por tipo, iniciando en 1.
 * - ids reaprovechados (D-3): Poliza.id = JournalEntry.id;
 *   PartidaPoliza.id = `${entry.id}-p${i}` (jamás crypto.randomUUID aquí).
 * - Los asientos sin `policyType` nacen como tipo 'diario'.
 * - `contasis_journals` queda intacto: esta función solo es PARTE de la lectura.
 */
const TIPO_POR_DEFECTO: TipoPoliza = 'diario';

export const migrateJournalsToPolizas = (
  journals: Journal[],
  accounts: Account[]
): Poliza[] => {
  const foliosPorTipo: Record<TipoPoliza, number> = { ingreso: 0, egreso: 0, diario: 0 };
  const polizas: Poliza[] = [];

  journals.forEach(journal => {
    journal.entries.forEach(entry => {
      const tipo: TipoPoliza = entry.policyType ?? TIPO_POR_DEFECTO;
      foliosPorTipo[tipo] += 1;

      const partidas: PartidaPoliza[] = entry.movements.map((movement, index) => {
        const cuenta = accounts.find(a => a.id === movement.accountId);
        return {
          id: `${entry.id}-p${index}`,
          accountId: movement.accountId,
          accountCode: cuenta?.code ?? '',
          accountName: cuenta?.name ?? '',
          debit: movement.type === 'debit' ? movement.amount : 0,
          credit: movement.type === 'credit' ? movement.amount : 0,
          uuidCFDI: movement.uuidCFDI,
          rfcTercero: movement.rfcTercero
        };
      });

      const balance = validatePolizaBalance(partidas);
      polizas.push({
        id: entry.id,
        folio: foliosPorTipo[tipo],
        tipo,
        fecha: entry.date,
        concepto: entry.description,
        partidas,
        totalDebe: balance.totalDebe,
        totalHaber: balance.totalHaber
      });
    });
  });

  return polizas;
};
