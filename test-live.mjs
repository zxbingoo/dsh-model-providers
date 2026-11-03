// Opt-in: sends two real model requests through the user's existing Codex configuration.
import assert from 'node:assert/strict';
import { CodexCliAdapter } from './adapter.mjs';
import { CodexRpc } from './rpc.mjs';
import { prepareIsolation } from './runtime.mjs';
if (process.env.DSH_CODEX_LIVE_TEST !== '1') throw new Error('Set DSH_CODEX_LIVE_TEST=1 to authorize real model usage');
const adapter = new CodexCliAdapter({ prepareIsolation, rpcFactory: options => new CodexRpc({ ...options, binary: process.env.CODEX_BIN || 'codex' }) });
const options = {
  sessionId: 'harness-codex-live-smoke', model: process.env.DSH_CODEX_MODEL || 'gpt-6.1-sol',
  system: 'Call harness_probe exactly once. After the tool result arrives, return its exact value as your final answer.',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Call harness_probe with value ping and return its result.' }] }],
  tools: [{ name: 'harness_probe', description: 'Read a test value from Harness', parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false } }],
};
async function collect(input) {
  const blocks = []; let finish;
  for await (const chunk of adapter.stream(input)) {
    if (chunk.type === 'block-end') blocks.push(chunk.block);
    if (chunk.type === 'finish') finish = chunk.reason;
  }
  return { blocks, finish };
}
try {
  const first = await collect(options);
  assert.equal(first.finish?.kind, 'tool-calls', JSON.stringify(first.finish));
  const tool = first.blocks.find(block => block.type === 'tool-call');
  assert.equal(tool?.name, 'harness_probe');
  assert.deepEqual(JSON.parse(tool.arguments), { value: 'ping' });
  const second = await collect({ ...options, messages: [...options.messages,
    { role: 'assistant', content: first.blocks },
    { role: 'tool', toolCallId: tool.id, content: [{ type: 'text', text: 'HARNESS_TOOL_RESULT_7291' }], isError: false },
  ] });
  assert.equal(second.finish?.kind, 'stop', JSON.stringify(second.finish));
  assert(second.blocks.some(block => block.type === 'text' && block.text.includes('HARNESS_TOOL_RESULT_7291')));
  console.log(JSON.stringify({ ok: true, model: options.model, toolRoundTrip: true, finalText: second.blocks.filter(b => b.type === 'text').map(b => b.text).join('') }, null, 2));
} finally { adapter.close(); }
