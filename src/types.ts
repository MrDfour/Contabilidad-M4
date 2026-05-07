/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
}

export interface Movement {
  accountId: string;
  type: 'debit' | 'credit';
  amount: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  movements: Movement[];
}

export interface Journal {
  id: string;
  name: string;
  entries: JournalEntry[];
}

export interface FixedAsset {
  id: string;
  name: string;
  acquisitionDate: string; // YYYY-MM-DD
  originalAmount: number; // Monto Original de la Inversión (MOI)
  assetAccountId: string; // ID de la cuenta de activo (ej. anc-4)
  accumulatedDeprAccountId: string; // ID de la contra-cuenta
  expenseAccountId: string; // ID de la cuenta de gasto
  fiscalRate: number; // Porcentaje anual (ej. 0.30)
  isDisposed: boolean;
}

export const INITIAL_ACCOUNTS: Account[] = [
  // Activo Circulante
  { id: 'ac-1', code: '1101', name: 'Caja', type: 'asset' },
  { id: 'ac-2', code: '1102', name: 'Bancos', type: 'asset' },
  { id: 'ac-3', code: '1103', name: 'Inversiones Temporales', type: 'asset' },
  { id: 'ac-4', code: '1104', name: 'Almacén / Inventarios', type: 'asset' },
  { id: 'ac-5', code: '1105', name: 'Clientes', type: 'asset' },
  { id: 'ac-6', code: '1106', name: 'Documentos por Cobrar', type: 'asset' },
  { id: 'ac-7', code: '1107', name: 'Deudores Diversos', type: 'asset' },
  { id: 'ac-8', code: '1108', name: 'IVA Acreditable', type: 'asset' },
  { id: 'ac-9', code: '1109', name: 'IVA por Acreditar', type: 'asset' },
  { id: 'ac-10', code: '1110', name: 'Anticipo a Proveedores', type: 'asset' },

  // Activo No Circulante
  { id: 'anc-1', code: '1201', name: 'Terrenos', type: 'asset' },
  { id: 'anc-2', code: '1202', name: 'Edificios', type: 'asset' },
  { id: 'anc-2b', code: '1202b', name: 'Edificio', type: 'asset' },
  { id: 'anc-3', code: '1203', name: 'Mobiliario y Equipo de Oficina', type: 'asset' },
  { id: 'anc-4', code: '1204', name: 'Equipo de Cómputo', type: 'asset' },
  { id: 'anc-5', code: '1205', name: 'Equipo de Entrega o Reparto', type: 'asset' },
  { id: 'anc-6', code: '1206', name: 'Depósitos en Garantía', type: 'asset' },
  { id: 'anc-7', code: '1207', name: 'Gastos de Instalación', type: 'asset' },
  { id: 'anc-8', code: '1208', name: 'Gastos de Organización', type: 'asset' },
  { id: 'anc-9', code: '1209', name: 'Propaganda y Publicidad', type: 'asset' },
  { id: 'anc-10', code: '1210', name: 'Primas de Seguros', type: 'asset' },
  { id: 'anc-11', code: '1211', name: 'Rentas Pagadas por Anticipado', type: 'asset' },
  { id: 'anc-12', code: '1212', name: 'Intereses Pagados por Anticipado', type: 'asset' },
  { id: 'anc-13', code: '1213', name: 'Depreciación Acumulada de Edificios', type: 'asset' },
  { id: 'anc-14', code: '1214', name: 'Depreciación Acumulada de Mobiliario', type: 'asset' },
  { id: 'anc-15', code: '1215', name: 'Depreciación Acumulada de Eq. Cómputo', type: 'asset' },
  { id: 'anc-16', code: '1216', name: 'Depreciación Acumulada de Eq. Reparto', type: 'asset' },
  { id: 'anc-17', code: '1217', name: 'Deterioro Acumulado de Activos Fijos', type: 'asset' },

  // Pasivo a Corto Plazo
  { id: 'pcp-1', code: '2101', name: 'Proveedores', type: 'liability' },
  { id: 'pcp-2', code: '2102', name: 'Documentos por Pagar', type: 'liability' },
  { id: 'pcp-3', code: '2103', name: 'Acreedores Diversos', type: 'liability' },
  { id: 'pcp-4', code: '2104', name: 'IVA Trasladado', type: 'liability' },
  { id: 'pcp-5', code: '2105', name: 'IVA por Trasladar', type: 'liability' },
  { id: 'pcp-6', code: '2106', name: 'Impuestos y Cuotas por Pagar', type: 'liability' },
  { id: 'pcp-8', code: '2108', name: 'Sueldos por pagar', type: 'liability' },
  { id: 'pcp-7', code: '2107', name: 'Anticipo de Clientes', type: 'liability' },

  // Pasivo a Largo Plazo
  { id: 'plp-1', code: '2201', name: 'Hipotecas por Pagar / Acreedores Hipotecarios', type: 'liability' },
  { id: 'plp-2', code: '2202', name: 'Documentos por Pagar a Largo Plazo', type: 'liability' },
  { id: 'plp-3', code: '2203', name: 'Rentas Cobradas por Anticipado', type: 'liability' },
  { id: 'plp-4', code: '2204', name: 'Intereses Cobrados por Anticipado', type: 'liability' },

  // Capital Contable
  { id: 'cc-1', code: '3101', name: 'Capital Social', type: 'equity' },
  { id: 'cc-1b', code: '3101b', name: 'Capital', type: 'equity' },
  { id: 'cc-2', code: '3102', name: 'Reserva Legal', type: 'equity' },
  { id: 'cc-3', code: '3103', name: 'Utilidad del Ejercicio', type: 'equity' },
  { id: 'cc-4', code: '3104', name: 'Pérdida del Ejercicio', type: 'equity' },
  { id: 'cc-5', code: '3105', name: 'Utilidades Acumuladas / Retenidas', type: 'equity' },
  { id: 'cc-6', code: '3106', name: 'Pérdidas Acumuladas', type: 'equity' },

  // Cuentas de Resultados (Ingresos)
  { id: 'ri-1', code: '4101', name: 'Ventas', type: 'revenue' },
  { id: 'ri-2', code: '4102', name: 'Devoluciones sobre Ventas', type: 'revenue' },
  { id: 'ri-3', code: '4103', name: 'Descuentos sobre Ventas', type: 'revenue' },
  { id: 'ri-4', code: '4104', name: 'Productos Financieros', type: 'revenue' },
  { id: 'ri-5', code: '4105', name: 'Otros Productos', type: 'revenue' },

  // Cuentas de Resultados (Costos y Gastos)
  { id: 're-1', code: '5101', name: 'Compras', type: 'expense' },
  { id: 're-2', code: '5102', name: 'Gastos de Compra', type: 'expense' },
  { id: 're-3', code: '5103', name: 'Devoluciones sobre Compras', type: 'expense' },
  { id: 're-4', code: '5104', name: 'Descuentos sobre Compras', type: 'expense' },
  { id: 're-5', code: '5105', name: 'Inventario Inicial', type: 'expense' },
  { id: 're-6', code: '5106', name: 'Inventario Final', type: 'expense' },
  { id: 're-7', code: '5107', name: 'Costo de Ventas', type: 'expense' },
  { id: 're-8', code: '5108', name: 'Gastos de Venta', type: 'expense' },
  { id: 're-9', code: '5109', name: 'Gastos de Administración', type: 'expense' },
  { id: 're-10', code: '5110', name: 'Gastos Financieros', type: 'expense' },
  { id: 're-11', code: '5111', name: 'Otros Gastos', type: 'expense' },
  { id: 're-12', code: '5112', name: 'Gasto por Depreciación', type: 'expense' },
  { id: 're-13', code: '5113', name: 'Pérdida por Deterioro', type: 'expense' },
];
