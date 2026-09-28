'use strict';

const assert = require('node:assert/strict');
const { app, BrowserWindow, dialog, Menu } = require('electron');

const phase = process.env.SSMAT_SMOKE_PHASE || 'write';
let loadAttempts = 0;
let aboutMessage;
const originalShowMessageBox = dialog.showMessageBox;
dialog.showMessageBox = async (...args) => {
  const options = args.at(-1);
  if (options.title === '关于 材料数据计算工具') {
    aboutMessage = options;
    return { response: 0 };
  }
  return originalShowMessageBox(...args);
};
if (phase === 'first-run') {
  const originalLoad = BrowserWindow.prototype.loadURL;
  BrowserWindow.prototype.loadURL = function (...args) {
    loadAttempts += 1;
    if (loadAttempts <= 2) return Promise.reject(new Error('模拟安装后短暂的文件占用'));
    return originalLoad.apply(this, args);
  };
}

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
    const menu = Menu.getApplicationMenu();
    assert.ok(menu, '桌面菜单未创建');
    assert.deepEqual(menu.items.map(item => item.label), ['文件', '编辑', '视图', '窗口', '帮助']);
    assert.deepEqual(menu.items.map(item => item.submenu.items.filter(child => child.type !== 'separator').map(child => child.label)), [
      ['退出'],
      ['撤销', '重做', '剪切', '复制', '粘贴', '全选'],
      ['重新加载', '实际大小', '放大', '缩小', '全屏'],
      ['最小化', '关闭'],
      ['检查更新', '关于']
    ]);
    window.hide();
    await loaded(window);
    if (phase === 'first-run') assert.equal(loadAttempts, 3, '首次启动重试次数不正确');
    const viewItems = menu.items[2].submenu.items;
    const clickView = label => viewItems.find(item => item.label === label).click({}, window, window.webContents);
    assert.deepEqual(['重新加载', '实际大小', '放大', '缩小'].map(label =>
      viewItems.find(item => item.label === label).accelerator),
    ['CommandOrControl+R', 'CommandOrControl+0', 'CommandOrControl+Plus', 'CommandOrControl+-']);
    clickView('放大');
    assert.equal(window.webContents.getZoomLevel(), 1, '放大未改变页面缩放');
    clickView('缩小');
    assert.equal(window.webContents.getZoomLevel(), 0, '缩小未恢复页面缩放');
    clickView('放大');
    clickView('实际大小');
    assert.equal(window.webContents.getZoomLevel(), 0, '实际大小未重置缩放');
    const reloaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
    clickView('重新加载');
    await reloaded;
    assert.equal(window.webContents.getURL(), 'ssmatcalc://app/index.html', '重新加载未恢复计算页面');
    menu.items[4].submenu.items.find(item => item.label === '关于').click({}, window, window.webContents);
    await Promise.resolve();
    assert.match(aboutMessage.message, new RegExp(`v${app.getVersion().replaceAll('.', '\\.')}`));
    assert.match(aboutMessage.detail, /离线估算材料可冲圆片数量/);
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
      return { title: document.title, revision: current.revision, quantity: calculated.quantity, batchQuantity: rows[0].result.quantity, xlsxSheets: workbook.SheetNames.length, history: window.HistoryStore.readRecords().length, origin: location.origin, sectionNumbers: document.querySelectorAll('.section-number').length };
    })()`);
    assert.equal(result.title, '材料数据计算工具');
    assert.equal(result.revision, 1);
    assert.equal(result.history, 1);
    assert.equal(result.quantity, result.batchQuantity);
    assert.equal(result.xlsxSheets, 1);
    assert.equal(result.origin, 'ssmatcalc://app');
    assert.equal(result.sectionNumbers, 0, '页面标题仍显示数字序号');
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
