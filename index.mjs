import { CodexCliAdapter } from './adapter.mjs';
import { CodexRpc } from './rpc.mjs';
import { prepareIsolation, discoverModels } from './runtime.mjs';
import { CONFIGURED_MODEL, currentConfig, resolveOptions, createModelDirectory } from './controller.mjs';
export { Config } from './config.mjs';

export const name = 'harness-codex-cli-link';
export const inject = ['llm'];
export function apply(ctx, config = {}) {
  const ns = ctx.fiber?.entry?.options?.id ?? name;
  const directory = createModelDirectory(discoverModels);
  const adapter = new CodexCliAdapter({ prepareIsolation, rpcFactory: options => new CodexRpc({ ...options, binary: process.env.CODEX_BIN || 'codex' }) });
  const originalStream = adapter.stream.bind(adapter);
  adapter.stream = async function* (options) {
    try { yield* originalStream(resolveOptions(options, config)); }
    catch (error) { yield { type: 'finish', reason: { kind: 'error', failure: { code: error.code ?? 'INVALID_REQUEST', message: error.message } } }; }
  };
  adapter.listModels = async provider => {
    if (!currentConfig(config).enabled) return [];
    const models = await directory(); adapter.models = models;
    return [{ id: CONFIGURED_MODEL, name: `跟随插件配置 · ${currentConfig(config).model}` }, ...models].map(m => ({ ...m, provider, inputModalities: ['text'] }));
  };
  adapter.resolveModel = async (provider, model) => {
    const c = currentConfig(config);
    const actual = model === CONFIGURED_MODEL ? c.model : model;
    const metadata = c.enabled ? (await directory()).find(m => m.id === actual) : undefined;
    return { ...metadata, provider, id: model, name: model === CONFIGURED_MODEL ? `跟随插件配置 · ${c.model}` : metadata?.name ?? model, inputModalities: ['text'] };
  };
  adapter.imageRequestPricing = () => undefined;
  adapter.imageRequestTarget = (_provider, _model, image) => ({ width: image.width, height: image.height, maxBytes: image.bytes });
  let registration;
  ctx.effect(() => { registration = ctx.llm.registerAdapter(['codex-cli'], adapter); return registration; });
  ctx.on('loader/volatile-update', () => registration?.replace(['codex-cli']));
  ctx.effect(() => () => adapter.close());
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
