import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { createUsageService, createUsageHandler } from '../usage-service.mjs';
import { USAGE_MESSAGES } from '../account-usage.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const snapshot = () => ({ version: 1, state: 'ready', account: { type: 'chatgpt', email: 'a***@example.test' },
  usage: { rateLimits: [{ id: 'codex', primary: { usedPercent: 10 } }] }, checkedAt: '2026-01-01T00:00:00.000Z', message: null });
const isCancelled = error => {
  assert.equal(error.name, 'AbortError');
  assert.equal(error.message, 'Account usage read cancelled');
  assert.doesNotMatch(String(error), /PRIVATE|secret|token/);
  return true;
};
const owner = signal => ({ principal: { kind: 'owner' }, ...(signal ? { signal } : {}) });

function fixture() {
  const reads = [];
  const service = createUsageService(({ signal }) => {
    const gate = deferred();
    reads.push({ signal, ...gate });
    return gate.promise;
  });
  return { service, reads };
}

function failure(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  assert.equal(typeof result.error.message, 'string');
  assert.deepEqual(result.error.details, {});
  assert.deepEqual(Object.keys(result).sort(), ['error', 'ok']);
  assert.deepEqual(Object.keys(result.error).sort(), ['code', 'details', 'message']);
}

test('service deduplicates only concurrent reads and gives every listener a detached result', async t => {
  const f = fixture(); t.after(() => f.service.close());
  const first = f.service.get(), second = f.service.get();
  await flush(); assert.equal(f.reads.length, 1);
  const raw = snapshot(); f.reads[0].resolve(raw);
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, raw); assert.deepEqual(b, raw);
  assert.notStrictEqual(a, b); assert.notStrictEqual(a, raw);
  assert.notStrictEqual(a.usage, b.usage); assert.notStrictEqual(a.usage.rateLimits, raw.usage.rateLimits);
  a.account.email = 'mutated'; a.usage.rateLimits[0].primary.usedPercent = 99;
  assert.equal(b.account.email, 'a***@example.test');
  assert.equal(b.usage.rateLimits[0].primary.usedPercent, 10);
  assert.equal(raw.usage.rateLimits[0].primary.usedPercent, 10);
  const third = f.service.get(); await flush(); assert.equal(f.reads.length, 2);
  f.reads[1].resolve(raw); const c = await third;
  assert.notStrictEqual(c, b); assert.notStrictEqual(c.usage, b.usage);
  assert.equal(c.usage.rateLimits[0].primary.usedPercent, 10);
});

test('cancelling one listener is independent and removes its abort listener', async t => {
  const f = fixture(); t.after(() => f.service.close());
  const a = new AbortController(), b = new AbortController();
  const first = f.service.get(a.signal), second = f.service.get(b.signal);
  const rejected = assert.rejects(first, isCancelled);
  await flush();
  assert.equal(getEventListeners(a.signal, 'abort').length, 1);
  a.abort(new Error('PRIVATE_TOKEN'));
  await rejected;
  assert.equal(f.reads[0].signal.aborted, false);
  assert.equal(getEventListeners(a.signal, 'abort').length, 0);
  f.reads[0].resolve(snapshot()); await second;
  assert.equal(getEventListeners(b.signal, 'abort').length, 0);
  b.abort(); assert.equal(f.reads[0].signal.aborted, false);
});

test('all cancelled listeners abort the shared read; the next read starts fresh immediately', async t => {
  const f = fixture(); t.after(() => f.service.close());
  const a = new AbortController(), b = new AbortController();
  const first = f.service.get(a.signal), second = f.service.get(b.signal);
  const firstRejected = assert.rejects(first, isCancelled), secondRejected = assert.rejects(second, isCancelled);
  await flush();
  a.abort(); assert.equal(f.reads[0].signal.aborted, false);
  b.abort(); await Promise.all([firstRejected, secondRejected]);
  assert.equal(f.reads[0].signal.aborted, true);
  const third = f.service.get(); await flush();
  assert.equal(f.reads.length, 2); assert.equal(f.reads[1].signal.aborted, false);
  // A late result from the discarded read must not clear or settle the new entry.
  f.reads[0].resolve({ state: 'STALE' }); await flush();
  const fourth = f.service.get(); await flush(); assert.equal(f.reads.length, 2);
  f.reads[1].resolve(snapshot());
  const [c, d] = await Promise.all([third, fourth]);
  assert.equal(c.state, 'ready'); assert.equal(d.state, 'ready'); assert.notStrictEqual(c, d);
});

test('pre-aborted and same-tick all-cancelled callers never launch a backend read', async t => {
  let reads = 0;
  const service = createUsageService(async () => { reads++; return snapshot(); });
  t.after(() => service.close());
  const aborted = new AbortController(); aborted.abort('PRIVATE');
  await assert.rejects(service.get(aborted.signal), isCancelled);
  const controller = new AbortController();
  const pending = service.get(controller.signal), rejected = assert.rejects(pending, isCancelled);
  controller.abort('PRIVATE'); await rejected; await flush();
  assert.equal(reads, 0);
  assert.equal((await service.get()).state, 'ready'); assert.equal(reads, 1);
});

test('backend errors are fixed and not cached; later calls can recover', async t => {
  const f = fixture(); t.after(() => f.service.close());
  const first = f.service.get();
  const rejected = assert.rejects(first, error => {
    assert.equal(error.message, 'Account usage unavailable');
    assert.doesNotMatch(String(error), /PRIVATE|sk-|https:/); return true;
  });
  await flush(); f.reads[0].reject(new Error('PRIVATE sk-secret https://credentials.test'));
  await rejected;
  const second = f.service.get(); await flush(); assert.equal(f.reads.length, 2);
  f.reads[1].resolve(snapshot()); assert.equal((await second).state, 'ready');
});

test('uncloneable backend values fail closed instead of leaking raw objects', async t => {
  const service = createUsageService(async () => ({ secret: () => 'PRIVATE' }));
  t.after(() => service.close());
  await assert.rejects(service.get(), error => error.message === 'Account usage unavailable');
});

test('close is final/idempotent and rejects all listeners while aborting the underlying read', async () => {
  const f = fixture(), a = new AbortController(), b = new AbortController();
  const first = f.service.get(a.signal), second = f.service.get(b.signal);
  const rejected = [assert.rejects(first, isCancelled), assert.rejects(second, isCancelled)];
  await flush(); f.service.close(); f.service.close();
  await Promise.all(rejected);
  assert.equal(f.reads[0].signal.aborted, true);
  assert.equal(getEventListeners(a.signal, 'abort').length, 0);
  assert.equal(getEventListeners(b.signal, 'abort').length, 0);
  await assert.rejects(f.service.get(), isCancelled);
  f.reads[0].resolve(snapshot()); await flush();
  await assert.rejects(f.service.get(), isCancelled); assert.equal(f.reads.length, 1);
});

test('close before the launch microtask does not invoke read and cannot be reopened', async () => {
  let reads = 0;
  const service = createUsageService(() => { reads++; return snapshot(); });
  const pending = service.get(), rejected = assert.rejects(pending, isCancelled);
  service.close(); await rejected; await flush();
  await assert.rejects(service.get(), isCancelled); assert.equal(reads, 0);
});

test('handler accepts only an empty owner request and returns the RemoteResult success envelope', async () => {
  const raw = snapshot(); let seenSignal, reads = 0;
  const handler = createUsageHandler({ get: async signal => { reads++; seenSignal = signal; return raw; } });
  const result = await handler({}, undefined, owner());
  assert.deepEqual(result, { ok: true, value: raw }); assert.equal(reads, 1);
  assert(seenSignal instanceof AbortSignal); assert.equal(seenSignal.aborted, false);
});

test('handler rejects command/account/token/config/credit inputs before any backend call', async () => {
  let reads = 0;
  const handler = createUsageHandler({ get: () => { reads++; throw new Error('must not run'); } });
  const payloads = [undefined, null, [], '', '{}', false, 0, 1,
    { command: 'account/login/start' }, { method: 'turn/start', params: {} }, { token: 'PRIVATE_TOKEN' },
    { accountId: 'PRIVATE_ACCOUNT' }, { creditId: 'PRIVATE_CREDIT' }, { upsell: true },
    { config: { token: 'PRIVATE_TOKEN' } }, { signal: null }];
  for (const payload of payloads) {
    const result = await handler(payload, undefined, owner());
    failure(result, 'codex/bad-request'); assert.doesNotMatch(JSON.stringify(result), /PRIVATE|turn\/start|account\/login/);
  }
  assert.equal(reads, 0);
});

test('handler denies missing, remote and read-only peers before invoking backend or validating payload', async () => {
  let reads = 0;
  const handler = createUsageHandler({ get: () => { reads++; return snapshot(); } });
  const revoked = new AbortController(); revoked.abort();
  const peers = [undefined, null, {}, { principal: null }, { principal: { kind: 'remote' } },
    { principal: { kind: 'readOnly' } }, { principal: { kind: 'read-only' } }, owner(revoked.signal)];
  for (const peer of peers) {
    failure(await handler({}, undefined, peer), 'codex/forbidden');
    failure(await handler({ token: 'PRIVATE' }, undefined, peer), 'codex/forbidden');
  }
  assert.equal(reads, 0);
});

test('handler merges request and peer cancellation and removes both listeners afterward', async t => {
  for (const cancelPeer of [false, true]) {
    const request = new AbortController(), peer = new AbortController();
    let merged; const started = deferred();
    const service = createUsageService(({ signal }) => {
      merged = signal; started.resolve();
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('PRIVATE')), { once: true }));
    });
    t.after(() => service.close());
    const pending = createUsageHandler(service)({}, request.signal, owner(peer.signal));
    await started.promise;
    assert.notStrictEqual(merged, request.signal); assert.notStrictEqual(merged, peer.signal);
    assert.equal(getEventListeners(request.signal, 'abort').length, 1);
    assert.equal(getEventListeners(peer.signal, 'abort').length, 1);
    (cancelPeer ? peer : request).abort('PRIVATE_TOKEN');
    failure(await pending, 'codex/cancelled'); assert.equal(merged.aborted, true);
    assert.equal(getEventListeners(request.signal, 'abort').length, 0);
    assert.equal(getEventListeners(peer.signal, 'abort').length, 0);
  }
});

test('handler handles duplicate signals, completion cleanup and a pre-aborted request without a backend read', async t => {
  const controller = new AbortController(); let reads = 0;
  const service = createUsageService(async () => { reads++; return snapshot(); });
  t.after(() => service.close()); const handler = createUsageHandler(service);
  assert.equal((await handler({}, controller.signal, owner(controller.signal))).ok, true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  controller.abort(new Error('PRIVATE'));
  failure(await handler({}, controller.signal, owner()), 'codex/cancelled');
  assert.equal(reads, 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('handler replaces backend errors with the fixed unavailable RemoteResult and cleans up signals', async () => {
  const request = new AbortController(), peer = new AbortController();
  for (const error of [new Error('PRIVATE_TOKEN sk-secret https://secret.test'), Object.assign(new Error('PRIVATE'), { name: 'AbortError' })]) {
    const handler = createUsageHandler({ get: async () => { throw error; } });
    const result = await handler({}, request.signal, owner(peer.signal));
    failure(result, 'codex/unavailable'); assert.equal(result.error.message, USAGE_MESSAGES.unavailable);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|sk-secret|https:/);
    assert.equal(getEventListeners(request.signal, 'abort').length, 0);
    assert.equal(getEventListeners(peer.signal, 'abort').length, 0);
  }
});

test('handler discards a result if peer revocation wins the final resolution race', async () => {
  const peer = new AbortController();
  const handler = createUsageHandler({ get: async () => { peer.abort('PRIVATE'); return snapshot(); } });
  failure(await handler({}, undefined, owner(peer.signal)), 'codex/cancelled');
  assert.equal(getEventListeners(peer.signal, 'abort').length, 0);
});
