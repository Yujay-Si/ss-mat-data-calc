'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ssmat-smoke-'));
const electron = require('electron');
const entry = path.join(__dirname, 'desktop-smoke-main.js');

try {
  for (const phase of ['write', 'read', 'first-run']) {
    const run = spawnSync(electron, [entry, ...(phase === 'first-run' ? ['--squirrel-firstrun'] : [])], {
      cwd: path.resolve(__dirname, '..', '..'),
      env: { ...process.env, SSMAT_SMOKE_USER_DATA: profile, SSMAT_SMOKE_PHASE: phase },
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 1024 * 1024
    });
    if (run.error || run.status !== 0) throw new Error(`${phase} failed: ${run.error?.message || run.status}\n${run.stdout}\n${run.stderr}`);
    const line = run.stdout.split(/\r?\n/).find(text => text.startsWith('{"phase"'));
    if (!line) throw new Error(`${phase} 未输出验收结果：${run.stdout}\n${run.stderr}`);
    console.log(line);
  }
} finally {
  if (path.dirname(profile) !== os.tmpdir() || !path.basename(profile).startsWith('ssmat-smoke-')) {
    throw new Error('测试数据目录校验失败，未清理。');
  }
  fs.rmSync(profile, { recursive: true, force: true });
}
