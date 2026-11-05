import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { createRuntime } from '../runtime.mjs';
import { USAGE_MESSAGES } from '../account-usage.mjs';

const HOME = '/test-account-home', ROOT = '/tmp/dsh-codex-bridge-account-test';
const secretError = () => new Error('PRIVATE_TOKEN sk-secret Bearer private https://private.example.test/auth');
const enoent = () => Object.assign(new Error('absent'), { code: 'ENOENT' });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const account = (id = 'account-a', fields = {}) => ({
  account: { type: 'chatgpt', email: 'alice@example.test', planType: 'plus', workspaceName: 'Review', ...fields },
  requiresOpenaiAuth: true, workspaceRouting: { chatgptAccountId: id },
});
const usage = (id = 'account-a', percent = 12) => ({
  accountId: id, ordinaryUsageAllowed: true, token: 'PRIVATE_TOKEN', config: 'PRIVATE_CONFIG', upsell: 'PRIVATE_UPSELL',
  rateLimits: { limitId: 'codex', primary: { usedPercent: percent, windowDurationMins: 300, resetsAt: 1800000000 },
    credits: { hasCredits: true, unlimited: false, balance: '1.234', creditId: 'PRIVATE_CREDIT' } },
  rateLimitResetCredits: { availableCount: '9223372036854775807', credits: [{ id: 'PRIVATE_CREDIT', expiresAt: null }] },
});
const gateway = required => ['account/gatewayOAuth/read', { required }];
const attempt = (before = account(), data = usage(), after = before) => [
  ['account/read', before], ['account/rateLimits/read', data], ['account/read', after],
];

// Every version/config/fs/RPC dependency is replaced. This fixture cannot read real
// credentials, spawn Codex, create a real directory, access a network or run a model.
function fixture(script = [gateway(false), ...attempt()], options = {}) {
  const remaining = [...script], inFlight = new Set();
  const f = { calls: [], initializations: [], fsReads: [], fsWrites: [], events: [],
    closed: 0, cleaned: 0, prepared: 0, created: 0, versions: 0, structures: 0, catalogLoads: 0 };
  function tracked(work) {
    return new Promise((resolve, reject) => {
      const entry = { reject }; inFlight.add(entry);
      Promise.resolve().then(work).then(value => { inFlight.delete(entry); resolve(value); },
        error => { inFlight.delete(entry); reject(error); });
    });
  }
  f.runtime = createRuntime({
    env: { CODEX_HOME: HOME, CODEX_BIN: '/test-bin/codex', PATH: '/no-real-programs' },
    homeDir: () => '/unused-home', tempDir: () => '/tmp',
    assertVersion: async binary => {
      f.versions++; f.events.push('version'); assert.equal(binary, '/test-bin/codex');
      if (options.versionError) throw options.versionError;
    },
    readStructure: path => {
      f.structures++; assert.equal(path, `${HOME}/config.toml`);
      if (options.structureError) throw options.structureError;
      return options.structure ?? {};
    },
    loadCatalog: () => { f.catalogLoads++; throw new Error('Account reads must not load a model catalog'); },
    fs: {
      stat: async path => {
        f.events.push(['stat', path]); assert.equal(path, `${HOME}/config.toml`);
        if (options.statError) throw options.statError;
        if (options.structure === undefined && !options.structureError) throw enoent();
        return {};
      },
      realpath: async path => {
        assert([ROOT, '/tmp'].includes(path));
        if (options.realpathError && path === '/tmp') throw options.realpathError;
        return path;
      },
      mkdtemp: async prefix => {
        assert.equal(prefix, '/tmp/dsh-codex-bridge-');
        options.preparing?.resolve();
        if (options.prepareGate) await options.prepareGate.promise;
        if (options.mkdirError) throw options.mkdirError;
        f.prepared++; f.events.push('prepared'); return ROOT;
      },
      rm: async (path, flags) => {
        assert.equal(path, ROOT); assert.deepEqual(flags, { recursive: true, force: true });
        f.cleaned++; f.events.push('cleanup');
        if (options.cleanupError) throw options.cleanupError;
      },
      readFile: async path => { f.fsReads.push(String(path)); throw new Error('No auth/config/catalog file reads allowed'); },
      writeFile: async path => { f.fsWrites.push(String(path)); throw new Error('No catalog/auth writes allowed'); },
    },
    rpcFactory: rpcOptions => {
      f.created++; f.rpcOptions = rpcOptions;
      if (options.factoryError) throw options.factoryError;
      return {
        initialize: initOptions => {
          f.initializations.push(initOptions);
          return tracked(() => {
            if (options.initializeError) throw options.initializeError;
            return options.initialize?.(f);
          });
        },
        call: (method, params, timeoutMs) => {
          f.calls.push({ method, params, timeoutMs });
          return tracked(() => {
            const step = remaining.shift();
            assert(step, `Unexpected RPC ${method}`); assert.equal(method, step[0]);
            const value = step[1];
            if (value instanceof Error) throw value;
            return typeof value === 'function' ? value(f) : value;
          });
        },
        close: () => {
          f.closed++; f.events.push('close');
          for (const entry of inFlight) entry.reject(secretError());
          inFlight.clear();
          return options.close?.(f);
        },
      };
    },
  });
  f.notify = method => f.rpcOptions.onNotification({ method });
  return f;
}
function resources(f, { closed = 1, cleaned = 1 } = {}) {
  assert.equal(f.closed, closed, 'RPC must close exactly once');
  assert.equal(f.cleaned, cleaned, 'allocated isolation must be cleaned exactly once');
  assert.deepEqual(f.fsReads, [], 'plugin must not read auth/config/catalog contents');
  assert.deepEqual(f.fsWrites, [], 'usage reads must not write auth/catalog files');
  assert.equal(f.catalogLoads, 0, 'usage reads must not load or execute a model');
}
function state(result, expected) {
  assert.equal(result.state, expected);
  assert.equal(result.version, 1);
  assert.equal(result.message, expected === 'ready' ? null : USAGE_MESSAGES[expected]);
  assert(Number.isFinite(Date.parse(result.checkedAt)));
  assert.deepEqual(Object.keys(result).sort(), ['account', 'checkedAt', 'message', 'state', 'usage', 'version']);
  if (expected !== 'ready') assert.equal(result.usage, null);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|sk-secret|Bearer private|https:\/\/private|accountId|creditId|upsell|token|config/);
}
function cancelled(error) {
  assert.equal(error.name, 'AbortError');
  assert.equal(error.message, 'Account usage read cancelled');
  assert.doesNotMatch(String(error), /PRIVATE|secret|https:/); return true;
}

test('standalone account read uses exact read-only RPC order, explicit gateway capability and per-call 10s bounds', async () => {
  const f = fixture(undefined, { structure: { mcpServers: ['private-server'], plugins: ['private-plugin'], skills: ['/private-skill'] } });
  const result = await f.runtime.readAccountUsage(); state(result, 'ready');
  assert.deepEqual(f.initializations, [{ explicitGatewayOauth: true, timeoutMs: 10000 }]);
  assert.deepEqual(f.calls, [
    { method: 'account/gatewayOAuth/read', params: undefined, timeoutMs: 10000 },
    { method: 'account/read', params: { refreshToken: false }, timeoutMs: 10000 },
    { method: 'account/rateLimits/read', params: { supportsLunaReserve: false, excludeResetCreditDetails: false }, timeoutMs: 10000 },
    { method: 'account/read', params: { refreshToken: false }, timeoutMs: 10000 },
  ]);
  assert.equal(f.rpcOptions.cwd, ROOT); assert.equal(f.rpcOptions.binary, '/test-bin/codex');
  assert(f.rpcOptions.args.includes('features.shell_tool=false'));
  assert(f.rpcOptions.args.includes('features.multi_agent=false'));
  assert(f.rpcOptions.args.some(arg => arg.startsWith('mcp_servers=')));
  assert(!f.rpcOptions.args.some(arg => /model_catalog_json|accountId|creditId|(?:^|\.)(?:token|access_token|api_key)=|auth\.json/.test(arg)));
  assert.deepEqual(result.account, { type: 'chatgpt', email: 'a***@example.test', planType: 'plus', workspaceName: 'Review' });
  assert.equal(result.usage.rateLimits[0].primary.usedPercent, 12);
  assert.equal(result.usage.resetCredits.availableCount, '9223372036854775807');
  assert.doesNotMatch(JSON.stringify(result), /alice@|account-a/);
  assert.equal(f.structures, 1); resources(f);
  assert.deepEqual(f.events.slice(-2), ['close', 'cleanup']);
  await assert.rejects(f.rpcOptions.onRequest({ method: 'item/commandExecution/requestApproval' }), /not allowed/);
});

test('gateway required=true is still only a read-only native account probe, never a login', async () => {
  const f = fixture([gateway(true), ...attempt()]);
  state(await f.runtime.readAccountUsage(), 'ready');
  assert.deepEqual(f.calls.map(call => call.method), ['account/gatewayOAuth/read', 'account/read', 'account/rateLimits/read', 'account/read']);
  resources(f);
});

test('same-email accounts with different workspace IDs cannot be paired, even if usage matches one side', async () => {
  for (const data of [usage('account-a'), usage('account-b')]) {
    const mismatch = attempt(account('account-a'), data, account('account-b'));
    const f = fixture([gateway(false), ...mismatch, ...mismatch]);
    const result = await f.runtime.readAccountUsage(); state(result, 'changed');
    assert.equal(result.account, null); assert.equal(f.calls.length, 7); resources(f);
  }
});

test('stable before/after identity still rejects another account usage ID and retries at most twice', async () => {
  const mismatch = attempt(account(), usage('other-account'), account());
  const f = fixture([gateway(false), ...mismatch, ...mismatch]);
  state(await f.runtime.readAccountUsage(), 'changed'); assert.equal(f.calls.length, 7); resources(f);
});

for (const [field, value] of [['email', 'anna@example.test'], ['planType', 'pro'], ['workspaceName', 'Other'], ['type', 'apiKey']]) {
  test(`raw account ${field} changes invalidate the snapshot, including identical masked emails`, async () => {
    const mismatch = attempt(account(), usage(), account('account-a', { [field]: value }));
    const f = fixture([gateway(false), ...mismatch, ...mismatch]);
    state(await f.runtime.readAccountUsage(), 'changed'); assert.equal(f.calls.length, 7); resources(f);
  });
}

test('a retry may return only the second stable account and its matching usage', async () => {
  const f = fixture([gateway(false),
    ...attempt(account(), usage('account-a', 99), account('account-b')),
    ...attempt(account('account-b', { email: 'bob@example.test' }), usage('account-b', 23), account('account-b', { email: 'bob@example.test' })),
  ]);
  const result = await f.runtime.readAccountUsage(); state(result, 'ready');
  assert.equal(result.account.email, 'b***@example.test'); assert.equal(result.usage.rateLimits[0].primary.usedPercent, 23);
  assert.equal(f.calls.length, 7); resources(f);
});

test('missing identity on either side of the pair is unverified, not ready or zero usage', async () => {
  for (const id of [null, '', undefined, 123]) {
    const before = account(); before.workspaceRouting.chatgptAccountId = id;
    const f = fixture([gateway(false), ...attempt(before)]);
    state(await f.runtime.readAccountUsage(), 'unverified'); assert.equal(f.calls.length, 4); resources(f);
    const data = usage(); data.accountId = id;
    const g = fixture([gateway(false), ...attempt(account(), data)]);
    state(await g.runtime.readAccountUsage(), 'unverified'); assert.equal(g.calls.length, 4); resources(g);
  }
  const before = account(); delete before.workspaceRouting;
  const f = fixture([gateway(false), ...attempt(before)]);
  state(await f.runtime.readAccountUsage(), 'unverified'); resources(f);
});

test('routing disappearing after the first account read is a changed pair, not a verified snapshot', async () => {
  const after = account(); delete after.workspaceRouting;
  const mismatch = attempt(account(), usage(), after);
  const f = fixture([gateway(false), ...mismatch, ...mismatch]);
  state(await f.runtime.readAccountUsage(), 'changed'); assert.equal(f.calls.length, 7); resources(f);
});

test('null initial accounts distinguish signed-out from providers that do not require OpenAI auth', async () => {
  for (const requiresOpenaiAuth of [true, false]) {
    const f = fixture([gateway(false), ['account/read', { account: null, requiresOpenaiAuth }]]);
    const result = await f.runtime.readAccountUsage(); state(result, requiresOpenaiAuth ? 'signedOut' : 'unsupported');
    assert.equal(result.account, null); assert.equal(f.calls.length, 2); resources(f);
  }
});

test('API-key/cloud/unknown initial accounts are unsupported and never trigger rate-limit reads', async () => {
  for (const type of ['apiKey', 'amazonBedrock', 'gcp', 'future']) {
    const f = fixture([gateway(false), ['account/read', account('private-id', { type })]]);
    const result = await f.runtime.readAccountUsage(); state(result, 'unsupported');
    assert.equal(result.account.email, null); assert.equal(f.calls.length, 2); resources(f);
  }
});

test('account/updated after the first account read invalidates that attempt; unrelated notifications do not', async () => {
  const f = fixture([gateway(false),
    ...attempt(account(), current => { current.notify('account/updated'); return usage('account-a', 99); }),
    ...attempt(account(), usage('account-a', 22)),
  ]);
  const result = await f.runtime.readAccountUsage(); state(result, 'ready');
  assert.equal(result.usage.rateLimits[0].primary.usedPercent, 22); assert.equal(f.calls.length, 7); resources(f);
  const g = fixture([gateway(false), ...attempt(account(), current => {
    current.notify('account/rateLimits/updated'); return usage();
  })]);
  state(await g.runtime.readAccountUsage(), 'ready'); assert.equal(g.calls.length, 4); resources(g);
});

test('account/updated during the final account read invalidates both attempts and returns changed', async () => {
  const invalid = attempt(account(), usage(), current => { current.notify('account/updated'); return account(); });
  const f = fixture([gateway(false), ...invalid, ...invalid]);
  state(await f.runtime.readAccountUsage(), 'changed'); assert.equal(f.calls.length, 7); resources(f);
});

test('startup account/updated before the first read does not poison a later stable pair', async () => {
  const f = fixture(undefined, { initialize: current => { current.notify('account/updated'); } });
  state(await f.runtime.readAccountUsage(), 'ready'); assert.equal(f.calls.length, 4); resources(f);
});

test('unsupported/malformed gateway capability fails closed with a fixed unavailable result', async () => {
  for (const response of [secretError(), undefined, null, {}, [], { required: 'false' }]) {
    const f = fixture([['account/gatewayOAuth/read', response]]);
    state(await f.runtime.readAccountUsage(), 'unavailable'); assert.equal(f.calls.length, 1); resources(f);
  }
});

test('malformed account envelopes are unavailable and never launch a model/auth operation', async () => {
  for (const response of [null, [], {}, { account: null }, { account: [], requiresOpenaiAuth: true },
    { account: 'PRIVATE', requiresOpenaiAuth: true }, { account: {}, requiresOpenaiAuth: 'false' }]) {
    const f = fixture([gateway(false), ['account/read', response]]);
    state(await f.runtime.readAccountUsage(), 'unavailable'); assert.equal(f.calls.length, 2); resources(f);
  }
});

test('rate-limit/read and post-read failures never leak RPC errors, secrets, URLs or partial account usage', async () => {
  for (const script of [
    [gateway(false), ['account/read', secretError()]],
    [gateway(false), ['account/read', account()], ['account/rateLimits/read', secretError()]],
    [gateway(false), ['account/read', account()], ['account/rateLimits/read', usage()], ['account/read', secretError()]],
    [gateway(false), ...attempt(account(), { accountId: 'account-a', secret: 'PRIVATE' })],
  ]) {
    const f = fixture(script); const result = await f.runtime.readAccountUsage(); state(result, 'unavailable');
    assert.equal(result.account, null); resources(f);
  }
});

test('version/config/temp preparation failures are sanitized and clean up only allocated resources', async () => {
  for (const options of [
    { versionError: secretError() }, { statError: secretError() }, { structureError: secretError() },
    { realpathError: secretError() }, { mkdirError: secretError() },
  ]) {
    const f = fixture([], options); state(await f.runtime.readAccountUsage(), 'unavailable');
    assert.equal(f.created, 0); resources(f, { closed: 0, cleaned: 0 });
  }
  // Invalid config structure makes buildDiscoveryArgs fail after mkdtemp.
  const f = fixture([], { structure: { mcpServers: { length: 1 } } });
  state(await f.runtime.readAccountUsage(), 'unavailable'); assert.equal(f.created, 0);
  resources(f, { closed: 0 });
});

test('RPC construction/initialization failures and cleanup errors still finalize isolation', async () => {
  const factory = fixture([], { factoryError: secretError() });
  state(await factory.runtime.readAccountUsage(), 'unavailable'); resources(factory, { closed: 0 });
  const init = fixture([], { initializeError: secretError() });
  state(await init.runtime.readAccountUsage(), 'unavailable'); assert.equal(init.calls.length, 0); resources(init);
  const cleanup = fixture(undefined, { cleanupError: secretError() });
  state(await cleanup.runtime.readAccountUsage(), 'unavailable'); resources(cleanup);
});

test('finally awaits asynchronous RPC close before cleaning the isolated cwd', async () => {
  const closing = deferred(), closeStarted = deferred(); let finished = false;
  const f = fixture(undefined, { close: () => { closeStarted.resolve(); return closing.promise; } });
  const pending = f.runtime.readAccountUsage().then(value => { finished = true; return value; });
  await closeStarted.promise; await flush();
  assert.equal(f.closed, 1); assert.equal(f.cleaned, 0); assert.equal(finished, false);
  closing.resolve(); state(await pending, 'ready'); resources(f);
  assert.deepEqual(f.events.slice(-2), ['close', 'cleanup']);
});

test('synchronous and asynchronous close failures are fixed unavailable and still clean isolation', async () => {
  for (const close of [() => { throw secretError(); }, () => Promise.reject(secretError())]) {
    const f = fixture(undefined, { close });
    state(await f.runtime.readAccountUsage(), 'unavailable'); resources(f);
  }
});

test('pre-aborted requests reject with a static AbortError before any preparation or RPC', async () => {
  const controller = new AbortController(); controller.abort(secretError()); const f = fixture([]);
  await assert.rejects(f.runtime.readAccountUsage({ signal: controller.signal }), cancelled);
  assert.equal(f.versions, 0); assert.equal(f.created, 0); resources(f, { closed: 0, cleaned: 0 });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('abort during preparation reclaims a late-created directory and never starts RPC', async () => {
  const preparing = deferred(), prepareGate = deferred(), controller = new AbortController();
  const f = fixture([], { preparing, prepareGate });
  const pending = f.runtime.readAccountUsage({ signal: controller.signal }), rejected = assert.rejects(pending, cancelled);
  await preparing.promise; controller.abort(secretError()); prepareGate.resolve(); await rejected;
  assert.equal(f.created, 0); resources(f, { closed: 0 });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

for (const stage of ['initialize', 'gateway', 'before', 'rateLimits', 'after']) {
  test(`abort during active ${stage} closes RPC once, cleans isolation and rejects a static AbortError`, async () => {
    const started = deferred(), block = deferred(), controller = new AbortController();
    const wait = () => { started.resolve(); return block.promise; };
    const script = stage === 'gateway' ? [['account/gatewayOAuth/read', wait]]
      : stage === 'before' ? [gateway(false), ['account/read', wait]]
      : stage === 'rateLimits' ? [gateway(false), ['account/read', account()], ['account/rateLimits/read', wait]]
      : stage === 'after' ? [gateway(false), ['account/read', account()], ['account/rateLimits/read', usage()], ['account/read', wait]] : [];
    const f = fixture(script, stage === 'initialize' ? { initialize: wait } : {});
    const pending = f.runtime.readAccountUsage({ signal: controller.signal }), rejected = assert.rejects(pending, cancelled);
    await started.promise; controller.abort(secretError()); await rejected; block.resolve(); resources(f);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  });
}

test('aborting an active read also awaits asynchronous close before final cleanup', async () => {
  const started = deferred(), active = deferred(), closeStarted = deferred(), closing = deferred();
  const controller = new AbortController();
  const f = fixture([gateway(false), ['account/read', () => { started.resolve(); return active.promise; }]], {
    close: () => { closeStarted.resolve(); return closing.promise; },
  });
  const pending = f.runtime.readAccountUsage({ signal: controller.signal }), rejected = assert.rejects(pending, cancelled);
  await started.promise; controller.abort(secretError()); await closeStarted.promise; await flush();
  assert.equal(f.closed, 1); assert.equal(f.cleaned, 0);
  closing.resolve(); await rejected; active.resolve(); resources(f);
});

test('the default whole-read deadline is 30s, aborts active RPC and returns unavailable rather than AbortError', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const started = deferred(), active = deferred();
  const f = fixture([gateway(false), ['account/read', () => { started.resolve(); return active.promise; }]]);
  const pending = f.runtime.readAccountUsage(); await started.promise;
  t.mock.timers.tick(29999); assert.equal(f.closed, 0);
  t.mock.timers.tick(1); state(await pending, 'unavailable'); active.resolve(); resources(f);
  t.mock.timers.tick(60000); assert.equal(f.closed, 1);
});

test('whole-read budget cannot exceed 30s and invalid timeout overrides use the default budget', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const timeoutMs of [60000, Infinity, NaN, -1, 0, null, '5']) {
    const started = deferred(), active = deferred();
    const f = fixture([gateway(false), ['account/read', () => { started.resolve(); return active.promise; }]]);
    const pending = f.runtime.readAccountUsage({ timeoutMs }); await started.promise;
    t.mock.timers.tick(29999); assert.equal(f.closed, 0, `deadline for ${String(timeoutMs)} must not fire early`);
    t.mock.timers.tick(1); assert.equal(f.closed, 1, `deadline for ${String(timeoutMs)} must not exceed 30s`);
    state(await pending, 'unavailable'); active.resolve(); resources(f);
  }
});

test('a shorter timeout during preparation reclaims resources as soon as preparation completes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const preparing = deferred(), prepareGate = deferred();
  const f = fixture([], { preparing, prepareGate });
  const pending = f.runtime.readAccountUsage({ timeoutMs: 5 }); await preparing.promise;
  t.mock.timers.tick(5); prepareGate.resolve(); state(await pending, 'unavailable');
  assert.equal(f.created, 0); resources(f, { closed: 0 });
});

test('successful/failed reads remove external abort listeners and never cache runtime snapshots', async () => {
  const controller = new AbortController();
  const f = fixture([gateway(false), ...attempt(), gateway(false), ...attempt(account(), usage('account-a', 44))]);
  const first = await f.runtime.readAccountUsage({ signal: controller.signal });
  const second = await f.runtime.readAccountUsage({ signal: controller.signal });
  state(first, 'ready'); state(second, 'ready');
  assert.notStrictEqual(first, second); assert.notStrictEqual(first.usage, second.usage);
  assert.equal(first.usage.rateLimits[0].primary.usedPercent, 12);
  assert.equal(second.usage.rateLimits[0].primary.usedPercent, 44);
  assert.equal(f.created, 2); assert.equal(f.cleaned, 2); assert.equal(f.closed, 2);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  controller.abort(); assert.equal(f.closed, 2);
  const g = fixture([gateway(false), ['account/read', secretError()]]), failed = new AbortController();
  state(await g.runtime.readAccountUsage({ signal: failed.signal }), 'unavailable'); resources(g);
  assert.equal(getEventListeners(failed.signal, 'abort').length, 0);
});
