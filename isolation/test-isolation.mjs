import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertCodexVersion, buildIsolationArgs, constructIsolatedCatalog, PUBLIC_CATALOG_URL } from './isolation.mjs';

assertCodexVersion();
const root = await mkdtemp(join(tmpdir(), 'dsh-codex-isolation-'));
const catalog = constructIsolatedCatalog(await (await fetch(PUBLIC_CATALOG_URL)).json(), 'harness-isolation-mock');
const catalogPath = join(root, 'catalog.json');
await writeFile(catalogPath, JSON.stringify(catalog));
const sentinel = join(root, 'UNEXPECTED_SIDE_EFFECT');
const markerCommand = `touch ${sentinel}`;
// Synthetic inherited config only; contains no user's credentials or values.
await writeFile(join(root, 'config.toml'), `model = "harness-isolation-mock"\nnotify = ["sh", "-c", ${JSON.stringify(markerCommand)}]\n[mcp_servers.node_repl]\ncommand = "sh"\nargs = ["-c", ${JSON.stringify(markerCommand)}]\nenabled = true\n[plugins."fake.plugin@test"]\nenabled = true\n`);
const requests = [];
const server = createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  assert(req.url.endsWith('/responses'), `Unexpected upstream endpoint ${req.url}`);
  const data = JSON.parse(body); requests.push(data);
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const event = value => res.write(`data: ${JSON.stringify(value)}\n\n`);
  event({ type: 'response.created', response: { id: 'mock-response', object: 'response', status: 'in_progress' } });
  event({ type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'mock-message', role: 'assistant', status: 'in_progress', content: [] } });
  event({ type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'mock-message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'isolated-ok', annotations: [] }] } });
  event({ type: 'response.completed', response: { id: 'mock-response', status: 'completed', output: [], usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } });
  res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
const args = buildIsolationArgs({ catalogPath, structure: { mcpServers: ['node_repl'], plugins: ['fake.plugin@test'] } });
args.push('-c', 'model_provider="isolation_mock"', '-c', `model_providers.isolation_mock={name="Local mock",base_url=${JSON.stringify(baseUrl)},env_key="DSH_ISOLATION_DUMMY_KEY",wire_api="responses"}`);
// No inherited env: no real token/API key/proxy can reach this local upstream.
const child = spawn('codex', ['app-server', ...args], { cwd: root, env: { PATH: process.env.PATH, HOME: root, CODEX_HOME: root, TMPDIR: root, DSH_ISOLATION_DUMMY_KEY: 'dummy-not-a-real-credential' }, stdio: ['pipe','pipe','pipe'] });
let stderr = ''; let completedTurns = 0; child.stderr.on('data', d => { stderr += d; });
const pending = new Map(); let seq = 0; let resolveDone, rejectDone;
const done = new Promise((resolve,reject) => { resolveDone=resolve; rejectDone=reject; });
const send = value => child.stdin.write(JSON.stringify(value)+'\n');
createInterface({ input: child.stdout }).on('line', line => {
  const m = JSON.parse(line);
  if (m.method) {
    if ('id' in m) { send({ id:m.id,error:{code:-32601,message:'Denied in isolation test'} }); rejectDone(new Error(`Unexpected server request ${m.method}`)); }
    if (m.method === 'turn/completed') { completedTurns++; m.params.turn.status === 'failed' ? rejectDone(new Error(JSON.stringify(m.params.turn.error))) : resolveDone(); }
  } else if (pending.has(m.id)) { const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result); }
});
child.on('exit', code => { for(const p of pending.values())p.reject(new Error(`CLI exited ${code}: ${stderr}`)); });
const call = (method,params) => new Promise((resolve,reject) => { const id=++seq;pending.set(id,{resolve,reject});send({id,method,params}); });
const timer = setTimeout(() => { rejectDone(new Error('Mock test timeout')); child.kill(); }, 45000);
try {
  await call('initialize',{clientInfo:{name:'harness-isolation-test',version:'1'},capabilities:{experimentalApi:true}});
  send({method:'initialized',params:{}});
  for (const dynamic of [false, true]) {
    const tools = dynamic ? [{type:'function',name:'harness_probe',description:'Harness owned tool',inputSchema:{type:'object',properties:{},additionalProperties:false}}] : [];
    const r=await call('thread/start',{model:'harness-isolation-mock',ephemeral:true,cwd:root,environments:[],approvalPolicy:'never',sandbox:'read-only',baseInstructions:'HARNESS_BASE_ONLY',developerInstructions:'',dynamicTools:tools});
    await call('turn/start',{threadId:r.thread.id,input:[{type:'text',text:'Return isolated-ok.'}]});
    // Each turn has one local mock response. Wait for its terminal notification.
    const deadline=Date.now()+15000;
    while(requests.length < (dynamic?2:1) || completedTurns < (dynamic?2:1)) { await new Promise(resolve=>setTimeout(resolve,20)); if(Date.now()>deadline)throw new Error('No mock inference request'); }
    const request=requests.at(-1);
    assert.deepEqual((request.tools??[]).map(t=>t.name).sort(), dynamic?['harness_probe']:[]);
    assert(JSON.stringify(request).includes('HARNESS_BASE_ONLY'),'Harness base instructions missing');
    await writeFile(join(root, `mock-request-${dynamic?2:1}.json`), JSON.stringify(request,null,2));
  }
  await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Turn completion missing')),10000))]);
  assert(!(await readdir(root)).includes('UNEXPECTED_SIDE_EFFECT'),'Inherited MCP/notify executed');
  console.log(JSON.stringify({ok:true,version:'0.166.0',requests:requests.length,toolSets:requests.map(r=>(r.tools??[]).map(t=>t.name)),noInheritedSideEffects:true,realCredentialsUsed:false,tempDirectory:root},null,2));
} catch(e) { console.error(e.message); console.error(stderr); process.exitCode=1; }
finally { clearTimeout(timer);child.stdin.end();child.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
