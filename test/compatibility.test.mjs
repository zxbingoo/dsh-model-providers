import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
test('host range has explicit prerelease branches and a bounded breaking-version ceiling', () => {
  assert.equal(pkg.engines.dsh, '>=0.2.1-rc.5 <0.2.2-0 || >=0.2.2-rc.1 <0.3.0-0');
  assert.equal(pkg.peerDependencies['@deepseek-ai/schemastery'], '^3.18.5');
  assert.equal(pkg.scripts['test:compatibility'], 'node scripts/check-host-compatibility.mjs');
  assert(pkg.files.includes('scripts/check-host-compatibility.mjs'));
});
test('compatibility checks explicitly test rejection as well as admission, without bypass flags', async () => {
  const script = await readFile(new URL('../scripts/check-host-compatibility.mjs', import.meta.url), 'utf8');
  assert(script.includes("const semver = hostRequire('semver')"));
  for (const version of ['0.2.1-rc.4', '0.2.2-rc.0', '0.2.3-rc.1', '0.3.0-alpha.1', '1.0.0']) assert(script.includes(`'${version}'`));
  assert(script.includes("await import('./test-host-transport.mjs')"));
  assert.doesNotMatch(script, /includePrerelease\s*:\s*true|acceptRisk\s*:\s*true/);
});
