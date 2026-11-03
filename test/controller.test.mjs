import test from 'node:test';
import assert from 'node:assert/strict';
import { currentConfig, resolveOptions, createModelDirectory } from '../controller.mjs';

test('default configuration and volatile reference reads are live', () => {
  assert.deepEqual(currentConfig(), { enabled: true, model: 'gpt-6.1-sol', reasoningEffort: 'default' });
  let value = 'first'; const config = { model: { get: () => value } };
  assert.equal(currentConfig(config).model, 'first'); value = 'second';
  assert.equal(currentConfig(config).model, 'second');
});
test('configured model follows settings while explicit models and effort win', () => {
  const c = { model: 'custom-model', reasoningEffort: 'high' };
  assert.deepEqual(resolveOptions({ model: 'configured' }, c), { model: 'custom-model', reasoningEffort: 'high' });
  assert.deepEqual(resolveOptions({ model: 'explicit', reasoningEffort: 'low' }, c), { model: 'explicit', reasoningEffort: 'low' });
  assert.deepEqual(resolveOptions({ model: 'configured' }, {}), { model: 'gpt-6.1-sol' });
});
test('disabled bridge fails closed without altering caller options', () => {
  const input = { model: 'configured' };
  assert.throws(() => resolveOptions(input, { enabled: false }), { code: 'CODEX_DISABLED' });
  assert.equal(input.model, 'configured');
});
test('directory shares concurrent discovery, caches and permits explicit refresh', async () => {
  let calls = 0;
  const read = createModelDirectory(async () => [{ id: String(++calls) }]);
  assert.deepEqual(await Promise.all([read(), read()]), [[{ id: '1' }], [{ id: '1' }]]);
  assert.deepEqual(await read(), [{ id: '1' }]);
  assert.deepEqual(await read(true), [{ id: '2' }]);
});
test('failed directory discovery can be retried', async () => {
  let calls = 0; const read = createModelDirectory(async () => { if (++calls === 1) throw Error('offline'); return []; });
  await assert.rejects(read(), /offline/); assert.deepEqual(await read(), []);
});
