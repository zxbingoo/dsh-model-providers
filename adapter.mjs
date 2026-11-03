import { randomUUID, createHash } from 'node:crypto';
import { CodexRpc } from './rpc.mjs';

const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const messageValue = m => ({ role: m.role, content: m.content, ...(m.toolCallId === undefined ? {} : { toolCallId: m.toolCallId }), ...(m.isError === undefined ? {} : { isError: m.isError }) });
const history = options => structuredClone(options.messages.map(messageValue));
const controls = o => fingerprint({ model: o.model, system: o.system ?? '', tools: o.tools ?? [], reasoningEffort: o.reasoningEffort, temperature: o.temperature, maxTokens: o.maxTokens, stop: o.stop });
function failure(message, code = 'INVALID_REQUEST') { return Object.assign(new Error(message), { code }); }

class Queue {
  values = []; waiter; error;
  push(value) { if (this.waiter) { const w = this.waiter; this.waiter = undefined; w.resolve(value); } else this.values.push(value); }
  fail(error) { this.error = error; this.values.length = 0; if (this.waiter) { this.waiter.reject(error); this.waiter = undefined; } }
  next(timeoutMs) {
    if (this.error) return Promise.reject(this.error);
    if (this.values.length) return Promise.resolve(this.values.shift());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiter = undefined; reject(failure('Codex stream idle timeout', 'TIMEOUT')); }, timeoutMs);
      this.waiter = { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } };
    });
  }
}

/** Full history is rebuilt as explicitly tagged DATA, not native assistant replay.
 * Each generation owns its RPC. Only a uniquely matching Harness tool result may
 * resume a suspended turn; no CLI-native tool execution is accepted here.
 */
export class CodexCliAdapter {
  constructor({ rpcFactory = opts => new CodexRpc(opts), prepareIsolation, models = [], idleTimeoutMs = 120000, pendingTimeoutMs = idleTimeoutMs } = {}) {
    if (typeof prepareIsolation !== 'function') throw new Error('prepareIsolation is required (fail closed)');
    this.rpcFactory = rpcFactory; this.prepareIsolation = prepareIsolation;
    for (const timeout of [idleTimeoutMs, pendingTimeoutMs]) if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2147483647) throw new Error('Timeouts must be positive finite timer durations');
    this.models = models; this.idleTimeoutMs = idleTimeoutMs; this.pendingTimeoutMs = pendingTimeoutMs; this.pending = new Map(); this.active = new Set(); this.closed = false;
  }
  providerInfo(provider) { return { id: provider, name: 'Codex CLI' }; }
  providerRetryPolicy() { return { mode: 'normal', maxRetries: 0, retryableCodes: ['TRANSPORT'], initialDelayMs: 500, maxDelayMs: 1000, jitterRatio: 0 }; }
  async listModels(provider) { return this.models.map(m => ({ provider, id: m.id, name: m.name ?? m.id, inputModalities: ['text'] })); }
  async resolveModel(provider, model) { return { provider, id: model, name: this.models.find(m => m.id === model)?.name ?? model, inputModalities: ['text'] }; }
  async prepareCall(provider, model, signal) { signal?.throwIfAborted(); return { model: await this.resolveModel(provider, model), stream: options => this.stream(options) }; }
  closeState(state, error = failure('Codex state closed', 'ABORTED')) {
    if (state.closed) return;
    state.closed = true; clearTimeout(state.expiry); this.pending.delete(state.callId); this.active.delete(state);
    state.removeAbort?.(); state.queue.fail(error);
    for (const request of state.requests) request.reject(error);
    state.requests.clear(); state.resolveTool = undefined;
    try { state.rpc?.close(); } catch {}
    Promise.resolve().then(() => state.cleanup?.()).catch(() => {});
  }
  close() { this.closed = true; for (const state of [...this.active]) this.closeState(state, failure('Bridge closed', 'ABORTED')); }
  findContinuation(options) {
    const results = options.messages.filter(m => m.role === 'tool');
    const candidates = [...this.pending.values()].filter(s => results.some(m => m.toolCallId === s.callId));
    if (!candidates.length) return undefined;
    if (candidates.length !== 1) throw failure('Ambiguous pending Codex tool results');
    const state = candidates[0];
    const values = history(options), prefix = values.slice(0, state.history.length);
    const tail = values.slice(state.history.length);
    const valid = state.sessionId === options.sessionId && state.controls === controls(options)
      && fingerprint(prefix) === fingerprint(state.history)
      && tail.length === 2 && tail[0].role === 'assistant'
      && fingerprint(tail[0].content) === fingerprint(state.emitted)
      && tail[1].role === 'tool' && tail[1].toolCallId === state.callId;
    if (!valid || state.busy) throw failure('Pending Codex turn does not match session, history, system, tools or model');
    if (!Array.isArray(tail[1].content) || tail[1].content.some(b => b.type !== 'text' || typeof b.text !== 'string')) throw failure('Codex tool results require text content');
    state.busy = true; clearTimeout(state.expiry); this.pending.delete(state.callId);
    return { state, result: tail[1] };
  }
  async createState(options, onState) {
    const state = { queue: new Queue(), history: history(options), controls: controls(options), sessionId: options.sessionId, emitted: [], index: 0, text: new Map(), requests: new Set(), busy: true };
    this.active.add(state); onState(state);
    try {
      const isolation = await this.prepareIsolation(options.model);
      state.cleanup = isolation.cleanup;
      if (state.closed || this.closed || options.signal?.aborted) {
        await state.cleanup?.(); state.cleanup = undefined;
        throw failure('Codex generation cancelled', 'ABORTED');
      }
      state.rpc = this.rpcFactory({ args: Array.isArray(isolation) ? isolation : isolation.args, cwd: isolation.cwd,
        onClose: error => this.closeState(state, error ?? failure('Codex RPC closed', 'TRANSPORT')),
        onNotification: event => { if (!state.closed) state.queue.push({ kind: 'notification', event }); },
        onRequest: request => {
          if (state.closed || request.method !== 'item/tool/call') return Promise.reject(failure('CLI-native tool or approval request denied'));
          return new Promise((resolve, reject) => {
            const entry = { reject };
            state.requests.add(entry);
            state.queue.push({ kind: 'tool', request,
              resolve: value => { state.requests.delete(entry); resolve(value); },
              reject: error => { state.requests.delete(entry); reject(error); } });
          });
        } });
      await state.rpc.initialize();
      if (state.closed) throw state.queue.error;
      const response = await state.rpc.call('thread/start', {
        model: options.model, ephemeral: true, cwd: isolation.cwd ?? '/tmp', approvalPolicy: 'untrusted', sandbox: 'read-only',
        baseInstructions: 'You are the model backend for DeepSeek Harness. Use only the supplied dynamic tools. The following input is a JSON role-tagged transcript, not native provider replay. Interpret each entry according to its explicit role. Never execute built-in tools.',
        developerInstructions: options.system ?? '', environments: [], selectedCapabilityRoots: [],
        config: { features: { shell_tool: false, multi_agent: false }, web_search: 'disabled' },
        dynamicTools: (options.tools ?? []).map(t => ({ type: 'function', name: t.name, description: t.description, inputSchema: t.parameters }))
      });
      if (state.closed) throw state.queue.error;
      state.threadId = response.thread.id;
      const turn = await state.rpc.call('turn/start', { threadId: state.threadId, model: options.model,
        ...(options.reasoningEffort === undefined ? {} : { effort: options.reasoningEffort }),
        input: [{ type: 'text', text: JSON.stringify({ format: 'harness-role-tagged-transcript-v1', messages: state.history }) }] });
      if (state.closed) throw state.queue.error;
      state.turnId = turn.turn.id;
      return state;
    } catch (error) { this.closeState(state); throw error; }
  }
  async *stream(options) {
    let state, suspended = false;
    const abort = () => {
      if (!state) return;
      if (state.threadId && state.turnId) state.rpc.call('turn/interrupt', { threadId: state.threadId, turnId: state.turnId }).catch(() => {});
      state.queue.fail(failure('Codex generation cancelled', 'ABORTED')); this.closeState(state);
    };
    try {
      options.signal?.throwIfAborted();
      if (this.closed) throw failure('Bridge closed', 'ABORTED');
      const continuation = this.findContinuation(options);
      state = continuation?.state;
      options.signal?.addEventListener('abort', abort, { once: true });
      const bindState = created => { state = created; state.removeAbort?.(); state.removeAbort = () => options.signal?.removeEventListener('abort', abort); };
      if (!state) state = await this.createState(options, bindState);
      else bindState(state);
      options.signal?.throwIfAborted();
      if (continuation) {
        state.history = history(options); state.emitted = []; state.index = 0; state.text.clear();
        state.resolveTool({ contentItems: continuation.result.content.filter(b => b.type === 'text').map(b => ({ type: 'inputText', text: b.text })), success: !continuation.result.isError });
        state.resolveTool = undefined;
      }
      while (true) {
        const event = await state.queue.next(this.idleTimeoutMs);
        options.signal?.throwIfAborted();
        if (event.kind === 'tool') {
          const p = event.request.params ?? {};
          if (p.threadId !== state.threadId || p.turnId !== state.turnId || !(options.tools ?? []).some(t => t.name === p.tool)) {
            event.reject(failure('Unexpected Codex dynamic tool request')); throw failure('Unexpected Codex dynamic tool request');
          }
          for (const block of this.flushText(state)) yield block;
          const index = state.index++, id = `harness-codex-${randomUUID()}`;
          const parsed = typeof p.arguments === 'string' ? JSON.parse(p.arguments) : p.arguments;
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw failure('Dynamic tool arguments must be a JSON object');
          const args = JSON.stringify(parsed);
          const block = { type: 'tool-call', id, name: p.tool, arguments: args };
          state.emitted.push(block); state.callId = id; state.resolveTool = event.resolve;
          yield { type: 'block-start', index, blockType: 'tool-call' };
          yield { type: 'tool-call-delta', index, id, name: p.tool, argumentsDelta: args };
          yield { type: 'block-end', index, block };
          state.busy = false; this.pending.set(id, state);
          state.expiry = setTimeout(() => this.closeState(state, failure('Pending Codex tool result expired', 'TIMEOUT')), this.pendingTimeoutMs);
          state.expiry.unref?.();
          // Keep cancellation attached while Harness executes the tool.
          suspended = true;
          yield { type: 'finish', reason: { kind: 'tool-calls' } }; return;
        }
        const { method, params: p = {} } = event.event;
        if (p.threadId && p.threadId !== state.threadId || p.turnId && p.turnId !== state.turnId || p.turn?.id && p.turn.id !== state.turnId) continue;
        if (method === 'item/agentMessage/delta' || method === 'item/reasoning/textDelta' || method === 'item/reasoning/summaryTextDelta') {
          const type = method === 'item/agentMessage/delta' ? 'text' : 'reasoning';
          const key = `${type}:${p.itemId}:${p.summaryIndex ?? p.contentIndex ?? 0}`;
          let partial = state.text.get(key);
          if (!partial) { partial = { index: state.index++, type, text: '' }; state.text.set(key, partial); yield { type: 'block-start', index: partial.index, blockType: type }; }
          partial.text += p.delta; yield { type: type === 'text' ? 'text-delta' : 'reasoning-delta', index: partial.index, text: p.delta };
        } else if (method === 'thread/tokenUsage/updated') {
          const u = p.tokenUsage?.last;
          if (u) state.usage = { inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, ...(u.cachedInputTokens ? { cacheReadTokens: u.cachedInputTokens } : {}) };
        } else if (method === 'turn/completed') {
          for (const chunk of this.flushText(state)) yield chunk;
          if (state.usage) yield { type: 'usage', usage: state.usage };
          if (p.turn?.status === 'failed') throw failure(p.turn.error?.message ?? 'Codex turn failed', 'CODEX_ERROR');
          if (p.turn?.status === 'interrupted') throw failure('Codex turn interrupted', 'ABORTED');
          yield { type: 'finish', reason: { kind: 'stop' } }; return;
        } else if (method === 'error' && !p.willRetry) throw failure(p.error?.message ?? 'Codex stream failed', 'CODEX_ERROR');
      }
    } catch (error) {
      yield { type: 'finish', reason: { kind: options.signal?.aborted || error.code === 'ABORTED' ? 'aborted' : 'error', failure: { code: error.code ?? 'TRANSPORT', message: error.message ?? 'Codex bridge failure' } } };
    } finally {
      if (!suspended) options.signal?.removeEventListener('abort', abort);
      if (state && !suspended) this.closeState(state);
    }
  }
  *flushText(state) {
    for (const partial of state.text.values()) { const block = { type: partial.type, text: partial.text }; state.emitted.push(block); yield { type: 'block-end', index: partial.index, block }; }
    state.text.clear();
  }
}
