(function (global) {
  'use strict';

  const HEADERS = Object.freeze([
    '材质', '厚度(mm)', '宽度(mm)', '材料重量(kg)', '冲料方式', '最终剪口(mm)',
    '冲料圆片比例系数', '可用重量(kg)', '第1套单重原值(kg/个)', '第2套单重原值(kg/个)',
    '所选单重公式', '所选单重原值(kg/个)', '预计数量(个)', '第1套密度系数',
    '第2套密度系数', '剪口换算参数', '剪口步长(mm)', '圆周率参数',
    '公式版本', '参数版本', '计算时间'
  ]);

  function decimalValue(number) {
    // 仅整理导出中的二进制浮点尾差；数量仍由计算模块使用原值求得。
    return Number(number.toPrecision(15));
  }

  function resultValues(result) {
    const input = result.input;
    const parameters = result.parameters;
    return [
      input.material, input.thickness, input.width, input.weight,
      input.mode === 'single' ? '单排' : '双排', result.cut,
      input.formula === 3 ? '未参与' : parameters.usableFactor,
      decimalValue(result.usableWeight), decimalValue(result.radiusUnitWeight),
      decimalValue(result.squareUnitWeight), input.formula === 3 ? '第 3 套（方片密度算法公式）' :
        input.formula === 1 ? '第 1 套（圆片密度算法公式）' : '第 2 套（圆片密度高级算法公式）',
      decimalValue(result.selectedUnitWeight),
      result.quantity, parameters.radiusFactor, parameters.squareFactor,
      parameters.widthDivisor, parameters.cutStep, parameters.pi,
      result.formulaVersion, result.parameterVersion || '默认参数（旧记录）', result.calculatedAt
    ];
  }

  function table(results) {
    if (!Array.isArray(results) || results.length === 0) throw new Error('没有可导出或打印的有效计算结果。');
    return [HEADERS, ...results.map(resultValues)];
  }

  function csv(results) {
    return '\uFEFF' + table(results).map(row => row.map(value => {
      const text = String(value ?? '');
      // 防止文本字段被表格软件当作公式；当前数值列仍保持数值格式。
      const safe = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    }).join(',')).join('\r\n') + '\r\n';
  }

  function xlsx(results) {
    if (!global.XLSX) throw new Error('XLSX 库未加载，无法导出。');
    const sheet = global.XLSX.utils.aoa_to_sheet(table(results));
    const workbook = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(workbook, sheet, '计算结果');
    return global.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  }

  function preparePrint(results, title, container) {
    const rows = table(results);
    container.replaceChildren();
    const heading = document.createElement('h1');
    heading.textContent = title;
    container.appendChild(heading);
    results.forEach((result, index) => {
      const card = document.createElement('section');
      card.className = 'print-card';
      const subheading = document.createElement('h2');
      subheading.textContent = `第 ${index + 1} 条 · ${result.quantity.toLocaleString('zh-CN')} 个`;
      const grid = document.createElement('dl');
      rows[0].forEach((label, column) => {
        const item = document.createElement('div');
        const term = document.createElement('dt');
        const detail = document.createElement('dd');
        term.textContent = result.input.formula === 3 && column === 11 ? '方片单重原值(kg/个)' : label;
        detail.textContent = String(rows[index + 1][column]);
        item.append(term, detail);
        grid.appendChild(item);
      });
      card.append(subheading, grid);
      container.appendChild(card);
    });
  }

  global.ResultOutput = Object.freeze({ HEADERS, resultValues, table, csv, xlsx, preparePrint });
})(typeof window === 'undefined' ? globalThis : window);
