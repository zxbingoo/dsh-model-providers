// Explicit-runtime, credential-free compatibility gate. Does not start DSH or CLI.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const runtime = process.env.DSH_HOST_RUNTIME_DIR;
if (!runtime) throw new Error('Set DSH_HOST_RUNTIME_DIR to the actual dsh runtime directory.');
const root = resolve(runtime);
const hostRequire = createRequire(join(root, 'package.json'));
const semver = hostRequire('semver'); // Use the same semantics as the selected host, including prereleases.
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const host = JSON.parse(await readFile(hostRequire.resolve('@deepseek-ai/dsh/package.json'), 'utf8'));
const schema = JSON.parse(await readFile(hostRequire.resolve('@deepseek-ai/schemastery/package.json'), 'utf8'));
assert(semver.satisfies(host.version, pkg.engines.dsh), `DSH ${host.version} is outside ${pkg.engines.dsh}; validate before widening the range.`);
assert(semver.satisfies(schema.version, pkg.peerDependencies['@deepseek-ai/schemastery']), `Schemastery ${schema.version} is outside the peer range.`);

const accepted = ['0.2.1-rc.5', '0.2.1-rc.6', '0.2.1', '0.2.2-rc.1', '0.2.2-rc.2', '0.2.2', '0.2.3', '0.2.99'];
const rejected = ['0.2.0', '0.2.1-rc.4', '0.2.2-rc.0', '0.2.3-rc.1', '0.3.0-alpha.1', '0.3.0', '1.0.0'];
for (const version of accepted) assert(semver.satisfies(version, pkg.engines.dsh), `Expected acceptance: ${version}`);
for (const version of rejected) assert(!semver.satisfies(version, pkg.engines.dsh), `Expected rejection: ${version}`);
for (const version of ['3.18.5', '3.19.0']) assert(semver.satisfies(version, pkg.peerDependencies['@deepseek-ai/schemastery']));
for (const version of ['3.18.4', '4.0.0']) assert(!semver.satisfies(version, pkg.peerDependencies['@deepseek-ai/schemastery']));

// Test the schema-building API against the host's peer, not only local test dependencies.
const schemaEntry = hostRequire.resolve('@deepseek-ai/schemastery');
const imported = await import(pathToFileURL(schemaEntry).href);
const z = imported.default;
const config = z.object({ enabled: z.boolean().default(true).volatile(), model: z.string().min(1).max(200).default('test').volatile(), reasoningEffort: z.union(['default', 'high'].map(value => z.const(value))).default('default').volatile() });
assert(config);
for (const name of ['dsh-client-ui-layout', 'dsh-client-ui-sidebar', 'dsh-api-remotes', 'dsh-client-connection']) {
  const metadata = JSON.parse(await readFile(hostRequire.resolve(`@deepseek-ai/${name}/package.json`), 'utf8'));
  assert(metadata.exports?.['./client'], `${name} must export its browser client`);
}
await import('./test-host-transport.mjs');
console.log(JSON.stringify({ compatibility: true, dsh: host.version, schemastery: schema.version, dshRange: pkg.engines.dsh,
  accepted, rejected, scope: 'metadata, host peer schema API and actual offline transport; not real-account/model/GUI E2E' }, null, 2));
