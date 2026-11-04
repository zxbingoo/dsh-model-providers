export const CONFIGURED_MODEL = 'configured';
export const DEFAULTS = { enabled: true, model: 'gpt-6.1-sol', reasoningEffort: 'default' };
export const EFFORTS = ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
export function currentConfig(config = {}) {
  const get = (key) => typeof config[key]?.get === 'function' ? config[key].get() : config[key] ?? DEFAULTS[key];
  return { enabled: get('enabled'), model: get('model'), reasoningEffort: get('reasoningEffort') };
}
// `configured` is a legacy stored route only, never a model-picker choice.
export const usesDefaultModel = model => model == null || model === CONFIGURED_MODEL || (typeof model === 'string' && !model.trim());
export function resolveModelId(model, config) {
  return usesDefaultModel(model) ? currentConfig(config).model : model;
}
export function modelChoices(models, config) {
  const c = currentConfig(config);
  if (!c.enabled) return [];
  const choices = models.filter(m => m.id !== CONFIGURED_MODEL);
  // Keep a configured custom upstream ID selectable under its actual ID/name.
  return choices.some(m => m.id === c.model) || c.model === CONFIGURED_MODEL
    ? choices : [{ id: c.model, name: c.model }, ...choices];
}
export function resolveOptions(options, config) {
  const c = currentConfig(config);
  if (!c.enabled) throw Object.assign(new Error('Codex CLI 已停用，请在左侧 Providers 面板中启用。'), { code: 'CODEX_DISABLED' });
  return { ...options, model: resolveModelId(options.model, c),
    ...(options.reasoningEffort === undefined && c.reasoningEffort !== 'default' ? { reasoningEffort: c.reasoningEffort } : {}) };
}
// The native selector requires a concrete catalog ID for its default. Migrate
// only a legacy/default-empty route, never a model the user already chose.
export async function migrateDefaultSelection(defaults, config) {
  const c = currentConfig(config);
  if (!c.enabled) return false;
  const selected = defaults.currentSelection();
  const empty = !selected.provider && !selected.model;
  if (!empty && !(selected.provider === 'codex-cli' && usesDefaultModel(selected.model))) return false;
  await defaults.saveSelection({ provider: 'codex-cli', model: c.model,
    ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }) });
  return true;
}
export function createModelDirectory(discover, ttlMs = 60000, fingerprint = async () => '') {
  let models, expires = 0, cachedKey, pending;
  return async (refresh = false) => {
    const key = await fingerprint();
    if (!refresh && models && key === cachedKey && Date.now() < expires) return structuredClone(models);
    if (!pending || pending.key !== key) {
      const request = { key };
      request.promise = Promise.resolve().then(discover).then(value => {
        if (pending === request) { models = structuredClone(value); cachedKey = key; expires = Date.now() + ttlMs; }
        return value;
      }).finally(() => { if (pending === request) pending = undefined; });
      pending = request;
    }
    return structuredClone(await pending.promise);
  };
}
