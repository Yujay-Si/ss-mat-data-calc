'use strict';

const assert = require('node:assert/strict');
global.XLSX = require('../preview-site/vendor/xlsx.full.min.js');
const memory = new Map();
global.localStorage = {
  getItem(key) { return memory.get(key) ?? null; },
  setItem(key, value) { memory.set(key, value); }
};
require('../preview-site/calculation.js');
require('../preview-site/batch-data.js');
require('../preview-site/history-store.js');
require('../preview-site/result-output.js');

const { calculate } = global.MaterialCalculator;
const input = { material: '201', thickness: 0.3, width: 600, weight: 100, mode: 'single', formula: 3 };
const result = calculate(input);
assert.equal(result.cut, 600);
assert.ok(Math.abs(result.sheetUnitWeight - 0.85644) < 1e-12);
assert.equal(result.selectedUnitWeight, result.sheetUnitWeight);
assert.equal(result.usableWeight, 100);
assert.equal(result.appliedUsableFactor, null);
assert.equal(result.parameters.radiusFactor, 0.793);
assert.equal(result.quantity, 116);
assert.equal(result.formulaVersion, '2.0.0');
assert.throws(() => calculate({ ...input, mode: 'double' }), /仅适用于单排/);
assert.throws(() => calculate({ ...input, width: 4 }), /最终剪口为 0/);

const defaults = global.MaterialCalculator.DEFAULT_PARAMETERS;
const customParameters = {
  ...defaults,
  materials: { ...defaults.materials, '201': { ...defaults.materials['201'], radius: 0.8 } },
  modes: { ...defaults.modes, single: { ...defaults.modes.single, usableFactor: 0.5 } }
};
const customized = calculate(input, customParameters);
assert.ok(Math.abs(customized.sheetUnitWeight - 600 * 600 * 0.3 * 0.8 / 100000) < 1e-12);
assert.equal(customized.usableWeight, 100);
assert.equal(customized.appliedUsableFactor, null);
assert.notEqual(customized.quantity, result.quantity);

for (const material of ['410', '201', '304', '316']) {
  const calculated = calculate({ ...input, material });
  const expectedUnit = 600 * 600 * 0.3 * global.MaterialCalculator.DEFAULT_PARAMETERS.materials[material].radius / 100000;
  assert.ok(Math.abs(calculated.sheetUnitWeight - expectedUnit) < 1e-12);
}
assert.equal(calculate({ ...input, formula: 1 }).quantity, 115);
assert.equal(calculate({ ...input, formula: 2 }).quantity, 115);

const batch = global.BatchData.calculateRows(global.BatchData.rowsFromText(
  '材质,厚度(mm),宽度(mm),材料重量(kg),冲料方式,单重公式\n201,0.3,600,100,单排,3\n201,0.3,600,100,双排,3'
), calculate);
assert.equal(batch[0].result.quantity, 116);
assert.match(batch[1].error, /仅适用于单排/);

global.HistoryStore.addResults([result]);
assert.equal(global.HistoryStore.readRecords()[0].result.quantity, 116);
assert.equal(global.HistoryStore.readRecords()[0].result.input.formula, 3);

const exported = global.ResultOutput.table([result]);
assert.equal(exported[0].length, 21);
assert.equal(exported[1][6], '未参与');
assert.equal(exported[1][7], 100);
assert.equal(exported[1][10], '第 3 套（方片密度算法公式）');
assert.equal(exported[1][11], 0.85644);
assert.equal(exported[1][12], 116);
assert.ok(global.ResultOutput.csv([result]).includes('未参与'));
const workbook = global.XLSX.read(global.ResultOutput.xlsx([result]), { type: 'array' });
const rows = global.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
assert.equal(rows[1][12], 116);

console.log('单排方片公式自检通过：四种材质、旧公式回归、双排拒绝、批量、历史、CSV/XLSX。');
