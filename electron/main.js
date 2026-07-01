const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const { autoUpdater } = require('electron-updater');

let mainWindow;
const KANBAN_PROXY_PORT = 3456;
const DASHBOARD_URL = 'http://192.168.1.50:9120';
const SERVE_URL = 'http://192.168.1.50:9119';

// ── Auth state ──────────────────────────────────────────────────────────────
let dashboardCookies = '';
let serveCookies = '';

// ── Auto-Updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  // Don't check for updates in dev mode
  if (!app.isPackaged) {
    console.log('[Updater] Dev mode — skipping update check');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'available',
        version: info.version,
        message: `Update v${info.version} available — downloading...`
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] Up to date:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'up-to-date',
        version: info.version,
        message: 'Up to date'
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    console.log(`[Updater] Downloading: ${pct}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'downloading',
        percent: pct,
        message: `Downloading update: ${pct}%`
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'ready',
        version: info.version,
        message: `Update v${info.version} ready — restart to install`
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'error',
        message: `Update error: ${err.message}`
      });
    }
  });

  // Check for updates after a short delay (let the app load first)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.error('[Updater] Check failed:', err.message);
    });
  }, 5000);
}

// IPC for manual update check and install
ipcMain.handle('update:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result?.updateInfo?.version || null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('update:install', async () => {
  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Jarvis Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: true,
    backgroundColor: '#0a0a0f',
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function httpRequest(method, hostname, port, pathname, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = { hostname, port, path: pathname, method, headers };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, data: { raw: data } }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function extractCookies(result) {
  const cookies = (result.headers['set-cookie'] || []);
  return cookies.map(c => c.split(';')[0]).join('; ');
}

// ── Login to a Hermes endpoint ──────────────────────────────────────────────

async function loginTo(hostname, port) {
  const postData = JSON.stringify({ provider: 'basic', username: 'jason', password: '0406' });
  const result = await httpRequest(
    'POST', hostname, port, '/auth/password-login',
    { 'Content-Type': 'application/json' },
    postData
  );
  return { ok: result.status === 200, cookies: extractCookies(result) };
}

async function apiWithCookies(hostname, port, cookies, method, path, body = null) {
  const headers = { 'Cookie': cookies, 'Content-Type': 'application/json' };
  const result = await httpRequest(method, hostname, port, path, headers, body ? JSON.stringify(body) : null);
  return result.data;
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('auth:login', async () => {
  try {
    // Login to dashboard (for REST API: profiles, sessions, status)
    const dashResult = await loginTo('192.168.1.50', 9120);
    if (dashResult.ok) dashboardCookies = dashResult.cookies;

    // Login to serve (for WebSocket chat)
    const serveResult = await loginTo('192.168.1.50', 9119);
    if (serveResult.ok) serveCookies = serveResult.cookies;

    const ok = dashResult.ok && serveResult.ok;
    return {
      ok,
      error: !ok
        ? !dashResult.ok ? 'Dashboard login failed' : 'Serve login failed'
        : null
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('api:request', async (event, { method, path, body }) => {
  try {
    return await apiWithCookies('192.168.1.50', 9120, dashboardCookies, method, path, body);
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('kanban:request', async (event, { method, path, body }) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://192.168.1.50:${KANBAN_PROXY_PORT}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
});

ipcMain.handle('ws:connect', async (event, { profile } = {}) => {
  try {
    if (!serveCookies) {
      const result = await loginTo('192.168.1.50', 9119);
      if (!result.ok) return { ok: false, error: 'Could not login to serve' };
      serveCookies = result.cookies;
    }

    // Get a WebSocket ticket from the serve endpoint
    const ticketResult = await apiWithCookies('192.168.1.50', 9119, serveCookies, 'POST', '/api/auth/ws-ticket');
    if (!ticketResult.ticket) {
      return { ok: false, error: 'Failed to get WebSocket ticket' };
    }

    let wsUrl = `ws://192.168.1.50:9119/api/ws?ticket=${encodeURIComponent(ticketResult.ticket)}`;
    if (profile) {
      wsUrl += `&profile=${encodeURIComponent(profile)}`;
    }
    return { ok: true, wsUrl };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Jobs API (port 8642) ───────────────────────────────────────────────────────

let apiServerKey = 'ch-local-gateway';

async function fetchApiServerKey() {
  try {
    const config = await apiWithCookies('192.168.1.50', 9120, dashboardCookies, 'GET', '/api/config');
    if (config?.api_server_key) apiServerKey = config.api_server_key;
    else if (config?.API_SERVER_KEY) apiServerKey = config.API_SERVER_SERVER_KEY;
    // Key may also be in gateway.api_server.extra.key
    const gwKey = config?.gateway?.api_server?.extra?.key;
    if (gwKey) apiServerKey = gwKey;
  } catch (err) {
    console.error('Failed to fetch API server key, using default:', err.message);
  }
}

ipcMain.handle('jobs:request', async (event, { method, path, body }) => {
  try {
    const url = new URL(path, 'http://192.168.1.50:8642');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiServerKey}`,
    };
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const result = await httpRequest(method, url.hostname, parseInt(url.port), url.pathname + url.search, headers, bodyStr);
    return result.data;
  } catch (err) {
    return { error: err.message };
  }
});

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    const dashResult = await loginTo('192.168.1.50', 9120);
    if (dashResult.ok) dashboardCookies = dashResult.cookies;
    const serveResult = await loginTo('192.168.1.50', 9119);
    if (serveResult.ok) serveCookies = serveResult.cookies;
    console.log('Logged in to dashboard + serve');
  } catch (err) {
    console.error('Auth failed:', err.message);
  }

  // Fetch API server key for Jobs API
  await fetchApiServerKey();

  createWindow();

  // Start auto-updater after window is created
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
