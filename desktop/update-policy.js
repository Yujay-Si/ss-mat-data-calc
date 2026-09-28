'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value || '');
  return match ? match.slice(1).map(Number) : null;
}

function isNewerVersion(candidate, current) {
  const next = parseVersion(candidate);
  const now = parseVersion(current);
  if (!next || !now) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== now[index]) return next[index] > now[index];
  }
  return false;
}

function isSquirrelInstall(executablePath) {
  const appDirectory = path.dirname(executablePath);
  return path.basename(executablePath).toLowerCase() === 'ssmaterialdatacalc.exe'
    && /^app-\d+\.\d+\.\d+$/.test(path.basename(appDirectory))
    && fs.existsSync(path.join(path.dirname(appDirectory), 'Update.exe'));
}

function getPortableUpdate(release, currentVersion) {
  if (!release || release.draft || release.prerelease || !isNewerVersion(release.tag_name, currentVersion)) return null;
  const version = release.tag_name.replace(/^v/, '');
  const archive = `SSMaterialDataCalc-${version}-win32-x64.zip`;
  if (!Array.isArray(release.assets) || !release.assets.some(asset => asset.name === archive && asset.state === 'uploaded')) return null;
  return {
    version,
    url: `https://github.com/Yujay-Si/ss-mat-data-calc/releases/tag/v${version}`
  };
}

module.exports = { isNewerVersion, isSquirrelInstall, getPortableUpdate };
