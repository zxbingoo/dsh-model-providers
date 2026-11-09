import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeModelContexts } from '../model-context.mjs';
import { createRuntime } from '../runtime.mjs';
import { constructIsolatedCatalog } from '../isolation/isolation.mjs';

test('native catalog computes CLI usable windows with exact slugs, config clamp and reserved percentage', () => {
  const catalog = { models: [
    { slug: 'first', context_window: 100000, max_context_window: 200000, effective_context_window_percent: 95 },
    { slug: 'second', context_window: 200000, max_context_window: 400000, effective_context_window_percent: 90 },
    { slug: 'max-only', max_context_window: 100000 },
    { slug: 'unknown' }, { slug: 'bad', context_window: '100000' },
    { slug: 'invalid', context_window: 100000, effective_context_window_percent: 101 },
  ] };
  const result = nativeModelContexts(catalog, { model: 'first', model_context_window: 300000 });
  assert.equal(result.get('first').context.contextWindow, 190000);
  assert.equal(result.get('second').context.contextWindow, 270000);
  assert.equal(result.get('unknown').context.contextWindow, 285000);
  assert.equal(result.get('bad').context.contextWindow, 285000);
  assert.equal(result.get('max-only').context.contextWindow, 95000);
  for (const id of ['invalid', 'FIRST', 'first-new']) assert(!result.has(id));
  assert.equal(result.get('first').contextSource, 'codex-native-catalog');
  assert.equal(catalog.models[0].context_window, 100000);
});
test('execution catalog carries exactly the displayed CLI usable budget instead of stale template capacity', () => {
  const native = nativeModelContexts({ models: [{ slug: 'target', context_window: 500000, max_context_window: 872000, effective_context_window_percent: 95 }] }, { model: 'different-default', model_context_window: 1000000 }).get('target');
  assert.equal(native.context.contextWindow, 828400);
  const entry = constructIsolatedCatalog({ models: [{ slug: 'old-template', context_window: 272000, max_context_window: 272000, effective_context_window_percent: 80 }] }, 'target', { id: 'target', ...native }).models[0];
  assert.equal(entry.context_window, 872000);
  assert.equal(entry.max_context_window, 872000);
  assert.equal(entry.effective_context_window_percent, 95);
  assert.equal(Number(BigInt(entry.context_window) * BigInt(entry.effective_context_window_percent) / 100n), native.context.contextWindow);
});
test('execution pins the same nominal snapshot even if global config changes after discovery', async () => {
  let written;
  const runtime = createRuntime({ env: { CODEX_HOME: '/fake' }, assertVersion: () => {}, tempDir: () => '/tmp',
    fs: { stat: async () => { throw Object.assign(new Error(), { code: 'ENOENT' }); }, realpath: async p => p,
      mkdtemp: async () => '/tmp/dsh-codex-bridge-capacity-pin', rm: async () => {}, writeFile: async (_p, data) => { written = JSON.parse(data); } },
    loadCatalog: async () => ({ models: [{ slug: 'old', context_window: 272000, max_context_window: 272000 }] }),
  });
  const metadata = nativeModelContexts({ models: [{ slug: 'target', context_window: 500000, max_context_window: 872000 }] }, { model_context_window: 1000000 }).get('target');
  const isolation = await runtime.prepareIsolation('target', { id: 'target', ...metadata });
  assert(isolation.args.includes('model_context_window=872000'));
  const entry = written.models[0];
  for (const changedGlobal of [100000, 2000000]) {
    const pinnedOverride = Number(isolation.args.find(x => x.startsWith('model_context_window=')).split('=')[1]);
    assert.notEqual(pinnedOverride, changedGlobal);
    const effective = Math.min(pinnedOverride, entry.max_context_window);
    assert.equal(Number(BigInt(effective) * BigInt(entry.effective_context_window_percent) / 100n), metadata.context.contextWindow);
  }
  await isolation.cleanup();
});
test('missing native maximum remains null instead of inheriting the execution template maximum', () => {
  const metadata = nativeModelContexts({ models: [{ slug: 'target', context_window: 500000 }] }, {}).get('target');
  assert.equal(metadata.codexContext.maxContextWindow, null);
  const entry = constructIsolatedCatalog({ models: [{ slug: 'old', context_window: 100000, max_context_window: 100000 }] }, 'target', { id: 'target', ...metadata }).models[0];
  assert.equal(entry.max_context_window, null);
  assert.equal(entry.context_window, 500000);
});
test('integer context math does not round one token upward at large safe boundaries', () => {
  const n = Number.MAX_SAFE_INTEGER;
  const result = nativeModelContexts({ models: [{ slug: 'large', context_window: n, effective_context_window_percent: 95 }] });
  assert.equal(result.get('large').context.contextWindow, Number(BigInt(n) * 95n / 100n));
});
test('discovery automatically projects native CLI capacities only onto matching model/list entries', async () => {
  const calls = [];
  const runtime = createRuntime({ env: { CODEX_HOME: '/fake' }, assertVersion: () => {}, tempDir: () => '/tmp',
    fs: { stat: async () => { throw Object.assign(new Error(), { code: 'ENOENT' }); }, realpath: async p => p, mkdtemp: async () => '/tmp/dsh-codex-bridge-context', rm: async () => {} },
    readModelCatalog: async opts => {
      assert(!opts.args.some(a => a.startsWith('model_catalog_json=')));
      return { models: [{ slug: 'new-model', context_window: 200000, effective_context_window_percent: 100 }, { slug: 'not-discovered', context_window: 300000 }] };
    },
    rpcFactory: () => ({ initialize: async () => {}, close: async () => {}, call: async (method, params) => {
      calls.push({ method, params });
      if (method === 'model/list') return { data: [{ model: 'new-model' }, { model: 'unknown' }] };
      assert.equal(method, 'config/read'); return { config: { model: 'another', model_context_window: 1000000 } };
    } }),
  });
  const models = await runtime.discoverModels();
  assert.equal(models[0].context.contextWindow, 1000000);
  assert.equal(models[1].context, undefined);
  assert.equal(models.length, 2);
  assert.deepEqual(calls.map(c => c.method), ['model/list', 'config/read']);
});
