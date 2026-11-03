export const CONFIGURED_MODEL = 'configured';
export const DEFAULTS = { enabled: true, model: 'gpt-6.1-sol', reasoningEffort: 'default' };
export const EFFORTS = ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
export function currentConfig(config = {}) {
  const get = (key) => typeof config[key]?.get === 'function' ? config[key].get() : config[key] ?? DEFAULTS[key];
  return { enabled: get('enabled'), model: get('model'), reasoningEffort: get('reasoningEffort') };
}
export function resolveOptions(options, config) {
  const c = currentConfig(config);
  if (!c.enabled) throw Object.assign(new Error('Codex CLI 已停用，请在左侧 Providers 面板中启用。'), { code: 'CODEX_DISABLED' });
  return { ...options, model: options.model === CONFIGURED_MODEL ? c.model : options.model,
    ...(options.reasoningEffort === undefined && c.reasoningEffort !== 'default' ? { reasoningEffort: c.reasoningEffort } : {}) };
}
export function createModelDirectory(discover, ttlMs = 60000) {
  let models, expires = 0, pending;
  return async (refresh = false) => {
    if (!refresh && models && Date.now() < expires) return models;
    if (!pending) pending = Promise.resolve().then(discover).then(value => { models = value; expires = Date.now() + ttlMs; return models; }).finally(() => { pending = undefined; });
    return pending;
  };
}
