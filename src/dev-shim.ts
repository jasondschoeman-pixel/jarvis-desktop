// src/dev-shim.ts — Browser dev shim that mocks Electron IPC with real Hermes API calls
// Only loaded in dev mode (when window.jarvis is undefined)

const DASHBOARD = '/hermes-api';
const SERVE = '/hermes-ws';
const API_SERVER = '/hermes-jobs';
const API_KEY = 'ch-local-gateway';
const AUTH = { username: 'jason', password: '0406' };

let dashCookies = '';
let serveCookies = '';

async function login() {
  // Dashboard
  try {
    const resp = await fetch(`${DASHBOARD}/auth/password-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'basic', ...AUTH }),
    });
    const cookie = resp.headers.get('set-cookie');
    if (cookie) dashCookies = cookie.split(';')[0];
  } catch (e) { console.error('[shim] Dashboard login failed:', e); }

  // Serve
  try {
    const resp = await fetch(`${SERVE}/auth/password-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'basic', ...AUTH }),
    });
    const cookie = resp.headers.get('set-cookie');
    if (cookie) serveCookies = cookie.split(';')[0];
  } catch (e) { console.error('[shim] Serve login failed:', e); }
}

async function apiRequest(method: string, path: string, body?: any) {
  if (!dashCookies) await login();
  const opts: any = {
    method,
    headers: { 'Cookie': dashCookies, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${DASHBOARD}${path}`, opts);
  if (!resp.ok) throw new Error(`${method} ${path}: ${resp.status}`);
  return resp.json();
}

async function kanbanRequest(method: string, path: string, body?: any) {
  if (!dashCookies) await login();
  const opts: any = {
    method,
    headers: { 'Cookie': dashCookies, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${DASHBOARD}${path}`, opts);
  if (!resp.ok) throw new Error(`${method} ${path}: ${resp.status}`);
  return resp.json();
}

async function jobsRequest(method: string, path: string, body?: any) {
  const opts: any = {
    method,
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${API_SERVER}${path}`, opts);
  if (!resp.ok) throw new Error(`${method} ${path}: ${resp.status}`);
  return resp.json();
}

async function fileRead(filePath: string) {
  // In dev mode, use a server-side proxy or direct fetch
  // We can't read the filesystem from browser, so use the serve files API
  if (!serveCookies) await login();
  const resp = await fetch(`${SERVE}/api/files/read?path=${encodeURIComponent(filePath)}`, {
    headers: { 'Cookie': serveCookies },
  });
  if (!resp.ok) {
    // Fallback: try reading via a local proxy
    return { ok: false, error: `File read failed: ${resp.status}` };
  }
  const data = await resp.json();
  if (data.data_url) {
    // Decode base64 data URL
    const base64 = data.data_url.split(',')[1] || data.data_url;
    const content = atob(base64);
    return { ok: true, content, size: content.length, path: filePath };
  }
  return { ok: false, error: 'No data_url in response' };
}

async function fileWrite(filePath: string, content: string) {
  // Can't write to filesystem from browser — this will only work in Electron
  return { ok: false, error: 'File write not available in dev mode (browser). Use Electron app.' };
}

async function getWsTicket() {
  if (!serveCookies) await login();
  const resp = await fetch(`${SERVE}/api/auth/ws-ticket`, {
    method: 'POST',
    headers: { 'Cookie': serveCookies, 'Content-Type': 'application/json' },
  });
  if (!resp.ok) throw new Error('WS ticket failed');
  const data = await resp.json();
  return data.ticket;
}

async function authLogin() {
  await login();
  // Get WS ticket for chat
  try {
    const ticket = await getWsTicket();
    const wsUrl = `ws://${location.host}/hermes-ws/api/ws?ticket=${encodeURIComponent(ticket)}`;
    return { ok: true, wsUrl };
  } catch (e) {
    return { ok: true }; // Still OK — just no WS
  }
}

async function wsConnect(profile: string) {
  if (!serveCookies) await login();
  try {
    const ticket = await getWsTicket();
    const wsUrl = `ws://${location.host}/hermes-ws/api/ws?ticket=${encodeURIComponent(ticket)}`;
    return { ok: true, wsUrl };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// Install the shim
window.jarvis = {
  auth: { login: authLogin },
  api: { request: apiRequest },
  kanban: { request: kanbanRequest },
  jobs: { request: jobsRequest },
  files: { read: fileRead, write: fileWrite },
  ws: { connect: wsConnect },
  update: {
    onStatus: (cb: any) => { cb({ status: 'up-to-date', message: 'Dev mode' }); return () => {}; },
    check: async () => { console.log('[shim] update check (no-op in dev)'); },
    install: async () => { console.log('[shim] update install (no-op in dev)'); },
  },
} as any;

console.log('[dev-shim] window.jarvis installed');

export {};