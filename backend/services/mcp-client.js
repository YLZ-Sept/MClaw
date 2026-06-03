// Generic MCP (Model Context Protocol) client over stdio
// Spawns a child process, communicates via JSON-RPC 2.0 with byte-level framing
const { spawn } = require('child_process');
const crypto = require('crypto');

class McpClient {
  constructor({ command, args, env, cwd }) {
    this._pending = new Map();
    this._buf = Buffer.alloc(0);
    this._tools = null;
    this._ready = false;
    this._proc = null;
    this._initPromise = null;

    this._proc = spawn(command, args || [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1', ...env },
      cwd: cwd || process.cwd()
    });

    this._proc.stdout.on('data', (chunk) => this._feed(chunk));
    this._proc.stderr.on('data', (d) => { /* debug only */ });
    this._proc.on('error', (err) => console.error('[mcp] process error:', err.message));
    this._proc.on('exit', (code) => {
      if (code !== 0 && code !== null) console.error(`[mcp] process exited code=${code}`);
      this._ready = false;
      for (const [id, p] of this._pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`MCP process exited (code=${code})`));
      }
      this._pending.clear();
    });
  }

  // Feed incoming bytes, parse MCP messages (byte-based, not string)
  _feed(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    const CRLFCRLF = Buffer.from('\r\n\r\n');

    while (true) {
      const headerEnd = this._buf.indexOf(CRLFCRLF);
      if (headerEnd === -1) break;

      const header = this._buf.subarray(0, headerEnd).toString();
      const lenMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lenMatch) { this._buf = Buffer.alloc(0); break; }

      const contentLen = parseInt(lenMatch[1]);
      const contentStart = headerEnd + 4;
      if (this._buf.length < contentStart + contentLen) break;

      const body = this._buf.subarray(contentStart, contentStart + contentLen).toString('utf-8');
      this._buf = this._buf.subarray(contentStart + contentLen);

      let msg;
      try { msg = JSON.parse(body); } catch { continue; }
      this._dispatch(msg);
    }
  }

  _send(request) {
    return new Promise((resolve, reject) => {
      const id = request.id || crypto.randomUUID();
      request.id = id;
      request.jsonrpc = '2.0';
      const body = JSON.stringify(request);
      const frame = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;

      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MCP request timeout: ${request.method}`));
      }, 60000);

      this._pending.set(id, { resolve, reject, timer });
      this._proc.stdin.write(frame);
    });
  }

  _dispatch(msg) {
    if (msg.id === undefined) return; // server notification, ignore
    const p = this._pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    this._pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
    else p.resolve(msg.result);
  }

  async initialize() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      const result = await this._send({
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'mclaw-mcp-client', version: '1.0' } }
      });
      this.serverCapabilities = result.capabilities;
      this._ready = true;
      console.log('[mcp] initialized:', result.serverInfo?.name, result.serverInfo?.version);
      return result;
    })();
    return this._initPromise;
  }

  async listTools() {
    if (this._tools) return this._tools;
    await this.initialize();
    const result = await this._send({ method: 'tools/list', params: {} });
    this._tools = result.tools || [];
    console.log('[mcp] tools:', this._tools.map(t => t.name).join(', '));
    return this._tools;
  }

  async callTool(name, args) {
    await this.initialize();
    return this._send({ method: 'tools/call', params: { name, arguments: args || {} } });
  }

  async close() {
    this._ready = false;
    try { this._proc.kill(); } catch {}
  }

  get ready() { return this._ready; }
}

module.exports = { McpClient };
