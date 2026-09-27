(function () {
  'use strict';

  const form = document.getElementById('calculator-form');
  const emptyPanel = document.getElementById('empty-panel');
  const resultPanel = document.getElementById('result-panel');
  const errorPanel = document.getElementById('error-panel');
  const sheetFormulaChoice = document.getElementById('sheet-formula-choice');
  let currentResult = null;

  function setText(id, value) {
    document.getElementById(id).textContent = String(value);
  }

  function syncFormulaChoices() {
    const isSingle = form.elements.mode.value === 'single';
    sheetFormulaChoice.hidden = !isSingle;
    if (!isSingle && form.querySelector('input[name="formula"][value="3"]').checked) {
      form.querySelector('input[name="formula"][value="1"]').checked = true;
    }
  }

  function showResult(result) {
    const { input, parameters } = result;
    const usesSheetFormula = input.formula === 3;
    setText('result-quantity', result.quantity.toLocaleString('zh-CN'));
    setText('result-quantity-basis', usesSheetFormula ?
      '按方片单重用材料总重换算圆片数量，使用未舍入单重并向下取整' :
      '使用所选公式的未舍入单重计算，最终向下取整');
    setText('result-material', input.material);
    setText('result-thickness', `${input.thickness} mm`);
    setText('result-width', `${input.width} mm`);
    setText('result-weight', `${input.weight} kg`);
    setText('result-mode', input.mode === 'single' ? '单排' : '双排');
    setText('result-cut', `${result.cut} mm`);
    setText('result-factor-label', input.mode === 'single' ? '单排冲料圆片比例系数' : '双排冲料圆片比例系数');
    setText('result-factor', usesSheetFormula ? '未参与（使用材料总重）' : parameters.usableFactor);
    setText('result-weight-label', usesSheetFormula ? '参与计算重量' : '可用重量');
    setText('result-usable-weight', `${result.usableWeight.toLocaleString('zh-CN')} kg`);
    setText('result-square-weight', `${result.squareUnitWeight.toFixed(4)} kg/个`);
    setText('result-radius-weight', `${result.radiusUnitWeight.toFixed(4)} kg/个`);
    document.getElementById('result-sheet-weight-row').hidden = !usesSheetFormula;
    if (usesSheetFormula) setText('result-sheet-weight', `${result.sheetUnitWeight.toFixed(4)} kg/个`);
    setText('result-selected', usesSheetFormula ? '第 3 套 · 方片密度算法公式' :
      input.formula === 1 ? '第 1 套 · 圆片密度算法公式' : '第 2 套 · 圆片密度高级算法公式');
    setText('result-material-factor', input.formula === 2 ? parameters.squareFactor : parameters.radiusFactor);
    setText('result-version', result.formulaVersion);
    setText('result-parameter-version', result.parameterVersion || '默认参数（旧记录）');
    setText('result-time', new Date(result.calculatedAt).toLocaleString('zh-CN'));
    errorPanel.hidden = true;
    emptyPanel.hidden = true;
    resultPanel.hidden = false;
    resultPanel.focus();
  }

  form.elements.mode.addEventListener('change', syncFormulaChoices);
  syncFormulaChoices();

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    resultPanel.hidden = true;
    emptyPanel.hidden = true;
    currentResult = null;
    try {
      const input = {
        material: form.elements.material.value,
        thickness: form.elements.thickness.value,
        width: form.elements.width.value,
        weight: form.elements.weight.value,
        mode: form.elements.mode.value,
        formula: form.elements.formula.value
      };
      const result = window.MaterialCalculator.calculate(input, window.ParameterStore.readState().parameters);
      currentResult = result;
      showResult(result);
      window.ProjectWorkflow.recordResult(result);
    } catch (error) {
      errorPanel.textContent = error instanceof Error ? error.message : '计算失败，请检查输入。';
      errorPanel.hidden = false;
      errorPanel.focus();
    }
  });
  for (const [id, format] of [['single-export-csv', 'csv'], ['single-export-xlsx', 'xlsx']]) {
    document.getElementById(id).addEventListener('click', () => window.ProjectWorkflow.exportResults(currentResult ? [currentResult] : [], format, '单次计算结果'));
  }
  document.getElementById('single-print').addEventListener('click', () => window.ProjectWorkflow.printResults(currentResult ? [currentResult] : [], '单次计算结果'));
})();
