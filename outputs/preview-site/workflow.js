(function (global) {
  'use strict';

  const calculator = global.MaterialCalculator;
  const batchData = global.BatchData;
  const historyStore = global.HistoryStore;
  const resultOutput = global.ResultOutput;
  const parameterStore = global.ParameterStore;
  const byId = id => document.getElementById(id);
  let importedRows = null;
  let currentBatchResults = [];

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle('is-error', isError);
    element.hidden = !message;
  }

  function errorMessage(error) {
    return error instanceof Error ? error.message : '操作失败，请检查输入或文件。';
  }

  function downloadBlob(content, type, filename) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function displayDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN');
  }

  function displayPreciseNumber(value) {
    return Number.isFinite(value) ? Number(value.toPrecision(15)) : value;
  }

  function historyFormulaLabel(result) {
    const formula = Number(result.input.formula);
    const legacy = /^1\./.test(String(result.formulaVersion));
    if (formula === 3) return '第 3 套 · 方片密度算法公式';
    if (legacy && formula === 1) return '旧第 1 套 · 圆片密度高级算法公式（现第 2 套）';
    if (legacy && formula === 2) return '旧第 2 套 · 圆片密度算法公式（现第 1 套）';
    return `第 ${formula} 套 · ${formula === 1 ? '圆片密度算法公式' : '圆片密度高级算法公式'}`;
  }

  function detailField(container, label, value) {
    const item = document.createElement('div');
    const name = document.createElement('span');
    const data = document.createElement('strong');
    name.textContent = label;
    data.textContent = String(value);
    item.append(name, data);
    container.appendChild(item);
  }

  function renderHistory() {
    const list = byId('history-list');
    const status = byId('history-status');
    list.replaceChildren();
    let records;
    try {
      records = historyStore.readRecords();
    } catch (error) {
      byId('history-count').textContent = '';
      setStatus(status, errorMessage(error), true);
      return;
    }
    const query = byId('history-filter').value.trim().toLowerCase();
    const filtered = records.filter(record => {
      const result = record.result;
      const terms = [result.input.material, result.input.mode === 'single' ? '单排' : '双排', result.quantity, displayDate(result.calculatedAt)];
      return terms.join(' ').toLowerCase().includes(query);
    });
    byId('history-count').textContent = `显示 ${filtered.length} 条，共 ${records.length} / ${historyStore.MAX_RECORDS} 条`;
    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = records.length ? '没有符合条件的历史记录。' : '暂无历史记录。';
      list.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    filtered.forEach(record => {
      const result = record.result;
      const item = document.createElement('article');
      item.className = 'history-item';
      const heading = document.createElement('div');
      heading.className = 'history-item-heading';
      const summary = document.createElement('div');
      const number = document.createElement('strong');
      number.textContent = `${result.quantity.toLocaleString('zh-CN')} 个`;
      const meta = document.createElement('small');
      meta.textContent = `${result.input.material} · ${result.input.mode === 'single' ? '单排' : '双排'}${result.input.formula === 3 ? ' · 方片换算' : ''} · ${displayDate(result.calculatedAt)}`;
      summary.append(number, meta);
      const actions = document.createElement('div');
      actions.className = 'history-actions';
      const recalculate = document.createElement('button');
      recalculate.type = 'button';
      recalculate.textContent = '重新计算';
      recalculate.addEventListener('click', () => {
        try {
          const fresh = calculator.calculate(calculator.currentInputFromHistory(result), parameterStore.readState().parameters);
          historyStore.addResults([fresh]);
          setStatus(status, '已按当前计算规则生成新记录；原历史记录未改变。');
          renderHistory();
        } catch (error) {
          setStatus(status, errorMessage(error), true);
        }
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger-button';
      remove.textContent = '删除';
      remove.addEventListener('click', () => {
        if (!global.confirm('确定删除这条历史记录吗？删除后无法撤销。')) return;
        try {
          historyStore.remove(record.id);
          renderHistory();
          setStatus(status, '历史记录已删除。');
        } catch (error) {
          setStatus(status, errorMessage(error), true);
        }
      });
      actions.append(recalculate, remove);
      heading.append(summary, actions);
      const details = document.createElement('details');
      const toggle = document.createElement('summary');
      toggle.textContent = '查看原始输入、参数快照和结果';
      const grid = document.createElement('div');
      grid.className = 'history-details';
      detailField(grid, '厚度', `${result.input.thickness} mm`);
      detailField(grid, '宽度', `${result.input.width} mm`);
      detailField(grid, '重量', `${result.input.weight} kg`);
      detailField(grid, '最终剪口', `${result.cut} mm`);
      detailField(grid, '单重公式', historyFormulaLabel(result));
      detailField(grid, '选中单重原值', `${displayPreciseNumber(result.selectedUnitWeight)} kg/个`);
      if (result.input.formula === 3) detailField(grid, '方片单重', `${displayPreciseNumber(result.sheetUnitWeight)} kg/个`);
      detailField(grid, '第 1 套密度系数', result.parameters.radiusFactor);
      detailField(grid, '第 2 套密度系数', result.parameters.squareFactor);
      detailField(grid, result.input.mode === 'single' ? '单排冲料圆片比例系数' : '双排冲料圆片比例系数', result.input.formula === 3 ? `未参与（配置值 ${result.parameters.usableFactor}）` : result.parameters.usableFactor);
      if (result.input.formula === 3) detailField(grid, '参与计算重量', `${result.usableWeight} kg`);
      detailField(grid, '剪口换算参数', result.parameters.widthDivisor);
      detailField(grid, '剪口步长', result.parameters.cutStep);
      detailField(grid, '圆周率参数', result.parameters.pi);
      detailField(grid, '公式版本', result.formulaVersion);
      details.append(toggle, grid);
      item.append(heading, details);
      fragment.appendChild(item);
    });
    list.appendChild(fragment);
  }

  function recordResult(result) {
    const status = byId('single-save-status');
    try {
      historyStore.addResults([result]);
      setStatus(status, '计算结果已保存到当前应用的历史记录。');
      renderHistory();
    } catch (error) {
      setStatus(status, errorMessage(error), true);
    }
  }

  function renderBatch(rows) {
    const body = byId('batch-results-body');
    const fragment = document.createDocumentFragment();
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const result = row.result;
      const source = row.source || [];
      const cells = result ? [row.line, result.input.material, result.input.thickness, result.input.width, result.input.weight, result.input.mode === 'single' ? '单排' : '双排', result.cut, result.quantity.toLocaleString('zh-CN'), result.input.formula === 3 ? '成功 · 方片换算' : '成功'] :
        [row.line, source[0] || '—', source[1] || '—', source[2] || '—', source[3] || '—', source[4] || '—', '—', '—', row.error];
      cells.forEach(cell => {
        const td = document.createElement('td');
        td.textContent = String(cell);
        if (!result && cell === row.error) td.className = 'row-error';
        tr.appendChild(td);
      });
      fragment.appendChild(tr);
    });
    body.replaceChildren(fragment);
    byId('batch-results').hidden = false;
  }

  function runBatch() {
    const status = byId('batch-status');
    byId('batch-results').hidden = true;
    currentBatchResults = [];
    byId('batch-output-actions').hidden = true;
    try {
      const rows = importedRows || batchData.rowsFromText(byId('batch-text').value);
      const activeParameters = parameterStore.readState().parameters;
      const results = batchData.calculateRows(rows, input => calculator.calculate(input, activeParameters));
      renderBatch(results);
      const valid = results.filter(row => row.result).map(row => row.result);
      currentBatchResults = valid;
      byId('batch-output-actions').hidden = valid.length === 0;
      const invalidCount = results.length - valid.length;
      let message = `已处理 ${results.length} 条：成功 ${valid.length} 条，错误 ${invalidCount} 条。`;
      if (valid.length > 0) {
        try {
          historyStore.addResults(valid);
          renderHistory();
          message += `成功记录已保存到历史。`;
        } catch (error) {
          setStatus(status, `${message} ${errorMessage(error)}`, true);
          return;
        }
      }
      setStatus(status, message, invalidCount > 0);
    } catch (error) {
      setStatus(status, errorMessage(error), true);
    }
  }

  function exportResults(results, format, title) {
    const status = title === '单次计算结果' ? byId('single-save-status') : byId('batch-status');
    try {
      const filename = `${title}.${format}`;
      if (format === 'csv') downloadBlob(resultOutput.csv(results), 'text/csv;charset=utf-8', filename);
      else if (format === 'xlsx') downloadBlob(resultOutput.xlsx(results), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename);
      else throw new Error('不支持的导出格式。');
      setStatus(status, `已生成 ${filename}。`);
    } catch (error) {
      setStatus(status, errorMessage(error), true);
    }
  }

  function printResults(results, title) {
    const status = title === '单次计算结果' ? byId('single-save-status') : byId('batch-status');
    try {
      resultOutput.preparePrint(results, title, byId('print-area'));
      global.print();
    } catch (error) {
      setStatus(status, errorMessage(error), true);
    }
  }

  async function loadFile(file) {
    if (!file) return;
    if (file.size > batchData.MAX_FILE_BYTES) throw new Error('文件超过 2 MB 上限。');
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension === 'xlsx') return batchData.rowsFromWorkbook(await file.arrayBuffer());
    if (extension === 'csv') {
      const bytes = await file.arrayBuffer();
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch (error) {
        try {
          text = new TextDecoder('gb18030', { fatal: true }).decode(bytes);
        } catch (decodeError) {
          throw new Error('CSV 编码无法识别，请另存为 UTF-8 或 GB18030。');
        }
      }
      return batchData.rowsFromText(text);
    }
    throw new Error('仅支持 CSV 和 XLSX 文件。');
  }

  document.querySelectorAll('.view-tab').forEach(button => {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      for (const name of ['single', 'batch', 'history', 'parameters']) byId(`${name}-view`).hidden = name !== view;
      document.querySelectorAll('.view-tab').forEach(tab => {
        const active = tab === button;
        tab.classList.toggle('active', active);
        if (active) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
      });
      if (view === 'history') renderHistory();
      if (view === 'parameters') global.ParameterUI.render();
    });
  });
  byId('batch-text').addEventListener('input', () => {
    importedRows = null;
    byId('batch-file').value = '';
  });
  byId('batch-file').addEventListener('change', async event => {
    const status = byId('batch-status');
    importedRows = null;
    byId('batch-text').value = '';
    try {
      const file = event.target.files[0];
      if (!file) return;
      importedRows = await loadFile(file);
      setStatus(status, `已读取 ${file.name}，点击“计算批量数据”查看逐行结果。`);
    } catch (error) {
      setStatus(status, errorMessage(error), true);
    }
  });
  byId('run-batch').addEventListener('click', runBatch);
  for (const [id, format] of [['batch-export-csv', 'csv'], ['batch-export-xlsx', 'xlsx']]) {
    byId(id).addEventListener('click', () => exportResults(currentBatchResults, format, '批量计算结果'));
  }
  byId('batch-print').addEventListener('click', () => printResults(currentBatchResults, '批量计算结果'));
  byId('download-csv-template').addEventListener('click', () => downloadBlob(batchData.templateCsv(), 'text/csv;charset=utf-8', '材料批量导入模板.csv'));
  byId('download-xlsx-template').addEventListener('click', () => {
    try {
      const bytes = global.XLSX.write(batchData.templateWorkbook(), { bookType: 'xlsx', type: 'array' });
      downloadBlob(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '材料批量导入模板.xlsx');
    } catch (error) {
      setStatus(byId('batch-status'), errorMessage(error), true);
    }
  });
  byId('history-filter').addEventListener('input', renderHistory);
  byId('backup-history').addEventListener('click', () => {
    try {
      const records = historyStore.readRecords();
      const payload = JSON.stringify({ format: 'material-calculator-history', version: 1, exportedAt: new Date().toISOString(), records }, null, 2);
      downloadBlob(payload, 'application/json;charset=utf-8', '材料计算历史备份.json');
      setStatus(byId('history-status'), `已生成包含 ${records.length} 条记录的 JSON 备份文件。`);
    } catch (error) {
      setStatus(byId('history-status'), errorMessage(error), true);
    }
  });
  byId('restore-history').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > batchData.MAX_FILE_BYTES) throw new Error('备份文件超过 2 MB 上限。');
      const backup = JSON.parse(await file.text());
      if (!global.confirm(`确定合并导入 ${Array.isArray(backup.records) ? backup.records.length : 0} 条历史备份吗？现有记录不会被覆盖。`)) return;
      const outcome = historyStore.importBackup(backup);
      renderHistory();
      setStatus(byId('history-status'), `已导入 ${outcome.imported} 条，跳过重复 ${outcome.skipped} 条。`);
    } catch (error) {
      setStatus(byId('history-status'), error instanceof SyntaxError ? 'JSON 备份文件格式错误。' : errorMessage(error), true);
    } finally {
      event.target.value = '';
    }
  });

  global.ProjectWorkflow = Object.freeze({ recordResult, renderHistory, exportResults, printResults });
  renderHistory();
})(window);
