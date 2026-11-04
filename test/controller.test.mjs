import test from 'node:test';
import assert from 'node:assert/strict';
import { currentConfig, resolveOptions, modelChoices, migrateDefaultSelection, createModelDirectory } from '../controller.mjs';

test('default configuration and volatile reference reads are live', () => {
  assert.deepEqual(currentConfig(), { enabled: true, model: 'gpt-6.1-sol', reasoningEffort: 'default' });
  let value = 'first'; const config = { model: { get: () => value } };
  assert.equal(currentConfig(config).model, 'first'); value = 'second';
  assert.equal(currentConfig(config).model, 'second');
});
test('missing model and legacy default use settings while explicit models and effort win', () => {
  const c = { model: 'custom-model', reasoningEffort: 'high' };
  assert.deepEqual(resolveOptions({ model: 'configured' }, c), { model: 'custom-model', reasoningEffort: 'high' });
  assert.deepEqual(resolveOptions({ model: 'explicit', reasoningEffort: 'low' }, c), { model: 'explicit', reasoningEffort: 'low' });
  assert.deepEqual(resolveOptions({ model: 'configured' }, {}), { model: 'gpt-6.1-sol' });
  for (const model of [undefined, null, '', '   ']) {
    const input = { model, sessionId: 'existing' };
    assert.deepEqual(resolveOptions(input, c), { model: 'custom-model', sessionId: 'existing', reasoningEffort: 'high' });
    assert.equal(input.model, model);
  }
  c.model = 'another-default';
  assert.equal(resolveOptions({ model: 'explicit' }, c).model, 'explicit');
  assert.equal(resolveOptions({}, c).model, 'another-default');
});
test('catalog contains concrete models only and retains real capability metadata', () => {
  const input = [{ id: 'real', name: 'Real', inputModalities: ['text', 'image'] }, { id: 'configured', name: 'Legacy alias' }];
  const before = structuredClone(input);
  assert.deepEqual(modelChoices(input, { model: 'real' }), [input[0]]);
  assert.deepEqual(modelChoices(input, { model: 'custom-upstream' }), [{ id: 'custom-upstream', name: 'custom-upstream' }, input[0]]);
  assert.deepEqual(modelChoices(input, { enabled: false }), []);
  assert.deepEqual(input, before);
});
test('legacy or unset native default migrates to a concrete ID, without overriding explicit choices', async () => {
  for (const selected of [{ provider: 'codex-cli', model: 'configured', reasoningEffort: 'high' },
    { provider: 'codex-cli', model: '' }, { provider: '', model: '' }]) {
    const writes = [];
    const defaults = { currentSelection: () => selected, saveSelection: async value => { writes.push(value); } };
    assert.equal(await migrateDefaultSelection(defaults, { model: 'real-default' }), true);
    assert.deepEqual(writes, [{ provider: 'codex-cli', model: 'real-default',
      ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }) }]);
  }
  for (const selected of [{ provider: 'codex-cli', model: 'picked' }, { provider: 'codex-cli', model: 'real-default' },
    { provider: 'other-provider', model: 'configured' }, { provider: 'other-provider', model: 'picked' }]) {
    assert.equal(await migrateDefaultSelection({ currentSelection: () => selected, saveSelection() { assert.fail('Explicit default must not change'); } }, { model: 'real-default' }), false);
  }
  assert.equal(await migrateDefaultSelection({ currentSelection() { assert.fail('Disabled plugin must not initialize defaults'); } }, { enabled: false }), false);
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
