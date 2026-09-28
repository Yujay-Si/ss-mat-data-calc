'use strict';

const { app, autoUpdater, dialog, shell } = require('electron');
const { isSquirrelInstall, getPortableUpdate } = require('./update-policy');

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const INITIAL_DELAY_MS = 12 * 1000;
const RELEASE_API = 'https://api.github.com/repos/Yujay-Si/ss-mat-data-calc/releases/latest';

function startInstalledUpdates() {
  let checking = false;
  let downloaded = false;
  const feed = `https://update.electronjs.org/Yujay-Si/ss-mat-data-calc/win32-x64/${app.getVersion()}`;

  autoUpdater.on('error', error => {
    checking = false;
    console.warn('更新检查失败：', error);
  });
  autoUpdater.on('update-not-available', () => { checking = false; });
  autoUpdater.on('update-downloaded', async () => {
    checking = false;
    downloaded = true;
    try {
      const result = await dialog.showMessageBox({
        type: 'info',
        title: '发现新版本',
        message: '新版本已下载完成',
        detail: '现在重启程序即可安装更新。选择“稍后”时，更新会在下次启动时生效。',
        buttons: ['立即重启并安装', '稍后'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      });
      if (result.response === 0) autoUpdater.quitAndInstall();
    } catch (error) {
      console.error('显示更新提示失败：', error);
    }
  });

  try {
    autoUpdater.setFeedURL({ url: feed });
  } catch (error) {
    console.warn('无法配置更新服务：', error);
    return;
  }

  const check = () => {
    if (checking || downloaded) return;
    checking = true;
    try {
      autoUpdater.checkForUpdates();
    } catch (error) {
      checking = false;
      console.warn('无法启动更新检查：', error);
    }
  };
  setTimeout(check, INITIAL_DELAY_MS).unref();
  setInterval(check, CHECK_INTERVAL_MS).unref();
}

function startPortableUpdates() {
  let checking = false;
  let promptedVersion = null;

  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      const response = await fetch(RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SSMaterialDataCalc' },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
      const update = getPortableUpdate(await response.json(), app.getVersion());
      if (!update || promptedVersion === update.version) return;
      promptedVersion = update.version;
      const result = await dialog.showMessageBox({
        type: 'info',
        title: '发现新版本',
        message: `便携版 ${update.version} 已发布`,
        detail: '请下载新版便携包，解压后使用。更新前建议导出历史记录和参数备份。',
        buttons: ['打开下载页', '稍后'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      });
      if (result.response === 0) await shell.openExternal(update.url);
    } catch (error) {
      // Offline use must remain available even if GitHub cannot be reached.
      console.warn('检查便携版更新失败：', error);
    } finally {
      checking = false;
    }
  };
  setTimeout(check, INITIAL_DELAY_MS).unref();
  setInterval(check, CHECK_INTERVAL_MS).unref();
}

function startUpdateChecks() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  if (isSquirrelInstall(process.execPath)) startInstalledUpdates();
  else startPortableUpdates();
}

module.exports = { startUpdateChecks };
