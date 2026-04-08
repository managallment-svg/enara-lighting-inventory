import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

export interface ExportColumn {
  key: string;
  label: string;
}

export interface ExportSheet {
  name: string;
  columns: ExportColumn[];
  rows: Record<string, any>[];
}

function buildSafeFileName(prefix: string) {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${prefix}-${timestamp}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderSheetsHtml(title: string, sheets: ExportSheet[]) {
  const sections = sheets
    .map((sheet) => {
      const headerCells = sheet.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
      const bodyRows = sheet.rows.length
        ? sheet.rows
            .map((row) => {
              const cells = sheet.columns
                .map((column) => `<td>${escapeHtml(row[column.key] ?? '-')}</td>`)
                .join('');
              return `<tr>${cells}</tr>`;
            })
            .join('')
        : `<tr><td colspan="${sheet.columns.length}">لا توجد بيانات متاحة للتصدير.</td></tr>`;

      return `
        <section class="report-section">
          <div class="sheet-header">
            <h2>${escapeHtml(sheet.name)}</h2>
            <span>${escapeHtml(String(sheet.rows.length))} سجل</span>
          </div>
          <table>
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </section>
      `;
    })
    .join('');

  return `
    <div class="report-root" dir="rtl">
      <header class="report-main-header">
        <h1>${escapeHtml(title)}</h1>
        <p>تقرير تم توليده من نظام إدارة مخازن إنارة بتاريخ ${escapeHtml(new Date().toLocaleString('ar-EG'))}</p>
      </header>
      ${sections}
    </div>
  `;
}

function buildReportStyles() {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      direction: rtl;
      background: #ffffff;
      color: #0f172a;
      font-family: "Tahoma", "Segoe UI", sans-serif;
    }
    .report-root {
      width: 100%;
    }
    .report-main-header {
      margin-bottom: 20px;
      border-bottom: 2px solid #d1fae5;
      padding-bottom: 12px;
    }
    .report-main-header h1 {
      margin: 0 0 6px;
      color: #064e3b;
      font-size: 24px;
      font-weight: 800;
    }
    .report-main-header p {
      margin: 0;
      color: #475569;
      font-size: 12px;
    }
    .report-section {
      margin-bottom: 20px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .sheet-header h2 {
      margin: 0;
      color: #0f766e;
      font-size: 18px;
      font-weight: 800;
    }
    .sheet-header span {
      color: #475569;
      font-size: 12px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
      background: #ffffff;
      border: 1px solid #dbeafe;
      border-radius: 16px;
      overflow: hidden;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 8px 10px;
      text-align: right;
      vertical-align: top;
      font-size: 11px;
      line-height: 1.7;
      word-break: break-word;
    }
    th {
      background: #f8fafc;
      color: #334155;
      font-weight: 800;
    }
    tr:nth-child(even) td {
      background: #fcfffe;
    }
  `;
}

export function exportSheetsToExcel(filePrefix: string, sheets: ExportSheet[]) {
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const matrix = [
      sheet.columns.map((column) => column.label),
      ...sheet.rows.map((row) => sheet.columns.map((column) => row[column.key] ?? '')),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(matrix);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || 'Sheet');
  });

  XLSX.writeFile(workbook, `${buildSafeFileName(filePrefix)}.xlsx`);
}

export async function exportSheetsToPdf(filePrefix: string, title: string, sheets: ExportSheet[]) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-20000px';
  container.style.top = '0';
  container.style.width = '1120px';
  container.style.background = '#ffffff';
  container.style.padding = '24px';
  container.innerHTML = `<style>${buildReportStyles()}</style>${renderSheetsHtml(title, sheets)}`;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });

    const imageData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageWidth = pageWidth - 16;
    const imageHeight = (canvas.height * imageWidth) / canvas.width;
    let heightLeft = imageHeight;
    let position = 8;

    pdf.addImage(imageData, 'PNG', 8, position, imageWidth, imageHeight, undefined, 'FAST');
    heightLeft -= pageHeight - 16;

    while (heightLeft > 0) {
      position = heightLeft - imageHeight + 8;
      pdf.addPage();
      pdf.addImage(imageData, 'PNG', 8, position, imageWidth, imageHeight, undefined, 'FAST');
      heightLeft -= pageHeight - 16;
    }

    pdf.save(`${buildSafeFileName(filePrefix)}.pdf`);
  } finally {
    container.remove();
  }
}

export function printSheets(title: string, sheets: ExportSheet[]) {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
  if (!printWindow) {
    throw new Error('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
  }

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(title)}</title>
        <style>${buildReportStyles()}</style>
      </head>
      <body>
        ${renderSheetsHtml(title, sheets)}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
