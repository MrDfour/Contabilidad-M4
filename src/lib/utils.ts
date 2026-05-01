import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas-pro';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Account } from '../types';

/** Returns true when running inside a native Capacitor app (iOS / Android). */
const isNative = () => Capacitor.isNativePlatform();

/**
 * Converts a Blob to a base64 string (data without the leading data-URI prefix).
 */
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix that FileReader adds
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/**
 * On Android / iOS: write the file to the cache directory and open the native
 * share sheet so the user can save it to Downloads, send it, etc.
 * On desktop: fall back to the standard browser download via file-saver.
 */
const saveFile = async (blob: Blob, fileName: string): Promise<void> => {
  if (isNative()) {
    const base64Data = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Cache,
    });
    const { uri } = await Filesystem.getUri({
      path: fileName,
      directory: Directory.Cache,
    });
    await Share.share({
      title: fileName,
      url: uri,
      dialogTitle: 'Guardar o compartir archivo',
    });
  } else {
    saveAs(blob, fileName);
  }
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount);
}

export const exportToExcel = async (data: any[], fileName: string, sheetName: string) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  if (data.length > 0) {
    const headerKeys = Object.keys(data[0]);
    
    // Set columns with headers
    worksheet.columns = headerKeys.map(key => ({
      header: key,
      key: key,
      width: Math.max(15, key.length * 1.5)
    }));

    // Style headers
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' } // indigo-600
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add data
    data.forEach((item) => {
      worksheet.addRow(item);
    });

    // Style data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.font = { color: { argb: 'FF334155' }, size: 11 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
          
          if (rowNumber % 2 === 0) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF1F5F9' } // slate-100
            };
          }
        });
      }
    });

    // Auto-fit columns (basic version)
    worksheet.columns.forEach(column => {
      let maxColumnLength = 0;
      column.eachCell!({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 0;
        if (columnLength > maxColumnLength) {
          maxColumnLength = columnLength;
        }
      });
      column.width = Math.min(50, maxColumnLength + 5);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await saveFile(blob, `${fileName}.xlsx`);
};

export const exportTAccountsStyleToExcel = async (
  tAccountsData: Record<string, { debits: { amount: number, ref: number }[], credits: { amount: number, ref: number }[] }>,
  accounts: Account[],
  fileName: string
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Cuentas T');

  const ACCOUNTS_PER_ROW = 4;
  const COLUMN_WIDTHS = [5, 15, 2, 15, 5]; // Ref | Amount | Border | Amount | Ref
  const SPACING_COLUMNS = 1;

  let currentAccountIndex = 0;
  let startRow = 2;

  const entries = Object.entries(tAccountsData);

  for (let i = 0; i < entries.length; i += ACCOUNTS_PER_ROW) {
    const rowAccounts = entries.slice(i, i + ACCOUNTS_PER_ROW);
    let maxRowsInThisBatch = 0;

    rowAccounts.forEach(([accountId, data], colIndex) => {
      const acc = accounts.find(a => a.id === accountId);
      const startCol = colIndex * (COLUMN_WIDTHS.length + SPACING_COLUMNS) + 1;
      
      // Header
      const headerCell = worksheet.getCell(startRow, startCol);
      worksheet.mergeCells(startRow, startCol, startRow, startCol + 4);
      headerCell.value = acc?.name || 'Unknown';
      headerCell.font = { bold: true, size: 12 };
      headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
      headerCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' } // slate-200
      };
      headerCell.border = {
        bottom: { style: 'thin' }
      };

      // T-Structure drawing
      const debits = data.debits;
      const credits = data.credits;
      const rowCount = Math.max(debits.length, credits.length);
      
      for (let r = 0; r < rowCount; r++) {
        const currentRow = startRow + 1 + r;
        
        // Debit side
        if (debits[r]) {
          worksheet.getCell(currentRow, startCol).value = `(${debits[r].ref})`;
          worksheet.getCell(currentRow, startCol).font = { size: 9, color: { argb: 'FF64748B' } };
          worksheet.getCell(currentRow, startCol + 1).value = debits[r].amount;
          worksheet.getCell(currentRow, startCol + 1).numFmt = '"$"#,##0.00';
        }

        // Center line
        worksheet.getCell(currentRow, startCol + 2).border = {
          left: { style: 'medium' }
        };

        // Credit side
        if (credits[r]) {
          worksheet.getCell(currentRow, startCol + 3).value = credits[r].amount;
          worksheet.getCell(currentRow, startCol + 3).numFmt = '"$"#,##0.00';
          worksheet.getCell(currentRow, startCol + 4).value = `(${credits[r].ref})`;
          worksheet.getCell(currentRow, startCol + 4).font = { size: 9, color: { argb: 'FF64748B' } };
        }
      }

      const endDataRow = startRow + 1 + rowCount;
      
      // Totals Row
      worksheet.getCell(endDataRow, startCol + 1).value = debits.reduce((s, d) => s + d.amount, 0);
      worksheet.getCell(endDataRow, startCol + 1).numFmt = '"$"#,##0.00';
      worksheet.getCell(endDataRow, startCol + 1).font = { bold: true };
      worksheet.getCell(endDataRow, startCol + 1).border = { top: { style: 'thin' } };

      worksheet.getCell(endDataRow, startCol + 2).border = { left: { style: 'medium' } };

      worksheet.getCell(endDataRow, startCol + 3).value = credits.reduce((s, c) => s + c.amount, 0);
      worksheet.getCell(endDataRow, startCol + 3).numFmt = '"$"#,##0.00';
      worksheet.getCell(endDataRow, startCol + 3).font = { bold: true };
      worksheet.getCell(endDataRow, startCol + 3).border = { top: { style: 'thin' } };

      // Balance
      const totalD = debits.reduce((s, d) => s + d.amount, 0);
      const totalC = credits.reduce((s, c) => s + c.amount, 0);
      const isDebitBalance = (acc?.type === 'asset' || acc?.type === 'expense');
      const balance = isDebitBalance ? totalD - totalC : totalC - totalD;
      const balanceType = isDebitBalance ? '(Saldo Deudor)' : '(Saldo Acreedor)';

      const balanceRow = endDataRow + 1;
      if (isDebitBalance) {
        worksheet.getCell(balanceRow, startCol + 1).value = balance;
        worksheet.getCell(balanceRow, startCol + 1).numFmt = '"$"#,##0.00';
        worksheet.getCell(balanceRow, startCol + 1).font = { bold: true };
        worksheet.getCell(balanceRow + 1, startCol + 1).value = balanceType;
        worksheet.getCell(balanceRow + 1, startCol + 1).font = { italic: true, size: 9 };
      } else {
        worksheet.getCell(balanceRow, startCol + 3).value = balance;
        worksheet.getCell(balanceRow, startCol + 3).numFmt = '"$"#,##0.00';
        worksheet.getCell(balanceRow, startCol + 3).font = { bold: true };
        worksheet.getCell(balanceRow + 1, startCol + 3).value = balanceType;
        worksheet.getCell(balanceRow + 1, startCol + 3).font = { italic: true, size: 9 };
      }

      maxRowsInThisBatch = Math.max(maxRowsInThisBatch, rowCount + 5);
    });

    startRow += maxRowsInThisBatch + 2;
  }

  // Set column widths
  for (let c = 0; c < ACCOUNTS_PER_ROW * (COLUMN_WIDTHS.length + SPACING_COLUMNS); c++) {
    const colIdx = (c % (COLUMN_WIDTHS.length + SPACING_COLUMNS));
    if (colIdx < COLUMN_WIDTHS.length) {
      worksheet.getColumn(c + 1).width = COLUMN_WIDTHS[colIdx];
    } else {
      worksheet.getColumn(c + 1).width = 2; // spacer
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await saveFile(blob, `${fileName}.xlsx`);
};

export const exportToPDF = async (elementId: string, fileName: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  
  const drawPageHeader = (pageNumber: number, totalPages: number) => {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 41, 59); // slate-800
    pdf.text('Contabilidad M4Pro', margin, margin - 2);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139); // slate-500
    pdf.text(`Página ${pageNumber} de ${totalPages}`, pdfWidth - margin, margin - 2, { align: 'right' });
    
    pdf.setDrawColor(203, 213, 225); // slate-300
    pdf.setLineWidth(0.5);
    pdf.line(margin, margin, pdfWidth - margin, margin);
  };

  const cards = element.querySelectorAll('.t-account-card');
  
  if (cards.length > 0) {
    let currentY = margin + 10;
    
    // First pass: Draw content and capture page count
    for (let i = 0; i < cards.length; i += 2) {
      const card1 = cards[i] as HTMLElement;
      const card2 = cards[i + 1] as HTMLElement;

      const captureConfig = {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc: Document) => {
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            .t-account-card { border: 2px solid #000000 !important; border-radius: 8px !important; background: #ffffff !important; }
            .t-account-header { border-bottom: 2px solid #000000 !important; background: #f8fafc !important; }
            .t-account-divider { border-left: 2px solid #000000 !important; }
            .t-account-totals { border-top: 2px solid #000000 !important; background: #f1f5f9 !important; }
            span, div { color: #000000 !important; }
            .text-emerald-400 { color: #059669 !important; font-weight: bold !important; }
            .text-rose-400 { color: #dc2626 !important; font-weight: bold !important; }
          `;
          clonedDoc.head.appendChild(style);
        }
      };

      const canvas1 = await html2canvas(card1, captureConfig);
      const imgData1 = canvas1.toDataURL('image/png');
      const imgWidth = (pdfWidth - (margin * 3)) / 2;
      const imgHeight1 = (canvas1.height * imgWidth) / canvas1.width;

      let maxHeightInRow = imgHeight1;
      let imgData2 = null;
      let imgHeight2 = 0;

      if (card2) {
        const canvas2 = await html2canvas(card2, captureConfig);
        imgData2 = canvas2.toDataURL('image/png');
        imgHeight2 = (canvas2.height * imgWidth) / canvas2.width;
        maxHeightInRow = Math.max(imgHeight1, imgHeight2);
      }

      if (currentY + maxHeightInRow > pdfHeight - margin) {
        pdf.addPage();
        currentY = margin + 10;
      }

      pdf.addImage(imgData1, 'PNG', margin, currentY, imgWidth, imgHeight1);
      if (imgData2) {
        pdf.addImage(imgData2, 'PNG', margin * 2 + imgWidth, currentY, imgWidth, imgHeight2);
      }

      currentY += maxHeightInRow + 12;
    }

    // Second pass: Add headers to all pages
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      drawPageHeader(i, totalPages);
    }
  } else {
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = pdfWidth - (margin * 2);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    drawPageHeader(1, 1);
    pdf.addImage(imgData, 'PNG', margin, margin + 10, imgWidth, imgHeight);
  }

  const pdfBlob = pdf.output('blob');
  await saveFile(pdfBlob, `${fileName}.pdf`);
};

export const exportTableToPDF = async (headers: string[][], body: (string | number)[][], fileName: string, title: string): Promise<void> => {
  const doc = new jsPDF();
  
  // Header section
  doc.setFontSize(22);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(title, 14, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Sistema de Gestión Contable - M4 Pro`, 14, 30);
  doc.text(`Generado: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 35);
  
  // Horizontal line
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.line(14, 40, 196, 40);
  
  autoTable(doc, {
    startY: 48,
    head: headers,
    body: body as any,
    theme: 'striped',
    headStyles: { 
      fillColor: [79, 70, 229], // indigo-600
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: 4
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [51, 65, 85], // slate-700
      cellPadding: 3
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    columnStyles: {
      [headers[0].length - 1]: { halign: 'right' },
      [headers[0].length - 2]: { halign: 'right' },
    },
    margin: { top: 48, left: 14, right: 14 },
    didDrawPage: (data) => {
      // Footer
      const str = "Página " + doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 10);
    }
  });

  const pdfBlob = doc.output('blob');
  await saveFile(pdfBlob, `${fileName}.pdf`);
};

export const normalizeString = (str: string) => 
  str.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const readExcel = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
