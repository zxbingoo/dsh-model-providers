// Manual offline regression against an explicitly selected, actual Harness runtime.
// DSH_HOST_RUNTIME_DIR=/path/to/dsh node scripts/test-host-transport.mjs
// For app.asar use Electron's executable with ELECTRON_RUN_AS_NODE=1 instead of node.
// Synthetic services/responses only: no server, auth files, CLI or real account. Not a UI test.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const runtime = process.env.DSH_HOST_RUNTIME_DIR;
if (!runtime) throw new Error('Set DSH_HOST_RUNTIME_DIR to the actual dsh runtime directory (no auto-discovery).');
// Guard before importing the candidate, whose dependencies import spawn by name.
const unexpected = [];
const savedProcessMethods = new Map();
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  savedProcessMethods.set(name, childProcess[name]);
  childProcess[name] = () => { unexpected.push(name); throw new Error(`Offline transport test forbids child_process.${name}`); };
}
syncBuiltinESMExports();
const savedFetch = globalThis.fetch;
globalThis.fetch = () => { unexpected.push('fetch'); throw new Error('Offline transport test forbids real fetch'); };

const runtimeFile = name => join(resolve(runtime), 'node_modules', '@deepseek-ai', name);
const { Context } = await import(pathToFileURL(runtimeFile('cordis/lib/index.js')).href);
const { HostConnectionService } = await import(pathToFileURL(runtimeFile('dsh-client-connection/lib/index.js')).href);
const { WebServer } = await import(pathToFileURL(runtimeFile('dsh-host-webserver/lib/index.js')).href);
const candidate = await import(new URL('../index.mjs', import.meta.url));
const source = await readFile(runtimeFile('dsh-client-connection/lib/client.browser.js'), 'utf8');
const channel = '/harness-codex-cli-link';
const results = [];

async function registrationCase(order) {
  const root = new Context();
  let routes = new Map();
  const carriers = [];
  let connection, entry, web, wire, registration, phase = 'initial';
  let activeAdapters = 0;
  // Capture the real child fiber created by candidate.apply, not a copy of its inject list.
  root.on('internal/plugin', fiber => { if ('connection' in fiber.inject) registration = fiber; });
  root.provide('llm', { registerAdapter(ids) {
    assert.deepEqual(ids, ['codex-cli']);
    ++activeAdapters;
    return Object.assign(() => { --activeAdapters; }, { replace() {} });
  } });
  const webPlugin = { name: 'offline-webServer', apply(ctx) {
    // Construct the actual service under a sibling fiber; do NOT call Service.init/listen.
    const carrier = new WebServer(ctx, { host: '127.0.0.1', port: 0 });
    assert.equal(carrier.server, undefined, 'offline test must not start an HTTP server');
    routes = carrier.prefixes;
    carriers.push(carrier);
  } };
  const connectionPlugin = { name: 'offline-connection', apply(ctx) {
    // Never call BrowserAuth.create(): the Host service stores this synthetic object only.
    connection = new HostConnectionService(ctx, [], {});
  } };
  const mountEntry = async () => {
    entry = root.plugin(candidate, { enabled: false });
    await entry;
    assert(registration, 'candidate must create its connection registration child');
    assert.equal(activeAdapters, 1);
    return registration.await();
  };
  const snapshot = async () => {
    await registration.await();
    return { entryState: entry.state, childState: registration.state, routes: routes.size,
      dependencies: Object.keys(registration.inject) };
  };
  try {
    await mountEntry();
    assert.equal(entry.state, 2);
    assert.equal(registration.state, 0, 'entry is active while unavailable transport stays pending');
    assert.equal(routes.size, 0);
    phase = 'first dependency';
    if (order === 'connection-first') { wire = root.plugin(connectionPlugin); await wire; }
    else { web = root.plugin(webPlugin); await web; }
    const before = await snapshot();
    assert.equal(before.childState, 0, 'one transport dependency alone must not attempt registration');
    assert.equal(before.routes, 0);
    phase = 'second dependency';
    if (order === 'connection-first') { web = root.plugin(webPlugin); await web; }
    else { wire = root.plugin(connectionPlugin); await wire; }
    const after = await snapshot();
    assert.equal(after.entryState, 2); assert.equal(after.childState, 2); assert.equal(after.routes, 1);
    assert.equal(routes.get(channel)?.kind, 'prefix');
    const firstRoute = routes.get(channel), firstPeer = connection.browserPeer;
    await entry.dispose();
    assert.equal(routes.size, 0, 'entry disposal removes its channel');
    assert.equal(activeAdapters, 0);
    assert.equal(firstPeer.signal.aborted, false, 'entry disposal leaves connection owner peer alive');
    phase = 'entry remount';
    await mountEntry();
    assert.equal(routes.size, 1); assert.notEqual(routes.get(channel), firstRoute);
    phase = 'webServer disposal';
    await web.dispose(); await registration.await();
    assert.equal(routes.size, 0, 'webServer disposal unloads registration');
    assert.equal(registration.state, 0);
    phase = 'webServer remount';
    web = root.plugin(webPlugin); await web; await registration.await();
    assert.equal(routes.size, 1, 'webServer remount restores the channel once');
    phase = 'connection disposal';
    await wire.dispose(); await registration.await();
    assert.equal(firstPeer.signal.aborted, true);
    assert.equal(routes.size, 0, 'connection disposal unloads registration');
    assert.equal(registration.state, 0);
    phase = 'connection remount';
    wire = root.plugin(connectionPlugin); await wire; await registration.await();
    assert.equal(routes.size, 1, 'connection remount restores the channel once');
    assert.notEqual(connection.browserPeer, firstPeer);
    assert.equal(connection.browserPeer.signal.aborted, false);
    results.push({ test: 'actual-candidate-registration', order, before, after,
      remount: 'entry/webServer/connection each restored exactly once' });
  } catch (error) {
    console.error(`actual-candidate ${order}: failure during ${phase}; dependencies=${JSON.stringify(Object.keys(registration?.inject ?? {}))}`);
    throw error;
  } finally { await root.fiber.dispose(); }
  assert(carriers.every(carrier => carrier.prefixes.size === 0 && carrier.server === undefined),
    'root disposal removes every route from every carrier; no server may start');
  assert.equal(activeAdapters, 0);
  assert.equal(connection.browserPeer.signal.aborted, true);
}

// Preserve the original failure as a small negative control, separate from actual-candidate tests.
async function legacyRace() {
  const root = new Context(), routes = new Map();
  let child;
  try {
    const wire = root.plugin({ name: 'offline-legacy-connection', apply(ctx) { new HostConnectionService(ctx, [], {}); } });
    await wire;
    const entry = root.plugin({ name: 'offline-legacy-entry', apply(ctx) {
      child = ctx.inject(['connection'], ctx => {
        ctx.connection.rpc.handle(channel, async () => ({ ok: true, value: null }));
      });
    } });
    await entry;
    await assert.rejects(child.await(), /cannot get property "webServer" without inject/);
    assert.equal(entry.state, 2); assert.equal(child.state, 3);
    root.provide('webServer', { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } });
    await assert.rejects(child.await(), /cannot get property "webServer" without inject/);
    assert.equal(child.state, 3); assert.equal(routes.size, 0);
    results.push({ test: 'legacy-race-negative-control', entryState: entry.state, childState: child.state,
      routes: routes.size, error: 'cannot get property "webServer" without inject', lateWebServerRetries: false });
  } finally { await root.fiber.dispose(); }
}

// Waiting for both dependencies alone is insufficient with rc.5's getter shadow.
// This separate negative control must use sibling provider fibers, not root.provide().
async function getterShadowCase() {
  const root = new Context();
  let child, webServer;
  try {
    const wire = root.plugin({ name: 'offline-shadow-connection', apply(ctx) {
      new HostConnectionService(ctx, [], {});
    } });
    const web = root.plugin({ name: 'offline-shadow-webServer', apply(ctx) {
      webServer = new WebServer(ctx, { host: '127.0.0.1', port: 0 });
    } });
    await wire; await web;
    const entry = root.plugin({ name: 'offline-shadow-entry', apply(ctx) {
      child = ctx.inject(['connection', 'webServer'], ctx => {
        ctx.connection.rpc.handle(channel, async () => ({ ok: true, value: null }));
      });
    } });
    await entry;
    await assert.rejects(child.await(), /cannot get property "webServer" without inject/);
    assert.equal(entry.state, 2); assert.equal(child.state, 3); assert.equal(webServer.prefixes.size, 0);
    assert.equal(webServer.server, undefined);
    results.push({ test: 'getter-shadow-negative-control', dependencies: Object.keys(child.inject),
      entryState: entry.state, childState: child.state, routes: 0,
      error: 'cannot get property "webServer" without inject' });
  } finally { await root.fiber.dispose(); }
}

async function carrierCases() {
  // Run the shipped browser ModuleLoader factory unchanged across a VM realm.
  let definition;
  const box = vm.createContext({ crypto: webcrypto, AbortController, setTimeout, clearTimeout, console,
    window: { __ModuleLoader__: { load(value) { definition = value; } } } });
  vm.runInContext(source, box, { filename: runtimeFile('dsh-client-connection/lib/client.browser.js') });
  const carrier = definition.factory(() => { throw new Error('Unexpected browser factory require'); });
  const dto = { version: 1, state: 'ready', account: { type: 'chatgpt', planType: 'plus' },
    usage: { rateLimits: [{ id: 'codex', primary: { usedPercent: 12.5, windowDurationMins: 300, resetsAt: null } }],
      resetCredits: { availableCount: '0', details: [] } }, checkedAt: '2026-11-05T00:00:00Z', message: null };
  const calls = [];
  let mode = 'ready', handle;
  carrier.installConnection({ provide(name, value) { assert.equal(name, 'connection'); handle = value; } }, {
    transport: { ownsHost: true, streamBaseUrl: 'http://offline.invalid/', fetch: async (input, init) => {
      const wire = JSON.parse(init.body);
      calls.push({ input, init, wire });
      const envelope = { type: 'server-response', rpcId: wire.rpcId, result: { ok: true, value: dto } };
      if (mode === 'http405') return new Response('method not allowed', { status: 405 });
      if (mode === 'raw') return Response.json({ ok: true, value: dto });
      if (mode === 'mismatch') envelope.rpcId = 'wrong';
      if (mode === 'remoteError') envelope.result = { ok: false, error: { code: 'codex/unavailable', message: 'offline', details: {} } };
      return Response.json(envelope);
    } },
  });
  const signal = new AbortController().signal;
  const ready = await handle.rpc.call(channel, 'accountUsage', {}, signal);
  assert.equal(ready.ok, true); assert.deepEqual(ready.value, dto);
  assert.equal(calls[0].input, 'harness-codex-cli-link/accountUsage');
  assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[0].init.signal, signal);
  assert.equal(calls[0].wire.type, 'client-request'); assert.equal(calls[0].wire.method, 'accountUsage');
  assert.deepEqual(calls[0].wire.payload, {});
  assert.equal(ready instanceof Object, false, 'result wrapper is from carrier VM realm');
  assert.equal(ready.value instanceof Object, true, 'DTO is from synthetic Response realm');
  assert.equal(handle.generation.getSnapshot(), undefined, 'unary RPC does not require stream readiness');
  results.push({ test: 'actual-browser-factory-ready', target: calls[0].input,
    crossRealmDTO: 'accepted', signal: 'forwarded', generation: 'not required' });
  for (const [testMode, pattern] of [['http405', /HTTP 405/], ['raw', /invalid server-response envelope/], ['mismatch', /rpcId mismatch/]]) {
    mode = testMode;
    await assert.rejects(handle.rpc.call(channel, 'accountUsage', {}, signal), pattern);
    results.push({ test: 'actual-browser-factory-rejection', mode });
  }
  mode = 'remoteError';
  const failure = await handle.rpc.call(channel, 'accountUsage', {}, signal);
  assert.equal(failure.ok, false); assert.equal(failure.error.code, 'codex/unavailable');
  results.push({ test: 'actual-browser-factory-failure-result', passed: true });
  mode = 'ready';
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(handle.rpc.call(channel, 'accountUsage', {}, cancelled.signal), error => error.name === 'AbortError');
  results.push({ test: 'actual-browser-factory-cancellation', passed: true });
}

try {
  await legacyRace();
  await getterShadowCase();
  await registrationCase('connection-first');
  await registrationCase('webServer-first');
  await carrierCases();
  assert.deepEqual(unexpected, [], 'no guarded CLI/process or real-fetch path may be entered');
  console.log(JSON.stringify({ ok: true, runtime: resolve(runtime), passed: results.length,
    scope: 'actual candidate and runtime, synthetic services/responses; offline only, not real UI/account verification',
    processStarts: 0, realFetches: 0, results }, null, 2));
} finally {
  for (const [name, value] of savedProcessMethods) childProcess[name] = value;
  syncBuiltinESMExports();
  globalThis.fetch = savedFetch;
}
