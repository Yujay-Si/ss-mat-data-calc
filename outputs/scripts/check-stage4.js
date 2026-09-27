'use strict';

const assert = require('node:assert/strict');
global.XLSX = require('../preview-site/vendor/xlsx.full.min.js');
const memory = new Map();
global.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, value); }
};
require('../preview-site/calculation.js');
require('../preview-site/parameter-store.js');
require('../preview-site/result-output.js');

const { MaterialCalculator, ParameterStore, ResultOutput } = global;
const input = { material: '201', thickness: 0.3, width: 600, weight: 100, mode: 'double', formula: 2 };
const initial = ParameterStore.readState();
assert.equal(ParameterStore.FIELDS.find(field => field.key === 'materials.201.radius').label, '201 第 1 套密度系数');
assert.equal(ParameterStore.FIELDS.find(field => field.key === 'modes.single.usableFactor').label, '单排冲料圆片比例系数');
assert.equal(ParameterStore.FIELDS.find(field => field.key === 'modes.double.usableFactor').label, '双排冲料圆片比例系数');
const oldResult = MaterialCalculator.calculate(input, initial.parameters);
assert.equal(oldResult.quantity, 430);
assert.equal(oldResult.parameterVersion, '默认参数 v0');

const values = ParameterStore.editableValues(initial.parameters);
values['materials.201.square'] = 6.5;
const modified = ParameterStore.writeValues(values, 0);
assert.equal(modified.revision, 1);
assert.equal(modified.parameters.cutStep, 5);
assert.equal(modified.parameters.pi, 3.14);
const newResult = MaterialCalculator.calculate(input, modified.parameters);
assert.notEqual(newResult.quantity, oldResult.quantity);
assert.equal(newResult.parameterVersion, '本机参数 v1');
assert.equal(oldResult.quantity, 430);
assert.equal(oldResult.parameters.squareFactor, 6.225);
assert.throws(() => ParameterStore.writeValues(values, 0), /其他页面/);

const invalid = { ...values, 'modes.double.usableFactor': 0 };
assert.throws(() => ParameterStore.writeValues(invalid, 1), /须大于 0/);
assert.equal(ParameterStore.readState().revision, 1);
const restored = ParameterStore.restoreDefaults(1);
assert.equal(restored.revision, 2);
assert.equal(restored.parameters.materials['201'].square, 6.225);
assert.equal(oldResult.quantity, 430);

const csv = ResultOutput.csv([oldResult, newResult]);
assert.equal(ResultOutput.HEADERS[6], '冲料圆片比例系数');
assert.equal(ResultOutput.HEADERS[13], '第1套密度系数');
assert.equal(ResultOutput.HEADERS[14], '第2套密度系数');
assert.ok(csv.startsWith('\uFEFF'));
assert.match(csv, /默认参数 v0/);
assert.match(csv, /本机参数 v1/);
assert.equal(csv.trim().split('\r\n').length, 3);
const workbook = XLSX.read(ResultOutput.xlsx([oldResult, newResult]), { type: 'array' });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
assert.equal(rows.length, 3);
assert.equal(rows[1][12], 430);
assert.ok(Math.abs(rows[1][8] - oldResult.radiusUnitWeight) < 1e-12);
assert.ok(Math.abs(rows[1][9] - oldResult.squareUnitWeight) < 1e-12);
assert.equal(rows[1][10], '第 2 套（圆片密度高级算法公式）');
assert.equal(rows[1][13], 0.793);
assert.equal(rows[1][14], 6.225);
assert.equal(rows[2][19], '本机参数 v1');
assert.throws(() => ResultOutput.csv([]), /没有可导出/);

memory.set(ParameterStore.STORAGE_KEY, '{bad');
assert.throws(() => ParameterStore.readState(), /格式异常/);
assert.equal(memory.get(ParameterStore.STORAGE_KEY), '{bad');

console.log('阶段 4 自检通过：参数校验/版本/恢复、历史快照、CSV/XLSX 字段及空结果保护。');
