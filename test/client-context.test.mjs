import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const ok = value => ({ ok: true, value });
const plain = value => JSON.parse(JSON.stringify(value));
const model = (id, capacity) => ({ id, context: { contextWindow: capacity }, contextSource: 'codex-native-catalog' });
const directory = models => ok({ namespace: 'harness-codex-cli-link', models });

async function withPanel(contextWindows, inspect, options = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, flag: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let plugin, Panel, listener;
  let row = { ns: 'harness-codex-cli-link', revision: 'r1', value: {
    enabled: true, model: 'Exact-A', reasoningEffort: 'default', ...(contextWindows === undefined ? {} : { contextWindows }),
  } };
  const calls = { writes: [], catalog: 0, accounts: 0, status: [], describe: 0 };
  const ctx = {
    slots: { inject: (_name, fn) => fn(), register: (options, component) => { if (options.name === 'main') Panel = component; } },
    remote: {
      $on: (_event, fn) => { listener = fn; return () => {}; },
      session: { modelCatalog: async () => {
        ++calls.catalog;
        // Catalog metadata must not substitute for the independent directory DTO.
        return ok({ groups: [{ id: 'codex-cli', models: [model('Exact-A', 1), { id: 'exact-a' }, { id: 'Model-B' }] }] });
      } },
      settings: {
        describe: async () => { ++calls.describe; return ok({ namespaces: [row] }); },
        update: async (ns, value, revision) => {
          calls.writes.push({ ns, value: plain(value), revision });
          row = { ns, value: plain(value), revision: 'saved-r2' };
          return ok(row);
        },
      },
    },
    connection: { rpc: { call: async (path, method, payload) => {
      assert.equal(path, '/harness-codex-cli-link');
      if (method === 'accountUsage') { ++calls.accounts; return ok({ version: 1, state: 'unsupported' }); }
      assert.equal(method, 'status'); calls.status.push(plain(payload));
      return options.status ? options.status(calls.status.length) : directory([model('Exact-A', 475000), model('Model-B', 200000)]);
    } } },
  };
  vm.runInNewContext(source, { AbortController, window: { __ModuleLoader__: { load: def => { plugin = def.factory(() => React); } } } });
  plugin.apply(ctx);
  const root = createRoot(document.getElementById('root'));
  const save = () => [...document.querySelectorAll('button')].find(node => node.textContent === '保存配置');
  const select = async value => {
    await act(async () => {
      const node = document.getElementById('hccl-model');
      if (![...node.options].some(option => option.value === value)) node.appendChild(new dom.window.Option(value, value));
      node.value = value; node.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  };
  const click = async node => { await act(async () => node.click()); };
  try {
    await act(async () => root.render(options.strict ? React.createElement(React.StrictMode, null, React.createElement(Panel)) : React.createElement(Panel)));
    await click(document.querySelector('.hccl-config-button'));
    await inspect({ save, select, click, calls,
      capacity: () => document.getElementById('hccl-context-capacity').textContent,
      external: async () => {
        row = { ...row, revision: 'external-r2', value: { ...row.value, model: 'exact-a', contextWindows: { 'Exact-A': 7 } } };
        await act(async () => listener());
      },
      unmount: async () => { await act(async () => root.unmount()); },
    });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window = old.window; globalThis.document = old.document; globalThis.IS_REACT_ACT_ENVIRONMENT = old.flag;
  }
}

test('capacity is one plain read-only setting, sourced only from the automatic directory', async () => {
  await withPanel({ 'Exact-A': 131072 }, async ({ capacity, calls, save }) => {
    assert.equal(capacity(), '475,000 tokens');
    const setting = document.getElementById('hccl-context-capacity').closest('.hccl-setting');
    assert.equal(setting.textContent, '上下文容量475,000 tokens');
    assert.equal(setting.children.length, 2);
    assert.equal(setting.querySelector('input, select, small, code, strong'), null);
    assert.equal(document.querySelector('.hccl-context'), null);
    assert.equal(document.getElementById('hccl-context-window'), null);
    assert.equal(document.getElementById('hccl-context-source'), null);
    assert.equal(document.getElementById('hccl-context-model'), null);
    assert.equal(document.querySelector('input[type="number"]'), null);
    assert.doesNotMatch(document.body.textContent, /可用上下文|来源：|手动覆盖|内置回退|服务端已验证上限|上下文容量必须/);
    assert.equal(calls.writes.length, 0); assert.equal(save().disabled, true);
    assert.equal(calls.catalog, 1); assert.equal(calls.accounts, 1);
    assert.deepEqual(calls.status, [{ refresh: false }]);
  });
});

test('selection uses exact IDs and never requests metadata or accounts or writes settings', async () => {
  await withPanel(undefined, async ({ capacity, select, click, calls }) => {
    await select('Model-B'); assert.equal(capacity(), '200,000 tokens');
    await select('exact-a'); assert.equal(capacity(), '未提供');
    await select('unknown/custom'); assert.equal(capacity(), '未提供');
    await click(document.getElementById('hccl-codex-tab-usage'));
    await click(document.getElementById('hccl-codex-tab-settings'));
    document.querySelector('[aria-label="刷新模型"]').dispatchEvent(new window.Event('mouseover', { bubbles: true }));
    assert.equal(calls.catalog, 1); assert.equal(calls.accounts, 1);
    assert.deepEqual(calls.status, [{ refresh: false }]); assert.equal(calls.writes.length, 0);
  });
});

test('unrelated saves preserve legacy context map verbatim without creating one, including dirty tab and refresh changes', async () => {
  for (const map of [undefined, {}, { 'Exact-A': 131072, 'exact-a': 8192, 'unlisted/model': 42000 }]) {
    await withPanel(map, async ({ capacity, select, click, save, calls, external }) => {
      assert.equal(capacity(), '475,000 tokens');
      await select('Model-B');
      await external();
      await click(document.querySelector('[aria-label="刷新模型"]'));
      await click(document.getElementById('hccl-codex-tab-usage'));
      await click(document.querySelector('.hccl-config-button'));
      await click(document.querySelector('.hccl-config-button'));
      await click(document.getElementById('hccl-codex-tab-settings'));
      assert.equal(document.getElementById('hccl-model').value, 'Model-B');
      assert.equal(capacity(), '200,000 tokens'); assert.equal(save().disabled, false);
      assert.equal(calls.writes.length, 0);
      await click(save());
      assert.deepEqual(calls.writes, [{ ns: 'harness-codex-cli-link', revision: 'r1', value: {
        enabled: true, model: 'Model-B', reasoningEffort: 'default', ...(map === undefined ? {} : { contextWindows: map }),
      } }]);
      assert.equal(save().disabled, true); assert.equal(calls.accounts, 1);
      assert.deepEqual(calls.status, [{ refresh: false }, { refresh: false }]);
    });
  }
});

test('refresh clears old capacity immediately, shows loading, and resolves for the newly selected exact model', async () => {
  let resolve;
  await withPanel(undefined, async ({ capacity, select, click, calls }) => {
    assert.equal(capacity(), '475,000 tokens');
    await click(document.querySelector('[aria-label="刷新模型"]'));
    assert.equal(capacity(), '读取中…');
    await select('Model-B'); assert.equal(capacity(), '读取中…');
    await act(async () => resolve(directory([model('Exact-A', 500000), model('Model-B', 250000)])));
    assert.equal(capacity(), '250,000 tokens');
    await select('Exact-A'); assert.equal(capacity(), '500,000 tokens');
    assert.equal(calls.accounts, 1); assert.equal(calls.writes.length, 0);
    assert.deepEqual(calls.status, [{ refresh: false }, { refresh: false }]);
  }, { status: count => count === 1 ? directory([model('Exact-A', 475000)]) : new Promise(done => { resolve = done; }) });
});

test('metadata refresh failure clears old capacity without failing the native connection or leaking errors', async () => {
  await withPanel(undefined, async ({ capacity, click, calls }) => {
    assert.equal(capacity(), '475,000 tokens');
    await click(document.querySelector('[aria-label="刷新模型"]'));
    assert.equal(capacity(), '读取失败，请刷新模型');
    assert.match(document.querySelector('.hccl-provider-sub').textContent, /可用/);
    assert.doesNotMatch(document.body.textContent, /secret-error/);
    assert.equal(calls.writes.length, 0); assert.equal(calls.accounts, 1);
    await click(document.querySelector('[aria-label="刷新模型"]'));
    assert.equal(capacity(), '600,000 tokens');
  }, { status: count => {
    if (count === 2) throw new Error('secret-error');
    return directory([model('Exact-A', count === 1 ? 475000 : 600000)]);
  } });
});

test('malformed status DTOs fail closed rather than guessing from catalog or saved manual values', async () => {
  for (const result of [null, [], { ok: 1, value: {} }, ok({ version: 1, state: 'ready' }),
    ok({ namespace: 'other', models: [] }), ok({ namespace: 'harness-codex-cli-link', models: {} }),
    { ok: false, error: { message: 'secret-error' } }]) {
    await withPanel({ 'Exact-A': 131072 }, async ({ capacity, calls }) => {
      assert.equal(capacity(), '读取失败，请刷新模型');
      assert.doesNotMatch(document.body.textContent, /secret-error/);
      assert.equal(calls.writes.length, 0);
    }, { status: () => result });
  }
});

test('absent, nonautomatic, and invalid capacities are unknown, never taken from legacy overrides', async () => {
  for (const entry of [
    { id: 'Exact-A', contextSource: 'explicit-override', context: { contextWindow: 131072 } },
    { id: 'Exact-A', context: { contextWindow: 475000 } },
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '475000', null].map(value => model('Exact-A', value)),
    model('exact-a', 475000), null, [],
  ]) {
    await withPanel({ 'Exact-A': 131072 }, async ({ capacity, calls }) => {
      assert.equal(capacity(), '未提供'); assert.equal(calls.writes.length, 0);
    }, { status: () => directory([entry]) });
  }
});

test('late directory response after unmount is ignored', async () => {
  let resolve;
  await withPanel(undefined, async ({ capacity, click, unmount, calls }) => {
    await click(document.querySelector('[aria-label="刷新模型"]'));
    assert.equal(capacity(), '读取中…');
    await unmount();
    await act(async () => resolve(directory([model('Exact-A', 1)])));
    assert.equal(document.getElementById('hccl-context-capacity'), null);
    assert.equal(calls.writes.length, 0); assert.equal(calls.accounts, 1);
  }, { status: count => count === 1 ? directory([model('Exact-A', 475000)]) : new Promise(done => { resolve = done; }) });
});

test('StrictMode discarded catalog request cannot duplicate directory metadata reads', async () => {
  await withPanel(undefined, async ({ capacity, calls }) => {
    assert.equal(capacity(), '475,000 tokens'); assert.equal(calls.status.length, 1); assert.equal(calls.accounts, 1);
  }, { strict: true });
});
