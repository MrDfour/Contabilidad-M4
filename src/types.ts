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

export const INITIAL_ACCOUNTS: Account[] = [
  // Assets
  { id: '1', code: '1101', name: 'Caja', type: 'asset' },
  { id: '2', code: '1102', name: 'Bancos', type: 'asset' },
  { id: '3', code: '1103', name: 'Clientes', type: 'asset' },
  { id: '4', code: '1104', name: 'Inventario', type: 'asset' },
  { id: '5', code: '1201', name: 'Mobiliario y Equipo', type: 'asset' },
  { id: '6', code: '1202', name: 'Vehículos', type: 'asset' },
  { id: '7', code: '1203', name: 'Edificios', type: 'asset' },
  { id: '8', code: '1204', name: 'Terrenos', type: 'asset' },
  
  // Liabilities
  { id: '9', code: '2101', name: 'Proveedores', type: 'liability' },
  { id: '10', code: '2102', name: 'Acreedores Diversos', type: 'liability' },
  { id: '11', code: '2103', name: 'Documentos por Pagar', type: 'liability' },
  { id: '12', code: '2201', name: 'Hipotecas por Pagar', type: 'liability' },
  
  // Equity
  { id: '13', code: '3101', name: 'Capital Social', type: 'equity' },
  { id: '14', code: '3102', name: 'Utilidad del Ejercicio', type: 'equity' },
  
  // Revenues
  { id: '15', code: '4101', name: 'Ventas', type: 'revenue' },
  { id: '16', code: '4102', name: 'Otros Ingresos', type: 'revenue' },
  
  // Expenses
  { id: '17', code: '5101', name: 'Costo de Ventas', type: 'expense' },
  { id: '18', code: '5102', name: 'Gastos de Administración', type: 'expense' },
  { id: '19', code: '5103', name: 'Gastos de Venta', type: 'expense' },
  { id: '20', code: '5104', name: 'Gastos Financieros', type: 'expense' },
];
