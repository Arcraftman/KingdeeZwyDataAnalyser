const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = 18768;
let window;

async function token() {
  const value = (await fs.readFile(path.join(root, 'runtime/finance/access.token'), 'utf8')).trim();
  if (value.length < 32) throw new Error('本地访问令牌无效；请先登录');
  return value;
}

async function serviceGet(route, timeoutMs = 300000) {
  const accessToken = await token();
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1', port, path: route, method: 'GET',
      headers: { Authorization: 'Bearer ' + accessToken },
      timeout: timeoutMs,
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) {
          request.destroy(new Error('返回数据超过 64 MiB'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode !== 200) {
          let message = '服务返回 HTTP ' + response.statusCode;
          if (response.statusCode === 404 &&
              (route === '/companies' || route.startsWith('/snapshot.json?'))) {
            message = '本地服务版本较旧；请关闭旧服务后重新启动。';
          }
          try { message = JSON.parse(body).error || message; } catch {}
          reject(new Error(message));
          return;
        }
        resolve({ body, contentType: String(response.headers['content-type'] || '') });
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('读取超时')));
    request.on('error', reject);
    request.end();
  });
}

function pythonExecutable() {
  const local = path.join(root, '.venv', 'Scripts', 'python.exe');
  return fs.access(local).then(() => local, () => 'python');
}

function launch(executable, args, hidden) {
  const child = spawn(executable, args, {
    cwd: root, detached: true, stdio: 'ignore', windowsHide: hidden, shell: false,
  });
  child.on('error', (error) => console.error('启动失败:', error.message));
  child.unref();
}

function register(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!window || event.sender !== window.webContents) throw new Error('无效请求来源');
    return fn(...args);
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1460, height: 920, minWidth: 1040, minHeight: 690,
    title: 'DataAnalyser 财务看板',
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  register('finance:companies', async () => {
    const response = await serviceGet('/companies', 2000);
    if (!response.contentType.includes('application/json')) throw new Error('服务没有返回账套列表');
    let payload;
    try { payload = JSON.parse(response.body); }
    catch { throw new Error('账套列表格式无效'); }
    if (payload.schema !== '2' || !Array.isArray(payload.companies)) {
      throw new Error('账套列表版本或结构无效');
    }
    return payload.companies
      .filter((row) => row && /^company_[0-9]+$/.test(row.key) && typeof row.name === 'string')
      .map((row) => ({ key: row.key, name: row.name }));
  });
  register('finance:status', async () => {
    try {
      const result = await serviceGet('/health', 2000);
      const health = JSON.parse(result.body);
      return {
        available: health.schema === '2' && health.readOnly === true,
        desktopReady: Array.isArray(health.capabilities) &&
          health.capabilities.includes('companies') &&
          health.capabilities.includes('snapshot-json'),
      };
    } catch {
      return { available: false, desktopReady: false };
    }
  });
  register('finance:start-service', async () => {
    const py = await pythonExecutable();
    launch(py, [path.join(root, 'scripts', 'launch.py'), 'serve'], true);
    return true;
  });
  register('finance:login', async () => {
    launch('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(root, 'scripts', 'start-local.ps1'),
    ], false);
    return true;
  });
  register('finance:snapshot', async (company, month) => {
    if (typeof company !== 'string' || !/^company_[0-9]+$/.test(company)) throw new Error('公司编号无效');
    if (typeof month !== 'string' || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('月份格式无效');
    const response = await serviceGet('/snapshot.json?company=' + company + '&month=' + month);
    if (!response.contentType.includes('application/json')) throw new Error('服务没有返回 JSON 财务快照');
    let payload;
    try { payload = JSON.parse(response.body); }
    catch { throw new Error('财务快照 JSON 格式无效'); }
    if (payload.schema !== '2' || payload.company !== company || payload.month !== month ||
        !payload.sheets || typeof payload.sheets !== 'object' || Array.isArray(payload.sheets)) {
      throw new Error('财务快照版本、账套或月份与请求不符');
    }
    return payload;
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

