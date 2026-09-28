'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const path = require('node:path');
const policy = require('../../desktop/update-policy');

const updatePath = path.resolve(__dirname, '../../desktop/update.js');

function makeController(installed, version = '0.1.3') {
  const updater = new EventEmitter();
  const messages = [];
  const opened = [];
  let checks = 0;
  let installs = 0;
  let response = 1;
  updater.setFeedURL = options => { updater.feed = options.url; };
  updater.checkForUpdates = () => { checks += 1; };
  updater.quitAndInstall = () => { installs += 1; };
  const electron = {
    app: { isPackaged: true, getVersion: () => version },
    autoUpdater: updater,
    dialog: { showMessageBox: async options => { messages.push(options); return { response }; } },
    shell: { openExternal: async url => { opened.push(url); } }
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === updatePath && request === 'electron') return electron;
    if (parent?.filename === updatePath && request === './update-policy') {
      return { ...policy, isSquirrelInstall: () => installed };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[updatePath];
    const { startUpdateChecks } = require(updatePath);
    return {
      check: startUpdateChecks(), updater, messages, opened,
      setResponse: value => { response = value; },
      checks: () => checks, installs: () => installs
    };
  } finally {
    Module._load = originalLoad;
    delete require.cache[updatePath];
  }
}

async function run() {
  process.argv.push('--squirrel-firstrun');
  const firstRun = makeController(true);
  process.argv.pop();
  await firstRun.check();
  assert.equal(firstRun.checks(), 0, '首次安装的文件锁期间不应检查更新');
  assert.match(firstRun.messages.at(-1).message, /稍后再检查/);

  const installed = makeController(true);
  assert.match(installed.updater.feed, /Yujay-Si\/ss-mat-data-calc\/win32-x64\/0\.1\.3$/);
  installed.check();
  assert.equal(installed.checks(), 1);
  await installed.check();
  assert.equal(installed.checks(), 1, '重复点击不应重复下载');
  installed.updater.emit('update-not-available');
  assert.match(installed.messages.at(-1).message, /已是最新版/);
  installed.check();
  installed.updater.emit('error', new Error('offline'));
  assert.equal(installed.messages.at(-1).title, '检查更新失败');
  installed.check();
  installed.updater.emit('update-available');
  assert.match(installed.messages.at(-1).message, /正在下载/);
  installed.updater.emit('update-downloaded');
  await Promise.resolve();
  assert.equal(installed.messages.at(-1).title, '更新已下载');
  assert.equal(installed.installs(), 0, '未确认时不应安装');
  installed.setResponse(0);
  await installed.check();
  assert.equal(installed.installs(), 1, '确认后应重启安装');

  const originalFetch = global.fetch;
  try {
    const portable = makeController(false);
    global.fetch = async () => ({ ok: true, json: async () => ({
      tag_name: 'v0.1.4', draft: false, prerelease: false,
      assets: [{ name: 'SSMaterialDataCalc-0.1.4-win32-x64.zip', state: 'uploaded' }]
    }) });
    portable.setResponse(0);
    await portable.check();
    assert.equal(portable.opened[0], 'https://github.com/Yujay-Si/ss-mat-data-calc/releases/tag/v0.1.4');
    global.fetch = async () => ({ ok: true, json: async () => ({
      tag_name: 'v0.1.3', draft: false, prerelease: false, assets: []
    }) });
    await portable.check();
    assert.match(portable.messages.at(-1).message, /没有可用的便携版更新/);
    global.fetch = async () => { throw new Error('offline'); };
    await portable.check();
    assert.equal(portable.messages.at(-1).title, '检查更新失败');
  } finally {
    global.fetch = originalFetch;
  }
  console.log('安装版与便携版的手动检查、重复点击、无更新、断网和安装确认通过');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
