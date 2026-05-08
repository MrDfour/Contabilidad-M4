/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Account } from '../types';

export const downloadXML = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'application/xml;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const generateCatalogoXML = (rfc: string, anio: string, mes: string, accounts: Account[]) => {
  const cuentasXML = accounts
    .filter(a => a.satGroupCode)
    .map(c => {
      const natur = (c.type === 'asset' || c.type === 'expense') ? 'D' : 'A';
      return `  <catalogocuentas:Ctas CodAgrup="${c.satGroupCode}" NumCta="${c.code}" Desc="${c.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}" SubCta="" Nivel="1" Natur="${natur}"/>`;
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
  tAccountsData: Record<string, { debits: { amount: number; ref: number }[]; credits: { amount: number; ref: number }[] }>
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
