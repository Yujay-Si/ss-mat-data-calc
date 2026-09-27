'use strict';

const assert = require('node:assert/strict');
const storage = new Map();
global.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, value); }
};
require('../preview-site/calculation.js');
require('../preview-site/parameter-store.js');
require('../preview-site/history-store.js');

const { MaterialCalculator, ParameterStore, HistoryStore } = global;
const backup = ParameterStore.exportBackup();
assert.equal(backup.format, 'material-calculator-parameters');
const values = { ...backup.values, 'materials.201.square': 6.5 };
assert.equal(ParameterStore.importBackup({ ...backup, values }, 0).revision, 1);
assert.equal(ParameterStore.readState().parameters.materials['201'].square, 6.5);
assert.throws(() => ParameterStore.importBackup({ ...backup, values: { ...values, 'modes.double.usableFactor': 0 } }, 1), /须大于 0/);
assert.equal(ParameterStore.readState().revision, 1);
assert.throws(() => ParameterStore.importBackup({ ...backup, version: 999 }, 1), /格式无效/);

const result = MaterialCalculator.calculate({ material: '201', thickness: 0.3, width: 600, weight: 100, mode: 'double', formula: 2 });
HistoryStore.addResults([result]);
const record = HistoryStore.readRecords()[0];
const missingInput = { ...record, id: 'missing', result: { ...record.result, input: { material: '201' } } };
assert.throws(() => HistoryStore.importBackup({ format: 'material-calculator-history', version: 1, records: [missingInput] }), /格式无效/);
assert.equal(HistoryStore.readRecords().length, 1);
const invalidParameter = { ...record, id: 'invalid', result: { ...record.result, parameters: { ...record.result.parameters, pi: 0 } } };
assert.throws(() => HistoryStore.importBackup({ format: 'material-calculator-history', version: 1, records: [invalidParameter] }), /格式无效/);
assert.equal(HistoryStore.readRecords().length, 1);
assert.deepEqual(HistoryStore.importBackup({ format: 'material-calculator-history', version: 1, records: [record] }), { imported: 0, skipped: 1 });
console.log('桌面迁移自检通过：参数备份往返、异常备份拒绝、历史缺字段拒绝。');
