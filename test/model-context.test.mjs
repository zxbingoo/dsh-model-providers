import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexAdapter } from '../index.mjs';
import { currentConfig, normalizeContextWindows, withModelContext } from '../controller.mjs';
const setup = (config = {}, discover = async () => [{ id: 'native', name: 'Native', context: { contextWindow: 475000 }, contextSource: 'codex-native-catalog' }]) => createCodexAdapter(config, { discover, fingerprint: async () => '' }).adapter;
test('automatic CLI capacity reaches exact resolution, picker and prepared call without configuration', async () => {
  const adapter = setup({ model: 'native' });
  assert.equal((await adapter.resolveModel('codex-cli', 'native')).context.contextWindow, 475000);
  assert.equal((await adapter.prepareCall('codex-cli', 'native')).model.context.contextWindow, 475000);
  assert.equal((await adapter.listModels('codex-cli'))[0].context.contextWindow, 475000);
  assert.equal((await adapter.resolveModel('codex-cli', 'configured')).context.contextWindow, 475000);
  assert.equal((await adapter.prepareCall('codex-cli', 'configured')).model.context.contextWindow, 475000);
  await adapter.close();
});
test('historical manual settings cannot replace automatic capacity or invent an unknown model capacity', async () => {
  const adapter = setup({ model: 'native', contextWindows: { native: 1000000, custom: 999999 } });
  assert.equal((await adapter.resolveModel('codex-cli', 'native')).context.contextWindow, 475000);
  assert.equal((await adapter.resolveModel('codex-cli', 'custom')).context, undefined);
  await adapter.close();
});
test('capacity snapshot is detached from mutable discovery and historical settings', async () => {
  const value = { id: 'native', name: 'Native', context: { contextWindow: 475000 }, contextSource: 'codex-native-catalog' };
  const adapter = setup({}, async () => [value]);
  const prepared = await adapter.prepareCall('codex-cli', 'native');
  value.context.contextWindow = 1;
  assert.equal(prepared.model.context.contextWindow, 475000);
  prepared.model.context.contextWindow = 2;
  assert.equal((await adapter.resolveModel('codex-cli', 'native')).context.contextWindow, 475000);
  await adapter.close();
});
test('historical capacity settings remain losslessly normalized but are not used for metadata', () => {
  const source = Object.assign(Object.create({ inherited: 1000 }), { good: 123456, zero: 0, negative: -1, fractional: 1.5, unsafe: Number.MAX_SAFE_INTEGER + 1, string: '123456', infinite: Infinity });
  assert.deepEqual(normalizeContextWindows(source), { good: 123456 });
  assert.deepEqual(normalizeContextWindows(null), {}); assert.deepEqual(normalizeContextWindows([]), {});
  const config = currentConfig({ contextWindows: source }); source.good = 2;
  assert.equal(config.contextWindows.good, 123456);
  assert.equal(withModelContext({ context: { contextWindow: 475000 } }, 'good', config).context.contextWindow, 475000);
});
test('cancelled model metadata lookup never returns a capacity result', async () => {
  const adapter = setup(); const controller = new AbortController(); controller.abort();
  await assert.rejects(adapter.resolveModel('codex-cli', 'native', controller.signal), { name: 'AbortError' });
  await adapter.close();
});
