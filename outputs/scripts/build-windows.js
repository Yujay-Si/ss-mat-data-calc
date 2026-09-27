'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const project = path.resolve(__dirname, '..', '..');
const npmCli = process.env.npm_execpath;

function run(args, cwd) {
  if (!npmCli) throw new Error('请通过 npm run make 运行构建脚本。');
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed with exit code ${result.status}`);
}

if (process.platform !== 'win32') throw new Error('此脚本仅用于 Windows 构建。');

if (/^[\x00-\x7F]*$/.test(project)) {
  run(['run', 'make:direct'], project);
} else {
  // Squirrel's resource editor cannot read installer paths containing Chinese characters.
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ssmat-build-'));
  try {
    for (const entry of ['package.json', 'package-lock.json', 'forge.config.js', 'desktop', 'outputs', 'README.md', 'LICENSE']) {
      fs.cpSync(path.join(project, entry), path.join(stage, entry), { recursive: true });
    }
    run(['ci', '--prefer-offline'], stage);
    run(['run', 'make:direct'], stage);
    const destination = path.join(project, 'out', 'make');
    fs.mkdirSync(destination, { recursive: true });
    fs.cpSync(path.join(stage, 'out', 'make'), destination, { recursive: true, force: true });
    console.log(`构建产物：${destination}`);
  } finally {
    if (path.dirname(stage) !== os.tmpdir() || !path.basename(stage).startsWith('ssmat-build-')) {
      throw new Error('临时构建目录校验失败，未清理。');
    }
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
