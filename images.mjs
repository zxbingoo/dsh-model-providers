import { Buffer } from 'node:buffer';

// Codex 0.166.0 turn/start caps the combined text input, independently of
// model token capacity. Use UTF-8 bytes as a conservative Unicode-safe bound.
export const MAX_TURN_TEXT_BYTES = 1048576;
export function assertTurnTextLimit(input) {
  const bytes = input.reduce((sum, item) => sum + (item.type === 'text' ? Buffer.byteLength(item.text, 'utf8') : 0), 0);
  if (bytes > MAX_TURN_TEXT_BYTES) throw failure(`Codex transcript exceeds the turn/start input limit (${bytes} UTF-8 bytes; limit ${MAX_TURN_TEXT_BYTES}). Harness must compact the conversation before retrying.`, 'CONTEXT_WINDOW_EXCEEDED');
}

export const DEFAULT_MAX_REQUEST_IMAGES = 64;
// Count the actual data URLs, including base64 padding and the media-type prefix.
export const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
const REQUEST_IMAGE_PIXELS = 4 * 1024 * 1024;
const REQUEST_IMAGE_BYTES = 1024 * 1024;
const mediaTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const roles = new Set(['system', 'developer', 'user', 'assistant', 'tool']);
const referenceKeys = new Set(['attachmentId', 'mediaType', 'width', 'height', 'bytes', 'name', 'originalDimensions']);
const imageKeys = new Set(['type', 'attachment', 'offloaded']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const failure = (message, code = 'INVALID_REQUEST', extra = {}) => Object.assign(new Error(message), { code, ...extra });

function assertDimensions(value) {
  return object(value) && positiveInteger(value.width) && positiveInteger(value.height)
    && Object.keys(value).every(key => key === 'width' || key === 'height');
}
function assertImageReference(ref) {
  if (!object(ref) || typeof ref.attachmentId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(ref.attachmentId)
    || !mediaTypes.has(ref.mediaType) || !positiveInteger(ref.width) || !positiveInteger(ref.height) || !positiveInteger(ref.bytes)
    || (ref.name !== undefined && typeof ref.name !== 'string')
    || (ref.originalDimensions !== undefined && !assertDimensions(ref.originalDimensions))
    || !Object.keys(ref).every(key => referenceKeys.has(key))) {
    throw failure('Images require a durable attachment reference with valid identity, media type, dimensions and byte length (not inline data or a path)');
  }
}

/** The host's image coordinate mapping and the adapter's read use this exact target. */
export function imageRequestTarget(ref) {
  assertImageReference(ref);
  const byWidth = ref.width >= ref.height;
  const long = byWidth ? ref.width : ref.height, short = byWidth ? ref.height : ref.width;
  let edge = long;
  if (ref.width * ref.height > REQUEST_IMAGE_PIXELS) {
    edge = Math.max(1, Math.floor(long * Math.sqrt(REQUEST_IMAGE_PIXELS / (ref.width * ref.height))));
    // Equivalent to inward rounding the long edge, without a potentially enormous
    // decrement loop for a very thin image. Small images are never enlarged.
    let low = 1, high = edge;
    while (low < high) {
      const candidate = low + Math.ceil((high - low) / 2);
      if (candidate * Math.max(1, Math.round(candidate * short / long)) <= REQUEST_IMAGE_PIXELS) low = candidate;
      else high = candidate - 1;
    }
    edge = low;
  }
  const other = Math.max(1, Math.round(edge * short / long));
  return { width: byWidth ? edge : other, height: byWidth ? other : edge, maxBytes: REQUEST_IMAGE_BYTES };
}

/** Synchronous admission happens before a suspended RPC can be consumed. */
export function assertSupportedMessages(messages) {
  if (!Array.isArray(messages)) throw failure('Codex messages must be an array');
  const refs = new Map();
  for (const message of messages) {
    if (!object(message) || !roles.has(message.role) || !Array.isArray(message.content)) throw failure('Invalid Codex message role or content');
    if (message.role === 'tool' && (typeof message.toolCallId !== 'string' || !message.toolCallId)) throw failure('Tool messages require a toolCallId');
    if (message.isError !== undefined && typeof message.isError !== 'boolean') throw failure('Tool isError must be a boolean');
    for (const block of message.content) {
      if (!object(block) || typeof block.type !== 'string') throw failure('Invalid Codex content block');
      if (block.type === 'image') {
        if (message.role !== 'user' && message.role !== 'tool') throw failure(`Codex cannot represent an image in an in-history ${message.role} message`, 'UNSUPPORTED_CONTENT');
        if (!Object.keys(block).every(key => imageKeys.has(key)) || (block.offloaded !== undefined && block.offloaded !== true)) throw failure('Invalid image block or offloaded marker');
        assertImageReference(block.attachment);
        const ref = block.attachment, previous = refs.get(ref.attachmentId);
        // A display name/source size can differ per occurrence; normalized facts cannot.
        if (previous && ['mediaType', 'width', 'height', 'bytes'].some(key => previous[key] !== ref[key])) throw failure('Conflicting metadata for the same image attachment');
        refs.set(ref.attachmentId, ref);
      } else if (block.type === 'text' || block.type === 'reasoning') {
        if (typeof block.text !== 'string') throw failure('Text and reasoning blocks require string text');
      } else if (block.type === 'tool-call') {
        if (message.role !== 'assistant' || ['id', 'name', 'arguments'].some(key => typeof block[key] !== 'string')) throw failure('Invalid assistant tool-call block');
      }
      if (message.role === 'tool' && block.type !== 'text' && block.type !== 'image') throw failure('Codex tool results require text or image content');
    }
  }
}

export function assertImageLimits(maxRequestImages, maxRequestImageBytes) {
  for (const [name, value] of Object.entries({ maxRequestImages, maxRequestImageBytes })) {
    if (!Number.isSafeInteger(value) || value < 0) throw failure(`${name} must be a non-negative safe integer`);
  }
}

const marker = (messageIndex, blockIndex) => `harness-image:m${messageIndex}:b${blockIndex}`;
function offloadedText(ref, occurrence) {
  const identity = ref.name === undefined ? ref.attachmentId : `${JSON.stringify(ref.name)} (${ref.attachmentId})`;
  return `[${occurrence}; image omitted to fit request image limits; ${identity}. No local normalized image path is available; ask the user to attach it again if needed.]`;
}
function imageLabel(message, ref, version, messageIndex, blockIndex) {
  return JSON.stringify({ format: 'harness-image-occurrence-v1', imageOccurrence: marker(messageIndex, blockIndex), messageIndex, blockIndex,
    role: message.role, ...(message.toolCallId === undefined ? {} : { toolCallId: message.toolCallId }), attachment: ref,
    requestImage: { mediaType: version.mediaType, width: version.width, height: version.height } });
}

// Observe late failures even if a service ignores cancellation, but never wait for
// such a service before returning an aborted/closed stream or releasing its RPC.
async function abortable(operation, signal) {
  signal?.throwIfAborted();
  if (!signal) return operation();
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason ?? failure('Image preparation cancelled', 'ABORTED')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }).then(
      value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); }
    );
  });
}
function offloadFailure(offloadImages) {
  return failure(`Codex request images exceed the image-count or encoded-byte limit; ${offloadImages} more oldest retained image occurrence(s) must be offloaded.`, 'IMAGE_OFFLOAD_REQUIRED', { offloadImages });
}

async function prepareImages(messages, { resolveAttachments, signal, maxRequestImages = DEFAULT_MAX_REQUEST_IMAGES, maxRequestImageBytes = DEFAULT_MAX_REQUEST_IMAGE_BYTES } = {}) {
  signal?.throwIfAborted();
  assertSupportedMessages(messages);
  assertImageLimits(maxRequestImages, maxRequestImageBytes);
  const occurrences = [];
  for (const [messageIndex, message] of messages.entries()) {
    for (const [blockIndex, block] of message.content.entries()) {
      if (block.type === 'image' && block.offloaded !== true) occurrences.push({ ref: block.attachment, messageIndex, blockIndex });
    }
  }
  const versions = new Map();
  if (!occurrences.length) return versions;
  // The count bound already requires this prefix to go. Only the remaining
  // suffix needs reads to compute the exact additional byte-bound offload count.
  // Nothing is actually omitted here: any excess returns an offload failure.
  const countOffload = Math.max(0, occurrences.length - maxRequestImages);
  const suffix = occurrences.slice(countOffload);
  if (!suffix.length || maxRequestImageBytes === 0) throw offloadFailure(occurrences.length);
  let attachments;
  try { attachments = await abortable(() => resolveAttachments?.(), signal); }
  catch (error) {
    signal?.throwIfAborted();
    throw failure('The image attachment service could not be resolved', 'ATTACHMENTS_UNAVAILABLE', { cause: error });
  }
  if (typeof attachments?.readImageRequest !== 'function') throw failure('Codex image forwarding requires the attachment readImageRequest service', 'ATTACHMENTS_UNAVAILABLE');
  const refs = new Map(suffix.map(({ ref }) => [ref.attachmentId, ref]));
  for (const ref of refs.values()) {
    let version;
    try { version = await abortable(() => attachments.readImageRequest(ref, imageRequestTarget(ref), signal), signal); }
    catch (error) {
      signal?.throwIfAborted();
      throw failure(`Cannot prepare image attachment ${ref.attachmentId}: ${error?.message ?? 'attachment read failed'}`, 'IMAGE_READ_FAILED', { cause: error });
    }
    signal?.throwIfAborted();
    if (!object(version) || !(version.data instanceof Uint8Array) || !positiveInteger(version.data.byteLength)
      || !mediaTypes.has(version.mediaType) || !positiveInteger(version.width) || !positiveInteger(version.height)
      || (version.bytes !== undefined && version.bytes !== version.data.byteLength)) throw failure('Attachment service returned an invalid request image', 'IMAGE_READ_FAILED');
    versions.set(ref.attachmentId, { data: version.data, mediaType: version.mediaType, width: version.width, height: version.height,
      encodedBytes: 4 * Math.ceil(version.data.byteLength / 3) + Buffer.byteLength(`data:${version.mediaType};base64,`) });
  }
  const lengths = suffix.map(({ ref }) => versions.get(ref.attachmentId).encodedBytes);
  let total = lengths.reduce((sum, bytes) => sum + bytes, 0), byteOffload = 0;
  while (total > maxRequestImageBytes) total -= lengths[byteOffload++];
  if (countOffload + byteOffload > 0) throw offloadFailure(countOffload + byteOffload);
  // Encode only after checking the actual lengths, not advisory metadata/targets.
  for (const version of versions.values()) {
    version.url = `data:${version.mediaType};base64,${Buffer.from(version.data).toString('base64')}`;
    delete version.data;
  }
  return versions;
}

/** Preserve the single JSON-text pure-text contract; attach only typed native images. */
export async function prepareTurnInput(messages, options) {
  const versions = await prepareImages(messages, options);
  const native = [];
  const projected = messages.map((message, messageIndex) => ({ ...message, content: message.content.map((block, blockIndex) => {
    if (block.type !== 'image') return block;
    const occurrence = marker(messageIndex, blockIndex);
    if (block.offloaded === true) return { type: 'text', text: offloadedText(block.attachment, occurrence) };
    const version = versions.get(block.attachment.attachmentId);
    native.push({ type: 'text', text: imageLabel(message, block.attachment, version, messageIndex, blockIndex) }, { type: 'image', url: version.url });
    return { type: 'image', attachment: block.attachment, imageOccurrence: occurrence,
      requestImage: { mediaType: version.mediaType, width: version.width, height: version.height } };
  }) }));
  const input = [{ type: 'text', text: JSON.stringify({ format: 'harness-role-tagged-transcript-v1', messages: projected }) }, ...native];
  assertTurnTextLimit(input);
  return input;
}

/** Budget the complete retained history, but answer only the suspended tool call. */
export async function prepareToolOutput(messages, messageIndex, options) {
  const versions = await prepareImages(messages, options);
  const message = messages[messageIndex];
  if (message?.role !== 'tool') throw failure('A tool output must reference a tool-role message');
  const contentItems = [];
  for (const [blockIndex, block] of message.content.entries()) {
    if (block.type === 'text') contentItems.push({ type: 'inputText', text: block.text });
    else if (block.offloaded === true) contentItems.push({ type: 'inputText', text: offloadedText(block.attachment, marker(messageIndex, blockIndex)) });
    else {
      const version = versions.get(block.attachment.attachmentId);
      contentItems.push({ type: 'inputText', text: imageLabel(message, block.attachment, version, messageIndex, blockIndex) }, { type: 'inputImage', imageUrl: version.url });
    }
  }
  return { contentItems, success: !message.isError };
}
