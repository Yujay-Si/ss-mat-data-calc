'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isNewerVersion, isSquirrelInstall, getPortableUpdate } = require('../../desktop/update-policy');

assert.equal(isNewerVersion('v0.1.2', '0.1.1'), true);
assert.equal(isNewerVersion('v0.1.1', '0.1.1'), false);
assert.equal(isNewerVersion('v0.1.0', '0.1.1'), false);
assert.equal(isNewerVersion('v0.2.0', '0.1.99'), true);
assert.equal(isNewerVersion('invalid', '0.1.1'), false);

const release = {
  tag_name: 'v0.1.2', draft: false, prerelease: false,
  assets: [{ name: 'SSMaterialDataCalc-0.1.2-win32-x64.zip', state: 'uploaded' }]
};
assert.deepEqual(getPortableUpdate(release, '0.1.1'), {
  version: '0.1.2', url: 'https://github.com/Yujay-Si/ss-mat-data-calc/releases/tag/v0.1.2'
});
assert.equal(getPortableUpdate(release, '0.1.2'), null);
assert.equal(getPortableUpdate({ ...release, prerelease: true }, '0.1.1'), null);
assert.equal(getPortableUpdate({ ...release, assets: [] }, '0.1.1'), null);
assert.equal(getPortableUpdate({ ...release, tag_name: '../../evil' }, '0.1.1'), null);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssmat-update-policy-'));
try {
  const appDir = path.join(root, 'app-0.1.2');
  fs.mkdirSync(appDir);
  const installedExe = path.join(appDir, 'SSMaterialDataCalc.exe');
  fs.writeFileSync(path.join(root, 'Update.exe'), '');
  assert.equal(isSquirrelInstall(installedExe), true);
  assert.equal(isSquirrelInstall(path.join(root, 'SSMaterialDataCalc.exe')), false);
  assert.equal(isSquirrelInstall(path.join(appDir, 'other.exe')), false);
} finally {
  if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ssmat-update-policy-')) {
    throw new Error('测试目录校验失败，未清理。');
  }
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('更新版本、便携包和安装目录判断通过');
