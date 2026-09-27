(function (global) {
  'use strict';

  const FORMULA_VERSION = '2.0.0';
  const DEFAULT_PARAMETERS = Object.freeze({
    materials: Object.freeze({
      '410': Object.freeze({ square: 6.162, radius: 0.785 }),
      '201': Object.freeze({ square: 6.225, radius: 0.793 }),
      '304': Object.freeze({ square: 6.225, radius: 0.793 }),
      '316': Object.freeze({ square: 6.264, radius: 0.798 })
    }),
    modes: Object.freeze({
      single: Object.freeze({ widthDivisor: 1, usableFactor: 0.776 }),
      double: Object.freeze({ widthDivisor: 1.87, usableFactor: 0.824 })
    }),
    cutStep: 5,
    pi: 3.14
  });

  function positiveNumber(value, label) {
    if (typeof value === 'string' && value.trim() === '') {
      throw new Error(`请输入${label}。`);
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      throw new Error(`${label}必须是大于 0 的有效数字。`);
    }
    return number;
  }

  function calculate(input, parameters = DEFAULT_PARAMETERS) {
    if (!input || typeof input !== 'object') {
      throw new Error('请输入材料数据。');
    }
    if (!parameters || !parameters.materials || !parameters.modes) {
      throw new Error('计算参数缺失。');
    }

    const material = String(input.material ?? '');
    const mode = String(input.mode ?? '');
    const selectedFormula = Number(input.formula);
    const materialFactors = parameters.materials[material];
    const modeFactors = parameters.modes[mode];
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PARAMETERS.materials, material) || !materialFactors) {
      throw new Error('请选择有效材质。');
    }
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PARAMETERS.modes, mode) || !modeFactors) {
      throw new Error('请选择有效冲料方式。');
    }
    if (![1, 2, 3].includes(selectedFormula)) {
      throw new Error('请选择有效单重公式。');
    }
    if (selectedFormula === 3 && mode !== 'single') {
      throw new Error('第 3 套方片公式仅适用于单排。');
    }

    const thickness = positiveNumber(input.thickness, '厚度');
    const width = positiveNumber(input.width, '宽度');
    const weight = positiveNumber(input.weight, '材料重量');
    const squareFactor = positiveNumber(materialFactors.square, '第 2 套密度系数');
    const radiusFactor = positiveNumber(materialFactors.radius, '第 1 套密度系数');
    const widthDivisor = positiveNumber(modeFactors.widthDivisor, '剪口换算参数');
    const ratioLabel = mode === 'single' ? '单排冲料圆片比例系数' : '双排冲料圆片比例系数';
    const usableFactor = positiveNumber(modeFactors.usableFactor, ratioLabel);
    const cutStep = positiveNumber(parameters.cutStep, '剪口取整步长');
    const pi = positiveNumber(parameters.pi, '圆周率参数');
    if (usableFactor > 1) {
      throw new Error(`${ratioLabel}不能大于 1。`);
    }

    const rawCut = width / widthDivisor;
    const cut = Math.floor(rawCut / cutStep) * cutStep;
    if (!Number.isFinite(cut) || cut <= 0) {
      throw new Error('宽度过小，最终剪口为 0 mm，无法计算。');
    }

    // 数量使用未舍入单重；四位小数仅用于结果显示。
    const squareUnitWeight = cut * cut * thickness * squareFactor / 1000000;
    const radius = cut / 2;
    const radiusUnitWeight = radius * radius * pi * thickness * radiusFactor / 100000;
    const sheetUnitWeight = selectedFormula === 3 ? cut * cut * thickness * radiusFactor / 100000 : null;
    const selectedUnitWeight = selectedFormula === 1 ? radiusUnitWeight : selectedFormula === 2 ? squareUnitWeight : sheetUnitWeight;
    // 方片公式明确用材料总重计算，不应用单排圆片公式的 0.776 系数。
    const appliedUsableFactor = selectedFormula === 3 ? null : usableFactor;
    const usableWeight = selectedFormula === 3 ? weight : weight * usableFactor;
    const rawQuantity = usableWeight / selectedUnitWeight;
    if (![squareUnitWeight, radiusUnitWeight, usableWeight, rawQuantity].every(Number.isFinite) ||
        !Number.isFinite(selectedUnitWeight) || selectedUnitWeight <= 0 || rawQuantity < 0 || rawQuantity >= Number.MAX_SAFE_INTEGER) {
      throw new Error('计算结果超出有效范围，请检查输入数值。');
    }

    return {
      formulaVersion: FORMULA_VERSION,
      parameterVersion: Number.isSafeInteger(parameters.revision) && parameters.revision > 0 ? `本机参数 v${parameters.revision}` : '默认参数 v0',
      parameterUpdatedAt: parameters.updatedAt || null,
      calculatedAt: new Date().toISOString(),
      input: { material, thickness, width, weight, mode, formula: selectedFormula },
      parameters: { squareFactor, radiusFactor, widthDivisor, usableFactor, cutStep, pi },
      rawCut,
      cut,
      squareUnitWeight,
      radiusUnitWeight,
      sheetUnitWeight,
      selectedUnitWeight,
      appliedUsableFactor,
      usableWeight,
      quantity: Math.floor(rawQuantity)
    };
  }

  function currentInputFromHistory(result) {
    if (!result || !result.input) throw new Error('历史记录缺少计算输入。');
    const version = String(result.formulaVersion || '');
    const oldNumbering = /^1\./.test(version);
    const formula = Number(result.input.formula);
    if (!version) throw new Error('历史记录缺少公式版本，无法安全重算。');
    // v1 的 1=剪口平方、2=剪口半径；v2 起这两个公开编号互换。
    return { ...result.input, formula: oldNumbering && (formula === 1 || formula === 2) ? 3 - formula : formula };
  }

  global.MaterialCalculator = Object.freeze({ calculate, currentInputFromHistory, DEFAULT_PARAMETERS, FORMULA_VERSION });
})(typeof window === 'undefined' ? globalThis : window);
