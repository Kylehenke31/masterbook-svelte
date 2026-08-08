/**
 * localFiling.js — filing the project's paperwork into a folder on this
 * computer instead of Dropbox.
 *
 * Uses the File System Access API. The directory handle the user picks is kept
 * in IndexedDB rather than localStorage because a handle is a live object, not
 * a string — localStorage would only ever store "[object FileSystemDirectory-
 * Handle]".
 *
 * A handle survives a reload but its *permission* does not always: the browser
 * may downgrade it to 'prompt', and re-granting requires a user gesture. So
 * nothing here silently re-asks. `localFolderReady()` reports whether writing
 * would work right now, and the Files window turns that into a visible
 * "reconnect this folder" action rather than a write that fails at commit.
 *
 * Per computer, not per project member. A folder chosen on the coordinator's
 * laptop means nothing on the producer's, which is exactly why the Dropbox
 * option exists — this is for a production keeping its own job folder.
 */

const DB_NAME  = 'masterbook-fs';
const STORE    = 'handles';
const KEY      = 'projectFolder';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbDel(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/** Can this browser file locally at all? Safari and Firefox cannot, today. */
export function localFilingSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** The stored handle, or null. Does not prompt. */
export async function getProjectFolderHandle() {
  if (!localFilingSupported()) return null;
  try { return await idbGet(KEY); } catch { return null; }
}

/**
 * Is the stored folder usable right now, without asking the user anything?
 * Distinguishes "never chosen" from "chosen but needs re-granting", because
 * those need different words in the interface.
 */
export async function localFolderStatus() {
  if (!localFilingSupported()) return { state: 'unsupported', name: null };
  const handle = await getProjectFolderHandle();
  if (!handle) return { state: 'none', name: null };
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return { state: 'ready', name: handle.name };
    if (perm === 'denied')  return { state: 'denied', name: handle.name };
    return { state: 'needs-permission', name: handle.name };
  } catch {
    return { state: 'needs-permission', name: handle.name || null };
  }
}

export async function localFolderReady() {
  return (await localFolderStatus()).state === 'ready';
}

/**
 * Ask the user to pick the folder. Must be called from a click — the browser
 * refuses otherwise, and the rejection is indistinguishable from the user
 * cancelling.
 */
export async function chooseProjectFolder() {
  if (!localFilingSupported()) throw new Error('This browser cannot file to a local folder.');
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'masterbook-project' });
  await idbSet(KEY, handle);
  return handle.name;
}

/** Re-grant permission on a folder already chosen. Also needs a click. */
export async function regrantProjectFolder() {
  const handle = await getProjectFolderHandle();
  if (!handle) throw new Error('No folder has been chosen yet.');
  const perm = await handle.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new Error('Permission to write to that folder was not granted.');
  return handle.name;
}

export async function forgetProjectFolder() {
  try { await idbDel(KEY); } catch { /* nothing stored */ }
}

/** Names that are legal in a folder on disk. Mirrors sanitizeFolderSegment. */
function safeName(segment) {
  return String(segment || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled';
}

/** Walk/create a nested path under the project folder, returning the handle. */
async function dirFor(pathSegments) {
  const root = await getProjectFolderHandle();
  if (!root) throw new Error('No project folder has been chosen on this computer.');
  let dir = root;
  for (const seg of pathSegments) {
    if (!seg) continue;
    dir = await dir.getDirectoryHandle(safeName(seg), { create: true });
  }
  return dir;
}

/**
 * Create the whole project folder structure on disk — the same tree
 * folderTree.js describes and dropbox.js provisions, so a production that
 * switches between the two finds its paperwork in the same places.
 */
export async function provisionLocalFolders(tree) {
  const root = await getProjectFolderHandle();
  if (!root) throw new Error('No project folder has been chosen on this computer.');
  let created = 0;
  const failed = [];
  const walk = async (nodes, parentSegments) => {
    for (const node of nodes) {
      try {
        const segments = [...parentSegments, node.label];
        await dirFor(segments);
        created++;
        if (node.children?.length) await walk(node.children, segments);
      } catch (e) {
        failed.push({ label: node.label, message: e.message });
      }
    }
  };
  await walk(tree, []);
  return { created, failedCount: failed.length, failed, folderName: root.name };
}

/**
 * Write one file into the project folder.
 *
 * @param pathSegments  folder labels, outermost first — e.g.
 *                      ['01. ACCOUNTING', 'iv. Purchase Orders', 'PO-0007_Vendor']
 * @param filename      the file's own name, including extension
 * @param bytes         Uint8Array | ArrayBuffer | Blob
 */
export async function writeLocalFile(pathSegments, filename, bytes) {
  const dir = await dirFor(pathSegments);
  const fileHandle = await dir.getFileHandle(safeName(filename), { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(bytes);
  } finally {
    await writable.close();
  }
  return { path: [...pathSegments, filename].join('/') };
}
