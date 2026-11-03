import test from 'node:test';
import assert from 'node:assert/strict';
import { Config } from '../config.mjs';
import { apply } from '../index.mjs';

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
      if (services[0] === 'connection') fn({ connection: { rpc: { handle: (channel, fn) => { assert.equal(channel, '/harness-codex-cli-link'); handler = fn; } } } });
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
