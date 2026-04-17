/* ============================================================
   The Masterbook — Electron Main Process
   Handles window creation, native file system access,
   and IPC bridge for folder operations.
   ============================================================ */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');

let mainWindow = null;

/* ────────────────────────────────────────────────────────────
   APP LIFECYCLE
   ──────────────────────────────────────────────────────────── */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'The Masterbook',
    titleBarStyle: 'hiddenInset',   // Native Mac title bar with traffic lights inset
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,              // Needed for fs access in preload
    },
  });

  // Dev mode: load from Vite dev server (run `npm run dev` first)
  // Prod mode: load compiled Svelte build
  if (process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173/index.svelte.html');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile('dist-svelte/index.svelte.html');
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

/* ────────────────────────────────────────────────────────────
   IPC HANDLERS — Native File System Operations
   ──────────────────────────────────────────────────────────── */

/* Pick a folder via native dialog */
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Project Folder',
    properties: ['openDirectory', 'createDirectory'],
    message: 'Choose a folder to build the production file structure in (e.g. your Dropbox folder).',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

/* Build folder structure on disk */
ipcMain.handle('build-folder-structure', async (_event, basePath, folderTree) => {
  try {
    const created = [];
    for (const folder of folderTree) {
      const folderPath = path.join(basePath, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        created.push(folderPath);
      }
    }
    return { success: true, created, basePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* Write a file to disk (e.g. PDF export) */
ipcMain.handle('write-file', async (_event, filePath, data, encoding) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (encoding === 'base64') {
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
    } else {
      fs.writeFileSync(filePath, data, encoding || 'utf-8');
    }
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* Read a file from disk */
ipcMain.handle('read-file', async (_event, filePath, encoding) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' };
    const data = fs.readFileSync(filePath, encoding || 'utf-8');
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* List files in a directory */
ipcMain.handle('list-directory', async (_event, dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) return { success: false, error: 'Directory not found' };
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries
      .filter(e => !e.name.startsWith('.'))  // Skip hidden files
      .map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name),
      }));
    return { success: true, items };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* Check if a path exists */
ipcMain.handle('path-exists', async (_event, targetPath) => {
  return fs.existsSync(targetPath);
});

/* Open a path in Finder */
ipcMain.handle('open-in-finder', async (_event, targetPath) => {
  try {
    shell.showItemInFolder(targetPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* Open a file with its default application */
ipcMain.handle('open-file', async (_event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* Copy a file from source to destination */
ipcMain.handle('copy-file', async (_event, srcPath, destPath) => {
  try {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.copyFileSync(srcPath, destPath);
    return { success: true, destPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* Delete a file */
ipcMain.handle('delete-file', async (_event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* Get file stats */
ipcMain.handle('file-stats', async (_event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: 'Not found' };
    const stats = fs.statSync(filePath);
    return {
      success: true,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString(),
      isDirectory: stats.isDirectory(),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* Save dialog for exporting files */
ipcMain.handle('save-dialog', async (_event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: options.title || 'Save File',
    defaultPath: options.defaultPath || '',
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled) return null;
  return result.filePath;
});
