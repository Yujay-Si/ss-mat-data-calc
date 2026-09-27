(function (global) {
  'use strict';

  const HEADERS = Object.freeze(['材质', '厚度(mm)', '宽度(mm)', '材料重量(kg)', '冲料方式', '单重公式']);
  const MAX_ROWS = 500;
  const MAX_FILE_BYTES = 2 * 1024 * 1024;

  function parseDelimited(text, delimiter) {
    const rows = [];
    let cells = [];
    let field = '';
    let inQuotes = false;
    let afterQuote = false;
    let line = 1;
    let rowLine = 1;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (inQuotes) {
        if (char === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          inQuotes = false;
          afterQuote = true;
        } else {
          field += char;
          if (char === '\n') line += 1;
        }
      } else if (char === delimiter) {
        cells.push(field);
        field = '';
        afterQuote = false;
      } else if (char === '\n' || char === '\r') {
        cells.push(field);
        rows.push({ line: rowLine, values: cells });
        cells = [];
        field = '';
        afterQuote = false;
        if (char === '\r' && text[index + 1] === '\n') index += 1;
        line += 1;
        rowLine = line;
      } else if (char === '"' && field === '' && !afterQuote) {
        inQuotes = true;
      } else if (afterQuote && char !== ' ' && char !== '\t') {
        throw new Error(`第 ${line} 行引号后存在无效字符。`);
      } else if (!afterQuote) {
        field += char;
      }
    }
    if (inQuotes) throw new Error(`第 ${rowLine} 行引号未闭合。`);
    if (field !== '' || cells.length > 0 || afterQuote) {
      cells.push(field);
      rows.push({ line: rowLine, values: cells });
    }
    return rows;
  }

  function rowsFromText(text) {
    if (typeof text !== 'string' || text.trim() === '') throw new Error('请输入或导入批量数据。');
    const clean = text.replace(/^\uFEFF/, '');
    const firstLine = clean.split(/\r?\n/, 1)[0];
    const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
    return parseDelimited(clean, delimiter);
  }

  function rowsFromWorkbook(bytes) {
    if (!global.XLSX) throw new Error('XLSX 库未加载，无法读取工作簿。');
    let workbook;
    try {
      workbook = global.XLSX.read(bytes, { type: 'array', cellFormula: false });
    } catch (error) {
      throw new Error('XLSX 文件无法读取，请检查文件是否损坏或受密码保护。');
    }
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error('XLSX 文件没有可读取的工作表。');
    const values = global.XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', blankrows: true, raw: true });
    return values.map((row, index) => ({ line: index + 1, values: row }));
  }

  function calculateRows(rows, calculate) {
    const populated = rows.filter(row => row.values.some(value => String(value).trim() !== ''));
    if (populated.length < 2) throw new Error('批量数据至少需要表头和一条材料记录。');
    const headers = populated[0].values.map(value => String(value).replace(/^\uFEFF/, '').trim());
    if (headers.length !== HEADERS.length || HEADERS.some((header, index) => headers[index] !== header)) {
      throw new Error(`表头必须依次为：${HEADERS.join('、')}。`);
    }
    const dataRows = populated.slice(1);
    if (dataRows.length > MAX_ROWS) throw new Error(`单次最多处理 ${MAX_ROWS} 条材料记录。`);

    return dataRows.map(row => {
      const values = row.values.map(value => String(value).trim());
      if (values.length !== HEADERS.length) {
        return { line: row.line, source: values, error: `字段数量应为 ${HEADERS.length} 列，实际为 ${values.length} 列。` };
      }
      const mode = values[4] === '单排' ? 'single' : values[4] === '双排' ? 'double' : values[4];
      const formula = values[5] === '' ? 1 : values[5];
      try {
        const result = calculate({
          material: values[0], thickness: values[1], width: values[2],
          weight: values[3], mode, formula
        });
        return { line: row.line, source: values, result };
      } catch (error) {
        return { line: row.line, source: values, error: error instanceof Error ? error.message : '计算失败。' };
      }
    });
  }

  function templateCsv() {
    return '\uFEFF' + HEADERS.join(',') + '\r\n201,0.3,600,100,双排,2\r\n';
  }

  function templateWorkbook() {
    if (!global.XLSX) throw new Error('XLSX 库未加载，无法制作模板。');
    const sheet = global.XLSX.utils.aoa_to_sheet([HEADERS, ['201', 0.3, 600, 100, '双排', 2]]);
    const workbook = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(workbook, sheet, '材料数据');
    return workbook;
  }

  global.BatchData = Object.freeze({ HEADERS, MAX_ROWS, MAX_FILE_BYTES, rowsFromText, rowsFromWorkbook, calculateRows, templateCsv, templateWorkbook });
})(typeof window === 'undefined' ? globalThis : window);
