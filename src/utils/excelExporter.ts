import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  Account,
  AccountingStandard,
  AccountCategory,
  EntitySettings,
  NormalBalance,
  Transaction,
} from '../types/accounting';
import {
  calculateLedgers,
  calculateTrialBalance,
  calculateWorksheet,
  generateClosingEntries,
} from './accountingEngine';

interface ExportOptions {
  settings: EntitySettings;
  standard: AccountingStandard;
  accounts: Account[];
  transactions: Transaction[];
}

// Color Palette for Classic Professional Accounting Workbook
const STYLES = {
  headerFill: {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FF1A1A1A' }, // Rich Dark Charcoal
  },
  headerFont: {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  },
  subHeaderFill: {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FFF0EDE6' }, // Warm editorial light gray
  },
  subHeaderFont: {
    name: 'Calibri',
    size: 10,
    bold: true,
    color: { argb: 'FF1A1A1A' },
  },
  totalFill: {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FFF7F5F0' },
  },
  totalFont: {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FF1A1A1A' },
  },
  zebraFill: {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FFFAF9F7' },
  },
  thinBorder: {
    top: { style: 'thin' as const, color: { argb: 'FFD3CBC0' } },
    left: { style: 'thin' as const, color: { argb: 'FFD3CBC0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFD3CBC0' } },
    right: { style: 'thin' as const, color: { argb: 'FFD3CBC0' } },
  },
  totalBorder: {
    top: { style: 'thin' as const, color: { argb: 'FF1A1A1A' } },
    left: { style: 'thin' as const, color: { argb: 'FFD3CBC0' } },
    bottom: { style: 'double' as const, color: { argb: 'FF1A1A1A' } },
    right: { style: 'thin' as const, color: { argb: 'FFD3CBC0' } },
  },
  currencyFormat: '_-Rp* #,##0_-;[Red]_-Rp* (#,##0)_-;_-Rp* "-"_-;_-@_-',
};

/**
 * Creates standardized centered title header block merged across table columns
 */
function addReportHeader(
  ws: ExcelJS.Worksheet,
  entityName: string,
  reportTitle: string,
  periodText: string,
  standardName: string,
  columnCount: number
): number {
  const colLetter = ws.getColumn(columnCount).letter;

  // Row 1: Company / Entity Name (Centered, Bold, 14pt)
  ws.mergeCells(`A1:${colLetter}1`);
  const r1 = ws.getCell('A1');
  r1.value = entityName.toUpperCase();
  r1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1A1A1A' } };
  r1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  // Row 2: Report Title (Centered, Bold 12pt)
  ws.mergeCells(`A2:${colLetter}2`);
  const r2 = ws.getCell('A2');
  r2.value = reportTitle.toUpperCase();
  r2.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF2D2A26' } };
  r2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20;

  // Row 3: Standard & Period (Centered, Italic 10pt)
  ws.mergeCells(`A3:${colLetter}3`);
  const r3 = ws.getCell('A3');
  r3.value = `Standar: ${standardName} | Periode: ${periodText}`;
  r3.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF5C5852' } };
  r3.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 18;

  // Row 4: Blank spacing row
  ws.getRow(4).height = 12;

  return 5; // Next row index for table headers
}

/**
 * Applies table border, font, and currency formatting to a cell
 */
function formatCell(
  cell: ExcelJS.Cell,
  opts: {
    isCurrency?: boolean;
    isBold?: boolean;
    align?: 'left' | 'center' | 'right';
    isTotal?: boolean;
    isHeader?: boolean;
    isZebra?: boolean;
    customFill?: ExcelJS.Fill;
  } = {}
) {
  cell.font = {
    name: 'Calibri',
    size: opts.isHeader ? 11 : 10,
    bold: opts.isBold || opts.isHeader || opts.isTotal || false,
    color: opts.isHeader ? { argb: 'FFFFFFFF' } : { argb: 'FF1A1A1A' },
  };

  cell.border = opts.isTotal ? STYLES.totalBorder : STYLES.thinBorder;

  if (opts.customFill) {
    cell.fill = opts.customFill;
  } else if (opts.isHeader) {
    cell.fill = STYLES.headerFill;
  } else if (opts.isTotal) {
    cell.fill = STYLES.totalFill;
  } else if (opts.isZebra) {
    cell.fill = STYLES.zebraFill;
  }

  cell.alignment = {
    vertical: 'middle',
    horizontal: opts.align || (opts.isCurrency ? 'right' : 'left'),
    wrapText: false,
  };

  if (opts.isCurrency) {
    cell.numFmt = STYLES.currencyFormat;
  }
}

/**
 * 1. Sheet Jurnal Umum
 */
export function buildGeneralJournalWorkbook(wb: ExcelJS.Workbook, transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Jurnal Umum', { views: [{ showGridLines: true }] });
  const startRow = addReportHeader(ws, settings.entityName, 'JURNAL UMUM (GENERAL JOURNAL)', `${settings.periodStart} s/d ${settings.periodEnd}`, standard, 6);

  // Table Headers
  const headerRow = ws.getRow(startRow);
  headerRow.values = ['Tanggal', 'No. Bukti / Ref', 'Keterangan Akun & Transaksi', 'Ref Akun', 'Debit', 'Kredit'];
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    formatCell(cell, { isHeader: true, align: 'center' });
  });

  let currentRow = startRow + 1;
  let totalDebit = 0;
  let totalCredit = 0;

  const sortedTx = [...transactions]
    .filter((t) => t.category === 'umum' || t.category === 'penyesuaian')
    .sort((a, b) => a.date.localeCompare(b.date));

  sortedTx.forEach((tx) => {
    tx.entries.forEach((entry, entryIdx) => {
      const isFirst = entryIdx === 0;
      const isCredit = entry.credit > 0 && entry.debit === 0;
      const indent = isCredit ? '      ' : '';

      const debitVal = entry.debit > 0 ? entry.debit : 0;
      const creditVal = entry.credit > 0 ? entry.credit : 0;

      totalDebit += debitVal;
      totalCredit += creditVal;

      const row = ws.getRow(currentRow);
      row.values = [
        isFirst ? tx.date : '',
        isFirst ? tx.refNumber : '',
        indent + entry.accountName,
        entry.accountCode,
        debitVal,
        creditVal,
      ];
      row.height = 20;

      formatCell(row.getCell(1), { align: 'center' });
      formatCell(row.getCell(2), { align: 'center' });
      formatCell(row.getCell(3), { align: 'left' });
      formatCell(row.getCell(4), { align: 'center' });
      formatCell(row.getCell(5), { isCurrency: true });
      formatCell(row.getCell(6), { isCurrency: true });

      currentRow++;
    });

    if (tx.notes || tx.description) {
      const row = ws.getRow(currentRow);
      row.values = ['', '', `    (${tx.description || tx.notes})`, '', 0, 0];
      row.height = 18;
      for (let c = 1; c <= 6; c++) {
        const cell = row.getCell(c);
        formatCell(cell, { align: c === 3 ? 'left' : 'center' });
        cell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF736E66' } };
      }
      currentRow++;
    }
  });

  // Total Row
  const totalRow = ws.getRow(currentRow);
  totalRow.values = ['TOTAL', '', '', '', totalDebit, totalCredit];
  totalRow.height = 24;
  ws.mergeCells(`A${currentRow}:D${currentRow}`);
  totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 6; c++) {
    formatCell(totalRow.getCell(c), { isTotal: true, isCurrency: c >= 5 });
  }

  ws.columns = [
    { width: 14 },
    { width: 16 },
    { width: 38 },
    { width: 12 },
    { width: 20 },
    { width: 20 },
  ];

  return ws;
}

/**
 * 2. Sheet Buku Besar
 */
export function buildLedgerWorkbook(wb: ExcelJS.Workbook, accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Buku Besar', { views: [{ showGridLines: true }] });
  let currentRow = addReportHeader(ws, settings.entityName, 'BUKU BESAR (GENERAL LEDGER)', `${settings.periodStart} s/d ${settings.periodEnd}`, standard, 6);

  const ledgers = calculateLedgers(accounts, transactions, ['umum', 'penyesuaian']);

  accounts.forEach((acc) => {
    const l = ledgers.get(acc.code);
    if (!l || (l.entries.length === 0 && l.endingBalance === 0)) return;

    // Account Subheader Banner
    const bannerRow = ws.getRow(currentRow);
    ws.mergeCells(`A${currentRow}:D${currentRow}`);
    bannerRow.getCell(1).value = `AKUN: ${acc.code} - ${acc.name.toUpperCase()}`;
    bannerRow.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1A1A1A' } };
    bannerRow.getCell(1).fill = STYLES.subHeaderFill;
    bannerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    ws.mergeCells(`E${currentRow}:F${currentRow}`);
    bannerRow.getCell(5).value = `Saldo Normal: ${acc.normalBalance}`;
    bannerRow.getCell(5).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF5C5852' } };
    bannerRow.getCell(5).fill = STYLES.subHeaderFill;
    bannerRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    bannerRow.height = 24;

    for (let c = 1; c <= 6; c++) {
      bannerRow.getCell(c).border = STYLES.thinBorder;
    }
    currentRow++;

    // Table Header
    const thRow = ws.getRow(currentRow);
    thRow.values = ['Tanggal', 'No. Ref', 'Keterangan Mutasi', 'Debit', 'Kredit', 'Saldo Berjalan'];
    thRow.height = 22;
    thRow.eachCell((cell) => {
      formatCell(cell, { isHeader: true, align: 'center' });
    });
    currentRow++;

    let running = 0;
    const isNormalDebit = acc.normalBalance === NormalBalance.DEBIT;

    l.entries.forEach((e, idx) => {
      if (isNormalDebit) {
        running += e.debit - e.credit;
      } else {
        running += e.credit - e.debit;
      }

      const row = ws.getRow(currentRow);
      row.values = [e.date, e.refNumber, e.description, e.debit, e.credit, running];
      row.height = 20;

      formatCell(row.getCell(1), { align: 'center', isZebra: idx % 2 === 1 });
      formatCell(row.getCell(2), { align: 'center', isZebra: idx % 2 === 1 });
      formatCell(row.getCell(3), { align: 'left', isZebra: idx % 2 === 1 });
      formatCell(row.getCell(4), { isCurrency: true, isZebra: idx % 2 === 1 });
      formatCell(row.getCell(5), { isCurrency: true, isZebra: idx % 2 === 1 });
      formatCell(row.getCell(6), { isCurrency: true, isZebra: idx % 2 === 1 });

      currentRow++;
    });

    // Subtotal Row per Account
    const subTotalRow = ws.getRow(currentRow);
    subTotalRow.values = ['SALDO AKHIR', '', '', l.totalDebit, l.totalCredit, l.endingBalance];
    subTotalRow.height = 22;
    ws.mergeCells(`A${currentRow}:C${currentRow}`);
    subTotalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 1; c <= 6; c++) {
      formatCell(subTotalRow.getCell(c), { isTotal: true, isCurrency: c >= 4 });
    }
    currentRow += 2; // Blank row between accounts
  });

  ws.columns = [
    { width: 14 },
    { width: 16 },
    { width: 36 },
    { width: 20 },
    { width: 20 },
    { width: 22 },
  ];

  return ws;
}

/**
 * 3. Sheet Neraca Saldo
 */
export function buildTrialBalanceWorkbook(wb: ExcelJS.Workbook, accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Neraca Saldo', { views: [{ showGridLines: true }] });
  const startRow = addReportHeader(ws, settings.entityName, 'NERACA SALDO (TRIAL BALANCE)', `${settings.periodStart} s/d ${settings.periodEnd}`, standard, 5);

  const headerRow = ws.getRow(startRow);
  headerRow.values = ['Kode Akun', 'Nama Akun', 'Kategori Akun', 'Debit', 'Kredit'];
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    formatCell(cell, { isHeader: true, align: 'center' });
  });

  let currentRow = startRow + 1;
  const tb = calculateTrialBalance(accounts, transactions, ['umum', 'penyesuaian']);

  tb.items.forEach((item, idx) => {
    const row = ws.getRow(currentRow);
    row.values = [
      item.account.code,
      item.account.name,
      item.account.category,
      item.debit,
      item.credit,
    ];
    row.height = 20;

    formatCell(row.getCell(1), { align: 'center', isZebra: idx % 2 === 1 });
    formatCell(row.getCell(2), { align: 'left', isZebra: idx % 2 === 1 });
    formatCell(row.getCell(3), { align: 'center', isZebra: idx % 2 === 1 });
    formatCell(row.getCell(4), { isCurrency: true, isZebra: idx % 2 === 1 });
    formatCell(row.getCell(5), { isCurrency: true, isZebra: idx % 2 === 1 });

    currentRow++;
  });

  // Total Row
  const totalRow = ws.getRow(currentRow);
  totalRow.values = ['TOTAL', '', '', tb.totalDebit, tb.totalCredit];
  totalRow.height = 24;
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 5; c++) {
    formatCell(totalRow.getCell(c), { isTotal: true, isCurrency: c >= 4 });
  }
  currentRow++;

  // Status Balance Row
  const statusRow = ws.getRow(currentRow);
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  ws.mergeCells(`D${currentRow}:E${currentRow}`);
  statusRow.getCell(1).value = 'STATUS KESEIMBANGAN';
  statusRow.getCell(4).value = tb.isBalanced ? '✓ SEIMBANG (BALANCED)' : `✗ TIDAK SEIMBANG (SELISIH Rp ${tb.difference.toLocaleString('id-ID')})`;
  statusRow.getCell(4).font = { name: 'Calibri', size: 10, bold: true, color: tb.isBalanced ? { argb: 'FF166534' } : { argb: 'FF991B1B' } };
  statusRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  statusRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  statusRow.height = 22;
  for (let c = 1; c <= 5; c++) {
    formatCell(statusRow.getCell(c), { isTotal: true });
  }

  ws.columns = [
    { width: 14 },
    { width: 36 },
    { width: 18 },
    { width: 22 },
    { width: 22 },
  ];

  return ws;
}

/**
 * 4. Sheet Kertas Kerja 10 Kolom
 */
export function buildWorksheetWorkbook(wb: ExcelJS.Workbook, accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Kertas Kerja 10 Kolom', { views: [{ showGridLines: true }] });
  const startRow = addReportHeader(ws, settings.entityName, 'KERTAS KERJA 10 KOLOM (NERACA LAJUR)', `${settings.periodStart} s/d ${settings.periodEnd}`, standard, 12);

  // 2-Level Multi-column Header
  // Top Level Header
  const topHeaderRow = ws.getRow(startRow);
  ws.mergeCells(`A${startRow}:A${startRow + 1}`);
  ws.mergeCells(`B${startRow}:B${startRow + 1}`);
  topHeaderRow.getCell(1).value = 'Kode';
  topHeaderRow.getCell(2).value = 'Nama Akun';

  ws.mergeCells(`C${startRow}:D${startRow}`);
  topHeaderRow.getCell(3).value = 'Neraca Saldo';

  ws.mergeCells(`E${startRow}:F${startRow}`);
  topHeaderRow.getCell(5).value = 'Penyesuaian';

  ws.mergeCells(`G${startRow}:H${startRow}`);
  topHeaderRow.getCell(7).value = 'NS Disesuaikan';

  ws.mergeCells(`I${startRow}:J${startRow}`);
  topHeaderRow.getCell(9).value = 'Laba / Rugi';

  ws.mergeCells(`K${startRow}:L${startRow}`);
  topHeaderRow.getCell(11).value = 'Neraca';

  topHeaderRow.height = 24;
  for (let c = 1; c <= 12; c++) {
    formatCell(topHeaderRow.getCell(c), { isHeader: true, align: 'center' });
  }

  // Second Level Header (Debit / Kredit)
  const subHeaderRow = ws.getRow(startRow + 1);
  subHeaderRow.values = [
    '', '',
    'Debit', 'Kredit',
    'Debit', 'Kredit',
    'Debit', 'Kredit',
    'Debit', 'Kredit',
    'Debit', 'Kredit',
  ];
  subHeaderRow.height = 22;
  for (let c = 1; c <= 12; c++) {
    formatCell(subHeaderRow.getCell(c), { isHeader: true, align: 'center' });
  }

  let currentRow = startRow + 2;
  const wsRes = calculateWorksheet(accounts, transactions);

  wsRes.rows.forEach((r, idx) => {
    const row = ws.getRow(currentRow);
    row.values = [
      r.account.code,
      r.account.name,
      r.trialBalance.debit,
      r.trialBalance.credit,
      r.adjustment.debit,
      r.adjustment.credit,
      r.adjustedTrialBalance.debit,
      r.adjustedTrialBalance.credit,
      r.incomeStatement.debit,
      r.incomeStatement.credit,
      r.balanceSheet.debit,
      r.balanceSheet.credit,
    ];
    row.height = 20;

    formatCell(row.getCell(1), { align: 'center', isZebra: idx % 2 === 1 });
    formatCell(row.getCell(2), { align: 'left', isZebra: idx % 2 === 1 });
    for (let c = 3; c <= 12; c++) {
      formatCell(row.getCell(c), { isCurrency: true, isZebra: idx % 2 === 1 });
    }
    currentRow++;
  });

  // Total Row 1
  const totalRow = ws.getRow(currentRow);
  totalRow.values = [
    'TOTAL',
    '',
    wsRes.totals.trialBalance.debit,
    wsRes.totals.trialBalance.credit,
    wsRes.totals.adjustment.debit,
    wsRes.totals.adjustment.credit,
    wsRes.totals.adjustedTrialBalance.debit,
    wsRes.totals.adjustedTrialBalance.credit,
    wsRes.totals.incomeStatement.debit,
    wsRes.totals.incomeStatement.credit,
    wsRes.totals.balanceSheet.debit,
    wsRes.totals.balanceSheet.credit,
  ];
  totalRow.height = 24;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 12; c++) {
    formatCell(totalRow.getCell(c), { isTotal: true, isCurrency: c >= 3 });
  }
  currentRow++;

  // Net Income Row
  const netIncomeRow = ws.getRow(currentRow);
  netIncomeRow.values = [
    wsRes.isNetIncome ? 'LABA BERSIH PERIODE BERJALAN' : 'RUGI BERSIH PERIODE BERJALAN',
    '',
    0, 0, 0, 0, 0, 0,
    wsRes.isNetIncome ? wsRes.netIncome : 0,
    wsRes.isNetIncome ? 0 : Math.abs(wsRes.netIncome),
    wsRes.isNetIncome ? 0 : Math.abs(wsRes.netIncome),
    wsRes.isNetIncome ? wsRes.netIncome : 0,
  ];
  netIncomeRow.height = 24;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  netIncomeRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 12; c++) {
    formatCell(netIncomeRow.getCell(c), { isTotal: true, isCurrency: c >= 3 });
  }

  ws.columns = [
    { width: 10 },
    { width: 30 },
    { width: 17 },
    { width: 17 },
    { width: 17 },
    { width: 17 },
    { width: 17 },
    { width: 17 },
    { width: 17 },
    { width: 17 },
    { width: 17 },
    { width: 17 },
  ];

  return ws;
}

/**
 * 5. Sheet Laporan Laba Rugi
 */
export function buildIncomeStatementWorkbook(wb: ExcelJS.Workbook, accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Laba Rugi', { views: [{ showGridLines: true }] });
  let currentRow = addReportHeader(ws, settings.entityName, 'LAPORAN LABA RUGI (INCOME STATEMENT)', `${settings.periodStart} s/d ${settings.periodEnd}`, standard, 3);

  const ledgers = calculateLedgers(accounts, transactions, ['umum', 'penyesuaian']);

  let totalPendapatan = 0;
  let totalBeban = 0;

  // Header Table
  const thRow = ws.getRow(currentRow);
  thRow.values = ['Kode', 'Uraian Akun', 'Jumlah'];
  thRow.height = 24;
  thRow.eachCell((cell) => formatCell(cell, { isHeader: true, align: 'center' }));
  currentRow++;

  // Section 1: Pendapatan
  const sec1 = ws.getRow(currentRow);
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  sec1.getCell(1).value = 'A. PENDAPATAN OPERASIONAL';
  sec1.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
  sec1.getCell(1).fill = STYLES.subHeaderFill;
  sec1.height = 22;
  currentRow++;

  accounts
    .filter((a) => a.category === AccountCategory.PENDAPATAN || a.category === AccountCategory.PENDAPATAN_LRA)
    .forEach((acc) => {
      const l = ledgers.get(acc.code);
      if (!l) return;
      const bal = l.endingBalanceCredit - l.endingBalanceDebit;
      if (bal !== 0) {
        totalPendapatan += bal;
        const row = ws.getRow(currentRow);
        row.values = [acc.code, acc.name, bal];
        row.height = 20;
        formatCell(row.getCell(1), { align: 'center' });
        formatCell(row.getCell(2), { align: 'left' });
        formatCell(row.getCell(3), { isCurrency: true });
        currentRow++;
      }
    });

  const totRevRow = ws.getRow(currentRow);
  totRevRow.values = ['TOTAL PENDAPATAN', '', totalPendapatan];
  totRevRow.height = 22;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  totRevRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 3; c++) formatCell(totRevRow.getCell(c), { isTotal: true, isCurrency: c === 3 });
  currentRow += 2;

  // Section 2: Beban
  const sec2 = ws.getRow(currentRow);
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  sec2.getCell(1).value = 'B. BEBAN OPERASIONAL';
  sec2.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
  sec2.getCell(1).fill = STYLES.subHeaderFill;
  sec2.height = 22;
  currentRow++;

  accounts
    .filter((a) => a.category === AccountCategory.BEBAN || a.category === AccountCategory.BELANJA_LRA)
    .forEach((acc) => {
      const l = ledgers.get(acc.code);
      if (!l) return;
      const bal = l.endingBalanceDebit - l.endingBalanceCredit;
      if (bal !== 0) {
        totalBeban += bal;
        const row = ws.getRow(currentRow);
        row.values = [acc.code, acc.name, bal];
        row.height = 20;
        formatCell(row.getCell(1), { align: 'center' });
        formatCell(row.getCell(2), { align: 'left' });
        formatCell(row.getCell(3), { isCurrency: true });
        currentRow++;
      }
    });

  const totExpRow = ws.getRow(currentRow);
  totExpRow.values = ['TOTAL BEBAN', '', totalBeban];
  totExpRow.height = 22;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  totExpRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 3; c++) formatCell(totExpRow.getCell(c), { isTotal: true, isCurrency: c === 3 });
  currentRow += 2;

  // Final Net Income
  const netIncome = totalPendapatan - totalBeban;
  const netRow = ws.getRow(currentRow);
  netRow.values = [
    netIncome >= 0 ? 'LABA BERSIH PERIODE BERJALAN' : 'RUGI BERSIH PERIODE BERJALAN',
    '',
    netIncome,
  ];
  netRow.height = 26;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  netRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 3; c++) {
    formatCell(netRow.getCell(c), { isTotal: true, isCurrency: c === 3 });
  }

  ws.columns = [
    { width: 14 },
    { width: 44 },
    { width: 24 },
  ];

  return ws;
}

/**
 * 6. Sheet Laporan Posisi Keuangan (Neraca)
 */
export function buildBalanceSheetWorkbook(wb: ExcelJS.Workbook, accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Posisi Keuangan', { views: [{ showGridLines: true }] });
  let currentRow = addReportHeader(ws, settings.entityName, 'LAPORAN POSISI KEUANGAN (NERACA)', `Per ${settings.periodEnd}`, standard, 3);

  const ledgers = calculateLedgers(accounts, transactions, ['umum', 'penyesuaian']);

  let totalAset = 0;
  let totalLiabilitas = 0;
  let totalEkuitas = 0;

  // Calculate Net Income
  let rev = 0, exp = 0;
  accounts.forEach((a) => {
    const l = ledgers.get(a.code);
    if (!l) return;
    if (a.category === AccountCategory.PENDAPATAN || a.category === AccountCategory.PENDAPATAN_LRA) {
      rev += l.endingBalanceCredit - l.endingBalanceDebit;
    }
    if (a.category === AccountCategory.BEBAN || a.category === AccountCategory.BELANJA_LRA) {
      exp += l.endingBalanceDebit - l.endingBalanceCredit;
    }
  });
  const netIncome = rev - exp;

  // Header Table
  const thRow = ws.getRow(currentRow);
  thRow.values = ['Kode', 'Uraian Pos Keuangan', 'Jumlah'];
  thRow.height = 24;
  thRow.eachCell((cell) => formatCell(cell, { isHeader: true, align: 'center' }));
  currentRow++;

  // 1. ASET
  const secAset = ws.getRow(currentRow);
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  secAset.getCell(1).value = 'ASET';
  secAset.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
  secAset.getCell(1).fill = STYLES.subHeaderFill;
  secAset.height = 22;
  currentRow++;

  accounts
    .filter((a) => a.category === AccountCategory.ASET)
    .forEach((acc) => {
      const l = ledgers.get(acc.code);
      if (!l) return;
      const bal = acc.isContra
        ? -(l.endingBalanceCredit - l.endingBalanceDebit)
        : l.endingBalanceDebit - l.endingBalanceCredit;
      if (bal !== 0) {
        totalAset += bal;
        const row = ws.getRow(currentRow);
        row.values = [acc.code, acc.name, bal];
        row.height = 20;
        formatCell(row.getCell(1), { align: 'center' });
        formatCell(row.getCell(2), { align: 'left' });
        formatCell(row.getCell(3), { isCurrency: true });
        currentRow++;
      }
    });

  const totAsetRow = ws.getRow(currentRow);
  totAsetRow.values = ['TOTAL ASET', '', totalAset];
  totAsetRow.height = 24;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  totAsetRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 3; c++) formatCell(totAsetRow.getCell(c), { isTotal: true, isCurrency: c === 3 });
  currentRow += 2;

  // 2. LIABILITAS
  const secLiab = ws.getRow(currentRow);
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  secLiab.getCell(1).value = 'LIABILITAS / KEWAJIBAN';
  secLiab.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
  secLiab.getCell(1).fill = STYLES.subHeaderFill;
  secLiab.height = 22;
  currentRow++;

  accounts
    .filter((a) => a.category === AccountCategory.LIABILITAS)
    .forEach((acc) => {
      const l = ledgers.get(acc.code);
      if (!l) return;
      const bal = l.endingBalanceCredit - l.endingBalanceDebit;
      if (bal !== 0) {
        totalLiabilitas += bal;
        const row = ws.getRow(currentRow);
        row.values = [acc.code, acc.name, bal];
        row.height = 20;
        formatCell(row.getCell(1), { align: 'center' });
        formatCell(row.getCell(2), { align: 'left' });
        formatCell(row.getCell(3), { isCurrency: true });
        currentRow++;
      }
    });

  const totLiabRow = ws.getRow(currentRow);
  totLiabRow.values = ['TOTAL LIABILITAS', '', totalLiabilitas];
  totLiabRow.height = 24;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  totLiabRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 3; c++) formatCell(totLiabRow.getCell(c), { isTotal: true, isCurrency: c === 3 });
  currentRow += 2;

  // 3. EKUITAS
  const secEq = ws.getRow(currentRow);
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  secEq.getCell(1).value = 'EKUITAS';
  secEq.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
  secEq.getCell(1).fill = STYLES.subHeaderFill;
  secEq.height = 22;
  currentRow++;

  accounts
    .filter((a) => a.category === AccountCategory.EKUITAS && a.code !== '399')
    .forEach((acc) => {
      const l = ledgers.get(acc.code);
      if (!l) return;
      const bal = acc.isContra
        ? -(l.endingBalanceDebit - l.endingBalanceCredit)
        : l.endingBalanceCredit - l.endingBalanceDebit;
      if (bal !== 0) {
        totalEkuitas += bal;
        const row = ws.getRow(currentRow);
        row.values = [acc.code, acc.name, bal];
        row.height = 20;
        formatCell(row.getCell(1), { align: 'center' });
        formatCell(row.getCell(2), { align: 'left' });
        formatCell(row.getCell(3), { isCurrency: true });
        currentRow++;
      }
    });

  totalEkuitas += netIncome;
  const netEqRow = ws.getRow(currentRow);
  netEqRow.values = ['398', 'Laba / (Rugi) Bersih Periode Berjalan', netIncome];
  netEqRow.height = 20;
  formatCell(netEqRow.getCell(1), { align: 'center' });
  formatCell(netEqRow.getCell(2), { align: 'left' });
  formatCell(netEqRow.getCell(3), { isCurrency: true });
  currentRow++;

  const totEqRow = ws.getRow(currentRow);
  totEqRow.values = ['TOTAL EKUITAS', '', totalEkuitas];
  totEqRow.height = 24;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  totEqRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 3; c++) formatCell(totEqRow.getCell(c), { isTotal: true, isCurrency: c === 3 });
  currentRow += 2;

  // Final Total Liabilitas + Ekuitas
  const grandTotalRow = ws.getRow(currentRow);
  const totalLiabAndEquity = totalLiabilitas + totalEkuitas;
  grandTotalRow.values = ['TOTAL LIABILITAS DAN EKUITAS', '', totalLiabAndEquity];
  grandTotalRow.height = 26;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  grandTotalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 3; c++) formatCell(grandTotalRow.getCell(c), { isTotal: true, isCurrency: c === 3 });

  ws.columns = [
    { width: 14 },
    { width: 44 },
    { width: 24 },
  ];

  return ws;
}

/**
 * 7. Sheet Jurnal Penutup
 */
export function buildClosingEntriesWorkbook(wb: ExcelJS.Workbook, accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Jurnal Penutup', { views: [{ showGridLines: true }] });
  const startRow = addReportHeader(ws, settings.entityName, 'JURNAL PENUTUP (CLOSING ENTRIES)', `${settings.periodStart} s/d ${settings.periodEnd}`, standard, 6);

  const headerRow = ws.getRow(startRow);
  headerRow.values = ['Tanggal', 'No. Ref', 'Keterangan Akun & Penutupan', 'Kode Akun', 'Debit', 'Kredit'];
  headerRow.height = 26;
  headerRow.eachCell((cell) => formatCell(cell, { isHeader: true, align: 'center' }));

  let currentRow = startRow + 1;
  let totD = 0, totK = 0;
  const closingTx = generateClosingEntries(accounts, transactions, settings.periodEnd, standard);

  closingTx.forEach((tx) => {
    tx.entries.forEach((e, idx) => {
      const isFirst = idx === 0;
      const isCredit = e.credit > 0 && e.debit === 0;
      const indent = isCredit ? '      ' : '';

      totD += e.debit;
      totK += e.credit;

      const row = ws.getRow(currentRow);
      row.values = [
        isFirst ? tx.date : '',
        isFirst ? tx.refNumber : '',
        indent + e.accountName,
        e.accountCode,
        e.debit,
        e.credit,
      ];
      row.height = 20;

      formatCell(row.getCell(1), { align: 'center' });
      formatCell(row.getCell(2), { align: 'center' });
      formatCell(row.getCell(3), { align: 'left' });
      formatCell(row.getCell(4), { align: 'center' });
      formatCell(row.getCell(5), { isCurrency: true });
      formatCell(row.getCell(6), { isCurrency: true });

      currentRow++;
    });

    const descRow = ws.getRow(currentRow);
    descRow.values = ['', '', `    (${tx.description})`, '', 0, 0];
    descRow.height = 18;
    for (let c = 1; c <= 6; c++) {
      const cell = descRow.getCell(c);
      formatCell(cell, { align: c === 3 ? 'left' : 'center' });
      cell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF736E66' } };
    }
    currentRow++;
  });

  const totalRow = ws.getRow(currentRow);
  totalRow.values = ['TOTAL', '', '', '', totD, totK];
  totalRow.height = 24;
  ws.mergeCells(`A${currentRow}:D${currentRow}`);
  totalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 6; c++) {
    formatCell(totalRow.getCell(c), { isTotal: true, isCurrency: c >= 5 });
  }

  ws.columns = [
    { width: 14 },
    { width: 16 },
    { width: 38 },
    { width: 12 },
    { width: 20 },
    { width: 20 },
  ];

  return ws;
}

/**
 * 8. Sheet Khusus SAK Syariah: Laporan Zakat
 */
export function buildSyariahZakatWorkbook(wb: ExcelJS.Workbook, accounts: Account[], transactions: Transaction[], settings: EntitySettings): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Dana Zakat', { views: [{ showGridLines: true }] });
  let currentRow = addReportHeader(ws, settings.entityName, 'LAPORAN SUMBER DAN PENYALURAN DANA ZAKAT', `${settings.periodStart} s/d ${settings.periodEnd}`, 'SAK Syariah', 3);

  const ledgers = calculateLedgers(accounts, transactions, ['umum', 'penyesuaian']);
  let totalSumber = 0;
  let totalSalur = 0;

  const thRow = ws.getRow(currentRow);
  thRow.values = ['Kode', 'Uraian Dana Zakat', 'Jumlah'];
  thRow.height = 24;
  thRow.eachCell((c) => formatCell(c, { isHeader: true, align: 'center' }));
  currentRow++;

  // Sumber
  const sec1 = ws.getRow(currentRow);
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  sec1.getCell(1).value = 'A. SUMBER DANA ZAKAT';
  sec1.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
  sec1.getCell(1).fill = STYLES.subHeaderFill;
  sec1.height = 22;
  currentRow++;

  accounts
    .filter((a) => a.code.startsWith('41') || a.name.toLowerCase().includes('penerimaan dana zakat'))
    .forEach((acc) => {
      const l = ledgers.get(acc.code);
      if (!l) return;
      const bal = l.endingBalanceCredit;
      totalSumber += bal;
      const row = ws.getRow(currentRow);
      row.values = [acc.code, acc.name, bal];
      row.height = 20;
      formatCell(row.getCell(1), { align: 'center' });
      formatCell(row.getCell(2), { align: 'left' });
      formatCell(row.getCell(3), { isCurrency: true });
      currentRow++;
    });

  const tot1 = ws.getRow(currentRow);
  tot1.values = ['TOTAL SUMBER DANA ZAKAT', '', totalSumber];
  tot1.height = 24;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  tot1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 3; c++) formatCell(tot1.getCell(c), { isTotal: true, isCurrency: c === 3 });
  currentRow += 2;

  // Penyaluran
  const sec2 = ws.getRow(currentRow);
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  sec2.getCell(1).value = 'B. PENYALURAN DANA ZAKAT';
  sec2.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
  sec2.getCell(1).fill = STYLES.subHeaderFill;
  sec2.height = 22;
  currentRow++;

  accounts
    .filter((a) => a.code.startsWith('51') || a.name.toLowerCase().includes('penyaluran dana zakat'))
    .forEach((acc) => {
      const l = ledgers.get(acc.code);
      if (!l) return;
      const bal = l.endingBalanceDebit;
      totalSalur += bal;
      const row = ws.getRow(currentRow);
      row.values = [acc.code, acc.name, bal];
      row.height = 20;
      formatCell(row.getCell(1), { align: 'center' });
      formatCell(row.getCell(2), { align: 'left' });
      formatCell(row.getCell(3), { isCurrency: true });
      currentRow++;
    });

  const tot2 = ws.getRow(currentRow);
  tot2.values = ['TOTAL PENYALURAN DANA ZAKAT', '', totalSalur];
  tot2.height = 24;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  tot2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 3; c++) formatCell(tot2.getCell(c), { isTotal: true, isCurrency: c === 3 });
  currentRow += 2;

  const surplusZakat = totalSumber - totalSalur;
  const netRow = ws.getRow(currentRow);
  netRow.values = ['KENAIKAN / (PENURUNAN) BERSIH DANA ZAKAT', '', surplusZakat];
  netRow.height = 26;
  ws.mergeCells(`A${currentRow}:B${currentRow}`);
  netRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 3; c++) formatCell(netRow.getCell(c), { isTotal: true, isCurrency: c === 3 });

  ws.columns = [{ width: 14 }, { width: 44 }, { width: 24 }];
  return ws;
}

/**
 * 9. Sheet Khusus SAP: LRA
 */
export function buildSAPLraWorkbook(wb: ExcelJS.Workbook, accounts: Account[], transactions: Transaction[], settings: EntitySettings): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('LRA Anggaran', { views: [{ showGridLines: true }] });
  let currentRow = addReportHeader(ws, settings.entityName, 'LAPORAN REALISASI ANGGARAN (LRA)', `${settings.periodStart} s/d ${settings.periodEnd}`, 'SAP (PP 71/2010)', 4);

  const ledgers = calculateLedgers(accounts, transactions, ['umum', 'penyesuaian']);
  let totalPendapatanLRA = 0;
  let totalBelanjaLRA = 0;

  const thRow = ws.getRow(currentRow);
  thRow.values = ['Kode', 'Uraian Akun Realisasi', 'Basis Akuntansi', 'Realisasi Kas'];
  thRow.height = 24;
  thRow.eachCell((c) => formatCell(c, { isHeader: true, align: 'center' }));
  currentRow++;

  // Pendapatan LRA
  const sec1 = ws.getRow(currentRow);
  ws.mergeCells(`A${currentRow}:D${currentRow}`);
  sec1.getCell(1).value = '1. PENDAPATAN - LRA (BASIS KAS)';
  sec1.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
  sec1.getCell(1).fill = STYLES.subHeaderFill;
  sec1.height = 22;
  currentRow++;

  accounts
    .filter((a) => a.category === AccountCategory.PENDAPATAN_LRA)
    .forEach((acc) => {
      const l = ledgers.get(acc.code);
      if (!l) return;
      const bal = l.endingBalanceCredit;
      totalPendapatanLRA += bal;
      const row = ws.getRow(currentRow);
      row.values = [acc.code, acc.name, 'Basis Kas', bal];
      row.height = 20;
      formatCell(row.getCell(1), { align: 'center' });
      formatCell(row.getCell(2), { align: 'left' });
      formatCell(row.getCell(3), { align: 'center' });
      formatCell(row.getCell(4), { isCurrency: true });
      currentRow++;
    });

  const tot1 = ws.getRow(currentRow);
  tot1.values = ['TOTAL PENDAPATAN - LRA', '', '', totalPendapatanLRA];
  tot1.height = 24;
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  tot1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 4; c++) formatCell(tot1.getCell(c), { isTotal: true, isCurrency: c === 4 });
  currentRow += 2;

  // Belanja LRA
  const sec2 = ws.getRow(currentRow);
  ws.mergeCells(`A${currentRow}:D${currentRow}`);
  sec2.getCell(1).value = '2. BELANJA - LRA (BASIS KAS)';
  sec2.getCell(1).font = { name: 'Calibri', size: 11, bold: true };
  sec2.getCell(1).fill = STYLES.subHeaderFill;
  sec2.height = 22;
  currentRow++;

  accounts
    .filter((a) => a.category === AccountCategory.BELANJA_LRA)
    .forEach((acc) => {
      const l = ledgers.get(acc.code);
      if (!l) return;
      const bal = l.endingBalanceDebit;
      totalBelanjaLRA += bal;
      const row = ws.getRow(currentRow);
      row.values = [acc.code, acc.name, 'Basis Kas', bal];
      row.height = 20;
      formatCell(row.getCell(1), { align: 'center' });
      formatCell(row.getCell(2), { align: 'left' });
      formatCell(row.getCell(3), { align: 'center' });
      formatCell(row.getCell(4), { isCurrency: true });
      currentRow++;
    });

  const tot2 = ws.getRow(currentRow);
  tot2.values = ['TOTAL BELANJA - LRA', '', '', totalBelanjaLRA];
  tot2.height = 24;
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  tot2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 4; c++) formatCell(tot2.getCell(c), { isTotal: true, isCurrency: c === 4 });
  currentRow += 2;

  const surplusLRA = totalPendapatanLRA - totalBelanjaLRA;
  const netRow = ws.getRow(currentRow);
  netRow.values = [surplusLRA >= 0 ? 'SURPLUS LRA' : 'DEFISIT LRA', '', '', surplusLRA];
  netRow.height = 26;
  ws.mergeCells(`A${currentRow}:C${currentRow}`);
  netRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 1; c <= 4; c++) formatCell(netRow.getCell(c), { isTotal: true, isCurrency: c === 4 });

  ws.columns = [{ width: 14 }, { width: 38 }, { width: 16 }, { width: 24 }];
  return ws;
}

/**
 * Main function: Exports all financial statements into a fully styled, structured .xlsx workbook
 */
export async function exportAllReportsToExcel(options: ExportOptions): Promise<void> {
  const { settings, standard, accounts, transactions } = options;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'NarKuntansi by Nadhif A.R';
  wb.lastModifiedBy = settings.entityName;
  wb.created = new Date();
  wb.modified = new Date();

  // 1. Jurnal Umum
  buildGeneralJournalWorkbook(wb, transactions, settings, standard);

  // 2. Buku Besar
  buildLedgerWorkbook(wb, accounts, transactions, settings, standard);

  // 3. Neraca Saldo
  buildTrialBalanceWorkbook(wb, accounts, transactions, settings, standard);

  // 4. Kertas Kerja (10 Kolom)
  buildWorksheetWorkbook(wb, accounts, transactions, settings, standard);

  // 5. Laba Rugi
  buildIncomeStatementWorkbook(wb, accounts, transactions, settings, standard);

  // 6. Posisi Keuangan (Neraca)
  buildBalanceSheetWorkbook(wb, accounts, transactions, settings, standard);

  // 7. Jurnal Penutup
  buildClosingEntriesWorkbook(wb, accounts, transactions, settings, standard);

  // 8. Standar Khusus: Syariah
  if (standard === AccountingStandard.SAK_SYARIAH) {
    buildSyariahZakatWorkbook(wb, accounts, transactions, settings);
  }

  // 9. Standar Khusus: SAP
  if (standard === AccountingStandard.SAP) {
    buildSAPLraWorkbook(wb, accounts, transactions, settings);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const safeFileName = `${settings.entityName.replace(/[^a-zA-Z0-9]/g, '_')}_Laporan_Keuangan_${standard}.xlsx`;
  saveAs(blob, safeFileName);
}

/**
 * Individual Single Sheet Exporters with the new styled engine
 */
export async function exportSingleJournalToExcel(transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NarKuntansi by Nadhif A.R';
  buildGeneralJournalWorkbook(wb, transactions, settings, standard);
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Jurnal_Umum_${settings.entityName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
}

export async function exportSingleLedgerToExcel(accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NarKuntansi by Nadhif A.R';
  buildLedgerWorkbook(wb, accounts, transactions, settings, standard);
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Buku_Besar_${settings.entityName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
}

export async function exportSingleTrialBalanceToExcel(accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NarKuntansi by Nadhif A.R';
  buildTrialBalanceWorkbook(wb, accounts, transactions, settings, standard);
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Neraca_Saldo_${settings.entityName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
}

export async function exportSingleWorksheetToExcel(accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NarKuntansi by Nadhif A.R';
  buildWorksheetWorkbook(wb, accounts, transactions, settings, standard);
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Kertas_Kerja_10_Kolom_${settings.entityName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
}

export async function exportSingleClosingEntriesToExcel(accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NarKuntansi by Nadhif A.R';
  buildClosingEntriesWorkbook(wb, accounts, transactions, settings, standard);
  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Jurnal_Penutup_${settings.entityName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
}

/**
 * ---------------------------------------------------------------------------
 * Standalone single-sheet builders + generic exporter
 * ---------------------------------------------------------------------------
 * These wrap the *Workbook builders above, creating a fresh, self-contained
 * ExcelJS.Workbook for a single sheet. The resulting Worksheet keeps a
 * reference back to its parent workbook (ws.workbook), which is what
 * `exportSingleSheetToExcel` uses to serialize and download the file.
 * This lets view components build a sheet and export it in two decoupled
 * steps (e.g. for previewing or reusing the worksheet before exporting).
 */

function createSingleSheetWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NarKuntansi by Nadhif A.R';
  wb.created = new Date();
  wb.modified = new Date();
  return wb;
}

/**
 * Builds a standalone "Buku Besar" (General Ledger) worksheet.
 */
export function buildLedgerSheet(accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): ExcelJS.Worksheet {
  const wb = createSingleSheetWorkbook();
  wb.lastModifiedBy = settings.entityName;
  return buildLedgerWorkbook(wb, accounts, transactions, settings, standard);
}

/**
 * Builds a standalone "Kertas Kerja 10 Kolom" (10-Column Worksheet) worksheet.
 */
export function buildWorksheetSheet(accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): ExcelJS.Worksheet {
  const wb = createSingleSheetWorkbook();
  wb.lastModifiedBy = settings.entityName;
  return buildWorksheetWorkbook(wb, accounts, transactions, settings, standard);
}

/**
 * Builds a standalone "Neraca Saldo" (Trial Balance) worksheet.
 */
export function buildTrialBalanceSheet(accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): ExcelJS.Worksheet {
  const wb = createSingleSheetWorkbook();
  wb.lastModifiedBy = settings.entityName;
  return buildTrialBalanceWorkbook(wb, accounts, transactions, settings, standard);
}

/**
 * Builds a standalone "Jurnal Penutup" (Closing Entries) worksheet.
 */
export function buildClosingEntriesSheet(accounts: Account[], transactions: Transaction[], settings: EntitySettings, standard: AccountingStandard): ExcelJS.Worksheet {
  const wb = createSingleSheetWorkbook();
  wb.lastModifiedBy = settings.entityName;
  return buildClosingEntriesWorkbook(wb, accounts, transactions, settings, standard);
}

/**
 * Serializes the parent workbook of a single worksheet (built via one of the
 * build*Sheet functions above) and triggers a download as .xlsx.
 * `sheetName` is accepted for API clarity/back-compat but the worksheet's
 * own name (set when it was added to its workbook) is what Excel displays.
 */
export async function exportSingleSheetToExcel(sheetName: string, ws: ExcelJS.Worksheet, filename: string): Promise<void> {
  const wb = ws.workbook;
  if (!wb) {
    throw new Error(`Tidak dapat mengekspor sheet "${sheetName}": worksheet tidak terhubung ke workbook manapun.`);
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, filename);
}
