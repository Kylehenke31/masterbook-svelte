/**
 * fileDocument.js — put a generated document where the project's filing plan
 * says it goes.
 *
 * One place decides this, so the PO packet, the credit card log and anything
 * generated later all obey the same setting. Callers say what the document is
 * and which folder it belongs in; where that folder actually lives — Dropbox,
 * a folder on this computer, or the user's own Downloads — is the plan's
 * business, not theirs.
 *
 * Every outcome is reported rather than thrown. A production whose Dropbox is
 * down still has to be able to commit an expense; what it must not do is
 * believe the paperwork was filed when it was not.
 */

import { folderPathById } from './folderTree.js';
import { effectivePlan, storedPlan } from './filingPlan.js';
import { isDropboxConnected } from './dropbox.js';
import { localFolderReady, writeLocalFile } from './localFiling.js';

/** Resolve what this project can do right now, then what it intends. */
export async function resolvePlan() {
  const { getProject } = await import('../stores/project.js');
  const project = getProject();
  const [dropboxConnected, localReady] = await Promise.all([
    isDropboxConnected().catch(() => false),
    localFolderReady().catch(() => false),
  ]);
  return {
    plan: effectivePlan(project, { dropboxConnected, localFolderReady: localReady }),
    stored: storedPlan(project),
    project,
  };
}

/** Hand the document to the user, which is what "manual" means. */
export function downloadDocument(bytes, filename) {
  try {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch {
    return false;
  }
}

/**
 * File one document according to the plan.
 *
 * @param opts.bytes       the document
 * @param opts.filename    its filename
 * @param opts.folderId    a folderTree id, e.g. '01-accounting/purchase-orders'
 * @param opts.subfolder   optional folder inside that, e.g. 'PO-0007_Keslow'
 * @param opts.dropboxFile async (bytes) => ({ filename, path }) — how this
 *                         document files itself to Dropbox. Passed in because
 *                         each document type has its own naming rules, which
 *                         belong with that document, not here.
 * @param opts.describe    short human name for prompts, e.g. 'PO-0007'
 *
 * @returns { destination, filed, downloaded, skipped, path?, filename?, problem? }
 */
export async function fileDocument(opts) {
  const { bytes, filename, folderId, subfolder, dropboxFile, describe } = opts;
  const { plan } = await resolvePlan();

  // Manual: the document is the user's to keep. Nothing is stored, and that is
  // the setting working, not a failure — so it is not reported as a problem.
  if (plan.destination === 'manual') {
    const ok = downloadDocument(bytes, filename);
    return { destination: 'manual', filed: false, downloaded: ok,
             degradedFrom: plan.degradedFrom, reason: plan.reason };
  }

  // Ask first. A production that wants to see what is being filed before it
  // lands gets to say no, and saying no still leaves them holding the file.
  if (plan.mode === 'prompt') {
    const where = plan.destination === 'dropbox' ? 'Dropbox' : 'the project folder on this computer';
    if (!confirm(`File ${describe || filename} to ${where}?\n\nChoosing Cancel downloads it instead.`)) {
      const ok = downloadDocument(bytes, filename);
      return { destination: plan.destination, filed: false, downloaded: ok, skipped: true };
    }
  }

  if (plan.destination === 'local') {
    try {
      const segments = folderPathById(folderId).split('/');
      if (subfolder) segments.push(subfolder);
      const { path } = await writeLocalFile(segments, filename, bytes);
      return { destination: 'local', filed: true, path, filename };
    } catch (e) {
      const ok = downloadDocument(bytes, filename);
      return { destination: 'local', filed: false, downloaded: ok, problem: e.message };
    }
  }

  try {
    const result = await dropboxFile(bytes);
    return { destination: 'dropbox', filed: true, ...result };
  } catch (e) {
    const ok = downloadDocument(bytes, filename);
    return { destination: 'dropbox', filed: false, downloaded: ok, problem: e.message };
  }
}

/**
 * Create a folder where the plan files things, without putting anything in it.
 *
 * For a petty cash envelope this runs when the envelope is opened, so the
 * custodian can see where their receipts are going to land before any exist.
 * On a manual plan there is nowhere to create it, which is not a failure —
 * `created: false` with no problem attached says so.
 *
 * Best-effort by design: an envelope must open whether or not Dropbox answers.
 * The folder gets created again on the first receipt filed into it anyway,
 * since both paths create parents as needed.
 */
export async function ensureFolder({ folderId, subfolder }) {
  const { plan } = await resolvePlan();
  if (plan.destination === 'manual') {
    return { created: false, destination: 'manual', reason: plan.reason };
  }
  try {
    if (plan.destination === 'local') {
      const { folderPathById } = await import('./folderTree.js');
      const { ensureLocalFolder } = await import('./localFiling.js');
      const segments = folderPathById(folderId).split('/');
      if (subfolder) segments.push(subfolder);
      const path = await ensureLocalFolder(segments);
      return { created: true, destination: 'local', path };
    }
    const { ensureDropboxFolder } = await import('./dropbox.js');
    const path = await ensureDropboxFolder(folderId, subfolder);
    return { created: true, destination: 'dropbox', path };
  } catch (e) {
    return { created: false, destination: plan.destination, problem: e.message };
  }
}

/**
 * File a set of attachments — receipts, mostly — according to the plan.
 *
 * Separate from fileDocument because these are not documents this app made.
 * They are files somebody already uploaded, which changes what the manual
 * setting means: there is nothing useful to hand back, because the person
 * filing by hand is the one who supplied them. So manual skips rather than
 * downloading a pile of PDFs somebody already has.
 *
 * @param opts.items      [{ ref, filename }] — ref is a receiptUrl-style
 *                        reference; bytes are resolved here
 * @param opts.folderId   folderTree id the set belongs under
 * @param opts.subfolder  optional folder inside it
 * @param opts.dropboxFile async () => ({ filedCount, failedCount, failed })
 *                        — Dropbox has its own naming and retry rules per
 *                        document type, so it stays with that type
 * @param opts.describe   short human name for the prompt
 */
export async function fileAttachments(opts) {
  const { items = [], folderId, subfolder, dropboxFile, describe } = opts;
  const { plan } = await resolvePlan();

  if (!items.length) return { destination: plan.destination, filedCount: 0, failedCount: 0 };

  if (plan.destination === 'manual') {
    return { destination: 'manual', filedCount: 0, failedCount: 0, manual: true,
             degradedFrom: plan.degradedFrom, reason: plan.reason };
  }

  if (plan.mode === 'prompt') {
    const where = plan.destination === 'dropbox' ? 'Dropbox' : 'the project folder on this computer';
    const what = `${items.length} ${items.length === 1 ? 'receipt' : 'receipts'}`;
    if (!confirm(`File ${what} for ${describe || 'this record'} to ${where}?`)) {
      return { destination: plan.destination, filedCount: 0, failedCount: 0, skipped: true };
    }
  }

  if (plan.destination === 'local') {
    const { folderPathById } = await import('./folderTree.js');
    const { writeLocalFile } = await import('./localFiling.js');
    const { resolveAttachmentBytes } = await import('./attachments.js');
    const segments = folderPathById(folderId).split('/');
    if (subfolder) segments.push(subfolder);

    const failed = [];
    let filedCount = 0;
    for (const item of items) {
      try {
        const bytes = await resolveAttachmentBytes(item.ref);
        if (!bytes) { failed.push({ filename: item.filename, message: 'nothing stored for it' }); continue; }
        await writeLocalFile(segments, item.filename, bytes);
        filedCount++;
      } catch (e) {
        failed.push({ filename: item.filename, message: e.message });
      }
    }
    return { destination: 'local', filedCount, failedCount: failed.length, failed };
  }

  try {
    const r = await dropboxFile();
    return { destination: 'dropbox', filedCount: r.filedCount ?? 0,
             failedCount: r.failedCount ?? 0, failed: r.failed, path: r.receiptsPath || r.folderPath };
  } catch (e) {
    return { destination: 'dropbox', filedCount: 0, failedCount: items.length, problem: e.message };
  }
}
