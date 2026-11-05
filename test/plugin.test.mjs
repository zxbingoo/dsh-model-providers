import test from 'node:test';
import assert from 'node:assert/strict';
import { Config } from '../config.mjs';
import { apply, createCodexAdapter } from '../index.mjs';

test('host registers authenticated status channel and reacts to volatile config updates', async () => {
  const config = Config({ enabled: false, model: 'custom', reasoningEffort: 'high' });
  let adapter, handler, event, replaced = 0; const disposers = [];
  const ctx = {
    fiber: { entry: { options: { id: 'custom-entry-id' } } },
    llm: { registerAdapter: (providers, value) => { adapter = value; const dispose = () => {}; dispose.replace = () => replaced++; return dispose; } },
    effect: fn => { const d = fn(); if (typeof d === 'function') disposers.push(d); },
    on: (name, fn) => { assert.equal(name, 'loader/volatile-update'); event = fn; },
    inject: (services, fn) => {
      if (services[0] === 'settings') fn({ effect: fn => fn(), settings: { configure: () => () => {} } });
      if (services[0] === 'connection') {
        assert.deepEqual(services, ['connection', 'webServer']);
        const child = { connection: { register: (owner, channel, fn) => {
          assert.equal(owner, child);
          assert.equal(channel, '/harness-codex-cli-link');
          handler = fn;
        } } };
        fn(child);
      }
    },
  };
  apply(ctx, config);
  try {
    assert.deepEqual(await adapter.listModels('codex-cli'), []);
    assert.equal((await adapter.resolveModel('codex-cli', 'configured')).id, 'configured');
    const chunks = []; for await (const c of adapter.stream({ model: 'configured' })) chunks.push(c);
    assert.equal(chunks[0].reason.failure.code, 'CODEX_DISABLED');
    event([['enabled']]); assert.equal(replaced, 1);
    assert.equal((await handler('other', {})).error.code, 'codex/not-found');
    assert.equal((await handler('status', { refresh: 'yes' })).error.code, 'codex/unavailable');
  } finally { for (const dispose of disposers.reverse()) dispose(); }
});

const catalog = [
  { id: 'vision-model', name: 'Vision Model', inputModalities: ['text', 'image'], reasoning: { efforts: [{ id: 'high', name: 'High' }] } },
  { id: 'text-model', name: 'Text Model', inputModalities: ['text'] },
];
function fixture(t, config = {}) {
  const calls = [], prepared = [];
  let discoveries = 0;
  const { adapter } = createCodexAdapter(config, {
    discover: async () => { discoveries++; return structuredClone(catalog); },
    fingerprint: async () => 'test-config',
    prepare: async (model, metadata) => { prepared.push({ model, metadata }); return { args: [], cwd: '/tmp', cleanup() {} }; },
    rpcFactory: handlers => ({
      async initialize() {},
      async call(method, params) {
        calls.push({ method, params });
        if (method === 'thread/start') return { thread: { id: 'thread' } };
        if (method === 'turn/start') {
          queueMicrotask(() => handlers.onNotification({ method: 'turn/completed', params: { threadId: 'thread', turnId: 'turn', turn: { id: 'turn', status: 'completed' } } }));
          return { turn: { id: 'turn' } };
        }
        return {};
      },
      close() { handlers.onClose(new Error('Closed')); },
    }),
  });
  t.after(() => adapter.close());
  return { adapter, calls, prepared, get discoveries() { return discoveries; } };
}
const request = model => ({ ...(model === undefined ? {} : { model }), sessionId: 'test', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] });
async function finish(stream) { let reason; for await (const chunk of stream) if (chunk.type === 'finish') reason = chunk.reason; return reason; }

test('host picker advertises only concrete model IDs with unmodified capabilities', async t => {
  const f = fixture(t, { model: 'vision-model' });
  const models = await f.adapter.listModels('codex-cli');
  assert.deepEqual(models, catalog.map(m => ({ ...m, provider: 'codex-cli' })));
  assert(!models.some(m => m.id === 'configured' || m.name.includes('跟随插件配置')));
  assert.equal(new Set(models.map(m => m.id)).size, models.length);
  assert.equal(f.discoveries, 1);
});

test('custom default appears once under its real ID with capabilities unknown', async t => {
  const f = fixture(t, { model: 'custom-default' });
  const models = await f.adapter.listModels('codex-cli');
  assert.deepEqual(models[0], { provider: 'codex-cli', id: 'custom-default', name: 'custom-default' });
  assert.equal(models.filter(m => m.id === 'custom-default').length, 1);
  assert(!models.some(m => m.id === 'configured'));
});

test('absent model uses the plugin default, explicit selection is not overridden', async t => {
  const config = { model: 'vision-model' };
  const f = fixture(t, config);
  assert.equal((await f.adapter.resolveModel('codex-cli', undefined)).id, 'vision-model');
  assert.equal((await finish(f.adapter.stream(request()))).kind, 'stop');
  assert.equal(f.prepared[0].model, 'vision-model');
  assert.deepEqual(f.prepared[0].metadata.inputModalities, ['text', 'image']);
  config.model = 'text-model';
  assert.equal((await finish(f.adapter.stream(request('vision-model')))).kind, 'stop');
  assert.equal(f.prepared[1].model, 'vision-model');
  assert.equal((await finish(f.adapter.stream(request()))).kind, 'stop');
  assert.equal(f.prepared[2].model, 'text-model');
});

test('prepared fallback captures its real model and capabilities before settings change', async t => {
  const config = { model: 'vision-model' };
  const f = fixture(t, config);
  const prepared = await f.adapter.prepareCall('codex-cli', undefined);
  assert.equal(prepared.model.id, 'vision-model');
  config.model = 'text-model';
  assert.equal((await finish(prepared.stream(request()))).kind, 'stop');
  assert.equal(f.prepared[0].model, 'vision-model');
  assert.deepEqual(f.prepared[0].metadata.inputModalities, ['text', 'image']);
  const picked = await f.adapter.prepareCall('codex-cli', 'text-model');
  config.model = 'vision-model';
  assert.equal((await finish(picked.stream(request('text-model')))).kind, 'stop');
  assert.equal(f.prepared[1].model, 'text-model');
});

test('old configured sessions remain resolvable without exposing another picker entry', async t => {
  const f = fixture(t, { model: 'vision-model' });
  const info = await f.adapter.resolveModel('codex-cli', 'configured');
  assert.equal(info.id, 'configured'); assert.equal(info.name, 'Vision Model');
  assert.deepEqual(info.inputModalities, ['text', 'image']);
  const prepared = await f.adapter.prepareCall('codex-cli', 'configured');
  assert.equal((await finish(prepared.stream(request('configured')))).kind, 'stop');
  assert.equal(f.prepared[0].model, 'vision-model');
  assert(!(await f.adapter.listModels('codex-cli')).some(m => m.id === 'configured'));
});

test('disabled plugin neither discovers models nor falls back to another model', async t => {
  const f = fixture(t, { enabled: false, model: 'vision-model' });
  assert.deepEqual(await f.adapter.listModels('codex-cli'), []);
  assert.equal((await finish(f.adapter.stream(request()))).failure.code, 'CODEX_DISABLED');
  await assert.rejects(f.adapter.prepareCall('codex-cli', undefined), { code: 'CODEX_DISABLED' });
  assert.equal(f.discoveries, 0); assert.equal(f.calls.length, 0);
});

test('host migrates a legacy native default to a concrete model and invalidates the catalog', async () => {
  let replacement = 0; const writes = [], disposers = [];
  const ctx = {
    llm: { registerAdapter: () => { const dispose = () => {}; dispose.replace = () => replacement++; return dispose; } },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
    on() {},
    inject(services, fn) {
      if (services[0] === 'agentDefaultModel') fn({ effect: callback => ctx.effect(callback), agentDefaultModel: {
        currentSelection: () => ({ provider: 'codex-cli', model: 'configured' }),
        saveSelection: async value => { writes.push(value); },
      } });
    },
  };
  apply(ctx, { model: 'vision-model' });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(writes, [{ provider: 'codex-cli', model: 'vision-model' }]);
    assert.equal(replacement, 1);
  } finally { for (const dispose of disposers.reverse()) dispose(); }
});
