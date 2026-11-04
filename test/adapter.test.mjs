import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexCliAdapter } from '../adapter.mjs';

const text = text => ({ type: 'text', text });
const options = extra => ({ model: 'mock-model', sessionId: 'session-a', system: 'system', messages: [{ role: 'user', content: [text('hello')] }], tools: [{ name: 'lookup', description: 'lookup', parameters: { type: 'object' } }], ...extra });
const collect = async stream => { const chunks = []; for await (const chunk of stream) chunks.push(chunk); return chunks; };
const blocks = chunks => chunks.filter(c => c.type === 'block-end').map(c => c.block);
const finish = chunks => chunks.at(-1).reason;
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, { script = () => {}, ...config } = {}) {
  const rpcs = []; let cleaned = 0;
  const adapter = new CodexCliAdapter({ idleTimeoutMs: 100, ...config,
    prepareIsolation: async () => ({ args: ['mock-only'], cwd: '/tmp', cleanup: () => { cleaned++; } }),
    rpcFactory: handlers => {
      const rpc = { handlers, calls: [], closed: 0, results: [], requests: [],
        async initialize() {},
        async call(method, params) {
          this.calls.push({ method, params });
          if (method === 'thread/start') return { thread: { id: 'thread' } };
          if (method === 'turn/start') { queueMicrotask(() => script(this)); return { turn: { id: 'turn' } }; }
          return {};
        },
        notify(method, params = {}) { handlers.onNotification({ method, params: { threadId: 'thread', turnId: 'turn', ...params } }); },
        complete(status = 'completed') { this.notify('turn/completed', { turn: { id: 'turn', status } }); },
        tool(args = { q: 1 }, overrides = {}) {
          const promise = handlers.onRequest({ id: this.requests.length + 1, method: 'item/tool/call', params: { threadId: 'thread', turnId: 'turn', tool: 'lookup', arguments: args, ...overrides } });
          this.requests.push(promise);
          // Observe rejection immediately, as the real RPC transport does.
          promise.then(value => this.results.push(value), error => this.results.push({ error }));
          return promise;
        },
        close() { this.closed++; handlers.onClose(new Error('mock closed')); }
      };
      rpcs.push(rpc); return rpc;
    }
  });
  t.after(() => adapter.close());
  return { adapter, rpcs, get cleaned() { return cleaned; } };
}
function continuation(o, chunks, value = 'result', extra = {}) {
  const content = blocks(chunks);
  return { ...o, messages: [...o.messages, { role: 'assistant', content }, { role: 'tool', toolCallId: content.at(-1).id, content: [text(value)], isError: false }], ...extra };
}

test('text/reasoning stream, usage, complete role-tagged history and schema contract', async t => {
  const f = fixture(t, { script(rpc) {
    rpc.notify('item/agentMessage/delta', { itemId: 'wrong', delta: 'WRONG', threadId: 'other' });
    rpc.notify('item/reasoning/textDelta', { itemId: 'r', delta: 'think' });
    rpc.notify('item/agentMessage/delta', { itemId: 'm', delta: 'hel' });
    rpc.notify('item/agentMessage/delta', { itemId: 'm', delta: 'lo' });
    rpc.notify('thread/tokenUsage/updated', { tokenUsage: { last: { inputTokens: 2, outputTokens: 3, totalTokens: 5, cachedInputTokens: 1 } } });
    rpc.notify('turn/completed', { turn: { id: 'other', status: 'failed' } });
    rpc.complete();
  } });
  const o = options({ messages: [{ role: 'user', content: [text('old')] }, { role: 'assistant', content: [text('answer')] }, { role: 'user', content: [text('new')] }] });
  const chunks = await collect(f.adapter.stream(o));
  assert.deepEqual(blocks(chunks), [{ type: 'reasoning', text: 'think' }, text('hello')]);
  assert.equal(finish(chunks).kind, 'stop');
  assert.deepEqual(chunks.find(c => c.type === 'usage').usage, { inputTokens: 2, outputTokens: 3, totalTokens: 5, cacheReadTokens: 1 });
  const rpc = f.rpcs[0];
  assert.deepEqual(rpc.calls[0].params.dynamicTools[0].inputSchema, o.tools[0].parameters);
  assert.deepEqual(JSON.parse(rpc.calls[1].params.input[0].text).messages, o.messages);
  assert.equal(rpc.closed, 1); assert.equal(f.cleaned, 1);
});

test('oversized rebuilt history requests host compaction before allocating RPC, then compacted retry succeeds', async t => {
  const f = fixture(t, { script: rpc => rpc.complete() });
  const chunks = await collect(f.adapter.stream(options({ messages: [{ role: 'user', content: [text('x'.repeat(1048576))] }] })));
  assert.equal(finish(chunks).failure.code, 'CONTEXT_WINDOW_EXCEEDED');
  assert.match(finish(chunks).failure.message, /compact/);
  assert.equal(f.rpcs.length, 0);
  assert.equal(f.adapter.active.size, 0);
  assert.equal(finish(await collect(f.adapter.stream(options()))).kind, 'stop');
});

test('multiple Harness tool steps resolve original RPC and continue the same turn', async t => {
  const f = fixture(t, { script(rpc) {
    rpc.notify('item/agentMessage/delta', { itemId: 'm', delta: 'before' });
    rpc.tool('{"q":1}').then(() => rpc.tool({ q: 2 })).then(() => {
      rpc.notify('item/agentMessage/delta', { itemId: 'end', delta: 'done' }); rpc.complete();
    }).catch(() => {});
  } });
  const o = options();
  const first = await collect(f.adapter.stream(o));
  assert.equal(finish(first).kind, 'tool-calls'); assert.equal(f.rpcs[0].closed, 0);
  assert.equal(blocks(first).at(-1).arguments, '{"q":1}');
  const secondOptions = continuation(o, first);
  const second = await collect(f.adapter.stream(secondOptions));
  assert.equal(finish(second).kind, 'tool-calls');
  const thirdOptions = continuation(secondOptions, second, 'failed');
  thirdOptions.messages.at(-1).isError = true;
  const third = await collect(f.adapter.stream(thirdOptions));
  assert.deepEqual(blocks(third), [text('done')]);
  assert.equal(f.rpcs.length, 1);
  assert.equal(f.rpcs[0].calls.filter(c => c.method === 'turn/start').length, 1);
  assert.deepEqual(f.rpcs[0].results, [{ contentItems: [{ type: 'inputText', text: 'result' }], success: true }, { contentItems: [{ type: 'inputText', text: 'failed' }], success: false }]);
  assert.equal(f.adapter.pending.size, 0); assert.equal(f.adapter.active.size, 0); assert.equal(f.cleaned, 1);
});

test('session, full history, model, controls and tool-schema mismatches cannot consume pending turn', async t => {
  const f = fixture(t, { script: rpc => { rpc.tool().catch(() => {}); } });
  const o = options(); const first = await collect(f.adapter.stream(o));
  for (const change of [{ sessionId: 'session-b' }]) {
    const chunks = await collect(f.adapter.stream(continuation(o, first, 'result', change)));
    assert.equal(finish(chunks).failure.code, 'INVALID_REQUEST');
  }
  const changed = continuation(o, first); changed.messages[0] = { role: 'user', content: [text('changed')] };
  assert.equal(finish(await collect(f.adapter.stream(changed))).kind, 'error');
  assert.equal(f.adapter.pending.size, 1); assert.equal(f.rpcs.length, 1); assert.equal(f.rpcs[0].results.length, 0);
});

test('history snapshots are detached from mutable caller content', async t => {
  const f = fixture(t, { script: rpc => { rpc.tool().catch(() => {}); } });
  const o = options(); const first = await collect(f.adapter.stream(o));
  o.messages[0].content[0].text = 'mutated';
  assert.equal(finish(await collect(f.adapter.stream(continuation(o, first)))).kind, 'error');
});

test('idle timeout releases RPC and isolation', async t => {
  const f = fixture(t, { idleTimeoutMs: 10 });
  assert.equal(finish(await collect(f.adapter.stream(options()))).failure.code, 'TIMEOUT');
  assert.equal(f.rpcs[0].closed, 1); assert.equal(f.cleaned, 1); assert.equal(f.adapter.active.size, 0);
});

test('pending expiry rejects unanswered RPC requests and releases resources', async t => {
  const f = fixture(t, { pendingTimeoutMs: 10, script: rpc => { rpc.tool().catch(() => {}); } });
  await collect(f.adapter.stream(options()));
  const request = f.rpcs[0].requests[0];
  // Real RPC child pipes keep Node alive; this in-memory mock needs a referenced timer.
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(request, { code: 'TIMEOUT' }); } finally { clearTimeout(keepAlive); }
  await tick();
  assert.equal(f.adapter.pending.size, 0); assert.equal(f.adapter.active.size, 0); assert.equal(f.cleaned, 1); assert.equal(f.rpcs[0].closed, 1);
});

test('abort active generation interrupts turn and releases resources', async t => {
  const controller = new AbortController();
  const f = fixture(t, { script: () => setImmediate(() => controller.abort()) });
  const chunks = await collect(f.adapter.stream(options({ signal: controller.signal })));
  assert.equal(finish(chunks).kind, 'aborted');
  assert.equal(f.rpcs[0].calls.at(-1).method, 'turn/interrupt'); assert.equal(f.cleaned, 1);
});

test('abort remains attached while tool execution is suspended', async t => {
  const controller = new AbortController();
  const f = fixture(t, { script: rpc => { rpc.tool().catch(() => {}); } });
  await collect(f.adapter.stream(options({ signal: controller.signal })));
  controller.abort();
  await assert.rejects(f.rpcs[0].requests[0], { code: 'ABORTED' }); await tick();
  assert.equal(f.adapter.pending.size, 0); assert.equal(f.cleaned, 1);
});

test('close is terminal and idempotent, including pending requests', async t => {
  const f = fixture(t, { script: rpc => { rpc.tool().catch(() => {}); } });
  await collect(f.adapter.stream(options())); f.adapter.close(); f.adapter.close();
  await assert.rejects(f.rpcs[0].requests[0], { code: 'ABORTED' }); await tick();
  assert.equal(f.rpcs[0].closed, 1); assert.equal(f.cleaned, 1);
  assert.equal(finish(await collect(f.adapter.stream(options()))).kind, 'aborted'); assert.equal(f.rpcs.length, 1);
});

test('transport exit while suspended rejects tool and cleans immediately', async t => {
  const f = fixture(t, { script: rpc => { rpc.tool().catch(() => {}); } });
  await collect(f.adapter.stream(options()));
  f.rpcs[0].handlers.onClose(new Error('exited'));
  await assert.rejects(f.rpcs[0].requests[0], /exited/); await tick();
  assert.equal(f.adapter.pending.size, 0); assert.equal(f.cleaned, 1);
});

test('cancel during isolation preparation cleans late isolation without starting RPC', async () => {
  let release, entered; let cleaned = 0; let spawned = 0;
  const started = new Promise(resolve => { entered = resolve; });
  const controller = new AbortController();
  const adapter = new CodexCliAdapter({ prepareIsolation: () => new Promise(resolve => { release = resolve; entered(); }), rpcFactory: () => { spawned++; throw new Error('must not spawn'); } });
  const result = collect(adapter.stream(options({ signal: controller.signal })));
  await started;
  controller.abort(); release({ args: [], cleanup: () => { cleaned++; } });
  assert.equal(finish(await result).kind, 'aborted'); assert.equal(cleaned, 1); assert.equal(spawned, 0); assert.equal(adapter.active.size, 0);
});

for (const [label, args, overrides] of [['unknown tool', {}, { tool: 'shell' }], ['wrong turn', {}, { turnId: 'other' }], ['non-object arguments', '[]', {}]]) {
  test(`reject ${label} and settle outstanding request`, async t => {
    const f = fixture(t, { script: rpc => { rpc.tool(args, overrides).catch(() => {}); } });
    assert.equal(finish(await collect(f.adapter.stream(options()))).kind, 'error');
    await assert.rejects(f.rpcs[0].requests[0]); assert.equal(f.adapter.active.size, 0); assert.equal(f.cleaned, 1);
  });
}

test('consumer return before finish releases pending tool request', async t => {
  const f = fixture(t, { script: rpc => { rpc.tool().catch(() => {}); } });
  const stream = f.adapter.stream(options()); await stream.next(); await stream.return();
  await assert.rejects(f.rpcs[0].requests[0]); await tick(); assert.equal(f.cleaned, 1); assert.equal(f.adapter.pending.size, 0);
});

test('concurrent sessions own separate RPCs; ambiguous results never resolve either', async t => {
  const f = fixture(t, { script: rpc => { rpc.tool().catch(() => {}); } });
  const a = options(); const b = options({ sessionId: 'session-b' });
  const [first, second] = await Promise.all([collect(f.adapter.stream(a)), collect(f.adapter.stream(b))]);
  assert.equal(f.rpcs.length, 2); assert.notEqual(blocks(first).at(-1).id, blocks(second).at(-1).id);
  const mixed = continuation(a, first);
  mixed.messages.push(continuation(b, second).messages.at(-1));
  assert.match(finish(await collect(f.adapter.stream(mixed))).failure.message, /Ambiguous/);
  assert.equal(f.adapter.pending.size, 2); assert.equal(f.rpcs[0].results.length, 0); assert.equal(f.rpcs[1].results.length, 0);
});

test('non-text tool result is rejected without silently dropping data or consuming pending turn', async t => {
  const f = fixture(t, { script: rpc => { rpc.tool().catch(() => {}); } });
  const o = options(); const first = await collect(f.adapter.stream(o));
  const next = continuation(o, first); next.messages.at(-1).content = [{ type: 'image', attachment: {} }];
  assert.equal(finish(await collect(f.adapter.stream(next))).failure.code, 'INVALID_REQUEST');
  assert.equal(f.adapter.pending.size, 1); assert.equal(f.rpcs[0].results.length, 0);
});

test('unexpected native execution/approval requests are denied', async t => {
  const f = fixture(t, { script: rpc => rpc.complete() });
  await collect(f.adapter.stream(options()));
  await assert.rejects(f.rpcs[0].handlers.onRequest({ method: 'item/commandExecution/requestApproval', params: {} }), /denied/);
});

test('close wakes an actively waiting stream', async t => {
  const f = fixture(t, { script: () => setImmediate(() => f.adapter.close()) });
  assert.equal(finish(await collect(f.adapter.stream(options()))).kind, 'aborted');
  assert.equal(f.cleaned, 1); assert.equal(f.adapter.active.size, 0);
});

const imageRef = { attachmentId: 'sha256:' + 'a'.repeat(64), mediaType: 'image/png', width: 2, height: 2, bytes: 3 };
const imageBlock = { type: 'image', attachment: imageRef };
const imageService = () => ({ readImageRequest: async () => ({ data: new Uint8Array([1,2,3]), mediaType: 'image/png', width: 2, height: 2 }) });
test('adapter forwards user images as native turn input', async t => {
  const f = fixture(t, { resolveAttachments: imageService, script: rpc => rpc.complete() });
  const chunks = await collect(f.adapter.stream(options({ messages: [{ role: 'user', content: [text('look'), imageBlock] }] })));
  assert.equal(finish(chunks).kind, 'stop');
  assert.equal(f.rpcs[0].calls[1].params.input[2].type, 'image');
});
test('adapter continues original pending turn with mixed image tool result', async t => {
  const f = fixture(t, { resolveAttachments: imageService, script: rpc => { rpc.tool().then(() => rpc.complete()).catch(() => {}); } });
  const o = options(); const first = await collect(f.adapter.stream(o));
  const next = continuation(o, first); next.messages.at(-1).content = [text('before'), imageBlock, text('after')];
  assert.equal(finish(await collect(f.adapter.stream(next))).kind, 'stop');
  assert.equal(f.rpcs.length, 1);
  assert.deepEqual(f.rpcs[0].results[0].contentItems.map(b => b.type), ['inputText','inputText','inputImage','inputText']);
});
test('failed tool image read closes pending RPC without silently consuming data', async t => {
  const f = fixture(t, { script: rpc => { rpc.tool().catch(() => {}); } });
  const o = options(); const first = await collect(f.adapter.stream(o));
  const next = continuation(o, first); next.messages.at(-1).content = [imageBlock];
  assert.equal(finish(await collect(f.adapter.stream(next))).failure.code, 'ATTACHMENTS_UNAVAILABLE');
  assert.equal(f.adapter.pending.size, 0); assert.equal(f.rpcs[0].closed, 1);
});

test('Harness runtime context and subagent notices after a tool result rebuild instead of rejecting continuation', async t => {
  let starts = 0;
  const f = fixture(t, { script(rpc) {
    if (++starts === 1) rpc.tool().catch(() => {});
    else { rpc.notify('item/agentMessage/delta', { itemId: 'rebuilt', delta: 'done' }); rpc.complete(); }
  } });
  const o = options(); const first = await collect(f.adapter.stream(o));
  const next = continuation(o, first, 'already executed');
  next.messages.push({ role: 'user', content: [text('Background subagent finished: result')] },
    { role: 'user', content: [text('Time sampled while preparing step 2: 2026-11-04T10:11:00+08:00')] });
  const chunks = await collect(f.adapter.stream(next));
  assert.equal(finish(chunks).kind, 'stop', JSON.stringify(finish(chunks)));
  assert.deepEqual(blocks(chunks), [text('done')]);
  assert.equal(f.rpcs.length, 2); assert.equal(f.rpcs[0].closed, 1);
  await assert.rejects(f.rpcs[0].requests[0], { code: 'CONTEXT_CHANGED' });
  assert.deepEqual(JSON.parse(f.rpcs[1].calls[1].params.input[0].text).messages, next.messages);
  assert.equal(f.adapter.pending.size, 0); assert.equal(f.cleaned, 2);
});

for (const change of [{ system: 'new system prompt' }, { tools: [] }, { model: 'new-model' }, { reasoningEffort: 'high' }]) {
  test(`changed ${Object.keys(change)[0]} rebuilds from committed history rather than feeding a stale Codex turn`, async t => {
    let starts = 0;
    const f = fixture(t, { script(rpc) { if (++starts === 1) rpc.tool().catch(() => {}); else rpc.complete(); } });
    const o = options(); const first = await collect(f.adapter.stream(o));
    const next = continuation(o, first, 'committed result', change);
    assert.equal(finish(await collect(f.adapter.stream(next))).kind, 'stop');
    assert.equal(f.rpcs[0].results.some(r => r.contentItems), false);
    assert.equal(f.rpcs[1].calls[0].params.model, next.model);
    assert.equal(f.rpcs[1].calls[0].params.developerInstructions, next.system);
    assert.deepEqual(f.rpcs[1].calls[0].params.dynamicTools.map(t => t.name), next.tools.map(t => t.name));
  });
}

test('DSH replacement of a historical system prompt rebuilds with the latest prompt', async t => {
  let starts = 0;
  const f = fixture(t, { script(rpc) { if (++starts === 1) rpc.tool().catch(() => {}); else rpc.complete(); } });
  const o = options({ messages: [{ role: 'system', content: [text('initial prompt')] }, { role: 'user', content: [text('hello')] }] });
  const first = await collect(f.adapter.stream(o)); const next = continuation(o, first);
  next.messages[0] = { role: 'system', content: [text('updated prompt, tools and permissions')] };
  assert.equal(finish(await collect(f.adapter.stream(next))).kind, 'stop');
  assert.match(f.rpcs[1].calls[1].params.input[0].text, /updated prompt/);
  assert.doesNotMatch(f.rpcs[1].calls[1].params.input[0].text, /initial prompt/);
});

test('object property order does not change an otherwise exact continuation', async t => {
  const f = fixture(t, { script: rpc => { rpc.tool().then(() => rpc.complete()).catch(() => {}); } });
  const o = options(); const first = await collect(f.adapter.stream(o)); const next = continuation(o, first);
  next.messages[0] = { role: 'user', content: [{ text: 'hello', type: 'text' }] };
  next.tools = [{ parameters: { type: 'object' }, description: 'lookup', name: 'lookup' }];
  assert.equal(finish(await collect(f.adapter.stream(next))).kind, 'stop');
  assert.equal(f.rpcs.length, 1);
});
