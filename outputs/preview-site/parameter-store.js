(function (global) {
  'use strict';

  const STORAGE_KEY = 'material-calculator-parameters-v1';
  const defaults = global.MaterialCalculator.DEFAULT_PARAMETERS;
  const FIELDS = Object.freeze([
    ...['410', '201', '304', '316'].flatMap(material => [
      { key: `materials.${material}.radius`, label: `${material} 第 1 套密度系数`, kind: 'material' },
      { key: `materials.${material}.square`, label: `${material} 第 2 套密度系数`, kind: 'material' }
    ]),
    { key: 'modes.single.usableFactor', label: '单排冲料圆片比例系数', kind: 'usable' },
    { key: 'modes.double.usableFactor', label: '双排冲料圆片比例系数', kind: 'usable' },
    { key: 'modes.double.widthDivisor', label: '双排剪口换算值', kind: 'divisor' }
  ]);

  function valueAt(object, key) {
    return key.split('.').reduce((part, name) => part && part[name], object);
  }

  function editableValues(parameters) {
    const values = {};
    for (const field of FIELDS) values[field.key] = valueAt(parameters, field.key);
    return values;
  }

  function validateValues(values) {
    if (!values || typeof values !== 'object') throw new Error('参数数据缺失。');
    const clean = {};
    for (const field of FIELDS) {
      const raw = values[field.key];
      if (raw === '' || raw === null || raw === undefined || typeof raw === 'boolean') throw new Error(`${field.label}不能为空。`);
      const number = Number(raw);
      if (!Number.isFinite(number)) throw new Error(`${field.label}必须是有效数字。`);
      if (field.kind === 'material' && !(number > 0 && number <= 1000)) throw new Error(`${field.label}须大于 0 且不超过 1000。`);
      if (field.kind === 'usable' && !(number > 0 && number <= 1)) throw new Error(`${field.label}须大于 0 且不超过 1。`);
      if (field.kind === 'divisor' && !(number >= 1 && number <= 100)) throw new Error(`${field.label}须在 1 到 100 之间。`);
      clean[field.key] = number;
    }
    return clean;
  }

  function buildParameters(values, revision, updatedAt) {
    const materials = {};
    for (const material of ['410', '201', '304', '316']) {
      materials[material] = {
        square: values[`materials.${material}.square`],
        radius: values[`materials.${material}.radius`]
      };
    }
    return {
      materials,
      modes: {
        single: { widthDivisor: 1, usableFactor: values['modes.single.usableFactor'] },
        double: { widthDivisor: values['modes.double.widthDivisor'], usableFactor: values['modes.double.usableFactor'] }
      },
      cutStep: defaults.cutStep,
      pi: defaults.pi,
      revision,
      updatedAt
    };
  }

  function readState() {
    let raw;
    try {
      raw = global.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      throw new Error('无法读取本地参数，请检查当前应用的存储权限。');
    }
    if (raw === null) return { revision: 0, updatedAt: null, parameters: buildParameters(editableValues(defaults), 0, null) };
    try {
      const stored = JSON.parse(raw);
      if (!stored || stored.schema !== 1 || !Number.isSafeInteger(stored.revision) || stored.revision < 1 ||
          typeof stored.updatedAt !== 'string' || Number.isNaN(Date.parse(stored.updatedAt))) throw new Error('invalid');
      const values = validateValues(stored.values);
      return { revision: stored.revision, updatedAt: stored.updatedAt, parameters: buildParameters(values, stored.revision, stored.updatedAt) };
    } catch (error) {
      throw new Error('本地参数格式异常。为避免覆盖原数据，已停止计算和参数修改。');
    }
  }

  function writeValues(values, expectedRevision) {
    const current = readState();
    if (current.revision !== expectedRevision) throw new Error('参数已在其他页面更新，请刷新参数后重试。');
    const clean = validateValues(values);
    const before = editableValues(current.parameters);
    if (FIELDS.every(field => clean[field.key] === before[field.key])) throw new Error('参数没有变化。');
    const next = { schema: 1, revision: current.revision + 1, updatedAt: new Date().toISOString(), values: clean };
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      throw new Error('参数保存失败：本地存储不可用或空间不足。原参数未改变。');
    }
    return readState();
  }

  function restoreDefaults(expectedRevision) {
    return writeValues(editableValues(defaults), expectedRevision);
  }

  function exportBackup() {
    const state = readState();
    return { format: 'material-calculator-parameters', version: 1, exportedAt: new Date().toISOString(), values: editableValues(state.parameters) };
  }

  function importBackup(backup, expectedRevision) {
    if (!backup || backup.format !== 'material-calculator-parameters' || backup.version !== 1) {
      throw new Error('参数备份格式无效，未修改当前参数。');
    }
    return writeValues(validateValues(backup.values), expectedRevision);
  }

  global.ParameterStore = Object.freeze({ STORAGE_KEY, FIELDS, valueAt, editableValues, validateValues, readState, writeValues, restoreDefaults, exportBackup, importBackup });
})(typeof window === 'undefined' ? globalThis : window);
