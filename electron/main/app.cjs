const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const serviceOrigin = 'http://127.0.0.1:18768';
let serviceProcess;
let loginWindow;
const loginPartition = 'persist:kdzwy-login';
const loginOrigins = new Set();

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function assertSender(event) {
  if (!event.senderFrame || !event.senderFrame.url.startsWith('file:')) {
    throw new Error('未授权的桌面请求');
  }
}

async function readToken() {
  const tokenPath = path.join(root, 'runtime', 'service', 'finance', 'access.token');
  const token = (await fs.readFile(tokenPath, 'utf8')).trim();
  if (token.length < 32) throw new Error('本地服务令牌无效');
  return token;
}

async function serviceRequest(endpoint, options = {}) {
  const token = await readToken();
  let response;
  try {
    response = await fetch(`${serviceOrigin}${endpoint}`, {
      method: options.method || 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(endpoint === '/health' ? 2_000 : 300_000),
    });
  } catch {
    throw new Error('本地财务服务未运行');
  }
  const body = await response.text();
  let payload;
  try { payload = JSON.parse(body); } catch { throw new Error('本地服务返回了无效数据'); }
  if (!response.ok) throw new Error(payload.error || '本地服务请求失败');
  return payload;
}

async function status() {
  try {
    const health = await serviceRequest('/health');
    return { running: health.schema === '2' && health.readOnly === true, health };
  } catch (error) {
    return { running: false, error: errorMessage(error) };
  }
}

async function startService() {
  if ((await status()).running) return status();
  const venvPython = path.join(root, '.kdzda', 'Scripts', 'python.exe');
  try { await fs.access(venvPython); } catch { throw new Error('请先运行 scripts\\bootstrap\\setup-local.ps1 创建 .kdzda Python 环境'); }
  serviceProcess = spawn(venvPython, [path.join(root, 'scripts', 'run', 'launch.py'), 'serve'], {
    cwd: root, windowsHide: true, stdio: 'ignore',
  });
  serviceProcess.once('exit', () => { serviceProcess = undefined; });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const current = await status();
    if (current.running) return current;
  }
  throw new Error('本地财务服务启动超时，请确认已完成登录');
}

function validCompany(value) { return typeof value === 'string' && /^company_\d+$/.test(value); }
function validMonth(value) { return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
function trustedLoginUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'kdzwy.com' || url.hostname.endsWith('.kdzwy.com'));
  } catch { return false; }
}

function rememberLoginUrl(value) {
  if (!trustedLoginUrl(value)) return;
  loginOrigins.add(new URL(value).origin);
}

function watchLoginContents(contents) {
  rememberLoginUrl(contents.getURL());
  contents.on('did-navigate', (_event, url) => rememberLoginUrl(url));
  contents.on('did-navigate-in-page', (_event, url) => rememberLoginUrl(url));
  contents.on('will-navigate', (event, url) => {
    if (!trustedLoginUrl(url)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (!trustedLoginUrl(url)) return { action: 'deny' };
    rememberLoginUrl(url);
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: { partition: loginPartition, contextIsolation: true, nodeIntegration: false, sandbox: true },
      },
    };
  });
  contents.on('did-create-window', (child) => watchLoginContents(child.webContents));
}

function createLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.focus(); return; }
  loginOrigins.clear();
  loginWindow = new BrowserWindow({
    width: 1120, height: 780, title: '账无忧授权',
      webPreferences: { partition: loginPartition, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  watchLoginContents(loginWindow.webContents);
  loginWindow.on('closed', () => { loginWindow = undefined; });
  loginWindow.loadURL('https://gj.kdzwy.com/');
}

async function completeLogin() {
  const loginSession = session.fromPartition(loginPartition);
  const cookies = (await loginSession.cookies.get({})).filter((cookie) =>
    cookie.domain.replace(/^\./, '').endsWith('kdzwy.com')
  ).map(({ name, value, domain, path, secure }) => ({ name, value, domain, path, secure }));
  const currentUrl = loginWindow && !loginWindow.isDestroyed() ? loginWindow.webContents.getURL() : 'https://gj.kdzwy.com/';
  if (!trustedLoginUrl(currentUrl) || cookies.length === 0) throw new Error('请先在授权窗口完成账无忧登录');
  rememberLoginUrl(currentUrl);
  for (const cookie of cookies) {
    const domain = String(cookie.domain || '').replace(/^\./, '');
    if (domain === 'kdzwy.com' || domain.endsWith('.kdzwy.com')) loginOrigins.add(`https://${domain}`);
  }
  await startService();
  const result = await serviceRequest('/authorized-session', {
    method: 'POST', body: { origins: [...loginOrigins], cookies },
  });
  if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
  return result;
}

async function restoreSession() {
  // A valid saved accountbook session is the fast path.  Do not touch the
  // login partition or start any authorization flow when it is still usable.
  try {
    await startService();
    const available = await serviceRequest('/companies');
    if (Array.isArray(available.companies) && available.companies.length) {
      return { restored: true, companies: available.companies, reused: true };
    }
  } catch { /* Continue with the persisted login cookie below. */ }
  const loginSession = session.fromPartition(loginPartition);
  const cookies = (await loginSession.cookies.get({})).filter((cookie) => cookie.domain.replace(/^\./, '').endsWith('kdzwy.com'))
    .map(({ name, value, domain, path, secure }) => ({ name, value, domain, path, secure }));
  if (!cookies.length) return { restored: false };
  const origins = new Set(['https://gj.kdzwy.com']);
  for (const cookie of cookies) origins.add(`https://${String(cookie.domain).replace(/^\./, '')}`);
  try {
    await startService();
    const result = await serviceRequest('/authorized-session', { method: 'POST', body: { origins: [...origins], cookies } });
    return { restored: true, ...result };
  } catch {
    return { restored: false };
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 640,
    title: '财务工作台',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#f3f3f4', symbolColor: '#56575c', height: 38 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'bridge.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ipcMain.handle('desktop:status', (event) => { assertSender(event); return status(); });
  ipcMain.handle('desktop:start-service', async (event) => { assertSender(event); return startService(); });
  ipcMain.handle('desktop:open-login', (event) => { assertSender(event); createLoginWindow(); });
  ipcMain.handle('desktop:restore-session', async (event) => { assertSender(event); return restoreSession(); });
  ipcMain.handle('desktop:complete-login', async (event) => { assertSender(event); return completeLogin(); });
  ipcMain.handle('desktop:companies', async (event) => { assertSender(event); return serviceRequest('/companies'); });
  ipcMain.handle('desktop:refresh', async (event, { company, month }) => {
    assertSender(event);
    if (!validCompany(company) || !validMonth(month)) throw new Error('账套或月份格式无效');
    return serviceRequest(`/snapshot.json?${new URLSearchParams({ company, month })}`);
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (serviceProcess) serviceProcess.kill(); });
