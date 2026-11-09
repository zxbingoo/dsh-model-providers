import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeModelContexts } from '../model-context.mjs';
import { createRuntime } from '../runtime.mjs';

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
  assert.equal(result.get('second').context.contextWindow, 180000);
  assert.equal(result.get('max-only').context.contextWindow, 95000);
  for (const id of ['unknown', 'bad', 'invalid', 'FIRST', 'first-new']) assert(!result.has(id));
  assert.equal(result.get('first').contextSource, 'codex-native-catalog');
  assert.equal(catalog.models[0].context_window, 100000);
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
  assert.equal(models[0].context.contextWindow, 200000);
  assert.equal(models[1].context, undefined);
  assert.equal(models.length, 2);
  assert.deepEqual(calls.map(c => c.method), ['model/list', 'config/read']);
});
