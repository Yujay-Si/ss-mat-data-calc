'use strict';

const { app, autoUpdater, dialog, shell } = require('electron');
const { isSquirrelInstall, getPortableUpdate } = require('./update-policy');

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const INITIAL_DELAY_MS = 12 * 1000;
const RELEASE_API = 'https://api.github.com/repos/Yujay-Si/ss-mat-data-calc/releases/latest';

function showUpdateMessage(options) {
  return dialog.showMessageBox({ buttons: ['确定'], noLink: true, ...options })
    .catch(error => console.error('显示更新提示失败：', error));
}

function startInstalledUpdates() {
  let state = 'idle';
  let manualRequested = false;
  let restartPromptOpen = false;
  const firstRunReadyAt = process.argv.includes('--squirrel-firstrun') ? Date.now() + 10 * 1000 : 0;
  const feed = `https://update.electronjs.org/Yujay-Si/ss-mat-data-calc/win32-x64/${app.getVersion()}`;

  const promptRestart = async () => {
    if (restartPromptOpen) return;
    restartPromptOpen = true;
    try {
      const result = await dialog.showMessageBox({
        type: 'info', title: '更新已下载', message: '新版本已下载完成',
        detail: '现在重启程序即可安装更新。选择“稍后”时，更新会在下次启动时生效。',
        buttons: ['立即重启并安装', '稍后'], defaultId: 0, cancelId: 1, noLink: true
      });
      if (result.response === 0) autoUpdater.quitAndInstall();
    } catch (error) {
      console.error('显示更新提示失败：', error);
    } finally {
      restartPromptOpen = false;
    }
  };

  const reportError = error => {
    const requested = manualRequested;
    state = 'idle';
    manualRequested = false;
    console.warn('更新检查失败：', error);
    if (requested) void showUpdateMessage({ type: 'warning', title: '检查更新失败',
      message: '暂时无法检查 GitHub 上的新版本', detail: error.message });
  };

  autoUpdater.on('error', reportError);
  autoUpdater.on('update-not-available', () => {
    const requested = manualRequested;
    state = 'idle';
    manualRequested = false;
    if (requested) void showUpdateMessage({ type: 'info', title: '检查更新',
      message: `当前已是最新版（v${app.getVersion()}）` });
  });
  autoUpdater.on('update-available', () => {
    state = 'downloading';
    if (manualRequested) void showUpdateMessage({ type: 'info', title: '发现新版本',
      message: '正在下载更新', detail: '下载完成后会询问是否重启安装。' });
  });
  autoUpdater.on('update-downloaded', () => {
    state = 'ready';
    manualRequested = false;
    void promptRestart();
  });

  try {
    autoUpdater.setFeedURL({ url: feed });
  } catch (error) {
    console.warn('无法配置更新服务：', error);
    return () => showUpdateMessage({ type: 'warning', title: '检查更新失败',
      message: '无法配置更新服务', detail: error.message });
  }

  const check = (manual = false) => {
    if (Date.now() < firstRunReadyAt) return manual ? showUpdateMessage({
      type: 'info', title: '检查更新', message: '安装刚完成，请稍后再检查更新'
    }) : undefined;
    if (state === 'ready') return manual ? promptRestart() : undefined;
    if (state !== 'idle') return manual ? showUpdateMessage({ type: 'info', title: '检查更新',
      message: state === 'downloading' ? '更新正在下载，请稍候' : '正在检查新版本，请稍候' }) : undefined;
    state = 'checking';
    manualRequested = manual;
    try {
      // Squirrel downloads immediately after finding a release; do not start a second check.
      Promise.resolve(autoUpdater.checkForUpdates()).catch(reportError);
    } catch (error) {
      reportError(error);
    }
  };
  setTimeout(() => check(), INITIAL_DELAY_MS).unref();
  setInterval(() => check(), CHECK_INTERVAL_MS).unref();
  return () => check(true);
}

function startPortableUpdates() {
  let checking = false;
  let promptedVersion = null;

  const check = async (manual = false) => {
    if (checking) {
      if (manual) await showUpdateMessage({ type: 'info', title: '检查更新', message: '正在检查新版本，请稍候' });
      return;
    }
    checking = true;
    try {
      const response = await fetch(RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SSMaterialDataCalc' },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
      const update = getPortableUpdate(await response.json(), app.getVersion());
      if (!update) {
        if (manual) await showUpdateMessage({ type: 'info', title: '检查更新',
          message: `当前没有可用的便携版更新（v${app.getVersion()}）` });
        return;
      }
      if (!manual && promptedVersion === update.version) return;
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
      if (manual) await showUpdateMessage({ type: 'warning', title: '检查更新失败',
        message: '暂时无法检查 GitHub 上的新版本', detail: error.message });
    } finally {
      checking = false;
    }
  };
  setTimeout(() => check(), INITIAL_DELAY_MS).unref();
  setInterval(() => check(), CHECK_INTERVAL_MS).unref();
  return () => check(true);
}

function startUpdateChecks() {
  if (!app.isPackaged || process.platform !== 'win32') return () => showUpdateMessage({
    type: 'info', title: '检查更新', message: '请在 Windows 正式桌面版中检查更新'
  });
  return isSquirrelInstall(process.execPath) ? startInstalledUpdates() : startPortableUpdates();
}

module.exports = { startUpdateChecks };
