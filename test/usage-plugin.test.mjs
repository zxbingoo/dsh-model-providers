import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../index.mjs';
import { CodexRpc } from '../rpc.mjs';

test('plugin mounts the owner-only account endpoint without starting account reads at apply', async () => {
  let handler; const disposers = [];
  const ctx = {
    llm: { registerAdapter: () => Object.assign(() => {}, { replace() {} }) },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
    on() {},
    inject(services, callback) {
      if (services[0] === 'connection') {
        assert.deepEqual(services, ['connection', 'webServer'], 'RPC registration must wait for the HTTP server as well as Connection');
        const child = { connection: { register(owner, channel, fn) {
          assert.equal(owner, child, 'the explicit route owner must be the consumer context, not Connection provider context');
          assert.equal(channel, '/harness-codex-cli-link'); handler = fn;
        } } };
        callback(child);
      }
    },
  };
  apply(ctx, { enabled: false });
  try {
    assert.equal(typeof handler, 'function');
    assert.equal((await handler('accountUsage', {})).error.code, 'codex/forbidden');
    assert.equal((await handler('accountUsage', {}, undefined, { principal: { kind: 'remote' } })).error.code, 'codex/forbidden');
    const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal };
    for (const payload of [undefined, null, [], { command: 'codex' }, { refresh: true }, { method: 'account/login/start' }]) {
      const result = await handler('accountUsage', payload, undefined, owner);
      assert.equal(result.error.code, 'codex/bad-request');
    }
    assert.equal((await handler('account/rateLimitResetCredit/consume', {}, undefined, owner)).error.code, 'codex/not-found');
  } finally { for (const dispose of disposers.reverse()) dispose(); }
});

test('usage initialization opts out of automatic gateway login without changing ordinary inference initialization', async () => {
  const calls = [], sent = [];
  const rpc = Object.create(CodexRpc.prototype);
  rpc.call = async (...args) => { calls.push(args); };
  rpc.send = value => sent.push(value);
  await rpc.initialize({ explicitGatewayOauth: true, timeoutMs: 10000 });
  assert.equal(calls[0][0], 'initialize');
  assert.deepEqual(calls[0][1].capabilities, { experimentalApi: true, explicitGatewayOauth: true });
  assert.equal(calls[0][2], 10000);
  assert.deepEqual(sent[0], { method: 'initialized', params: {} });
  await rpc.initialize();
  assert.deepEqual(calls[1][1].capabilities, { experimentalApi: true });
  assert.equal(calls[1][2], 30000);
});
