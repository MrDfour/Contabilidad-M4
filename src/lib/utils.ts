import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

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
  saveAs(blob, `${fileName}.xlsx`);
};

export const exportToPDF = async (elementId: string, fileName: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    onclone: (clonedDoc) => {
      // Robust fix for oklch/oklab errors in html2canvas
      // We traverse the cloned document and replace any problematic color functions
      const elements = clonedDoc.querySelectorAll('*');
      elements.forEach(el => {
        const style = (el as HTMLElement).style;
        const computed = window.getComputedStyle(el);
        
        ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke'].forEach(prop => {
          const val = style.getPropertyValue(prop) || computed.getPropertyValue(prop);
          if (val && (val.includes('oklch') || val.includes('oklab'))) {
            style.setProperty(prop, '#4f46e5', 'important');
          }
        });
      });

      // Also replace in CSS variables and style tags
      const styleTags = clonedDoc.querySelectorAll('style');
      styleTags.forEach(tag => {
        tag.innerHTML = tag.innerHTML
          .replace(/oklch\([^)]+\)/g, '#4f46e5')
          .replace(/oklab\([^)]+\)/g, '#4f46e5');
      });

      const style = clonedDoc.createElement('style');
      style.innerHTML = `
        * {
          color-scheme: light !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        /* Override some common tailwind variables that might use oklch */
        :root {
          --tw-ring-color: rgba(79, 70, 229, 0.5) !important;
          --tw-ring-offset-color: #0a0f1d !important;
        }
      `;
      clonedDoc.head.appendChild(style);
    }
  });
  
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
  
  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save(`${fileName}.pdf`);
};

export const exportTableToPDF = (headers: string[][], body: (string | number)[][], fileName: string, title: string) => {
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

  doc.save(`${fileName}.pdf`);
};

export const normalizeString = (str: string) => 
  str.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const readExcel = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
};
