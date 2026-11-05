import { readAccountUsage } from './runtime.mjs';
import { USAGE_MESSAGES } from './account-usage.mjs';

const failure = (code, message) => ({ ok: false, error: { code, message, details: {} } });
const cancelled = () => Object.assign(new Error('Account usage read cancelled'), { name: 'AbortError' });

/** Only in-flight reads are shared. No TTL/account cache, disk, settings or logs.
 * Each caller owns cancellation; cancelling one tab must not cancel another tab.
 */
export function createUsageService(read = readAccountUsage) {
  let pending, disposed = false;
  function get(signal) {
    if (disposed || signal?.aborted) return Promise.reject(cancelled());
    if (!pending) {
      const entry = { controller: new AbortController(), listeners: new Set() };
      pending = entry;
      Promise.resolve().then(() => {
        entry.controller.signal.throwIfAborted();
        return read({ signal: entry.controller.signal });
      }).then(value => settle(entry, null, value), () => settle(entry, new Error('Account usage unavailable')));
    }
    const entry = pending;
    return new Promise((resolve, reject) => {
      const listener = { resolve, reject, signal };
      listener.abort = () => {
        if (!entry.listeners.delete(listener)) return;
        signal?.removeEventListener('abort', listener.abort);
        reject(cancelled());
        // Drop immediately: a later request starts a fresh, non-aborted process.
        if (!entry.listeners.size) {
          if (pending === entry) pending = undefined;
          entry.controller.abort();
        }
      };
      entry.listeners.add(listener);
      signal?.addEventListener('abort', listener.abort, { once: true });
      if (signal?.aborted) listener.abort();
    });
  }
  function settle(entry, error, value) {
    if (pending === entry) pending = undefined;
    for (const listener of entry.listeners) {
      listener.signal?.removeEventListener('abort', listener.abort);
      if (error) listener.reject(error);
      else {
        try { listener.resolve(structuredClone(value)); }
        catch { listener.reject(new Error('Account usage unavailable')); }
      }
    }
    entry.listeners.clear();
  }
  function close() {
    disposed = true;
    const entry = pending; pending = undefined;
    if (!entry) return;
    entry.controller.abort();
    settle(entry, cancelled());
  }
  return { get, close };
}

/** The public endpoint is not a general-purpose Codex/command proxy. The host
 * authenticates the connection, then this branch additionally requires owner.
 */
export function createUsageHandler(service) {
  return async (payload, signal, peer) => {
    if (peer?.principal?.kind !== 'owner' || peer.signal?.aborted) {
      return failure('codex/forbidden', '仅 Harness 所有者可查看账号额度。');
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 0) {
      return failure('codex/bad-request', '额度查询仅接受空参数。');
    }
    // The host may independently revoke this peer while the HTTP request lives.
    const controller = new AbortController();
    const abort = () => controller.abort();
    const signals = [...new Set([signal, peer.signal].filter(Boolean))];
    for (const source of signals) {
      source.addEventListener('abort', abort, { once: true });
      if (source.aborted) abort();
    }
    try {
      const value = await service.get(controller.signal);
      controller.signal.throwIfAborted();
      return { ok: true, value };
    } catch {
      return failure(controller.signal.aborted ? 'codex/cancelled' : 'codex/unavailable',
        controller.signal.aborted ? '额度查询已取消。' : USAGE_MESSAGES.unavailable);
    } finally {
      for (const source of signals) source.removeEventListener('abort', abort);
    }
  };
}
