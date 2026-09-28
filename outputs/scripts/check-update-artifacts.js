'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../../package.json');

const root = path.resolve(__dirname, '..', '..', 'out', 'make');
const squirrel = path.join(root, 'squirrel.windows', 'x64');
const packageName = `SSMaterialDataCalc-${version}-full.nupkg`;
const packagePath = path.join(squirrel, packageName);
const manifest = fs.readFileSync(path.join(squirrel, 'RELEASES'), 'utf8').trim();
const match = /^([0-9A-Fa-f]{40})\s+(\S+)\s+(\d+)$/.exec(manifest);
assert.ok(match, 'RELEASES 格式不正确或含有多余版本');
assert.equal(match[2], packageName, 'RELEASES 指向的版本不正确');
assert.equal(Number(match[3]), fs.statSync(packagePath).size, '更新包大小与 RELEASES 不符');

const hash = crypto.createHash('sha1');
const stream = fs.createReadStream(packagePath);
stream.on('data', chunk => hash.update(chunk));
stream.on('error', error => { throw error; });
stream.on('end', () => {
  assert.equal(hash.digest('hex').toUpperCase(), match[1].toUpperCase(), '更新包哈希与 RELEASES 不符');
  const installer = path.join(squirrel, `SS Material Data Calculator-${version} Setup.exe`);
  const portable = path.join(root, 'zip', 'win32', 'x64', `SS Material Data Calculator-win32-x64-${version}.zip`);
  assert.ok(fs.statSync(installer).size > 0, '安装包不存在');
  assert.ok(fs.statSync(portable).size > 0, '便携包不存在');
  console.log(`v${version} 安装包、便携包与 Squirrel 更新元数据校验通过`);
});
