import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexRpc } from '../rpc.mjs';

async function fixture(body) {
  const dir = await mkdtemp(join(tmpdir(), 'harness-rpc-test-'));
  const binary = join(dir, 'fake-codex');
  await writeFile(binary, `#!${process.execPath}\n${body}`, { mode: 0o700 });
  return { binary, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
test('RPC initialization and method response use only stdio', async () => {
  const f = await fixture(`require('node:readline').createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l); if(m.id)console.log(JSON.stringify({id:m.id,result:{ok:true,method:m.method}}));});`);
  const rpc = new CodexRpc({ binary: f.binary });
  try { await rpc.initialize(); assert.deepEqual(await rpc.call('model/list', {}), { ok: true, method: 'model/list' }); }
  finally { rpc.close(); await f.cleanup(); }
});
test('JSONL preserves Unicode line separators in content', async () => {
  const f = await fixture(`process.stdout.write(JSON.stringify({method:'unicode',params:{text:'a\\u2028b\\u2029c'}})+'\\n');process.stdin.resume();`);
  let resolve; const got = new Promise(r => { resolve = r; });
  const rpc = new CodexRpc({ binary: f.binary, onNotification: m => resolve(m.params.text) });
  try { assert.equal(await got, 'a\u2028b\u2029c'); }
  finally { rpc.close(); await f.cleanup(); }
});
test('unexpected process exit rejects outstanding requests and reports closure', async () => {
  const f = await fixture(`setTimeout(()=>process.exit(0),30);`);
  let closed = false; const rpc = new CodexRpc({ binary: f.binary, onClose() { closed = true; } });
  try { await assert.rejects(rpc.call('model/list', {}, 1000), /stopped/); assert.equal(closed, true); }
  finally { rpc.close(); await f.cleanup(); }
});
test('unapproved server requests are denied, never executed', async () => {
  const f = await fixture(`console.log(JSON.stringify({id:42,method:'item/commandExecution/requestApproval',params:{}}));require('node:readline').createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);if(m.id===42&&m.error)console.log(JSON.stringify({method:'denied',params:{code:m.error.code}}));});`);
  let resolve; const denied = new Promise(r => { resolve = r; });
  const rpc = new CodexRpc({ binary: f.binary, onNotification(m) { if (m.method === 'denied') resolve(m.params); } });
  try { assert.equal((await denied).code, -32601); }
  finally { rpc.close(); await f.cleanup(); }
});
