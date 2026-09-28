'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');

const mainPath = require.resolve('../../desktop/main.js');
const originalLoad = Module._load;
let quitCount = 0;

Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        quit: () => { quitCount += 1; },
        whenReady: () => { throw new Error('Squirrel 事件不应启动计算窗口'); }
      },
      protocol: { registerSchemesAsPrivileged: () => { throw new Error('Squirrel 事件不应注册页面协议'); } }
    };
  }
  if (request === 'electron-squirrel-startup') return true;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  require(mainPath);
  assert.equal(quitCount, 1, 'Squirrel 事件必须立即退出');
  console.log('Squirrel 安装/更新/卸载事件不会创建计算窗口');
} finally {
  Module._load = originalLoad;
  delete require.cache[mainPath];
}
