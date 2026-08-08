/**
 * pettyCashSummary.js — "Petty Cash Reconciliation" PDF generation.
 *
 * Built from scratch with pdf-lib, following the same pattern as
 * ccLogSummary.js and poSummary.js (PDFDocument.create + ensureSpace +
 * wrapText). The document is the paper record of a closed envelope: what was
 * issued, what was spent, what was counted back, and how the two differ.
 *
 * The reconciliation block is the point of the page, so it is drawn last and
 * given room rather than being squeezed under the table.
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

/**
 * The arithmetic of a closed envelope, in one place.
 *
 * Kept separate from the drawing so the screen and the PDF cannot disagree
 * about what an envelope is worth — the UI imports this too.
 *
 * An envelope is allowed to go negative: a custodian who spends past the cash
 * they were handed has paid the difference out of pocket, and the production
 * owes it back. That is a normal outcome, not an error, so it is reported as
 * money owed rather than folded into the over/short figure — otherwise going
 * $100 out of pocket would read as being $100 "over", which is the opposite
 * of what happened.
 */
export function reconcile(envelope, charges) {
  const opening = Number(envelope?.openingBalance) || 0;
  const spent   = charges.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = opening - spent;

  // What should physically still be in the envelope, which can never be less
  // than nothing, and what the production owes on top if it went past zero.
  const expectedRemaining = Math.max(balance, 0);
  const owedToCustodian   = balance < 0 ? -balance : 0;

  const counted  = envelope?.countedCash == null ? null : Number(envelope.countedCash) || 0;
  const variance = counted == null ? null : counted - expectedRemaining;

  return { opening, spent, balance, expectedRemaining, owedToCustodian, counted, variance };
}

/** Pure builder — returns Uint8Array PDF bytes for a closed envelope. */
export async function buildPettyCashPDF(envelope, charges) {
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
  const red       = rgb(0.72, 0.31, 0.31);
  const green     = rgb(0.29, 0.48, 0.29);

  let page = pdfDoc.addPage(PageSizes.Letter);
  let y    = pageH - margin;

  const cols = [
    { key: 'date',   label: 'DATE',        x: margin,        w: 60 },
    { key: 'folder', label: 'FOLDER',      x: margin + 60,   w: 50 },
    { key: 'vendor', label: 'VENDOR',      x: margin + 110,  w: 120 },
    { key: 'desc',   label: 'DESCRIPTION', x: margin + 230,  w: 200 },
    { key: 'amount', label: 'AMOUNT',      x: margin + 430,  w: contentW - 430, align: 'right' },
  ];

  function drawTableHeader() {
    page.drawRectangle({ x: margin, y: y - 14, width: contentW, height: 14, color: lightGray });
    cols.forEach(c => {
      const tx = c.align === 'right'
        ? c.x + c.w - fontBold.widthOfTextAtSize(c.label, 7) - 4
        : c.x + 4;
      page.drawText(c.label, { x: tx, y: y - 10, font: fontBold, size: 7, color: darkGray });
    });
    y -= 18;
  }

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

  // ── Title band ──
  page.drawRectangle({ x: margin, y: y - 26, width: contentW, height: 26, color: darkGray });
  page.drawText('PETTY CASH RECONCILIATION', { x: margin + 8, y: y - 18, font: fontBold, size: 12, color: white });
  const projW = fontReg.widthOfTextAtSize(projectName, 10);
  page.drawText(projectName, { x: margin + contentW - projW - 8, y: y - 18, font: fontReg, size: 10, color: white });
  y -= 26;

  // ── Custodian band ──
  const custodian = envelope?.custodianName || 'Unknown custodian';
  page.drawRectangle({ x: margin, y: y - 22, width: contentW, height: 22, color: tan });
  page.drawText(custodian, { x: margin + 8, y: y - 15, font: fontBold, size: 10, color: black });
  const period = `${fmtDate(envelope?.openedDate)} – ${fmtDate(envelope?.closedDate)}`;
  const perW = fontReg.widthOfTextAtSize(period, 9);
  page.drawText(period, { x: margin + contentW - perW - 8, y: y - 15, font: fontReg, size: 9, color: black });
  y -= 34;

  // ── Charges table ──
  drawTableHeader();

  const sorted = charges.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (sorted.length === 0) {
    page.drawText('No charges were logged against this envelope.', {
      x: margin + 4, y: y - 10, font: fontReg, size: 8, color: medGray,
    });
    y -= 20;
  }

  sorted.forEach(p => {
    const descLines = wrapText(p.description || '—', fontReg, 7.5, cols[3].w - 8);
    const rowH = Math.max(16, descLines.length * 10 + 6);
    ensureSpace(rowH);

    const values = {
      date:   fmtDate(p.date),
      folder: p.folder || '—',
      vendor: p.vendor || '—',
      amount: fmtMoney(p.amount),
    };
    cols.forEach(c => {
      if (c.key === 'desc') return; // wrapped separately
      const text = values[c.key] ?? '';
      const font = c.key === 'amount' ? fontBold : fontReg;
      const tx = c.align === 'right' ? c.x + c.w - font.widthOfTextAtSize(text, 8) - 4 : c.x + 4;
      page.drawText(text, { x: tx, y: y - 9, font, size: 8, color: darkGray });
    });
    descLines.forEach((line, li) => {
      page.drawText(line, { x: cols[3].x + 4, y: y - 9 - li * 10, font: fontReg, size: 7.5, color: darkGray });
    });

    y -= rowH;
    page.drawLine({ start: { x: margin, y: y + 3 }, end: { x: margin + contentW, y: y + 3 }, thickness: 0.3, color: lightGray });
  });

  // ── Reconciliation block ──
  const r = reconcile(envelope, charges);
  ensureSpace(120);
  y -= 14;

  page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: margin + contentW, y: y + 6 }, thickness: 0.5, color: black });
  y -= 8;
  page.drawText('RECONCILIATION', { x: margin, y: y - 8, font: fontBold, size: 9, color: black });
  y -= 22;

  const labelX = margin + contentW - 260;
  const valueRight = margin + contentW - 4;

  function line(label, value, { bold = false, color = darkGray, size = 9 } = {}) {
    const font = bold ? fontBold : fontReg;
    page.drawText(label, { x: labelX, y: y - 8, font, size, color });
    const vw = font.widthOfTextAtSize(value, size);
    page.drawText(value, { x: valueRight - vw, y: y - 8, font, size, color });
    y -= 15;
  }

  line('Opening balance', fmtMoney(r.opening));
  line(`Charges (${sorted.length})`, `(${fmtMoney(r.spent)})`);
  page.drawLine({ start: { x: labelX, y: y + 4 }, end: { x: valueRight, y: y + 4 }, thickness: 0.3, color: lightGray });
  y -= 4;
  line('Expected cash on hand', fmtMoney(r.expectedRemaining), { bold: true });
  line('Counted cash on hand', r.counted == null ? '—' : fmtMoney(r.counted), { bold: true });

  const vLabel = r.variance == null ? 'Over / (short)'
    : r.variance === 0 ? 'Balanced'
    : r.variance > 0 ? 'Over' : 'Short';
  const vValue = r.variance == null ? '—'
    : r.variance < 0 ? `(${fmtMoney(Math.abs(r.variance))})` : fmtMoney(r.variance);
  const vColor = r.variance == null || r.variance === 0 ? darkGray : (r.variance > 0 ? green : red);
  line(vLabel, vValue, { bold: true, color: vColor, size: 10 });

  if (r.owedToCustodian > 0) {
    y -= 4;
    line('Owed to custodian (out of pocket)', fmtMoney(r.owedToCustodian), { bold: true, color: red, size: 10 });
  }

  // ── Sign-off ──
  ensureSpace(60);
  y -= 22;
  const sigW = (contentW - 24) / 2;
  [['Custodian', envelope?.closedBy], ['Reviewed by', envelope?.reviewedBy]].forEach(([label, who], i) => {
    const x = margin + i * (sigW + 24);
    page.drawLine({ start: { x, y }, end: { x: x + sigW, y }, thickness: 0.5, color: medGray });
    page.drawText(label, { x, y: y - 11, font: fontReg, size: 7.5, color: medGray });
    if (who) page.drawText(who, { x, y: y + 5, font: fontReg, size: 9, color: darkGray });
  });

  return await pdfDoc.save();
}

/** Filename used for both the download and the filed Dropbox copy. */
export function pettyCashFilename(envelope) {
  const who  = (envelope?.custodianName || 'Unknown').replace(/[\\/:*?"<>|]/g, '-');
  const when = envelope?.closedDate || envelope?.openedDate || '';
  return `Petty_Cash_${who}_${when}.pdf`;
}

/** Build + trigger a browser download, matching ccLogSummary.js's pattern. */
export async function generateAndDownloadPettyCash(envelope, charges) {
  const bytes = await buildPettyCashPDF(envelope, charges);
  const blob  = new Blob([bytes], { type: 'application/pdf' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url;
  a.download = pettyCashFilename(envelope);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
