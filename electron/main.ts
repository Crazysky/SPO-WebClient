import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  ipcMain,
  Notification,
} from 'electron';
import * as path from 'path';
import { autoUpdater } from 'electron-updater';

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PORT = process.env['PORT'] ?? '8080';
const APP_URL = `http://localhost:${PORT}`;
const ICON_PATH = path.join(__dirname, '../electron/assets/icon.png');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverReady = false;

// ---------------------------------------------------------------------------
// Start the Node.js gateway server (same process, compiled server.js)
// ---------------------------------------------------------------------------
function startGateway(): void {
  // server.js auto-starts on require — __dirname inside server resolves correctly
  // to dist/server/, so PUBLIC_DIR and CACHE_DIR paths remain valid
  require('../server/server.js');
  serverReady = true;
}

// ---------------------------------------------------------------------------
// Wait for the gateway HTTP server to accept connections before loading URL
// ---------------------------------------------------------------------------
async function waitForServer(retries = 300, delayMs = 1000): Promise<void> {
  const http = await import('http');
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const req = http.get(APP_URL, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        attempts++;
        // Update splash message to reflect first-run download in progress
        if (splashWindow && !splashWindow.isDestroyed()) {
          const message = attempts < 15
            ? 'Starting server…'
            : attempts < 60
              ? 'Downloading game assets — first launch may take a few minutes…'
              : 'Finalizing setup…';
          splashWindow.webContents
            .executeJavaScript(`var el=document.getElementById('msg');if(el)el.textContent=${JSON.stringify(message)};`)
            .catch(() => undefined);
        }
        if (attempts >= retries) {
          reject(new Error(`Gateway not ready after ${retries} attempts`));
        } else {
          setTimeout(check, delayMs);
        }
      });
      req.end();
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Splash window
// ---------------------------------------------------------------------------
function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 500,
    height: 280,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: '#0d1117',
    webPreferences: { contextIsolation: true },
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0d1117;display:flex;flex-direction:column;align-items:center;
      justify-content:center;height:100vh;font-family:'Segoe UI',sans-serif;
      color:#c8a96e;-webkit-app-region:drag;overflow:hidden}
    .logo{font-size:32px;font-weight:300;letter-spacing:6px;color:#d4af37;
      text-transform:uppercase;margin-bottom:4px}
    .sub{font-size:11px;letter-spacing:3px;color:#3a4a5a;text-transform:uppercase;margin-bottom:48px}
    .ring{width:40px;height:40px;border:2px solid #1e2a3a;border-top:2px solid #d4af37;
      border-radius:50%;animation:spin .8s linear infinite;margin-bottom:28px}
    @keyframes spin{to{transform:rotate(360deg)}}
    #msg{font-size:13px;color:#6b7a8d;min-height:18px;text-align:center}
    .hint{font-size:11px;color:#2d3748;margin-top:10px;text-align:center;max-width:380px}
  </style></head><body>
    <div class="logo">Starpeace</div>
    <div class="sub">Online</div>
    <div class="ring"></div>
    <div id="msg">Starting up…</div>
    <div class="hint">First launch downloads game assets and may take a few minutes.</div>
  </body></html>`;

  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return splash;
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function createTray(): void {
  let icon = nativeImage.createEmpty();
  try {
    icon = nativeImage.createFromPath(ICON_PATH);
  } catch {
    // Icon not yet available — tray will use empty image
  }

  tray = new Tray(icon);
  tray.setToolTip('Starpeace Online');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );

  tray.on('double-click', () => mainWindow?.show());
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update-available');
    if (Notification.isSupported()) {
      new Notification({
        title: 'Starpeace Online',
        body: 'Une mise à jour est disponible et sera installée automatiquement.',
      }).show();
    }
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-downloaded');
  });

  autoUpdater.on('error', (err: Error) => {
    console.error('[Updater] Error:', err.message);
  });

  // Check on startup (skip in dev to avoid GitHub API calls)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      console.error('[Updater] Check failed:', err.message);
    });
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function setupIpc(): void {
  ipcMain.on('minimize-to-tray', () => {
    mainWindow?.hide();
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Starpeace Online',
    show: false, // shown after ready-to-show to avoid flash
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Hide menu bar (game UI handles navigation)
  mainWindow.setMenuBarVisibility(false);

  // Show window once content is ready, close splash at the same time
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  // Minimize to tray on close instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Wait for server then load
  await waitForServer();
  await mainWindow.loadURL(APP_URL);
}

// ---------------------------------------------------------------------------
// Global shortcuts
// ---------------------------------------------------------------------------
function registerShortcuts(): void {
  // Ctrl+Shift+S — show/hide the window
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

// Restore window when a second instance tries to launch
app.on('second-instance', () => {
  mainWindow?.show();
  mainWindow?.focus();
});

app.on('ready', async () => {
  // Point writable caches to userData so packaged builds can write outside the asar
  if (app.isPackaged) {
    const userData = app.getPath('userData');
    process.env['SPO_CACHE_DIR'] = path.join(userData, 'cache');
    process.env['SPO_WEBCLIENT_CACHE_DIR'] = path.join(userData, 'webclient-cache');
  }

  splashWindow = createSplashWindow();
  splashWindow.show();

  startGateway();
  createTray();
  setupIpc();
  registerShortcuts();
  setupAutoUpdater();

  try {
    await createWindow();
  } catch (err) {
    console.error('[Electron] Failed to load app:', err);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    app.quit();
  }
});

// Prevent default quit so tray minimize works; set flag on explicit quit
let isQuiting = false;
app.on('before-quit', () => {
  isQuiting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// macOS: re-create window when dock icon is clicked with no open windows
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow().catch(console.error);
  } else {
    mainWindow.show();
  }
});
