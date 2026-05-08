/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Account, JournalEntry } from '../types';

export const downloadXML = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'application/xml;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

const escapeXML = (str: string) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const generateCatalogoXML = (rfc: string, anio: string, mes: string, accounts: Account[]) => {
  const cuentasXML = accounts
    .filter(a => a.satGroupCode)
    .map(c => {
      const natur = (c.type === 'asset' || c.type === 'expense') ? 'D' : 'A';
      return `  <catalogocuentas:Ctas CodAgrup="${c.satGroupCode}" NumCta="${c.code}" Desc="${escapeXML(c.name)}" SubCta="" Nivel="1" Natur="${natur}"/>`;
    }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<catalogocuentas:Catalogo xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas/CatalogoCuentas_1_3.xsd" Version="1.3" RFC="${rfc.toUpperCase()}" Mes="${mes}" Anio="${anio}">
${cuentasXML}
</catalogocuentas:Catalogo>`;

  downloadXML(`${rfc.toUpperCase()}${anio}${mes}CT.xml`, xml);
};

export const generateBalanzaXML = (
  rfc: string,
  anio: string,
  mes: string,
  accounts: Account[],
  tAccountsData: Record<string, { debits: { amount: number, ref?: number }[], credits: { amount: number, ref?: number }[] }>
) => {
  const cuentasXML = accounts
    .filter(a => a.satGroupCode && tAccountsData[a.id])
    .map(a => {
      const data = tAccountsData[a.id];
      const debe = data.debits.reduce((sum, d) => sum + d.amount, 0);
      const haber = data.credits.reduce((sum, c) => sum + c.amount, 0);
      const saldoIni = 0;
      const saldoFin =
        a.type === 'asset' || a.type === 'expense'
          ? saldoIni + debe - haber
          : saldoIni + haber - debe;

      return `  <BCE:Ctas NumCta="${a.code}" SaldoIni="${saldoIni.toFixed(2)}" Debe="${debe.toFixed(2)}" Haber="${haber.toFixed(2)}" SaldoFin="${saldoFin.toFixed(2)}"/>`;
    }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<BCE:Balanza xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion/BalanzaComprobacion_1_3.xsd" Version="1.3" RFC="${rfc.toUpperCase()}" Mes="${mes}" Anio="${anio}" TipoEnvio="N">
${cuentasXML}
</BCE:Balanza>`;

  downloadXML(`${rfc.toUpperCase()}${anio}${mes}BN.xml`, xml);
};

export const downloadTXT = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2,3}$/;
const DIOT_FIELDS_COUNT = 54;
const DIOT_THIRD_PARTY_TYPE_NATIONAL = '04';
const DIOT_OPERATION_TYPE_OTHER = '85';
const DIOT_FISCAL_EFFECTS_YES = '01';
const DEFAULT_CREDITABLE_PROPORTION = '100.00';

const formatDIOTAmount = (amount: number) => {
  const normalized = Math.round(amount * 100) / 100;
  return normalized === 0 ? '' : normalized.toFixed(2);
};

export const generateDIOTTxt = (
  rfc: string,
  anio: string,
  mes: string,
  entries: JournalEntry[],
  accounts: Account[]
) => {
  const ivaAccount = accounts.find(a => a.satGroupCode === '118.01');
  if (!ivaAccount) {
    throw new Error('No se encontró la cuenta de IVA Acreditable (118.01) en el catálogo. Por favor, agregue esta cuenta antes de generar el reporte DIOT.');
  }

  const periodPrefix = `${anio}-${mes}`;
  const ivaByRFC: Record<string, number> = {};

  entries
    .filter(entry => entry.date.startsWith(periodPrefix))
    .forEach(entry => {
      entry.movements.forEach(movement => {
        const supplierRfc = movement.rfcTercero?.trim().toUpperCase();

        if (movement.accountId !== ivaAccount.id || !supplierRfc || !RFC_REGEX.test(supplierRfc)) {
          return;
        }

        const signedAmount = movement.type === 'debit' ? movement.amount : -movement.amount;
        ivaByRFC[supplierRfc] = (ivaByRFC[supplierRfc] || 0) + signedAmount;
      });
    });

  const rows = Object.entries(ivaByRFC)
    .filter(([, amount]) => amount > 0)
    .sort(([rfcA], [rfcB]) => rfcA.localeCompare(rfcB))
    .map(([supplierRfc, amount]) => {
      const fields = Array(DIOT_FIELDS_COUNT).fill('');
      fields[0] = DIOT_THIRD_PARTY_TYPE_NATIONAL;
      fields[1] = DIOT_OPERATION_TYPE_OTHER;
      fields[2] = supplierRfc;
      fields[21] = formatDIOTAmount(amount); // IVA acreditable pagado resto del país
      fields[22] = DEFAULT_CREDITABLE_PROPORTION; // Proporción acreditable
      fields[53] = DIOT_FISCAL_EFFECTS_YES;
      return fields.join('|');
    });

  if (rows.length === 0) {
    throw new Error('No se encontraron movimientos de IVA acreditable con RFC de proveedor para el periodo seleccionado. Verifique que las pólizas incluyan RFC de terceros válidos.');
  }

  const filename = `${rfc.trim().toUpperCase()}${anio}${mes}DIOT.txt`;
  downloadTXT(filename, rows.join('\n'));
};
