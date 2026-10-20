/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

/**
 * Nivel 2 (funcional): generamos el archivo real y lo RELEEMOS para verificar
 * su contenido. Mockeamos el último paso (file-saver/saveAs) para capturar el
 * Blob en memoria; todo lo demás (ExcelJS workbook, estilos, jsPDF/autotable)
 * corre de verdad.
 */

const { saveAsMock } = vi.hoisted(() => ({ saveAsMock: vi.fn() }));
vi.mock('file-saver', () => ({ saveAs: saveAsMock }));

import { exportToExcel, exportTableToPDF } from './utils';

const fixture = [
  { 'ID_MOVIMIENTO': 1, 'FECHA': '2024-05-01', 'CUENTA': 'Caja', 'DEBE': 1000, 'HABER': 0 },
  { 'ID_MOVIMIENTO': 1, 'FECHA': '2024-05-01', 'CUENTA': 'Capital Social', 'DEBE': 0, 'HABER': 1000 }
];

describe('exportToExcel', () => {
  beforeEach(() => { saveAsMock.mockClear(); });

  it('genera un .xlsx legible por ExcelJS con hoja, encabezados y datos correctos', async () => {
    await exportToExcel(fixture, 'Libro_Diario_Prueba', 'Movimientos');

    expect(saveAsMock).toHaveBeenCalledTimes(1);
    const [blob, fileName] = saveAsMock.mock.calls[0];
    expect(fileName).toBe('Libro_Diario_Prueba.xlsx');
    expect(blob).toBeInstanceOf(Blob);

    // Relectura del Excel generado (inspección de workbook real)
    // El arbol de tipos de exceljs (@types/node 14 via fast-csv) colisiona con
    // el Buffer moderno global: cast agresivo acotado al punto de lectura.
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);

    expect(workbook.worksheets).toHaveLength(1);
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe('Movimientos');
    expect(sheet.getRow(1).getCell(1).value).toBe('ID_MOVIMIENTO');
    expect(sheet.getRow(1).getCell(3).value).toBe('CUENTA');
    // Posiciones según el orden de claves del fixture: 1 ID, 2 FECHA, 3 CUENTA, 4 DEBE, 5 HABER
    expect(sheet.getRow(2).getCell(3).value).toBe('Caja');
    expect(sheet.getRow(2).getCell(4).value).toBe(1000);
    expect(sheet.getRow(2).getCell(5).value).toBe(0);
    expect(sheet.getRow(3).getCell(3).value).toBe('Capital Social');
    expect(sheet.getRow(3).getCell(5).value).toBe(1000);

    // El encabezado lleva fuente en negrita con color de fondo indigo aplicado
    const headerCell = sheet.getRow(1).getCell(1);
    expect((headerCell.font as ExcelJS.Font).bold).toBe(true);
    expect((headerCell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF4F46E5');
  });

  it('con datos vacíos igual exporta un .xlsx válido sin hoja con columnas', async () => {
    await exportToExcel([], 'Vacio_M4', 'Movimientos');
    const [blob, fileName] = saveAsMock.mock.calls[0];
    expect(fileName).toBe('Vacio_M4.xlsx');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
    expect(workbook.worksheets).toHaveLength(1);
    expect(workbook.worksheets[0].name).toBe('Movimientos');
    expect(workbook.worksheets[0].rowCount).toBe(0);
  });
});

describe('exportTableToPDF', () => {
  beforeEach(() => { saveAsMock.mockClear(); });

  it('genera un PDF real (firma %PDF-, no vacío): jsPDF + autotable ejecutan el pipeline', async () => {
    const headers = [['ID', 'FECHA', 'CUENTA', 'DEBE', 'HABER']];
    const body = [['1', '2024-05-01', 'Caja', '$1,000.00', '']];

    await exportTableToPDF(headers, body, 'Libro_Diario_Prueba', 'Libro Diario - Prueba', 'Prueba');

    expect(saveAsMock).toHaveBeenCalledTimes(1);
    const [blob, fileName] = saveAsMock.mock.calls[0];
    expect(fileName).toBe('Libro_Diario_Prueba.pdf');

    const text = await blob.text();
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text.length).toBeGreaterThan(500); // contenido real, no un PDF en blanco
  });

  it('con tabla vacía también produce un PDF válido', async () => {
    await exportTableToPDF([['ID']], [], 'Vacio_PDF', 'Sin contenido');
    const [blob] = saveAsMock.mock.calls[0];
    expect((await blob.text()).startsWith('%PDF-')).toBe(true);
  });
});
