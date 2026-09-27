'use strict';

const assert = require('node:assert/strict');
require('../preview-site/calculation.js');
const { calculate } = global.MaterialCalculator;

const sample = calculate({ material: '201', thickness: 0.3, width: 600, weight: 100, mode: 'double', formula: 2 });
assert.equal(sample.cut, 320);
assert.ok(Math.abs(sample.squareUnitWeight - 0.191232) < 1e-12);
assert.equal(sample.squareUnitWeight.toFixed(4), '0.1912');
assert.equal(sample.quantity, 430);
assert.equal(sample.parameters.usableFactor, 0.824);
assert.equal(calculate({ material: '201', thickness: 0.3, width: 725, weight: 100, mode: 'double', formula: 2 }).cut, 385);
assert.equal(calculate({ ...sample.input, formula: 1 }).selectedUnitWeight, sample.radiusUnitWeight);
assert.equal(global.MaterialCalculator.currentInputFromHistory({ ...sample, formulaVersion: '1.1.0', input: { ...sample.input, formula: 1 } }).formula, 2);
assert.equal(global.MaterialCalculator.currentInputFromHistory({ ...sample, formulaVersion: '1.1.0', input: { ...sample.input, formula: 2 } }).formula, 1);
assert.equal(global.MaterialCalculator.currentInputFromHistory(sample).formula, 2);
const oldSnapshot = { ...sample, formulaVersion: '1.1.0', input: { ...sample.input, formula: 1 } };
assert.equal(calculate(global.MaterialCalculator.currentInputFromHistory(oldSnapshot)).quantity, oldSnapshot.quantity);

for (const material of ['410', '201', '304', '316']) {
  for (const mode of ['single', 'double']) {
    const result = calculate({ material, thickness: 0.3, width: 600, weight: 100, mode, formula: 1 });
    assert.equal(result.input.material, material);
    assert.equal(result.input.mode, mode);
    assert.equal(result.cut, mode === 'single' ? 600 : 320);
    assert.ok(Number.isSafeInteger(result.quantity) && result.quantity > 0);
    assert.equal(result.selectedUnitWeight, result.radiusUnitWeight);
  }
}

for (const invalid of [
  { thickness: 0 }, { thickness: -1 }, { thickness: 'abc' },
  { width: 4 }, { weight: '' }, { weight: 'Infinity' },
  { material: '36' }, { mode: 'triple' }, { formula: 3 }
]) {
  assert.throws(() => calculate({ material: '201', thickness: 0.3, width: 600, weight: 100, mode: 'double', formula: 1, ...invalid }));
}

console.log('计算自检通过：演示样例、8 种材质/方式组合、9 项异常输入。');
