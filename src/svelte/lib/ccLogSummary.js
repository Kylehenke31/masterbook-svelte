/**
 * ccLogSummary.js — "Credit Card Log" PDF generation.
 *
 * Builds a from-scratch pdf-lib document matching the target CC Log
 * template (dark "CC Log {number} / Project Name" band, tan "Credit Card
 * Log - {cardholder} - {type} {last4}" band, a charges table, and a
 * subtotal footer). Follows the same from-scratch pdf-lib pattern already
 * proven in poSummary.js (PDFDocument.create + ensureSpace + wrapText
 * helpers, itself adapted from Schedules.svelte's buildPrepPDF).
 */

import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import { getProject } from '../stores/project.js';

function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${m}.${d}.${String(y).slice(-2)}`;
}

/** Pure builder — returns Uint8Array PDF bytes for a card's log. */
export async function buildCCLogPDF(card, logNumber, purchases) {
  const pdfDoc   = await PDFDocument.create();
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageW    = PageSizes.Letter[0];
  const pageH    = PageSizes.Letter[1];
  const margin   = 36;
  const contentW = pageW - margin * 2;

  const project     = getProject() || {};
  const projectName = project.title || 'Untitled Project';

  const black     = rgb(0, 0, 0);
  const white     = rgb(1, 1, 1);
  const darkGray  = rgb(0.25, 0.25, 0.25);
  const medGray   = rgb(0.5, 0.5, 0.5);
  const lightGray = rgb(0.85, 0.85, 0.85);
  const tan       = rgb(0.97, 0.92, 0.82);
  const highlight = rgb(0.87, 0.93, 0.86);

  let page = pdfDoc.addPage(PageSizes.Letter);
  let y    = pageH - margin;

  function ensureSpace(needed) {
    if (y - needed < margin + 30) {
      page = pdfDoc.addPage(PageSizes.Letter);
      y = pageH - margin;
      drawTableHeader();
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

  // ── Header: dark "CC Log" band (left) + tan cardholder band (right) ──
  const bandH     = 34;
  const bandY     = y - bandH;
  const darkBandW = 200;

  page.drawRectangle({ x: margin, y: bandY, width: darkBandW, height: bandH, color: black });
  page.drawText(`CC Log ${logNumber}`, { x: margin + 8, y: bandY + bandH - 15, font: fontBold, size: 12, color: white });
  page.drawText(projectName, { x: margin + 8, y: bandY + 6, font: fontReg, size: 8, color: white });

  const tanX = margin + darkBandW;
  const tanW = contentW - darkBandW;
  page.drawRectangle({ x: tanX, y: bandY, width: tanW, height: bandH, color: tan });
  const cardLine = `Credit Card Log - ${card.cardholderName} - ${card.cardType} ${card.last4}`;
  const cardLineW = fontBold.widthOfTextAtSize(cardLine, 10);
  page.drawText(cardLine, { x: tanX + tanW - cardLineW - 8, y: bandY + bandH / 2 - 4, font: fontBold, size: 10, color: darkGray });

  y = bandY - 10;

  // ── Table columns ──
  const cols = [
    { key: 'line',    label: 'LINE',           w: 32,  align: 'left'  },
    { key: 'vendor',  label: 'VENDOR',         w: 100, align: 'left'  },
    { key: 'env',     label: 'ENV #',          w: 40,  align: 'left'  },
    { key: 'rec',     label: 'REC #',          w: 40,  align: 'left'  },
    { key: 'date',    label: 'DATE',           w: 48,  align: 'left'  },
    { key: 'payType', label: 'PAY TYPE',       w: 62,  align: 'left'  },
    { key: 'terms',   label: 'TERMS',          w: 38,  align: 'left'  },
    { key: 'actual',  label: 'ACTUAL',         w: 55,  align: 'right' },
    { key: 'purpose', label: 'PURPOSE',        w: 90,  align: 'left'  },
    { key: 'notes',   label: 'NOTES / NEEDS',  w: 0,   align: 'left'  }, // fills remainder
  ];
  const fixedW = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w = Math.max(60, contentW - fixedW);
  cols.forEach((c, i) => { c.x = margin + cols.slice(0, i).reduce((s, cc) => s + cc.w, 0); });

  function drawTableHeader() {
    page.drawRectangle({ x: margin, y: y - 14, width: contentW, height: 16, color: lightGray });
    cols.forEach(c => {
      const tx = c.align === 'right' ? c.x + c.w - fontBold.widthOfTextAtSize(c.label, 7) - 4 : c.x + 4;
      page.drawText(c.label, { x: tx, y: y - 10, font: fontBold, size: 7, color: darkGray });
    });
    y -= 20;
  }
  drawTableHeader();

  let subtotal = 0;
  let anyReceipts = false;

  purchases.forEach(p => {
    const amount = Number(p.amount) || 0;
    subtotal += amount;
    if (p.receiptUrl) anyReceipts = true;

    const purposeLines = wrapText(p.description || '', fontReg, 7.5, cols.find(c => c.key === 'purpose').w - 8);
    const rowH = Math.max(14, purposeLines.length * 10 + 2);
    ensureSpace(rowH + 4);

    // Env# / Rec# / Actual get a light-green highlight, matching the example
    ['env', 'rec', 'actual'].forEach(key => {
      const c = cols.find(cc => cc.key === key);
      page.drawRectangle({ x: c.x, y: y - rowH + 3, width: c.w, height: rowH, color: highlight });
    });

    const values = {
      line:    p.lineItem || '—',
      vendor:  p.vendor || '—',
      env:     p.ccEnvelopeNum || '',
      rec:     p.ccReceiptNum || '',
      date:    fmtDate(p.date),
      payType: `${p.ccCardType || card.cardType} ${p.ccLast4 || card.last4}`,
      terms:   p.paid ? 'paid' : '',
      actual:  fmtMoney(amount),
      notes:   '',
    };
    cols.forEach(c => {
      if (c.key === 'purpose') return; // drawn separately below (wrapped)
      const text = c.key === 'actual' ? values.actual : (values[c.key] ?? '');
      const bold = c.key === 'actual';
      const font = bold ? fontBold : fontReg;
      const tx = c.align === 'right' ? c.x + c.w - font.widthOfTextAtSize(text, 8) - 4 : c.x + 4;
      page.drawText(text, { x: tx, y: y - 9, font, size: 8, color: darkGray });
    });
    const purposeX = cols.find(c => c.key === 'purpose').x;
    purposeLines.forEach((line, li) => {
      page.drawText(line, { x: purposeX + 4, y: y - 9 - li * 10, font: fontReg, size: 7.5, color: darkGray });
    });

    y -= rowH;
    page.drawLine({ start: { x: margin, y: y + 3 }, end: { x: margin + contentW, y: y + 3 }, thickness: 0.3, color: lightGray });
  });

  ensureSpace(40);
  y -= 6;

  // ── Footer: "Receipts Attached" + Subtotal ──
  page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: margin + contentW, y: y + 6 }, thickness: 0.5, color: black });
  if (anyReceipts) {
    page.drawText('Receipts Attached', { x: margin, y: y - 8, font: fontBold, size: 8, color: darkGray });
  }
  const subLabel = 'SUBTOTAL';
  const subValue = fmtMoney(subtotal);
  const actualCol = cols.find(c => c.key === 'actual');
  page.drawText(subLabel, { x: actualCol.x - 60, y: y - 8, font: fontBold, size: 8, color: darkGray });
  const subValW = fontBold.widthOfTextAtSize(subValue, 9);
  page.drawText(subValue, { x: actualCol.x + actualCol.w - subValW - 4, y: y - 8, font: fontBold, size: 9, color: black });

  return await pdfDoc.save();
}

/** Build + trigger a browser download, matching poSummary.js's downloadPDF() pattern. */
export async function generateAndDownloadCCLog(card, logNumber, purchases) {
  const bytes = await buildCCLogPDF(card, logNumber, purchases);
  const blob  = new Blob([bytes], { type: 'application/pdf' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url;
  a.download = `CC_Log_${logNumber}_${card.cardType}_${card.last4}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
