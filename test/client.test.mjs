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
  let plugin; const registrations = [], writes = [], rpcCalls = [];
  let row = { ns: 'harness-codex-cli-link', revision: 'r1', value: { enabled: true, model: 'gpt-6.1-sol', reasoningEffort: 'default' } };
  let defaults = { ns: 'agent-default-model', revision: 'd1', value: { provider: 'old', model: 'old' } };
  const ctx = {
    slots: { inject: (_name, fn) => fn(), register: (options, component) => registrations.push({ options, component }) },
    remote: { $on: () => () => {}, session: { modelCatalog: async () => ({ ok: true, value: { groups: [{ id: 'codex-cli', models: [{ id: 'gpt-6.1-sol' }, { id: 'custom-model' }] }] } }) }, settings: {
      describe: async () => ({ ok: true, value: { namespaces: [row, defaults] } }),
      mutate: async (ns, ops, revision) => { const value = Object.fromEntries(ops.filter(op => op.op === 'set').map(op => [op.path[0], op.value])); writes.push({ ns, value, revision }); defaults = { ns, value, revision: 'd2' }; return { ok: true, value: defaults }; },
      update: async (ns, value, revision) => { writes.push({ ns, value, revision }); const next = { ns, value: { ...(ns === row.ns ? row.value : defaults.value), ...value }, revision: 'r2' }; if (ns === row.ns) row = next; else defaults = next; return { ok: true, value: next }; },
    } },
    connection: { rpc: { call: async (...args) => { if (args[1] === 'status') return { ok: true, value: { namespace: 'harness-codex-cli-link', models: [] } }; assert.equal(args[1], 'accountUsage'); rpcCalls.push(args); return { ok: true, value: { version: 1, state: 'unsupported', account: { type: 'apiKey', email: null, planType: null, workspaceName: null }, usage: null, checkedAt: '2026-11-05T02:00:00Z', message: null } }; } } },
  };
  vm.runInNewContext(await readFile(new URL('../client.js', import.meta.url), 'utf8'), { AbortController, window: { __ModuleLoader__: { load: def => { plugin = def.factory(() => React); } } } });
  assert(plugin.inject.includes('remote'), 'root remote event service must be explicitly injected');
  assert(plugin.inject.includes('remote.session'), 'native session transport must be injected');
  assert(plugin.inject.includes('connection'), 'shared Web/Electron account usage transport must be injected');
  plugin.apply(ctx);
  assert.equal(rpcCalls.length, 0, 'plugin registration alone must not query usage');
  assert(registrations.some(r => r.options.name === 'sidebar.panellist' && r.options.label === 'Providers'));
  const Panel = registrations.find(r => r.options.name === 'main').component;
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => { root.render(React.createElement(Panel)); });
    assert.equal(rpcCalls.length, 1, 'opening the page automatically reads usage once');
    assert.equal(document.querySelector('.hccl-usage').dataset.state, 'unsupported');
    assert.doesNotMatch(document.body.textContent, /仅支持|当前只支持|HARNESS · CLI LINK/);
    assert.equal(document.querySelector('h1').textContent, 'Providers');
    const configure = document.querySelector('.hccl-config-button');
    assert.equal(configure.getAttribute('aria-controls'), 'hccl-codex-details');
    assert.equal(configure.getAttribute('aria-expanded'), 'false');
    assert.equal(document.getElementById('hccl-codex-details').hidden, true);
    assert.equal(document.getElementById('hccl-codex-settings').hidden, false);
    assert.equal(document.getElementById('hccl-codex-usage').hidden, true);
    const modelTab = document.getElementById('hccl-codex-tab-settings');
    assert.equal(modelTab.textContent, '模型');
    assert.equal(modelTab.getAttribute('aria-selected'), 'true');
    await act(async () => { configure.click(); });
    assert.equal(configure.getAttribute('aria-expanded'), 'true');
    assert.equal(document.getElementById('hccl-codex-details').hidden, false);
    assert.equal(document.getElementById('hccl-codex-settings').hidden, false, 'first expansion defaults to the Model tab');
    assert.equal(document.getElementById('hccl-codex-usage').hidden, true);
    assert.equal(modelTab.getAttribute('aria-selected'), 'true');
    assert.equal(document.getElementById('hccl-model').closest('[hidden]'), null);
    assert.match(document.body.textContent, /2 个模型/);
    const model = document.getElementById('hccl-model');
    await act(async () => { model.value = 'custom-model'; model.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
    // An external edit plus catalog refresh must not advance the baseline of a dirty form.
    row = { ...row, revision: 'external-r2', value: { ...row.value, reasoningEffort: 'high' } };
    const refreshModels = document.querySelector('button[aria-label="刷新模型"]');
    assert.equal(refreshModels.closest('.hccl-model-head').querySelector('h3').textContent, '模型与行为');
    assert.equal(refreshModels.textContent, '', 'refresh is icon-only, with an accessible action label');
    await act(async () => { refreshModels.click(); });
    await act(async () => { button('保存配置').click(); });
    assert.equal(writes[0].value.model, 'custom-model'); assert.equal(writes[0].revision, 'r1');
    await act(async () => { button('设为 Harness 默认模型').click(); });
    assert.equal(writes[1].ns, 'agent-default-model'); assert.equal(writes[1].value.model, 'custom-model');
    assert.equal(writes[1].value.provider, 'codex-cli');
    assert.equal(writes[1].revision, 'd1');
    assert.doesNotMatch(document.body.textContent, /跟随插件配置/);
    assert.match(document.body.textContent, /未指定模型时使用/);
    await act(async () => { document.querySelector('[role=switch]').click(); });
    await act(async () => { button('保存配置').click(); });
    assert.equal(writes[2].value.enabled, false);
    assert.match(document.body.textContent, /已保存/);
    assert.equal(button('重新载入'), undefined, 'the discard-and-reload action is removed');
    assert.deepEqual([...document.querySelector('.hccl-actions').querySelectorAll('button')].map(node => node.textContent), ['保存配置', '设为 Harness 默认模型']);
    assert.equal(button('保存配置').disabled, true, 'successful saves still clear the dirty state');
    const notice = document.querySelector('.hccl-ok');
    assert.equal(notice.closest('[role="tabpanel"]').id, 'hccl-codex-settings');
    assert.match(notice.textContent, /已保存默认配置/);
    assert.equal(rpcCalls.length, 1, 'model/settings actions must not add to the automatic entry query');
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = old.window; globalThis.document = old.document; globalThis.IS_REACT_ACT_ENVIRONMENT = old.flag;
  }
});
