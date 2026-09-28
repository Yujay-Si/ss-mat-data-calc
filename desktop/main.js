'use strict';

const { app, BrowserWindow, dialog, protocol, session } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { startUpdateChecks } = require('./update');

if (require('electron-squirrel-startup')) app.quit();

const scheme = 'ssmatcalc';
const origin = `${scheme}://app`;
const siteRoot = path.join(__dirname, '..', 'outputs', 'preview-site');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain' };

protocol.registerSchemesAsPrivileged([{ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// Keep the storage path stable across installer and portable builds and later upgrades.
app.setPath('userData', !app.isPackaged && process.env.SSMAT_SMOKE_USER_DATA
  ? process.env.SSMAT_SMOKE_USER_DATA
  : path.join(app.getPath('appData'), 'SSMaterialDataCalc'));
app.setAppUserModelId('com.squirrel.SSMaterialDataCalc.SSMaterialDataCalc');

app.whenReady().then(() => {
  protocol.handle(scheme, async request => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'app') return new Response('Not found', { status: 404 });
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const target = path.resolve(siteRoot, relative);
      if (!target.startsWith(siteRoot + path.sep)) return new Response('Forbidden', { status: 403 });
      const bytes = await readFile(target);
      return new Response(bytes, { headers: {
        'Content-Type': `${mime[path.extname(target)] || 'application/octet-stream'}; charset=utf-8`,
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
      } });
    } catch (error) {
      return new Response('Not found', { status: 404 });
    }
  });

  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const window = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 760,
    minHeight: 600,
    title: '材料数据计算工具',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.loadURL(`${origin}/index.html`).catch(error => {
    dialog.showErrorBox('启动失败', `无法加载本地计算页面：${error.message}`);
    app.quit();
  });
  startUpdateChecks();
});

app.on('window-all-closed', () => app.quit());
