'use strict';

const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');

require('../../desktop/main.js');

async function loaded(window) {
  if (window.webContents.isLoading() || !window.webContents.getURL().startsWith('ssmatcalc://app/')) {
    await new Promise((resolve, reject) => {
      window.webContents.once('did-finish-load', resolve);
      window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}: ${description}`)));
    });
  }
}

app.whenReady().then(async () => {
  try {
    const window = BrowserWindow.getAllWindows()[0];
    assert.ok(window, '桌面窗口未创建');
    window.hide();
    await loaded(window);
    const phase = process.env.SSMAT_SMOKE_PHASE || 'write';
    const result = await window.webContents.executeJavaScript(`(() => {
      const input = { material: '201', thickness: 0.3, width: 600, weight: 100, mode: 'double', formula: 2 };
      if (!window.MaterialCalculator || !window.ParameterStore || !window.BatchData || !window.XLSX) throw new Error('页面脚本未加载');
      if (${JSON.stringify(phase)} === 'write') {
        const before = window.ParameterStore.readState();
        const values = window.ParameterStore.editableValues(before.parameters);
        values['materials.201.square'] = 6.5;
        window.ParameterStore.writeValues(values, before.revision);
        window.HistoryStore.addResults([window.MaterialCalculator.calculate(input)]);
      }
      const current = window.ParameterStore.readState();
      const calculated = window.MaterialCalculator.calculate(input, current.parameters);
      const rows = window.BatchData.calculateRows(window.BatchData.rowsFromText('材质,厚度(mm),宽度(mm),材料重量(kg),冲料方式,单重公式\\n201,0.3,600,100,双排,2'), item => window.MaterialCalculator.calculate(item, current.parameters));
      const sheet = window.ResultOutput.xlsx([calculated]);
      const workbook = window.XLSX.read(sheet, { type: 'array' });
      window.ResultOutput.preparePrint([calculated], '桌面验收', document.getElementById('print-area'));
      return { title: document.title, revision: current.revision, quantity: calculated.quantity, batchQuantity: rows[0].result.quantity, xlsxSheets: workbook.SheetNames.length, history: window.HistoryStore.readRecords().length, origin: location.origin };
    })()`);
    assert.equal(result.title, '材料数据计算工具');
    assert.equal(result.revision, 1);
    assert.equal(result.history, 1);
    assert.equal(result.quantity, result.batchQuantity);
    assert.equal(result.xlsxSheets, 1);
    assert.equal(result.origin, 'ssmatcalc://app');
    if (phase === 'write') {
      const download = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('参数备份未触发下载')), 10000);
        window.webContents.session.once('will-download', (_event, item) => {
          clearTimeout(timer);
          const filename = item.getFilename();
          item.cancel();
          resolve(filename);
        });
      });
      await window.webContents.executeJavaScript("document.getElementById('backup-parameters').click()");
      assert.equal(await download, '材料计算参数备份.json');
    }
    const pdf = await window.webContents.printToPDF({ printBackground: true });
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    console.log(JSON.stringify({ phase, ...result, pdfBytes: pdf.length }));
    window.close();
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}).catch(error => { console.error(error); app.exit(1); });
