import * as nodeFs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir, homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { CodexRpc } from './rpc.mjs';
import { CODEX_VERSION, assertCodexVersion, readConfigStructure, constructIsolatedCatalog, buildIsolationArgs, buildDiscoveryArgs } from './isolation/isolation.mjs';

const TEMP_PREFIX = 'dsh-codex-bridge-';
const nonemptyString = value => typeof value === 'string' && value.length > 0;

/** Normalize only fields reported by model/list, never infer capabilities from an ID.
 * Future modality/reasoning strings are preserved; malformed/absent modalities stay unknown.
 */
function discoveredModel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const id = nonemptyString(value.model) ? value.model : nonemptyString(value.id) ? value.id : undefined;
  if (!id) return;
  const model = { id, name: nonemptyString(value.displayName) ? value.displayName : id };
  if (typeof value.description === 'string') model.description = value.description;
  if (Array.isArray(value.inputModalities) && value.inputModalities.every(nonemptyString)) {
    model.inputModalities = [...new Set(value.inputModalities)];
  }
  if (Array.isArray(value.supportedReasoningEfforts)) {
    const efforts = value.supportedReasoningEfforts.filter(e => nonemptyString(e?.reasoningEffort)).map(e => ({
      id: e.reasoningEffort, name: e.reasoningEffort,
      ...(typeof e.description === 'string' ? { description: e.description } : {}),
    }));
    if (efforts.length || !value.supportedReasoningEfforts.length) model.reasoning = { efforts };
  }
  if (nonemptyString(value.defaultReasoningEffort)) model.defaultReasoningEffort = value.defaultReasoningEffort;
  return model;
}

/** Dependency injection keeps discovery tests entirely offline and credential-free.
 * The bundled catalog is loaded lazily, for execution isolation only.
 */
export function createRuntime({
  fs: fsOverrides = {}, env = process.env, homeDir = homedir, tempDir = tmpdir,
  assertVersion = assertCodexVersion, readStructure = readConfigStructure,
  loadCatalog, rpcFactory = options => new CodexRpc(options),
} = {}) {
  const fs = { ...nodeFs, ...fsOverrides };
  const executionCatalog = loadCatalog ?? (async () => JSON.parse(await fs.readFile(new URL('./isolation/models.json', import.meta.url), 'utf8')));
  const context = () => ({ binary: env.CODEX_BIN || 'codex', home: resolve(env.CODEX_HOME || join(homeDir(), '.codex')) });

  async function structureAt(home) {
    const path = join(home, 'config.toml');
    try { await fs.stat(path); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
    return readStructure(path);
  }

  async function prepare(model, metadata, discovery) {
    const { binary, home } = context();
    await assertVersion(binary);
    const structure = await structureAt(home);
    const tempRoot = await fs.realpath(tempDir());
    const root = await fs.mkdtemp(join(tempRoot, TEMP_PREFIX));
    const cleanup = async () => {
      let actual;
      try { actual = await fs.realpath(root); }
      catch (error) { if (error.code === 'ENOENT') return; throw error; }
      // Verify the exact mkdtemp directory, never a symlink or a computed parent.
      if (actual !== root || dirname(root) !== tempRoot || !basename(root).startsWith(TEMP_PREFIX)) {
        throw new Error('Refusing to remove an unexpected Codex isolation directory');
      }
      await fs.rm(root, { recursive: true, force: true });
    };
    try {
      let args;
      if (discovery) {
        args = buildDiscoveryArgs({ structure });
      } else {
        const catalogPath = join(root, 'models.json');
        const catalog = constructIsolatedCatalog(await executionCatalog(), model, metadata);
        await fs.writeFile(catalogPath, JSON.stringify(catalog), { mode: 0o600 });
        args = buildIsolationArgs({ catalogPath, structure });
      }
      return { binary, cwd: root, args, cleanup };
    } catch (error) {
      try { await cleanup(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Codex isolation preparation and cleanup failed'); }
      throw error;
    }
  }

  /** Execution only. Supply the selected entry from discoverModels() when known.
   * Missing metadata remains unknown to the host; the isolated CLI transport permits
   * text/images without pretending that some other bundled model's capabilities apply.
   */
  async function prepareIsolation(model, metadata) { return prepare(model, metadata, false); }

  /** Catalog-only startup. It never writes or injects the plugin's bundled catalog. */
  async function prepareDiscoveryIsolation() { return prepare(undefined, undefined, true); }

  async function discoverModels() {
    const isolation = await prepareDiscoveryIsolation();
    let rpc;
    try {
      rpc = rpcFactory({ binary: isolation.binary, args: isolation.args, cwd: isolation.cwd, env,
        onRequest: async () => { throw new Error('Server requests are not allowed during Codex model discovery'); },
      });
      await rpc.initialize();
      const models = new Map(), seenCursors = new Set();
      let cursor;
      do {
        // Discovery deliberately has no thread or turn: model metadata lookup only.
        const result = await rpc.call('model/list', { includeHidden: false, ...(cursor === undefined ? {} : { cursor }) });
        if (!result || !Array.isArray(result.data)) throw new Error('Invalid Codex model/list response');
        for (const value of result.data) {
          const model = discoveredModel(value);
          if (model) models.set(model.id, model);
        }
        cursor = result.nextCursor;
        if (cursor == null) break;
        if (!nonemptyString(cursor) || seenCursors.has(cursor)) throw new Error('Invalid or repeated Codex model/list cursor');
        seenCursors.add(cursor);
      } while (true);
      return [...models.values()];
    } finally {
      try { await rpc?.close(); }
      finally { await isolation.cleanup(); }
    }
  }

  /** Opaque cache key; stats config.toml only, never reads config values or auth files.
   * Auth/upstream/environment changes not represented here still need TTL/manual refresh.
   */
  async function getDiscoveryFingerprint() {
    const { binary, home } = context();
    let config = null;
    try {
      const stat = await fs.stat(join(home, 'config.toml'), { bigint: true });
      config = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].map(key => String(stat[key]));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return createHash('sha256').update(JSON.stringify({ version: CODEX_VERSION, binary, home, path: env.PATH ?? '', config })).digest('hex');
  }

  return { prepareIsolation, prepareDiscoveryIsolation, discoverModels, getDiscoveryFingerprint };
}

export const { prepareIsolation, prepareDiscoveryIsolation, discoverModels, getDiscoveryFingerprint } = createRuntime();
