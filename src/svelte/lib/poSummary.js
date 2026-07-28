/**
 * poSummary.js — "Uniform PO Summary" PDF generation.
 *
 * Builds a from-scratch pdf-lib document matching the target Purchase
 * Order template (title/company block, vendor "To:" block, date/PO#/
 * payment method, salesperson/job/job#, a line-items table, and totals).
 * Follows the same from-scratch pdf-lib pattern already proven in
 * Schedules.svelte's buildPrepPDF (PDFDocument.create + ensureSpace +
 * wrapText helpers) rather than the AcroForm template-fill pattern used
 * for the COI in Insurance.svelte — there's no static PO template file
 * in the repo, and this gives full control over the exact layout.
 */

import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import { getProject, projectFolderName } from '../stores/project.js';

function fmtMoney(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

function readProdInfo() {
  try { return JSON.parse(localStorage.getItem('movie-ledger-prod-info')) || {}; }
  catch { return {}; }
}

const METHOD_LABELS = {
  PO: 'Purchase Order',
  CC: 'Production Credit Card',
  'Petty Cash': 'Petty Cash',
  Return: 'Return',
};

/** Pure builder — returns Uint8Array PDF bytes for the given purchase record. */
export async function buildPOSummaryPDF(purchase) {
  const pdfDoc   = await PDFDocument.create();
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageW    = PageSizes.Letter[0];
  const pageH    = PageSizes.Letter[1];
  const margin   = 50;
  const contentW = pageW - margin * 2;

  const project  = getProject() || {};
  const prodInfo = readProdInfo();

  const projectTitle = project.title || 'Untitled Project';
  const jobName   = prodInfo.jobName   || projectFolderName(project) || projectTitle;
  const jobNumber = prodInfo.jobNumber || project.productionNumber   || '';

  const black    = rgb(0, 0, 0);
  const darkGray = rgb(0.3, 0.3, 0.3);
  const medGray  = rgb(0.5, 0.5, 0.5);
  const lightGray = rgb(0.85, 0.85, 0.85);
  const gold     = rgb(0.6, 0.47, 0.15);

  let page = pdfDoc.addPage(PageSizes.Letter);
  let y    = pageH - margin;

  function drawFooter(pg) {
    const text = prodInfo.prodCoName || '';
    if (!text) return;
    const w = fontReg.widthOfTextAtSize(text, 9);
    pg.drawText(text, { x: (pageW - w) / 2, y: 30, font: fontReg, size: 9, color: medGray });
  }
  function ensureSpace(needed) {
    if (y - needed < margin + 30) {
      drawFooter(page);
      page = pdfDoc.addPage(PageSizes.Letter);
      y = pageH - margin;
    }
  }
  function wrapText(text, font, size, maxW) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) > maxW && cur) { lines.push(cur); cur = w; }
      else { cur = test; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  function centeredText(text, size, font, color) {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (pageW - w) / 2, y, font, size, color });
  }

  // ── Header ──
  centeredText(projectTitle.toUpperCase(), 14, fontBold, black); y -= 22;
  centeredText('PURCHASE ORDER FORM', 18, fontBold, gold); y -= 30;

  // ── Three-column info block ──
  const col1X = margin;
  const col2X = margin + 190;
  const col3X = margin + 370;
  const infoStartY = y;

  const companyLines = [
    prodInfo.prodCoName  || '',
    prodInfo.prodCoAddr  || '',
    prodInfo.prodCoCity  || '',
    prodInfo.prodCoPhone || '',
  ].filter(Boolean);
  let cy = infoStartY;
  for (const line of companyLines) { page.drawText(line, { x: col1X, y: cy, font: fontReg, size: 9, color: darkGray }); cy -= 13; }

  cy = infoStartY;
  page.drawText('To:', { x: col2X, y: cy, font: fontBold, size: 9, color: black });
  const vendorLines = [
    purchase.vendor              || '',
    purchase.vendorStreetAddress || '',
    purchase.vendorCityStateZip  || '',
    purchase.vendorPhone         || '',
  ].filter(Boolean);
  for (const line of vendorLines) { page.drawText(line, { x: col2X + 24, y: cy, font: fontReg, size: 9, color: darkGray }); cy -= 13; }

  cy = infoStartY;
  const methodLabel = METHOD_LABELS[purchase.method] || purchase.method || '';
  const rightLines = [
    `Date: ${fmtDate(purchase.date)}`,
    `Purchase Order #: ${purchase.poNumber || ''}`,
    `Payment Method: ${methodLabel}`,
  ];
  for (const line of rightLines) { page.drawText(line, { x: col3X, y: cy, font: fontReg, size: 9, color: darkGray }); cy -= 13; }

  y = Math.min(infoStartY - companyLines.length * 13, infoStartY - vendorLines.length * 13 - 13, infoStartY - rightLines.length * 13) - 16;

  page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.5, color: lightGray });
  y -= 18;

  // ── Salesperson / Job / Job # ──
  page.drawText('Salesperson', { x: col1X, y, font: fontBold, size: 8, color: medGray });
  page.drawText('Job',         { x: col2X, y, font: fontBold, size: 8, color: medGray });
  page.drawText('Job #',       { x: col3X, y, font: fontBold, size: 8, color: medGray });
  y -= 13;
  page.drawText(purchase.salesperson || '—', { x: col1X, y, font: fontReg, size: 9, color: darkGray });
  page.drawText(jobName   || '—', { x: col2X, y, font: fontReg, size: 9, color: darkGray });
  page.drawText(jobNumber || '—', { x: col3X, y, font: fontReg, size: 9, color: darkGray });
  y -= 24;

  // ── Line items table ──
  const lineNumX    = margin;
  const qtyX        = margin + 35;
  const itemX       = margin + 70;
  const descX       = margin + 190;
  const unitPriceX  = margin + 380;
  const lineTotalX  = margin + 460;

  function drawTableHeader() {
    page.drawRectangle({ x: margin, y: y - 14, width: contentW, height: 18, color: rgb(0.94, 0.94, 0.94) });
    page.drawText('Line #',      { x: lineNumX,   y: y - 10, font: fontBold, size: 8, color: darkGray });
    page.drawText('Qty',         { x: qtyX,       y: y - 10, font: fontBold, size: 8, color: darkGray });
    page.drawText('Item',        { x: itemX,      y: y - 10, font: fontBold, size: 8, color: darkGray });
    page.drawText('Description', { x: descX,      y: y - 10, font: fontBold, size: 8, color: darkGray });
    page.drawText('Unit Price',  { x: unitPriceX, y: y - 10, font: fontBold, size: 8, color: darkGray });
    page.drawText('Line Total',  { x: lineTotalX, y: y - 10, font: fontBold, size: 8, color: darkGray });
    y -= 24;
  }

  drawTableHeader();

  const items = Array.isArray(purchase.poLineItems) ? purchase.poLineItems : [];
  let subtotal = 0;

  if (!items.length) {
    page.drawText('No line items.', { x: itemX, y, font: fontReg, size: 9, color: medGray });
    y -= 16;
  } else {
    items.forEach((item, i) => {
      const qty       = Number(item.qty) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const lineTotal = qty * unitPrice;
      subtotal += lineTotal;

      const descLines = wrapText(item.description || '', fontReg, 8, 180);
      const rowHeight = Math.max(13, descLines.length * 11 + 2);
      ensureSpace(rowHeight + 4);

      page.drawText(String(item.lineNo ?? i + 1), { x: lineNumX,   y, font: fontReg, size: 8, color: darkGray });
      page.drawText(String(qty),                  { x: qtyX,       y, font: fontReg, size: 8, color: darkGray });
      page.drawText(item.item || '',               { x: itemX,      y, font: fontReg, size: 8, color: darkGray });
      descLines.forEach((line, li) => {
        page.drawText(line, { x: descX, y: y - li * 11, font: fontReg, size: 8, color: darkGray });
      });
      page.drawText(fmtMoney(unitPrice), { x: unitPriceX, y, font: fontReg, size: 8, color: darkGray });
      page.drawText(fmtMoney(lineTotal), { x: lineTotalX, y, font: fontReg, size: 8, color: darkGray });

      y -= rowHeight;
      page.drawLine({ start: { x: margin, y: y + 3 }, end: { x: pageW - margin, y: y + 3 }, thickness: 0.3, color: lightGray });
      y -= 3;
    });
  }

  y -= 12;
  ensureSpace(80);

  // ── Totals ──
  const totalsLabelX = margin + 320;
  const totalsValueX = margin + 460;
  const salesTax = 0; // manual/blank in Phase 1 — no tax-rate field exists anywhere in the schema
  const grandTotal = subtotal + salesTax;

  page.drawText('Total Items',                { x: totalsLabelX, y, font: fontReg, size: 9, color: darkGray });
  page.drawText(String(items.length),          { x: totalsValueX, y, font: fontReg, size: 9, color: darkGray });
  y -= 14;
  page.drawText('Subtotal',                    { x: totalsLabelX, y, font: fontReg, size: 9, color: darkGray });
  page.drawText(fmtMoney(subtotal),             { x: totalsValueX, y, font: fontReg, size: 9, color: darkGray });
  y -= 14;
  page.drawText('Sales Tax',                    { x: totalsLabelX, y, font: fontReg, size: 9, color: darkGray });
  y -= 14;
  page.drawLine({ start: { x: totalsLabelX, y: y + 10 }, end: { x: pageW - margin, y: y + 10 }, thickness: 0.5, color: lightGray });
  page.drawText('Total',                        { x: totalsLabelX, y, font: fontBold, size: 10, color: black });
  page.drawText(fmtMoney(grandTotal),           { x: totalsValueX, y, font: fontBold, size: 10, color: black });

  drawFooter(page);
  return await pdfDoc.save();
}

/** Build + trigger a browser download, matching Schedules.svelte's downloadPDF() pattern. */
export async function generateAndDownloadPOSummary(purchase) {
  const bytes = await buildPOSummaryPDF(purchase);
  const blob  = new Blob([bytes], { type: 'application/pdf' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  const poNum = purchase.poNumber || 'unknown';
  a.href = url;
  a.download = `PO_Summary_${poNum}_${(purchase.vendor || 'Vendor').replace(/\s+/g, '_')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
