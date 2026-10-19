/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utilidades de formateo y normalización de montos/texto.
 * Fuente ÚNICA de verdad: ninguna vista debe definir copias locales de
 * estas funciones (ver REFACTORING_PLAN.md, Fase 0 / riesgo R6).
 */

/** Redondea a 2 decimales (centavos), tolera NaN/Infinity devolviendo 0. */
export const normalizeAmount = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

/** Convierte un string con separadores de miles ("1,234.56") a número normalizado. */
export const parseFormattedAmount = (value: string) => {
  const parsed = Number(value.replace(/,/g, ''));
  return normalizeAmount(parsed);
};

/**
 * Parsea montos provenientes de importaciones (Excel/CSV/JSX) que pueden traer
 * signos o separadores inesperados: "$-1,234.56-" → -1234.56.
 * El signo `-` es válido en cualquier posición (Excel exporta así).
 */
export const parseImportedAmount = (value: unknown) => {
  const raw = String(value ?? '0').replace(/,/g, '');
  const isNegative = raw.includes('-');
  const numericOnly = raw.replace(/[^0-9.]/g, '');
  const [integerPartRaw, ...decimalParts] = numericOnly.split('.');
  const integerPart = integerPartRaw || '0';
  const decimalPart = decimalParts.join('');
  const normalized = `${isNegative ? '-' : ''}${integerPart}${decimalPart ? `.${decimalPart}` : ''}`;
  return normalizeAmount(parseFloat(normalized) || 0);
};

/** Formatea un monto para mostrarlo en inputs (con separador de miles, vacío si es 0). */
export const formatAmountForInput = (amount: number) => {
  const normalized = normalizeAmount(amount);
  if (normalized === 0) return '';
  return new Intl.NumberFormat('en-US', {
    useGrouping: true,
    maximumFractionDigits: 2
  }).format(normalized);
};

/** Sanitiza entrada de teclado en inputs de monto: solo dígitos, un punto y máx. 2 decimales. */
export const formatAmountInput = (value: string) => {
  const sanitized = value.replace(/[^0-9.]/g, '');
  if (!sanitized) return '';

  const [integerPartRaw, ...decimalParts] = sanitized.split('.');
  const hasDecimalPoint = sanitized.includes('.');
  const normalizedInteger = (integerPartRaw || '0').replace(/^0+(?=\d)/, '') || '0';
  const formattedInteger = normalizedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimalPart = decimalParts.join('').slice(0, 2);

  if (!hasDecimalPoint) return formattedInteger;
  return `${formattedInteger}.${decimalPart}`;
};

/** Formato de moneda MXN para reportes y UI. */
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount);
}

/** Regla SAT: códigos de 4+ dígitos se muestran como XX.XX. */
export const formatSatGroupCode = (code: string) => {
  if (code.length >= 4) return `${code.slice(0, 2)}.${code.slice(2)}`;
  return code;
};

/** Minúsculas, sin espacios en bordes y sin tildes (para comparar nombres de cuentas). */
export const normalizeString = (str: string) =>
  str.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
