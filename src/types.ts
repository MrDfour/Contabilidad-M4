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
  subtype?: 'circulante' | 'no_circulante';
  satGroupCode?: string;
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
  { id: 'ac-1', code: '1101', name: 'Caja', type: 'asset', subtype: 'circulante', satGroupCode: '101.01' },
  { id: 'ac-2', code: '1102', name: 'Bancos', type: 'asset', subtype: 'circulante', satGroupCode: '102.01' },
  { id: 'ac-3', code: '1103', name: 'Inversiones Temporales', type: 'asset', subtype: 'circulante', satGroupCode: '103.01' },
  { id: 'ac-4', code: '1104', name: 'Almacén / Inventarios', type: 'asset', subtype: 'circulante', satGroupCode: '115.01' },
  { id: 'ac-5', code: '1105', name: 'Clientes', type: 'asset', subtype: 'circulante', satGroupCode: '105.01' },
  { id: 'ac-6', code: '1106', name: 'Documentos por Cobrar', type: 'asset', subtype: 'circulante', satGroupCode: '107.01' },
  { id: 'ac-7', code: '1107', name: 'Deudores Diversos', type: 'asset', subtype: 'circulante', satGroupCode: '108.01' },
  { id: 'ac-8', code: '1108', name: 'IVA Acreditable', type: 'asset', subtype: 'circulante', satGroupCode: '118.01' },
  { id: 'ac-9', code: '1109', name: 'IVA por Acreditar', type: 'asset', subtype: 'circulante', satGroupCode: '119.01' },
  { id: 'ac-10', code: '1110', name: 'Anticipo a Proveedores', type: 'asset', subtype: 'circulante', satGroupCode: '120.01' },

  // Activo No Circulante
  { id: 'anc-1', code: '1201', name: 'Terrenos', type: 'asset', subtype: 'no_circulante', satGroupCode: '151.01' },
  { id: 'anc-2', code: '1202', name: 'Edificios', type: 'asset', subtype: 'no_circulante', satGroupCode: '152.01' },
  { id: 'anc-2b', code: '1202b', name: 'Edificio', type: 'asset', subtype: 'no_circulante', satGroupCode: '152.01' },
  { id: 'anc-3', code: '1203', name: 'Mobiliario y Equipo de Oficina', type: 'asset', subtype: 'no_circulante', satGroupCode: '154.01' },
  { id: 'anc-4', code: '1204', name: 'Equipo de Cómputo', type: 'asset', subtype: 'no_circulante', satGroupCode: '156.01' },
  { id: 'anc-5', code: '1205', name: 'Equipo de Entrega o Reparto', type: 'asset', subtype: 'no_circulante', satGroupCode: '155.01' },
  { id: 'anc-6', code: '1206', name: 'Depósitos en Garantía', type: 'asset', subtype: 'no_circulante', satGroupCode: '183.01' },
  { id: 'anc-7', code: '1207', name: 'Gastos de Instalación', type: 'asset', subtype: 'no_circulante', satGroupCode: '171.01' },
  { id: 'anc-8', code: '1208', name: 'Gastos de Organización', type: 'asset', subtype: 'no_circulante', satGroupCode: '170.01' },
  { id: 'anc-9', code: '1209', name: 'Propaganda y Publicidad', type: 'asset', subtype: 'no_circulante', satGroupCode: '173.01' },
  { id: 'anc-10', code: '1210', name: 'Primas de Seguros', type: 'asset', subtype: 'no_circulante', satGroupCode: '174.01' },
  { id: 'anc-11', code: '1211', name: 'Rentas Pagadas por Anticipado', type: 'asset', subtype: 'no_circulante', satGroupCode: '175.01' },
  { id: 'anc-12', code: '1212', name: 'Intereses Pagados por Anticipado', type: 'asset', subtype: 'no_circulante', satGroupCode: '176.01' },
  { id: 'anc-13', code: '1213', name: 'Depreciación Acumulada de Edificios', type: 'asset', subtype: 'no_circulante' },
  { id: 'anc-14', code: '1214', name: 'Depreciación Acumulada de Mobiliario', type: 'asset', subtype: 'no_circulante' },
  { id: 'anc-15', code: '1215', name: 'Depreciación Acumulada de Eq. Cómputo', type: 'asset', subtype: 'no_circulante' },
  { id: 'anc-16', code: '1216', name: 'Depreciación Acumulada de Eq. Reparto', type: 'asset', subtype: 'no_circulante' },
  { id: 'anc-17', code: '1217', name: 'Deterioro Acumulado de Activos Fijos', type: 'asset', subtype: 'no_circulante' },

  // Pasivo a Corto Plazo
  { id: 'pcp-1', code: '2101', name: 'Proveedores', type: 'liability', subtype: 'circulante', satGroupCode: '201.01' },
  { id: 'pcp-2', code: '2102', name: 'Documentos por Pagar', type: 'liability', subtype: 'circulante', satGroupCode: '203.01' },
  { id: 'pcp-3', code: '2103', name: 'Acreedores Diversos', type: 'liability', subtype: 'circulante', satGroupCode: '205.01' },
  { id: 'pcp-4', code: '2104', name: 'IVA Trasladado', type: 'liability', subtype: 'circulante', satGroupCode: '208.01' },
  { id: 'pcp-5', code: '2105', name: 'IVA por Trasladar', type: 'liability', subtype: 'circulante', satGroupCode: '209.01' },
  { id: 'pcp-6', code: '2106', name: 'Impuestos y Cuotas por Pagar', type: 'liability', subtype: 'circulante', satGroupCode: '216.01' },
  { id: 'pcp-8', code: '2108', name: 'Sueldos por pagar', type: 'liability', subtype: 'circulante', satGroupCode: '211.01' },
  { id: 'pcp-7', code: '2107', name: 'Anticipo de Clientes', type: 'liability', subtype: 'circulante', satGroupCode: '206.01' },

  // Pasivo a Largo Plazo
  { id: 'plp-1', code: '2201', name: 'Hipotecas por Pagar / Acreedores Hipotecarios', type: 'liability', subtype: 'no_circulante', satGroupCode: '254.01' },
  { id: 'plp-2', code: '2202', name: 'Documentos por Pagar a Largo Plazo', type: 'liability', subtype: 'no_circulante', satGroupCode: '252.01' },
  { id: 'plp-3', code: '2203', name: 'Rentas Cobradas por Anticipado', type: 'liability', subtype: 'no_circulante', satGroupCode: '260.01' },
  { id: 'plp-4', code: '2204', name: 'Intereses Cobrados por Anticipado', type: 'liability', subtype: 'no_circulante', satGroupCode: '260.02' },

  // Capital Contable
  { id: 'cc-1', code: '3101', name: 'Capital Social', type: 'equity', satGroupCode: '301.01' },
  { id: 'cc-1b', code: '3101b', name: 'Capital', type: 'equity', satGroupCode: '301.01' },
  { id: 'cc-2', code: '3102', name: 'Reserva Legal', type: 'equity', satGroupCode: '304.01' },
  { id: 'cc-3', code: '3103', name: 'Utilidad del Ejercicio', type: 'equity', satGroupCode: '304.04' },
  { id: 'cc-4', code: '3104', name: 'Pérdida del Ejercicio', type: 'equity', satGroupCode: '305.02' },
  { id: 'cc-5', code: '3105', name: 'Utilidades Acumuladas / Retenidas', type: 'equity', satGroupCode: '304.02' },
  { id: 'cc-6', code: '3106', name: 'Pérdidas Acumuladas', type: 'equity', satGroupCode: '304.03' },

  // Cuentas de Resultados (Ingresos)
  { id: 'ri-1', code: '4101', name: 'Ventas', type: 'revenue', satGroupCode: '401.01' },
  { id: 'ri-2', code: '4102', name: 'Devoluciones sobre Ventas', type: 'revenue', satGroupCode: '402.01' },
  { id: 'ri-3', code: '4103', name: 'Descuentos sobre Ventas', type: 'revenue', satGroupCode: '402.02' },
  { id: 'ri-4', code: '4104', name: 'Productos Financieros', type: 'revenue', satGroupCode: '403.01' },
  { id: 'ri-5', code: '4105', name: 'Otros Productos', type: 'revenue', satGroupCode: '403.02' },

  // Cuentas de Resultados (Costos y Gastos)
  { id: 're-1', code: '5101', name: 'Compras', type: 'expense', satGroupCode: '501.01' },
  { id: 're-2', code: '5102', name: 'Gastos de Compra', type: 'expense', satGroupCode: '501.02' },
  { id: 're-3', code: '5103', name: 'Devoluciones sobre Compras', type: 'expense', satGroupCode: '501.03' },
  { id: 're-4', code: '5104', name: 'Descuentos sobre Compras', type: 'expense', satGroupCode: '501.04' },
  { id: 're-5', code: '5105', name: 'Inventario Inicial', type: 'expense', satGroupCode: '501.01' },
  { id: 're-6', code: '5106', name: 'Inventario Final', type: 'expense', satGroupCode: '501.01' },
  { id: 're-7', code: '5107', name: 'Costo de Ventas', type: 'expense', satGroupCode: '501.01' },
  { id: 're-8', code: '5108', name: 'Gastos de Venta', type: 'expense', satGroupCode: '502.01' },
  { id: 're-9', code: '5109', name: 'Gastos de Administración', type: 'expense', satGroupCode: '503.01' },
  { id: 're-10', code: '5110', name: 'Gastos Financieros', type: 'expense', satGroupCode: '504.01' },
  { id: 're-11', code: '5111', name: 'Otros Gastos', type: 'expense', satGroupCode: '505.01' },
  { id: 're-12', code: '5112', name: 'Gasto por Depreciación', type: 'expense' },
  { id: 're-13', code: '5113', name: 'Pérdida por Deterioro', type: 'expense' },
];
