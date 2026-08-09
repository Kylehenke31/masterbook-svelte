/**
 * poPacket.js — assemble everything a Purchase Order needs into one PDF.
 *
 * A filed PO is not just its topsheet. The question an auditor asks months
 * later is "what did we agree to, what were we billed, and who were we paying"
 * — and answering it should not mean hunting three files across two systems.
 * So the filed document carries all of it, in the order someone reads it:
 *
 *   1. Purchase Order topsheet   — what was ordered and approved
 *   2. Invoice                   — what the vendor billed (the attached receipt)
 *   3. Payment instructions      — where the money goes
 *   4. W9 / tax form             — who they are
 *
 * Missing parts are skipped rather than faulted. A PO can legitimately be
 * approved before its invoice arrives, and a packet of three pages is more
 * use than a failure that files nothing.
 */

import { PDFDocument } from 'pdf-lib';
import { resolveAttachmentBytes } from './attachments.js';

/* Reference decoding lives in attachments.js — the filing code reads the same
   formats, and two decoders drift. */
const loadDocBytes = (ref) => resolveAttachmentBytes(ref);

/**
 * Build the combined PO packet.
 *
 * @param purchase      the approved PO record
 * @param summaryBytes  the already-rendered PO Summary, so it is not built twice
 * @returns {Promise<{ bytes: Uint8Array, included: string[], missing: string[] }>}
 */
export async function buildPOPacket(purchase, summaryBytes) {
  const packet = await PDFDocument.create();
  const included = [];
  const missing = [];

  // Ordered as they are read, not as they were collected.
  const parts = [
    { label: 'Purchase Order', bytes: summaryBytes },
    { label: 'Invoice',        ref: purchase.receiptUrl },
    { label: 'Payment Info',   ref: purchase.payDocUrl },
    { label: 'W9',             ref: purchase.w9Url },
  ];

  for (const part of parts) {
    const bytes = part.bytes ?? await loadDocBytes(part.ref);
    if (!bytes) { missing.push(part.label); continue; }
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await packet.copyPages(src, src.getPageIndices());
      pages.forEach(pg => packet.addPage(pg));
      included.push(part.label);
    } catch (e) {
      // A single unreadable attachment must not cost the whole packet — an
      // encrypted or corrupt vendor PDF is common enough to plan for.
      console.warn(`[poPacket] skipping ${part.label}:`, e.message);
      missing.push(part.label);
    }
  }

  return { bytes: await packet.save(), included, missing };
}
