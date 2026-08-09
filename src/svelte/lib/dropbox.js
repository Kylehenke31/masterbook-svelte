/**
 * dropbox.js — Dropbox connection + Files API wrapper.
 *
 * Uses OAuth 2.0 with PKCE (no App Secret needed) — the right flow for a
 * browser-only app with no backend server of its own. The App Key is a
 * public client identifier, safe to ship in frontend code (same category
 * as the Supabase anon key), read from VITE_DROPBOX_APP_KEY.
 *
 * The refresh token this flow produces is stored per-user in Supabase
 * (dropbox_tokens table) via db.js — never in localStorage, since it's
 * long-lived and grants real account access.
 */

const APP_KEY       = import.meta.env.VITE_DROPBOX_APP_KEY;
const REDIRECT_URI  = window.location.origin;
const VERIFIER_KEY  = 'masterbook-dropbox-pkce-verifier';

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier() {
  const arr = new Uint8Array(64);
  crypto.getRandomValues(arr);
  return base64url(arr.buffer);
}

async function challengeFromVerifier(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(digest);
}

/** Kick off the connect flow — redirects the browser to Dropbox. */
export async function startDropboxAuth() {
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = await challengeFromVerifier(verifier);
  const params = new URLSearchParams({
    client_id: APP_KEY,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline',
    redirect_uri: REDIRECT_URI,
  });
  window.location.href = `https://www.dropbox.com/oauth2/authorize?${params}`;
}

/**
 * Call once on app load. If the URL has Dropbox's ?code= redirect param,
 * completes the token exchange and stores the refresh token. Always
 * strips the query string afterward so it doesn't linger or re-fire on
 * refresh. Returns true if a connection was just completed.
 */
export async function handleDropboxRedirect() {
  const url  = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return false;

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', url.pathname + url.hash);
  if (!verifier) return false;

  const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: APP_KEY,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!resp.ok) throw new Error(`Dropbox token exchange failed: ${resp.status}`);
  const data = await resp.json();
  const { saveDropboxToken } = await import('./db.js');
  await saveDropboxToken(data.refresh_token);

  // Set up the project's Dropbox folder structure right away — best-effort,
  // shouldn't block the connect flow from completing if it fails.
  try {
    const { getProject } = await import('../stores/project.js');
    const project = getProject();
    if (project) await provisionProjectFolders(project);
  } catch (e) {
    console.warn('[Dropbox] provisioning project folders failed:', e.message);
  }

  return true;
}

let _accessTokenCache = null; // { token, expiresAt }

/** Mint (and cache) a short-lived access token from the stored refresh token. */
async function getAccessToken() {
  if (_accessTokenCache && _accessTokenCache.expiresAt > Date.now() + 60_000) {
    return _accessTokenCache.token;
  }
  const { loadDropboxToken } = await import('./db.js');
  const refreshToken = await loadDropboxToken();
  if (!refreshToken) throw new Error('Dropbox is not connected.');

  const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: APP_KEY,
    }),
  });
  if (!resp.ok) throw new Error(`Dropbox token refresh failed: ${resp.status}`);
  const data = await resp.json();
  _accessTokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return _accessTokenCache.token;
}

export async function isDropboxConnected() {
  const { loadDropboxToken } = await import('./db.js');
  return !!(await loadDropboxToken());
}

export async function disconnectDropbox() {
  _accessTokenCache = null;
  const { disconnectDropbox: clear } = await import('./db.js');
  await clear();
}

/** Create a folder (and any missing parent folders). No-op if it already exists. */
export async function dropboxCreateFolder(path) {
  const token = await getAccessToken();
  const resp = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, autorename: false }),
  });
  if (resp.ok) return true;

  // 429 (rate limited) — Dropbox sends a Retry-After header.
  if (resp.status === 429) {
    const retryAfterMs = (Number(resp.headers.get('Retry-After')) || 1) * 1000;
    const err = new Error(`Dropbox rate limited (429)`);
    err.retryable = true;
    err.retryAfterMs = retryAfterMs;
    throw err;
  }
  // 5xx — transient server-side error.
  if (resp.status >= 500) {
    const err = new Error(`Dropbox create_folder_v2 server error (${resp.status})`);
    err.retryable = true;
    throw err;
  }

  const err = await resp.json().catch(() => ({}));
  if (err?.error?.['.tag'] === 'path' && err.error.path?.['.tag'] === 'conflict') return true; // already exists
  // Dropbox explicitly documents this one: too many concurrent writes to the
  // *same parent folder* (which is exactly what creating a project's whole
  // subfolder tree does) — their own guidance is to back off and retry.
  if (err?.error?.['.tag'] === 'too_many_write_operations') {
    const e = new Error('Dropbox too_many_write_operations');
    e.retryable = true;
    throw e;
  }
  throw new Error(`Dropbox create_folder_v2 failed (${resp.status}): ${err?.error_summary || ''}`);
}

/**
 * Move or rename a Dropbox path.
 *
 * `not_found` on the source resolves to null rather than throwing: a missing
 * source is not always an error — a folder that was never created is nothing
 * to move — so this reports the absence and leaves callers, which know what
 * they expected to be there, to judge it.
 */
export async function dropboxMove(fromPath, toPath) {
  const token = await getAccessToken();
  const resp = await fetch('https://api.dropboxapi.com/2/files/move_v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    // autorename guards the case where the destination already exists — a PO
    // voided twice should not fail, it should just not collide.
    body: JSON.stringify({ from_path: fromPath, to_path: toPath, autorename: true }),
  });
  if (resp.ok) return await resp.json();

  if (resp.status === 429) {
    const err = new Error('Dropbox rate limited (429)');
    err.retryable = true;
    err.retryAfterMs = (Number(resp.headers.get('Retry-After')) || 1) * 1000;
    throw err;
  }
  if (resp.status >= 500) {
    const err = new Error(`Dropbox move server error (${resp.status})`);
    err.retryable = true;
    throw err;
  }
  const err = await resp.json().catch(() => ({}));
  if (err?.error_summary?.includes('from_lookup/not_found')) return null;
  throw new Error(`Dropbox move failed (${resp.status}): ${err?.error_summary || ''}`);
}

/** dropboxCreateFolder with retry/backoff for the transient failures it flags as retryable. */
async function createFolderWithRetry(path, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await dropboxCreateFolder(path);
    } catch (e) {
      if (!e.retryable || attempt === maxAttempts) throw e;
      const delay = e.retryAfterMs || Math.min(500 * 2 ** (attempt - 1), 8000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/** Upload a file, overwriting any existing file at that exact path. */
export async function dropboxUploadFile(path, bytes) {
  const token = await getAccessToken();
  const resp = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: false, mute: true }),
    },
    body: bytes,
  });
  if (resp.ok) return await resp.json();

  if (resp.status === 429) {
    const retryAfterMs = (Number(resp.headers.get('Retry-After')) || 1) * 1000;
    const err = new Error('Dropbox rate limited (429)');
    err.retryable = true;
    err.retryAfterMs = retryAfterMs;
    throw err;
  }
  if (resp.status >= 500) {
    const err = new Error(`Dropbox upload server error (${resp.status})`);
    err.retryable = true;
    throw err;
  }
  const err = await resp.json().catch(() => ({}));
  if (err?.error?.['.tag'] === 'too_many_write_operations' || err?.error_summary?.includes('too_many_write_operations')) {
    const e = new Error('Dropbox too_many_write_operations');
    e.retryable = true;
    throw e;
  }
  throw new Error(`Dropbox upload failed (${resp.status}): ${err?.error_summary || ''}`);
}

/** dropboxUploadFile with retry/backoff for the transient failures it flags as retryable. */
async function uploadFileWithRetry(path, bytes, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await dropboxUploadFile(path, bytes);
    } catch (e) {
      if (!e.retryable || attempt === maxAttempts) throw e;
      const delay = e.retryAfterMs || Math.min(500 * 2 ** (attempt - 1), 8000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/** Dropbox forbids \, /, and trailing dots/spaces in a path component. */
function sanitizeFolderSegment(name) {
  return String(name || '').replace(/[\\/]/g, '-').trim().replace(/[. ]+$/, '') || 'Untitled';
}


/** Two decimals, no thousands separators — commas read badly in a filename. */
function fmtMoneyForFilename(n) {
  return (Number(n) || 0).toFixed(2);
}

/**
 * File an approved Purchase Order into Dropbox —
 * "{project root}/01. ACCOUNTING/{n}. Purchase Orders/"
 * — named "PO-{poNumber}_{vendor}_{date}_${amount}.pdf".
 *
 * Unlike credit card receipts, POs are not grouped into periodic logs: a PO is
 * a document in its own right, approved once and filed once. The PO number is
 * its identity, so it leads the filename and the folder needs no further
 * structure.
 *
 * @param purchase  the approved PO record
 * @param bytes     the rendered PO Summary PDF
 */
export async function filePurchaseOrder(purchase, bytes) {
  const poPath = await purchaseOrdersPath();
  await createFolderWithRetry(poPath);

  const folderName = poFolderName(purchase);
  const poFolder = `${poPath}/${folderName}`;
  await createFolderWithRetry(poFolder);

  const vendorSlug = sanitizeFolderSegment(purchase.vendor || 'Unknown');
  const filename = sanitizeFolderSegment(
    `PO-${purchase.poNumber || '0000'}_${vendorSlug}_${purchase.date || ''}_$${fmtMoneyForFilename(purchase.amount)}`
  ) + '.pdf';

  await uploadFileWithRetry(`${poFolder}/${filename}`, bytes);
  return { path: `${poFolder}/${filename}`, filename, folderName };
}

/** "{project root}/01. ACCOUNTING/{n}. Purchase Orders" */
async function purchaseOrdersPath() {
  const { projectFolderName, getProject } = await import('../stores/project.js');
  const { folderPathById } = await import('./folderTree.js');
  const rootName = sanitizeFolderSegment(projectFolderName(getProject()));
  return `/${rootName}/${folderPathById('01-accounting/purchase-orders')}`;
}

/** "PO-0007_Keslow Camera" — the folder a PO's paperwork lives in. */
function poFolderName(purchase) {
  return sanitizeFolderSegment(
    `PO-${purchase.poNumber || '0000'}_${sanitizeFolderSegment(purchase.vendor || 'Unknown')}`);
}

/**
 * Mark a voided PO's folder as void — "PO-0007_Keslow Camera" becomes
 * "PO-0007_Keslow Camera_VOID".
 *
 * The folder is renamed rather than deleted. A voided PO is still part of the
 * paper trail: an auditor asking what happened to PO 0007 should find the
 * answer, not a gap where it used to be. Renaming in place also keeps it
 * beside its neighbours, so the gap in the numbering explains itself.
 *
 * VOID is appended rather than replacing the vendor, so the folder still says
 * who the order was for — and so this matches voidPurchase in data.js, which
 * appends to the ledger folder the same way. Two conventions pointing in
 * opposite directions would be worse than either.
 *
 * Returns null when there was no folder to rename. Whether that is benign
 * depends on context this function does not have — a PO voided before it was
 * ever filed has nothing to rename and should not, while one the books record
 * as filed has a folder missing that ought to exist. onPurchaseOrderVoided
 * holds that context and decides; it screens on poSummaryFiled before calling
 * here, so a null it receives is a real disagreement worth reporting.
 */
export async function voidPurchaseOrderFolder(purchase) {
  const poPath = await purchaseOrdersPath();
  const base = poFolderName(purchase);
  if (base.endsWith('_VOID')) return null;          // already marked
  const from = `${poPath}/${base}`;
  const to   = `${poPath}/${sanitizeFolderSegment(`${base}_VOID`)}`;
  const result = await dropboxMove(from, to);
  return result ? { from, to } : null;
}

/**
 * File each purchase's receipt into this card's Dropbox folder —
 * "{project root}/01. ACCOUNTING/{n}. Credit Cards/{cardType} {last4}_{cardholderName}/Receipts/"
 * — named "{last4}_{logNumber}_{receiptNum}_{vendor}_{date}_${amount}.pdf",
 * per the naming convention. Purchases with no receiptUrl are skipped.
 * Sequential + retried, same reasoning as provisionProjectFolders: Dropbox
 * rejects a burst of concurrent writes to the same parent folder.
 *
 * The card folder is keyed on the card alone, not the log number, so every
 * receipt for a card accumulates in one place across log periods. The log
 * number stays in the *filename*, which is what now distinguishes receipts
 * from different periods sharing that folder.
 */
/**
 * What a credit card receipt is called, wherever it is filed.
 *
 * Exported because the local-folder path names them too, and a receipt that is
 * called one thing in Dropbox and another on disk is the same receipt only to
 * whoever filed it.
 */
export async function ccReceiptFilename(p, logNumber) {
  const { padReceiptNum } = await import('./format.js');
  return sanitizeFolderSegment(
    `${p.ccLast4}_${logNumber}_${padReceiptNum(p.ccReceiptNum) || '000'}_${p.vendor}_${p.date}_$${fmtMoneyForFilename(p.amount)}`
  ) + '.pdf';
}

export async function fileCCLogReceipts(card, logNumber, purchases) {
  const { projectFolderName, getProject } = await import('../stores/project.js');
  const { folderPathById } = await import('./folderTree.js');
  const { resolveAttachmentBytes } = await import('./attachments.js');

  const project  = getProject();
  const rootName = sanitizeFolderSegment(projectFolderName(project));
  const cardsPath  = `/${rootName}/${folderPathById('01-accounting/credit-cards')}`;
  const cardFolder = sanitizeFolderSegment(`${card.cardType} ${card.last4}_${card.cardholderName}`);
  const receiptsPath = `${cardsPath}/${cardFolder}/Receipts`;

  // The Credit Cards folder itself is provisioned with the project tree, but
  // create it anyway — a project connected before this folder existed won't
  // have it, and create-if-missing is a no-op when it's already there.
  await createFolderWithRetry(cardsPath);
  await createFolderWithRetry(`${cardsPath}/${cardFolder}`);
  await createFolderWithRetry(receiptsPath);

  const failed = [];
  let filedCount = 0;
  for (const p of purchases) {
    if (!p.receiptUrl) continue;
    try {
      const bytes = await resolveAttachmentBytes(p.receiptUrl);
      if (!bytes) throw new Error('could not read the stored receipt');
      const filename = await ccReceiptFilename(p, logNumber);
      await uploadFileWithRetry(`${receiptsPath}/${filename}`, bytes);
      filedCount++;
    } catch (e) {
      failed.push({ purchaseId: p.id, message: e.message });
    }
  }
  if (failed.length) {
    console.warn('[Dropbox] some receipts failed to file:', failed);
  }
  return { receiptsPath, filedCount, failedCount: failed.length, failed };
}

/**
 * File a reconciled petty cash envelope as one packet —
 * "{project root}/01. ACCOUNTING/{n}. Petty Cash/{custodian}_{closed date}/"
 * — holding the reconciliation PDF and every receipt logged against it.
 *
 * One folder per envelope, for the same reason a PO gets its own: the packet
 * is the unit an auditor asks for, and splitting it across a shared folder
 * means reassembling it by filename later.
 *
 * Filing happens at review, not at close. A custodian closing an envelope is
 * saying what they counted; an accountant approving it is what makes that the
 * production's record, and only then is it worth committing to the file.
 *
 * Receipt failures are collected rather than thrown: the reconciliation itself
 * is the document that matters, and losing the whole filing because one
 * receipt would not download serves nobody. The count comes back so the caller
 * can say what happened.
 */
/** Envelope folder name, shared by the Dropbox and local-folder paths. */
export function pettyCashFolderName(envelope) {
  return sanitizeFolderSegment(
    `${envelope.custodianName || 'Unknown'}_${envelope.closedDate || envelope.openedDate || ''}`);
}

/** What one petty cash receipt is called, wherever it is filed. */
export function pettyCashReceiptFilename(p) {
  return sanitizeFolderSegment(
    `${p.folder || '0000'}_${p.vendor || 'Unknown'}_${p.date || ''}_$${fmtMoneyForFilename(p.amount)}`
  ) + '.pdf';
}

export async function filePettyCashEnvelope(envelope, charges, summaryBytes, filename) {
  const { projectFolderName, getProject } = await import('../stores/project.js');
  const { folderPathById } = await import('./folderTree.js');
  const { resolveAttachmentBytes } = await import('./attachments.js');

  const project  = getProject();
  const rootName = sanitizeFolderSegment(projectFolderName(project));
  const pcPath   = `/${rootName}/${folderPathById('01-accounting/petty-cash')}`;
  const folderPath = `${pcPath}/${pettyCashFolderName(envelope)}`;

  await createFolderWithRetry(pcPath);
  await createFolderWithRetry(folderPath);

  await uploadFileWithRetry(`${folderPath}/${filename}`, summaryBytes);

  const failed = [];
  let filedCount = 0;
  for (const p of charges) {
    if (!p.receiptUrl) continue;
    try {
      const bytes = await resolveAttachmentBytes(p.receiptUrl);
      if (!bytes) throw new Error('could not read the stored receipt');
      await uploadFileWithRetry(`${folderPath}/${pettyCashReceiptFilename(p)}`, bytes);
      filedCount++;
    } catch (e) {
      failed.push({ purchaseId: p.id, message: e.message });
    }
  }
  if (failed.length) {
    console.warn('[Dropbox] some petty cash receipts failed to file:', failed);
  }
  return { folderPath, filedCount, failedCount: failed.length, failed };
}

/**
 * Create the project's root Dropbox folder (named after the project, same
 * convention as projectFolderName()) plus the full static subfolder tree
 * from folderTree.js — the same structure shown in the app's Files window.
 * Called once right after a successful connect.
 *
 * Creates paths one at a time, parents before children, with retry/backoff
 * on transient failures. Dropbox explicitly rejects a burst of concurrent
 * writes to the same parent folder (`too_many_write_operations`) — which is
 * exactly what firing all these creates in parallel does, since several
 * subfolders share the same parent (e.g. everything under "01. ACCOUNTING").
 * Any path that still fails after retries is skipped rather than aborting
 * the rest of the tree.
 */
export async function provisionProjectFolders(project) {
  const { projectFolderName } = await import('../stores/project.js');
  const { FOLDER_TREE } = await import('./folderTree.js');

  const rootName = sanitizeFolderSegment(projectFolderName(project));
  const rootPath = `/${rootName}`;

  const paths = [rootPath];
  for (const node of FOLDER_TREE) {
    paths.push(`${rootPath}/${node.label}`);
    for (const child of node.children || []) {
      paths.push(`${rootPath}/${node.label}/${child.label}`);
    }
  }

  const failed = [];
  for (const path of paths) {
    try {
      await createFolderWithRetry(path);
    } catch (e) {
      failed.push({ path, message: e.message });
    }
  }
  if (failed.length) {
    console.warn('[Dropbox] some project folders failed to create:', failed);
  }
  return { rootPath, failedCount: failed.length, totalCount: paths.length, failed };
}
