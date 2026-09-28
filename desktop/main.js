'use strict';

const { app, BrowserWindow, dialog, Menu, protocol, session } = require('electron');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { startUpdateChecks } = require('./update');

// Squirrel invokes the EXE for install/update/uninstall events. These are not app launches.
const squirrelStartup = require('electron-squirrel-startup');
if (squirrelStartup) app.quit();

if (!squirrelStartup) {
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
    const checkForUpdates = startUpdateChecks();
    // Bind view commands to this app window so menu clicks and accelerators have the same target.
    const viewContents = () => window.isDestroyed() ? null : window.webContents;
    const changeZoom = step => {
      const contents = viewContents();
      if (contents) contents.setZoomLevel(Math.max(-3, Math.min(5, contents.getZoomLevel() + step)));
    };
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '文件', submenu: [{ label: '退出', role: 'quit' }] },
      { label: '编辑', submenu: [
        { label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }
      ] },
      { label: '视图', submenu: [
        { label: '重新加载', accelerator: 'CommandOrControl+R', click: () => viewContents()?.reload() },
        { type: 'separator' },
        { label: '实际大小', accelerator: 'CommandOrControl+0', click: () => viewContents()?.setZoomLevel(0) },
        { label: '放大', accelerator: 'CommandOrControl+Plus', click: () => changeZoom(1) },
        { label: '缩小', accelerator: 'CommandOrControl+-', click: () => changeZoom(-1) },
        { label: '全屏', role: 'togglefullscreen' }
      ] },
      { label: '窗口', submenu: [
        { label: '最小化', role: 'minimize' }, { label: '关闭', role: 'close' }
      ] },
      { label: '帮助', submenu: [
        { label: '检查更新', click: () => { void checkForUpdates(); } },
        { type: 'separator' },
        { label: '关于', click: () => { void dialog.showMessageBox(window, {
          type: 'info', title: '关于 材料数据计算工具', message: `材料数据计算工具 v${app.getVersion()}`,
          detail: '供工厂人员在本机离线估算材料可冲圆片数量。输入材质、厚度、宽度、重量和冲料方式后，可查看预计数量及复核数据。',
          buttons: ['确定'], noLink: true
        }).catch(error => console.error('显示关于信息失败：', error)); } }
      ] }
    ]));

    let lastProtocolError = null;
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
        lastProtocolError = error;
        console.error('读取本地页面失败：', error);
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
    async function loadLocalPage() {
      const firstRun = process.argv.includes('--squirrel-firstrun');
      const attempts = firstRun ? 4 : 1;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        lastProtocolError = null;
        try {
          await window.loadURL(`${origin}/index.html`);
          return;
        } catch (error) {
          console.warn(`本地页面加载失败（第 ${attempt}/${attempts} 次）：`, error);
          if (window.isDestroyed()) return;
          if (attempt < attempts) {
            // Installation can briefly lock app files while Squirrel finishes setup.
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          const detail = lastProtocolError ? `\n读取页面资源时：${lastProtocolError.message}` : '';
          dialog.showErrorBox('启动失败', `无法加载本地计算页面：${error.message}${detail}`);
          app.quit();
        }
      }
    }

    loadLocalPage().catch(error => {
      dialog.showErrorBox('启动失败', error.message);
      app.quit();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
