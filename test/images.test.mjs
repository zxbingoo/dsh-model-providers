import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTurnInput, prepareToolOutput, imageRequestTarget } from '../images.mjs';
const ref = { attachmentId: 'sha256:' + 'a'.repeat(64), mediaType: 'image/png', width: 100, height: 50, bytes: 3 };
const image = { type: 'image', attachment: ref };
const text = text => ({ type: 'text', text });
const messages = [{ role: 'user', content: [text('look'), image] }, { role: 'tool', toolCallId: 't', content: [image, text('after')] }];
const service = { readImageRequest: async () => ({ data: new Uint8Array([1,2,3]), mediaType: 'image/png', width: 100, height: 50 }) };
test('history images are native, ordered, occurrence-tagged and read once per attachment', async () => {
  let reads = 0; const before = structuredClone(messages);
  const input = await prepareTurnInput(messages, { resolveAttachments: () => ({ readImageRequest: async (...args) => { reads++; return service.readImageRequest(...args); } }) });
  assert.equal(reads, 1); assert.deepEqual(messages, before);
  assert.equal(input.filter(i => i.type === 'image').length, 2);
  assert.equal(input[2].url, 'data:image/png;base64,AQID');
  assert.match(input[1].text, /harness-image:m0:b1/); assert.match(input[3].text, /harness-image:m1:b0/);
  assert.doesNotMatch(input[0].text, /base64/);
});
test('mixed tool image/text output preserves order and error status', async () => {
  const output = await prepareToolOutput(messages, 1, { resolveAttachments: () => service });
  assert.deepEqual(output.contentItems.map(i => i.type), ['inputText', 'inputImage', 'inputText']);
  assert.equal(output.contentItems[2].text, 'after'); assert.equal(output.success, true);
});
test('missing attachment service fails explicitly, offloaded images require no service', async () => {
  await assert.rejects(prepareTurnInput(messages), { code: 'ATTACHMENTS_UNAVAILABLE' });
  const input = await prepareTurnInput([{ role: 'user', content: [{ ...image, offloaded: true }] }]);
  assert.equal(input.length, 1); assert.match(input[0].text, /image omitted/);
});
test('invalid image roles and malformed references fail before reads', async () => {
  await assert.rejects(prepareTurnInput([{ role: 'assistant', content: [image] }]), { code: 'UNSUPPORTED_CONTENT' });
  await assert.rejects(prepareTurnInput([{ role: 'user', content: [{ type: 'image', attachment: {} }] }]), { code: 'INVALID_REQUEST' });
});
test('actual encoded-byte and occurrence-count limits request offload rather than dropping images', async () => {
  await assert.rejects(prepareTurnInput(messages, { resolveAttachments: () => service, maxRequestImages: 1 }), { code: 'IMAGE_OFFLOAD_REQUIRED', offloadImages: 1 });
  await assert.rejects(prepareTurnInput(messages, { resolveAttachments: () => service, maxRequestImageBytes: 1 }), { code: 'IMAGE_OFFLOAD_REQUIRED', offloadImages: 2 });
});
test('image read errors and cancellation propagate', async () => {
  await assert.rejects(prepareTurnInput(messages, { resolveAttachments: () => ({ readImageRequest() { throw Error('missing'); } }) }), { code: 'IMAGE_READ_FAILED' });
  const c = new AbortController(); c.abort();
  await assert.rejects(prepareTurnInput(messages, { signal: c.signal }), { name: 'AbortError' });
});
test('request geometry is bounded and aspect preserving', () => {
  const target = imageRequestTarget({ ...ref, width: 8000, height: 4000 });
  assert(target.width * target.height <= 4 * 1024 * 1024); assert.equal(target.width / target.height, 2);
});
