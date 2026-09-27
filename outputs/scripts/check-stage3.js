'use strict';

const assert = require('node:assert/strict');
global.XLSX = require('../preview-site/vendor/xlsx.full.min.js');
require('../preview-site/calculation.js');
require('../preview-site/batch-data.js');

const { BatchData, MaterialCalculator } = global;
const csv = '\uFEFF材质,厚度(mm),宽度(mm),材料重量(kg),冲料方式,单重公式\r\n201,0.3,600,100,双排,2\r\n304,0,600,100,单排,1\r\n';
const csvResults = BatchData.calculateRows(BatchData.rowsFromText(csv), MaterialCalculator.calculate);
assert.equal(csvResults.length, 2);
assert.equal(csvResults[0].line, 2);
assert.equal(csvResults[0].result.quantity, 430);
assert.deepEqual(csvResults[0].source.slice(0, 5), ['201', '0.3', '600', '100', '双排']);
assert.equal(csvResults[1].line, 3);
assert.match(csvResults[1].error, /厚度/);
assert.equal(csvResults[1].source[1], '0');
const missingColumn = BatchData.calculateRows(BatchData.rowsFromText(BatchData.HEADERS.join(',') + '\n201,0.3,600,100,双排'), MaterialCalculator.calculate)[0];
assert.equal(missingColumn.source[0], '201');
assert.match(missingColumn.error, /字段数量/);

const quoted = BatchData.rowsFromText('材质,厚度(mm),宽度(mm),材料重量(kg),冲料方式,单重公式\n"201","0.3",600,100,双排,2');
assert.equal(BatchData.calculateRows(quoted, MaterialCalculator.calculate)[0].result.quantity, 430);
const tabbed = BatchData.rowsFromText('材质\t厚度(mm)\t宽度(mm)\t材料重量(kg)\t冲料方式\t单重公式\n201\t0.3\t600\t100\t双排\t');
assert.equal(BatchData.calculateRows(tabbed, MaterialCalculator.calculate)[0].result.input.formula, 1);
assert.throws(() => BatchData.rowsFromText('"unclosed'), /未闭合/);
assert.throws(() => BatchData.calculateRows(BatchData.rowsFromText('材质,厚度(mm)\n201,0.3'), MaterialCalculator.calculate), /表头/);
const largeRows = BatchData.rowsFromText(BatchData.HEADERS.join(',') + '\n' + Array.from({ length: 500 }, () => '201,0.3,600,100,双排,2').join('\n'));
assert.equal(BatchData.calculateRows(largeRows, MaterialCalculator.calculate).length, 500);
assert.throws(() => BatchData.calculateRows([...largeRows, { line: 502, values: ['201', '0.3', '600', '100', '双排', '1'] }], MaterialCalculator.calculate), /最多处理/);

const workbook = BatchData.templateWorkbook();
const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
const xlsxResults = BatchData.calculateRows(BatchData.rowsFromWorkbook(bytes), MaterialCalculator.calculate);
assert.equal(xlsxResults[0].result.quantity, 430);
assert.equal(BatchData.templateCsv().split('\r\n')[1], '201,0.3,600,100,双排,2');

const saved = new Map();
global.localStorage = {
  getItem(key) { return saved.has(key) ? saved.get(key) : null; },
  setItem(key, value) { saved.set(key, value); }
};
require('../preview-site/history-store.js');
const store = global.HistoryStore;
store.addResults([csvResults[0].result]);
assert.equal(store.readRecords().length, 1);
const first = store.readRecords()[0];
assert.equal(first.result.parameters.usableFactor, 0.824);
assert.equal(first.result.formulaVersion, MaterialCalculator.FORMULA_VERSION);
const changedParameters = {
  ...MaterialCalculator.DEFAULT_PARAMETERS,
  materials: { ...MaterialCalculator.DEFAULT_PARAMETERS.materials, '201': { square: 6.5, radius: 0.793 } }
};
const changedResult = MaterialCalculator.calculate(first.result.input, changedParameters);
assert.notEqual(changedResult.quantity, first.result.quantity);
assert.equal(store.readRecords()[0].result.quantity, 430);
const backup = { format: 'material-calculator-history', version: 1, records: [first] };
assert.deepEqual(store.importBackup(backup), { imported: 0, skipped: 1 });
assert.throws(() => store.addResults(Array.from({ length: 500 }, () => csvResults[0].result)), /最多保存/);
assert.equal(store.readRecords().length, 1);
store.remove(first.id);
assert.equal(store.readRecords().length, 0);
assert.deepEqual(store.importBackup(backup), { imported: 1, skipped: 0 });
assert.equal(store.readRecords()[0].result.quantity, 430);
store.remove(first.id);
saved.set(store.STORAGE_KEY, '{broken');
assert.throws(() => store.addResults([csvResults[0].result]), /格式异常/);
assert.equal(saved.get(store.STORAGE_KEY), '{broken');
saved.delete(store.STORAGE_KEY);
global.localStorage.setItem = () => { throw new Error('quota'); };
assert.throws(() => store.addResults([csvResults[0].result]), /历史保存失败/);

console.log('阶段 3 自检通过：CSV/表格粘贴、XLSX 模板往返、逐行错误、500 条上限、历史快照、备份恢复及损坏数据保护。');
