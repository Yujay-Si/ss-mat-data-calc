(function (global) {
  'use strict';

  const STORAGE_KEY = 'material-calculator-history-v1';
  const MAX_RECORDS = 500;

  function validRecord(record) {
    if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 200 || !record.result) return false;
    const result = record.result;
    const input = result.input;
    const parameters = result.parameters;
    return input && parameters &&
      ['410', '201', '304', '316'].includes(input.material) &&
      ['single', 'double'].includes(input.mode) &&
      [1, 2, 3].includes(Number(input.formula)) &&
      Number.isFinite(input.thickness) && input.thickness > 0 &&
      Number.isFinite(input.width) && input.width > 0 &&
      Number.isFinite(input.weight) && input.weight > 0 &&
      typeof result.formulaVersion === 'string' && /^\d+\./.test(result.formulaVersion) &&
      typeof result.calculatedAt === 'string' && !Number.isNaN(Date.parse(result.calculatedAt)) &&
      Number.isSafeInteger(result.quantity) && result.quantity >= 0 &&
      Number.isFinite(result.cut) && result.cut > 0 &&
      Number.isFinite(result.selectedUnitWeight) && result.selectedUnitWeight > 0 &&
      ['squareFactor', 'radiusFactor', 'widthDivisor', 'usableFactor', 'cutStep', 'pi']
        .every(key => Number.isFinite(parameters[key]) && parameters[key] > 0);
  }

  function readRecords() {
    let raw;
    try {
      raw = global.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      throw new Error('无法读取本地历史存储，请检查当前应用的本地数据权限。');
    }
    if (raw === null) return [];
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || data.length > MAX_RECORDS || !data.every(validRecord)) {
        throw new Error('invalid history');
      }
      return data;
    } catch (error) {
      throw new Error('历史数据格式异常。为避免覆盖原数据，已停止历史写入。');
    }
  }

  function writeRecords(records) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (error) {
      throw new Error('历史保存失败：本地存储不可用或空间不足。计算结果仍可查看。');
    }
  }

  function newId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function addResults(results) {
    if (!Array.isArray(results) || results.length === 0) return 0;
    const records = readRecords();
    if (records.length + results.length > MAX_RECORDS) {
      throw new Error(`历史最多保存 ${MAX_RECORDS} 条；本次结果未写入，请先备份并删除不需要的旧记录。`);
    }
    const additions = results.map(result => ({ id: newId(), result: JSON.parse(JSON.stringify(result)) }));
    writeRecords(additions.concat(records));
    return additions.length;
  }

  function remove(id) {
    const records = readRecords();
    const next = records.filter(record => record.id !== id);
    if (next.length === records.length) throw new Error('未找到要删除的历史记录。');
    writeRecords(next);
  }

  function importBackup(backup) {
    if (!backup || backup.format !== 'material-calculator-history' || backup.version !== 1 ||
        !Array.isArray(backup.records) || backup.records.length > MAX_RECORDS || !backup.records.every(validRecord)) {
      throw new Error('历史备份格式无效，未写入任何记录。');
    }
    const existing = readRecords();
    const ids = new Set(existing.map(record => record.id));
    const additions = [];
    for (const record of backup.records) {
      if (ids.has(record.id)) continue;
      ids.add(record.id);
      additions.push(record);
    }
    if (existing.length + additions.length > MAX_RECORDS) {
      throw new Error(`导入后将超过 ${MAX_RECORDS} 条历史上限，未写入任何记录。`);
    }
    if (additions.length > 0) writeRecords(additions.concat(existing));
    return { imported: additions.length, skipped: backup.records.length - additions.length };
  }

  global.HistoryStore = Object.freeze({ readRecords, addResults, remove, importBackup, MAX_RECORDS, STORAGE_KEY });
})(typeof window === 'undefined' ? globalThis : window);
