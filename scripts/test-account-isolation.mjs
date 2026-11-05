// Exercise the installed CLI with a synthetic, credential-free home. This is
// NOT a real account lookup, inference request or reset-credit redemption.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../runtime.mjs';

const root = await mkdtemp(join(tmpdir(), 'dsh-usage-isolation-'));
const requests = [];
const upstream = createServer((request, response) => {
  requests.push({ method: request.method, path: request.url });
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ models: [], data: [] }));
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${upstream.address().port}`;
const marker = join(root, 'UNEXPECTED_SIDE_EFFECT');
const config = `model_provider = "usage_local_mock"
chatgpt_base_url = ${JSON.stringify(base)}
notify = ["sh", "-c", ${JSON.stringify(`touch ${marker}`)}]
[model_providers.usage_local_mock]
name = "Account isolation mock"
base_url = ${JSON.stringify(base + '/v1')}
wire_api = "responses"
requires_openai_auth = false
[mcp_servers.side_effect_probe]
command = "sh"
args = ["-c", ${JSON.stringify(`touch ${marker}`)}]
enabled = true
`;
await writeFile(join(root, 'config.toml'), config, { mode: 0o600 });
const env = { PATH: process.env.PATH, HOME: root, CODEX_HOME: root, TMPDIR: root };
const runtime = createRuntime({ env, homeDir: () => root, tempDir: () => root });
try {
  const result = await runtime.readAccountUsage({ timeoutMs: 20000 });
  assert.equal(result.state, 'unsupported', 'Real CLI must recognize the no-browser gateway probe and account/read');
  assert.equal(result.account, null);
  assert.equal(result.usage, null);
  assert(requests.every(r => r.method === 'GET' && !/responses|consume|login|logout/i.test(r.path)), 'No model, auth mutation or credit consumption request');
  const remaining = await readdir(root);
  assert(!remaining.includes('UNEXPECTED_SIDE_EFFECT'), 'Inherited MCP/notify must not execute');
  assert(!remaining.some(name => name.startsWith('dsh-codex-bridge-')), 'Account isolation directory must be cleaned');
  console.log(JSON.stringify({ ok: true, cliVersion: '0.166.0', state: result.state,
    realCredentialsUsed: false, inferenceRequests: 0, resetCreditsConsumed: 0,
    noInheritedSideEffects: true, requests, tempDirectory: root }, null, 2));
} finally {
  upstream.closeAllConnections();
  await new Promise(resolve => upstream.close(resolve));
}
