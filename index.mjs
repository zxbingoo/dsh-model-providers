import { CodexCliAdapter } from './adapter.mjs';
import { CodexRpc } from './rpc.mjs';
import { prepareIsolation, discoverModels, getDiscoveryFingerprint } from './runtime.mjs';
import { imageRequestTarget } from './images.mjs';
import { currentConfig, resolveModelId, modelChoices, resolveOptions, migrateDefaultSelection, createModelDirectory } from './controller.mjs';
export { Config } from './config.mjs';

export const name = 'dsh-model-providers';
export const inject = ['llm'];
export function createCodexAdapter(config = {}, {
  discover = discoverModels, fingerprint = getDiscoveryFingerprint,
  prepare = prepareIsolation, resolveAttachments,
  rpcFactory = options => new CodexRpc({ ...options, binary: process.env.CODEX_BIN || 'codex' }),
} = {}) {
  const directory = createModelDirectory(discover, 60000, fingerprint);
  const adapter = new CodexCliAdapter({ prepareIsolation: prepare, resolveAttachments, rpcFactory });
  const originalStream = adapter.stream.bind(adapter);
  adapter.stream = async function* (options) {
    try { const resolved = resolveOptions(options, config);
      const metadata = (await directory()).find(m => m.id === resolved.model);
      yield* originalStream({ ...resolved, codexModelInfo: metadata }); }
    catch (error) { yield { type: 'finish', reason: { kind: 'error', failure: { code: error.code ?? 'INVALID_REQUEST', message: error.message } } }; }
  };
  adapter.listModels = async provider => {
    const c = currentConfig(config);
    if (!c.enabled) return [];
    const models = await directory(true); adapter.models = models;
    return modelChoices(models, c).map(m => ({ ...m, provider }));
  };
  adapter.resolveModel = async (provider, model) => {
    const c = currentConfig(config);
    const actual = resolveModelId(model, c);
    const metadata = c.enabled ? (await directory()).find(m => m.id === actual) : undefined;
    // Retain a legacy requested ID for replay, but label it with the real model.
    return { ...metadata, provider, id: model?.trim() ? model : actual, name: metadata?.name ?? actual };
  };
  adapter.prepareCall = async (provider, model, signal) => {
    signal?.throwIfAborted();
    const snapshot = currentConfig(config);
    const resolved = resolveOptions({ model }, snapshot);
    const metadata = structuredClone((await directory()).find(m => m.id === resolved.model));
    signal?.throwIfAborted();
    return { model: { ...metadata, provider, id: model?.trim() ? model : resolved.model, name: metadata?.name ?? resolved.model },
      stream: async function* (options) {
        try {
          if (!currentConfig(config).enabled) throw Object.assign(new Error('Codex CLI 已停用'), { code: 'CODEX_DISABLED' });
          yield* originalStream({ ...resolveOptions(options, snapshot), codexModelInfo: metadata });
        } catch (error) { yield { type: 'finish', reason: { kind: 'error', failure: { code: error.code ?? 'INVALID_REQUEST', message: error.message } } }; }
      }
    };
  };
  adapter.imageRequestPricing = () => undefined;
  adapter.imageRequestTarget = (_provider, _model, image) => imageRequestTarget(image);
  return { adapter, directory };
}

export function apply(ctx, config = {}) {
  const ns = ctx.fiber?.entry?.options?.id ?? name;
  const { adapter, directory } = createCodexAdapter(config, { resolveAttachments: () => ctx.get?.('attachments') });
  let registration;
  ctx.effect(() => { registration = ctx.llm.registerAdapter(['codex-cli'], adapter); return registration; });
  ctx.on('loader/volatile-update', () => registration?.replace(['codex-cli']));
  ctx.effect(() => () => adapter.close());
  ctx.inject(['agentDefaultModel'], child => child.effect(() => {
    let disposed = false;
    migrateDefaultSelection(child.agentDefaultModel, config).then(changed => {
      if (changed && !disposed) registration?.replace(['codex-cli']);
    }).catch(error => { if (!disposed) ctx.logger?.warn?.(`Unable to migrate legacy Codex default: ${error.message}`); });
    return () => { disposed = true; };
  }));
  ctx.inject(['settings'], child => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)));
  ctx.inject(['connection'], child => {
    child.connection.rpc.handle('/harness-codex-cli-link', async (endpoint, payload, signal) => {
      try {
        if (endpoint !== 'status') return { ok: false, error: { code: 'codex/not-found', message: 'Unknown method', details: {} } };
        if (payload !== undefined && payload !== null && (typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(k => k !== 'refresh') || (payload.refresh !== undefined && typeof payload.refresh !== 'boolean'))) throw new Error('Invalid status request');
        signal?.throwIfAborted();
        const models = await directory(payload?.refresh === true);
        signal?.throwIfAborted();
        return { ok: true, value: { namespace: ns, settings: currentConfig(config), models, version: '0.166.0', supportedProviders: ['codex'], connected: true } };
      } catch (error) { return { ok: false, error: { code: 'codex/unavailable', message: error.message, details: {} } }; }
    });
  });
}
