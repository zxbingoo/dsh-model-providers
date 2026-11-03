import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

test('sidebar panel reads persistent settings, saves switch/model and sets Harness default', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, flag: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let plugin; const registrations = [], writes = [];
  let row = { ns: 'harness-codex-cli-link', revision: 'r1', value: { enabled: true, model: 'gpt-6.1-sol', reasoningEffort: 'default' } };
  let defaults = { ns: 'agent-default-model', revision: 'd1', value: { provider: 'old', model: 'old' } };
  const ctx = {
    slots: { inject: (_name, fn) => fn(), register: (options, component) => registrations.push({ options, component }) },
    remote: { $on: () => () => {}, session: { modelCatalog: async () => ({ ok: true, value: { groups: [{ id: 'codex-cli', models: [{ id: 'gpt-6.1-sol' }, { id: 'custom-model' }] }] } }) }, settings: {
      describe: async () => ({ ok: true, value: { namespaces: [row, defaults] } }),
      mutate: async (ns, ops, revision) => { const value = Object.fromEntries(ops.filter(op => op.op === 'set').map(op => [op.path[0], op.value])); writes.push({ ns, value, revision }); defaults = { ns, value, revision: 'd2' }; return { ok: true, value: defaults }; },
      update: async (ns, value, revision) => { writes.push({ ns, value, revision }); const next = { ns, value: { ...(ns === row.ns ? row.value : defaults.value), ...value }, revision: 'r2' }; if (ns === row.ns) row = next; else defaults = next; return { ok: true, value: next }; },
    } },
    get connection() { throw new Error('Desktop must not call generic HTTP RPC'); },
  };
  vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load: def => { plugin = def.factory(() => React); } } } });
  assert(plugin.inject.includes('remote'), 'root remote event service must be explicitly injected');
  assert(plugin.inject.includes('remote.session'), 'native session transport must be injected');
  plugin.apply(ctx);
  assert(registrations.some(r => r.options.name === 'sidebar.panellist' && r.options.label === 'Providers'));
  const Panel = registrations.find(r => r.options.name === 'main').component;
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => { root.render(React.createElement(Panel)); });
    assert.match(document.body.textContent, /仅支持 Codex/);
    const model = document.getElementById('hccl-model');
    await act(async () => { model.value = 'custom-model'; model.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
    // An external edit plus catalog refresh must not advance the baseline of a dirty form.
    row = { ...row, revision: 'external-r2', value: { ...row.value, reasoningEffort: 'high' } };
    await act(async () => { button('检查连接 / 刷新模型').click(); });
    await act(async () => { button('保存配置').click(); });
    assert.equal(writes[0].value.model, 'custom-model'); assert.equal(writes[0].revision, 'r1');
    await act(async () => { button('设为 Harness 默认模型').click(); });
    assert.equal(writes[1].ns, 'agent-default-model'); assert.equal(writes[1].value.model, 'configured');
    await act(async () => { document.querySelector('[role=switch]').click(); });
    await act(async () => { button('保存配置').click(); });
    assert.equal(writes[2].value.enabled, false);
    assert.match(document.body.textContent, /已保存/);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = old.window; globalThis.document = old.document; globalThis.IS_REACT_ACT_ENVIRONMENT = old.flag;
  }
});
