import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { CodexRpc } from './rpc.mjs';
import { assertCodexVersion, readConfigStructure, constructIsolatedCatalog, buildIsolationArgs } from './isolation/isolation.mjs';

const catalog = JSON.parse(await readFile(new URL('./isolation/models.json', import.meta.url), 'utf8'));
export async function prepareIsolation(model, discovery = false) {
  assertCodexVersion(process.env.CODEX_BIN || 'codex');
  const home = resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));
  let structure = {};
  try { await realpath(join(home, 'config.toml')); structure = readConfigStructure(join(home, 'config.toml')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const tempRoot = await realpath(tmpdir());
  const root = await mkdtemp(join(tempRoot, 'dsh-codex-bridge-'));
  const catalogPath = join(root, 'models.json');
  try {
    await writeFile(catalogPath, JSON.stringify(discovery ? { models: catalog.models.map(m => constructIsolatedCatalog(catalog, m.slug).models[0]) } : constructIsolatedCatalog(catalog, model)), { mode: 0o600 });
    return { cwd: root, args: buildIsolationArgs({ catalogPath, structure }), cleanup: async () => {
      // Only remove the exact mkdtemp directory owned by this invocation.
      if (await realpath(root).catch(() => undefined) === root && root.startsWith(join(tempRoot, 'dsh-codex-bridge-'))) await rm(root, { recursive: true, force: true });
    } };
  } catch (error) { throw error; }
}

export async function discoverModels() {
  const isolation = await prepareIsolation(catalog.models[0].slug, true);
  const rpc = new CodexRpc({ binary: process.env.CODEX_BIN || 'codex', args: isolation.args, cwd: isolation.cwd });
  try {
    await rpc.initialize();
    const models = []; let cursor;
    do {
      const result = await rpc.call('model/list', { includeHidden: false, ...(cursor ? { cursor } : {}) });
      for (const m of result.data ?? []) models.push({ id: m.model ?? m.id, name: m.displayName ?? m.model ?? m.id,
        ...(m.supportedReasoningEfforts?.length ? { reasoning: { efforts: m.supportedReasoningEfforts.map(e => ({ id: e.reasoningEffort, name: e.reasoningEffort, description: e.description })) } } : {}) });
      cursor = result.nextCursor;
    } while (cursor);
    return models;
  } finally { rpc.close(); await isolation.cleanup(); }
}
