/**
 * attachments.js — turning a stored document reference into bytes.
 *
 * A purchase carries references, not files: `receiptUrl`, `w9Url`, `payDocUrl`.
 * Each is one of
 *   data:application/pdf;base64,…   legacy, inlined on the record by older
 *                                   direct submissions — still read, no longer
 *                                   written
 *   supabase://tempdocs/{path}      staged in Supabase Storage, which is where
 *                                   everything goes now
 *
 * This lived in four places — dropbox.js twice, poPacket.js, and the Purchase
 * Log's detail popup — which was survivable while only Dropbox ever read them.
 * Filing to a folder on this computer needs the same bytes outside dropbox.js,
 * and a fifth copy of a format decoder is how one of them quietly stops
 * understanding a reference the others do.
 */

/** data: URL payload → bytes. */
function base64ToBytes(base64) {
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Resolve one reference to bytes, or null.
 *
 * Null covers three different situations on purpose — no reference at all, a
 * reference in a form this build does not understand, and a download that came
 * back empty. Callers filing a whole set of attachments treat all three the
 * same way: skip it and say how many were skipped. Callers that need to tell
 * them apart should check the reference themselves first.
 */
export async function resolveAttachmentBytes(ref) {
  if (!ref) return null;
  try {
    if (ref.startsWith('data:')) {
      return base64ToBytes(ref.split(',')[1]);
    }
    if (ref.startsWith('supabase://')) {
      const { downloadDraftReceipt } = await import('./db.js');
      const buf = await downloadDraftReceipt(ref);
      return buf ? new Uint8Array(buf) : null;
    }
  } catch (e) {
    console.warn('[attachments] could not load a document:', e.message);
  }
  return null;
}
