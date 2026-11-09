import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, discoverModels } from '../runtime.mjs';
import { buildDiscoveryArgs, constructIsolatedCatalog } from '../isolation/isolation.mjs';
const enoent = () => Object.assign(Error('absent'), { code: 'ENOENT' });
function fixture(pages) {
  const calls = []; let closed = 0, cleaned = 0;
  const runtime = createRuntime({ env: { CODEX_HOME: '/test-home' }, assertVersion: () => {}, tempDir: () => '/tmp',
    fs: { stat: async () => { throw enoent(); }, realpath: async p => p, mkdtemp: async () => '/tmp/dsh-codex-bridge-test', rm: async () => { cleaned++; } },
    readModelCatalog: async () => ({ models: [] }),
    rpcFactory: options => { assert(!options.args.some(a => a.startsWith('model_catalog_json='))); return {
      initialize: async () => {}, close: () => { closed++; }, call: async (method, params) => { calls.push({ method, params }); const value = pages.shift(); if (value instanceof Error) throw value; return value; }
    }; }, loadCatalog: () => { throw Error('Discovery must never load bundled catalog'); }
  });
  return { runtime, calls, get closed() { return closed; }, get cleaned() { return cleaned; } };
}
test('native discovery preserves reported capabilities across pagination without inference', async () => {
  const f = fixture([{ data: [{ model: 'vision', inputModalities: ['text', 'image'] }, { model: 'unknown' }], nextCursor: 'next' }, { data: [{ model: 'text', inputModalities: ['text'] }] }]);
  const models = await f.runtime.discoverModels();
  assert.deepEqual(models[0].inputModalities, ['text','image']); assert.equal(models[1].inputModalities, undefined);
  assert.deepEqual(models[2].inputModalities, ['text']); assert.deepEqual(f.calls.map(c => c.method), ['model/list', 'model/list', 'config/read']);
  assert.equal(f.calls[1].params.cursor, 'next'); assert.equal(f.closed, 1); assert.equal(f.cleaned, 1);
});
test('failed discovery cleans resources and repeated cursors are rejected', async () => {
  const f = fixture([Error('offline')]); await assert.rejects(f.runtime.discoverModels(), /offline/); assert.equal(f.cleaned, 1); assert.equal(f.closed, 1);
  const g = fixture([{ data: [], nextCursor: 'x' }, { data: [], nextCursor: 'x' }]);
  await assert.rejects(g.runtime.discoverModels(), /repeated/); assert.equal(g.cleaned, 1);
});
test('discovery keeps native catalog but disables inherited execution features', () => {
  const args = buildDiscoveryArgs({ structure: { mcpServers: ['test'] } });
  assert(!args.some(a => a.startsWith('model_catalog_json='))); assert(args.includes('features.shell_tool=false')); assert(args.some(a => a.startsWith('mcp_servers=')));
});
test('execution capabilities use discovered metadata, not bundled model guess', () => {
  const catalog = { models: [{ slug: 'template', input_modalities: ['image'], shell_type: 'shell_command' }] };
  const entry = constructIsolatedCatalog(catalog, 'actual', { id: 'actual', inputModalities: ['text'] }).models[0];
  assert.deepEqual(entry.input_modalities, ['text']); assert.equal(entry.shell_type, 'disabled');
  assert.throws(() => constructIsolatedCatalog(catalog, 'actual', { id: 'wrong' }), /does not match/);
});
