import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

/** Stdio-only app-server client. Authentication stays entirely inside Codex CLI. */
export class CodexRpc {
  constructor({ binary = 'codex', args = [], cwd, env = process.env, onClose = () => {}, onNotification = () => {}, onRequest = async () => { throw new Error('Unapproved Codex server request'); } } = {}) {
    this.pending = new Map(); this.sequence = 0; this.closed = false; this.onClose = onClose;
    this.child = spawn(binary, ['app-server', ...args], { cwd, env, stdio: ['pipe', 'pipe', 'ignore'] });
    this.child.stdin.on('error', () => this.fail(new Error('Codex CLI input closed')));
    let buffer = ''; const decoder = new StringDecoder('utf8');
    this.child.stdout.on('data', chunk => {
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer) > 32 * 1024 * 1024) { this.fail(new Error('Codex RPC frame too large')); this.child.kill(); return; }
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); this.receiveLine(line); }
    });
    this.receiveLine = line => {
      let message; try { message = JSON.parse(line); } catch { return; }
      if ('method' in message) {
        if ('id' in message) Promise.resolve().then(() => onRequest(message)).then(result => this.send({ id: message.id, result }),
          () => this.send({ id: message.id, error: { code: -32601, message: 'Request denied by Harness bridge' } }));
        else { try { onNotification(message); } catch { this.fail(new Error('Invalid Codex notification')); this.child.kill(); } }
        return;
      }
      const item = this.pending.get(message.id); if (!item) return;
      this.pending.delete(message.id); clearTimeout(item.timer);
      message.error ? item.reject(new Error(`Codex RPC ${item.method} failed (${message.error.code})`)) : item.resolve(message.result);
    };
    this.child.on('error', () => this.fail(new Error('Cannot start Codex CLI')));
    this.child.on('exit', () => this.fail(new Error('Codex CLI stopped')));
  }
  send(value) { if (!this.closed && this.child.stdin.writable) this.child.stdin.write(JSON.stringify(value) + '\n'); }
  call(method, params, timeoutMs = 30000) {
    if (this.closed) return Promise.reject(new Error('Codex RPC is closed'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex RPC ${method} timed out`)); }, timeoutMs);
      this.pending.set(id, { method, timer, resolve, reject }); this.send({ id, method, params });
    });
  }
  async initialize() {
    await this.call('initialize', { clientInfo: { name: 'deepseek-harness-cli-bridge', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    this.send({ method: 'initialized', params: {} });
  }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
    try { this.onClose(error); } catch {}
  }
  close() {
    this.fail(new Error('Codex bridge closed')); this.child.stdin.end(); this.child.kill();
    const timer = setTimeout(() => { if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL'); }, 2000);
    timer.unref(); this.child.once('exit', () => clearTimeout(timer));
  }
}
