import { execFile } from 'node:child_process';

/** CLI-local catalog, not an assertion that a remote provider verified the limit.
 * CLI owns auth/cache validation. No shell, thread, turn or credential extraction.
 */
export function readNativeModelCatalog({ binary, cwd, env, args = [] }) {
  return new Promise((resolve, reject) => {
    // Discovery starts with --listen stdio://; debug models only accepts -c overrides.
    const overrides = args.slice(2);
    execFile(binary, [...overrides, 'debug', 'models'], {
      cwd, env, encoding: 'utf8', timeout: 15000, maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    }, (error, stdout) => {
      if (error) return reject(new Error('Codex model capacity metadata unavailable'));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error('Invalid Codex model capacity metadata')); }
    });
  });
}
const positive = value => Number.isSafeInteger(value) && value > 0;
/** Mirror Codex usable_context_window and explicit config max clamping.
 * Exact slugs only; no prefix matching or copying another model's template.
 */
export function nativeModelContexts(catalog, config) {
  const contexts = new Map();
  if (!Array.isArray(catalog?.models)) return contexts;
  for (const item of catalog.models) {
    if (typeof item?.slug !== 'string' || !item.slug.trim()) continue;
    let capacity = positive(item.context_window) ? item.context_window : positive(item.max_context_window) ? item.max_context_window : undefined;
    if (config?.model === item.slug && positive(config.model_context_window)) {
      capacity = positive(item.max_context_window) ? Math.min(config.model_context_window, item.max_context_window) : config.model_context_window;
    }
    const percent = item.effective_context_window_percent === undefined ? 95 : item.effective_context_window_percent;
    if (!positive(capacity) || !Number.isInteger(percent) || percent <= 0 || percent > 100) continue;
    const usable = Math.floor(capacity * (percent / 100));
    if (positive(usable)) contexts.set(item.slug, { context: { contextWindow: usable }, contextSource: 'codex-native-catalog' });
  }
  return contexts;
}
