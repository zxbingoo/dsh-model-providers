import { CodexCliAdapter } from './adapter.mjs';
import { CodexRpc } from './rpc.mjs';
import { prepareIsolation, discoverModels } from './runtime.mjs';

export const name = 'harness-codex-cli-link';
export const inject = ['llm'];
export function apply(ctx) {
  const adapter = new CodexCliAdapter({ prepareIsolation, rpcFactory: options => new CodexRpc({ ...options, binary: process.env.CODEX_BIN || 'codex' }) });
  let cached, expires = 0;
  adapter.listModels = async provider => {
    if (!cached || Date.now() > expires) {
      cached = await discoverModels(); expires = Date.now() + 60000;
      adapter.models = cached;
    }
    return cached.map(m => ({ ...m, provider, inputModalities: ['text'] }));
  };
  // Match optional base-adapter image hooks without adding a runtime dependency.
  adapter.imageRequestPricing = () => undefined;
  adapter.imageRequestTarget = (_provider, _model, image) => ({ width: image.width, height: image.height, maxBytes: image.bytes });
  ctx.effect(() => ctx.llm.registerAdapter(['codex-cli'], adapter));
  ctx.effect(() => () => adapter.close());
}
