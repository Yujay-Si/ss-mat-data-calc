(function (global) {
  'use strict';

  const store = global.ParameterStore;
  const byId = id => document.getElementById(id);
  let loadedRevision = null;

  function showStatus(message, error = false) {
    const element = byId('parameter-status');
    element.textContent = message;
    element.classList.toggle('is-error', error);
    element.hidden = !message;
  }

  function messageFrom(error) {
    return error instanceof Error ? error.message : '参数操作失败。';
  }

  function render() {
    const fields = byId('parameter-fields');
    fields.replaceChildren();
    try {
      const state = store.readState();
      loadedRevision = state.revision;
      const fragment = document.createDocumentFragment();
      for (const field of store.FIELDS) {
        const label = document.createElement('label');
        label.className = 'field';
        const title = document.createElement('span');
        title.textContent = field.label;
        const input = document.createElement('input');
        input.type = 'number';
        input.inputMode = 'decimal';
        input.step = 'any';
        input.required = true;
        input.dataset.key = field.key;
        input.value = store.valueAt(state.parameters, field.key);
        if (field.kind === 'usable') {
          input.min = '0';
          input.max = '1';
        } else if (field.kind === 'divisor') {
          input.min = '1';
          input.max = '100';
        } else {
          input.min = '0';
          input.max = '1000';
        }
        label.append(title, input);
        fragment.appendChild(label);
      }
      fields.appendChild(fragment);
      byId('parameter-version-info').textContent = state.revision === 0 ? '默认参数 v0 · 尚未修改' :
        `本机参数 v${state.revision} · 最近修改 ${new Date(state.updatedAt).toLocaleString('zh-CN')}`;
      showStatus('');
    } catch (error) {
      loadedRevision = null;
      byId('parameter-version-info').textContent = '本地参数无法读取';
      showStatus(messageFrom(error), true);
    }
  }

  function formValues() {
    const values = {};
    byId('parameter-fields').querySelectorAll('input[data-key]').forEach(input => { values[input.dataset.key] = input.value; });
    return store.validateValues(values);
  }

  byId('parameter-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const current = store.readState();
      if (current.revision !== loadedRevision) throw new Error('参数已在其他页面更新，请刷新参数后重试。');
      const values = formValues();
      const before = store.editableValues(current.parameters);
      const changes = store.FIELDS.filter(field => before[field.key] !== values[field.key])
        .map(field => `${field.label}：${before[field.key]} → ${values[field.key]}`);
      if (changes.length === 0) throw new Error('参数没有变化。');
      if (!global.confirm(`确认保存以下参数变化？新参数只影响后续计算。\n\n${changes.join('\n')}`)) return;
      const saved = store.writeValues(values, loadedRevision);
      render();
      showStatus(`参数已保存为本机参数 v${saved.revision}；历史计算结果未修改。`);
    } catch (error) {
      showStatus(messageFrom(error), true);
    }
  });

  byId('restore-default-parameters').addEventListener('click', () => {
    try {
      const current = store.readState();
      if (current.revision !== loadedRevision) throw new Error('参数已在其他页面更新，请刷新参数后重试。');
      const before = store.editableValues(current.parameters);
      const defaults = store.editableValues(global.MaterialCalculator.DEFAULT_PARAMETERS);
      const changes = store.FIELDS.filter(field => before[field.key] !== defaults[field.key])
        .map(field => `${field.label}：${before[field.key]} → ${defaults[field.key]}`);
      if (changes.length === 0) throw new Error('当前已是出厂默认参数。');
      if (!global.confirm(`确认恢复出厂默认参数？新参数只影响后续计算。\n\n${changes.join('\n')}`)) return;
      const saved = store.restoreDefaults(loadedRevision);
      render();
      showStatus(`已恢复出厂默认值，当前为本机参数 v${saved.revision}；历史计算结果未修改。`);
    } catch (error) {
      showStatus(messageFrom(error), true);
    }
  });

  global.ParameterUI = Object.freeze({ render });
  render();
})(window);
