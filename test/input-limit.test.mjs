import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TURN_TEXT_BYTES, assertTurnTextLimit, prepareTurnInput } from '../images.mjs';
const text = text => ({ type: 'text', text });

test('native text budget counts all items together and preserves exact boundary', () => {
  assert.doesNotThrow(() => assertTurnTextLimit([text('x'.repeat(MAX_TURN_TEXT_BYTES))]));
  assert.throws(() => assertTurnTextLimit([text('x'.repeat(MAX_TURN_TEXT_BYTES)), text('y')]), { code: 'CONTEXT_WINDOW_EXCEEDED' });
  assert.doesNotThrow(() => assertTurnTextLimit([{ type: 'image', url: 'data:image/png;base64,' + 'x'.repeat(MAX_TURN_TEXT_BYTES + 1) }]));
});
test('budget uses Unicode-safe UTF-8 bytes including JSON escaping, never truncates history', async () => {
  assert.throws(() => assertTurnTextLimit([text('中'.repeat(Math.ceil(MAX_TURN_TEXT_BYTES / 3)))]), { code: 'CONTEXT_WINDOW_EXCEEDED' });
  const messages = [{ role: 'user', content: [text('\\'.repeat(MAX_TURN_TEXT_BYTES / 2))] }];
  await assert.rejects(prepareTurnInput(messages), { code: 'CONTEXT_WINDOW_EXCEEDED' });
  assert.equal(messages[0].content[0].text.length, MAX_TURN_TEXT_BYTES / 2);
  const small = [{ role: 'user', content: [text('完整保留🙂')] }];
  assert.deepEqual(JSON.parse((await prepareTurnInput(small))[0].text).messages, small);
});
