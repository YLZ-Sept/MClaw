// Integration Tests — 端到端聊天→工具→回复全链路
// 需要 server 在运行 (port 18621)

const BASE = 'http://localhost:18621';
let token = '';

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

// Setup: login
test('integration: login', async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const data = await res.json();
  assert.ok(data.code === 200, 'login should succeed');
  assert.ok(data.data?.token, 'should return token');
  token = data.data.token;
});

// Health
test('integration: /healthz', async () => {
  const res = await fetch(`${BASE}/healthz`);
  const data = await res.json();
  assert.equal(data.status, 'ok');
});

// System info
test('integration: /api/info', async () => {
  const data = await api('GET', '/api/info');
  assert.equal(data.code, 200);
  assert.equal(data.data.engine, 'OpenClaw');
});

// LLM health
test('integration: LLM health', async () => {
  const data = await api('GET', '/api/llm/health');
  assert.equal(data.code, 200);
  assert.ok(data.data?.summary, 'should have summary');
});

// Channel health
test('integration: channel health', async () => {
  const data = await api('GET', '/api/channels/health');
  assert.equal(data.code, 200);
  assert.ok(data.data?.channels, 'should have channels');
  assert.ok(data.data.channels.length >= 0);
});

// Channel manager
test('integration: channel manager', async () => {
  const data = await api('GET', '/api/channels/manager');
  assert.equal(data.code, 200);
  assert.ok(data.data?.summary, 'should have manager summary');
});

// Audit
test('integration: audit stats', async () => {
  const data = await api('GET', '/api/audit/stats');
  assert.equal(data.code, 200);
  assert.ok(data.data?.total !== undefined);
});

// Audit export
test('integration: audit export JSON', async () => {
  const data = await api('GET', '/api/export/audit');
  assert.equal(data.code, 200);
});

// Metrics
test('integration: tool metrics', async () => {
  const data = await api('GET', '/api/metrics/tools');
  assert.equal(data.code, 200);
  assert.ok(data.data?.summary);
});

// Plugins
test('integration: plugins list', async () => {
  const data = await api('GET', '/api/plugins');
  assert.equal(data.code, 200);
  assert.ok(data.data?.plugins?.length >= 2, 'should have at least 2 plugins');
  assert.ok(data.data?.tools?.count >= 4, 'should have at least 4 plugin tools');
});

// Dashboard models
test('integration: dashboard models', async () => {
  const data = await api('GET', '/api/dashboard/models');
  assert.equal(data.code, 200);
  assert.ok(data.data?.length >= 1, 'should have at least 1 model config');
});

// Memory API
test('integration: memory stats', async () => {
  const data = await api('GET', '/api/memory/internal-agent');
  assert.equal(data.code, 200);
});

// Approval API
test('integration: approval pending', async () => {
  const data = await api('GET', '/api/approval/pending');
  assert.equal(data.code, 200);
});

// Preflight
test('integration: preflight wecom', async () => {
  const data = await api('POST', '/api/channels/preflight', {
    platform: 'wecom',
    config: { corp_id: 'ww12345', token: 'test_token_12345678' }
  });
  assert.equal(data.code, 200);
  assert.ok(data.data?.ok, 'valid wecom config should pass');
});

// Preflight fail
test('integration: preflight fail', async () => {
  const data = await api('POST', '/api/channels/preflight', {
    platform: 'telegram',
    config: { bot_token: 'invalid' }
  });
  assert.equal(data.code, 200);
  assert.ok(!data.data?.ok, 'invalid telegram token should fail');
});

// Chat — non-streaming
test('integration: chat non-streaming', async () => {
  const data = await api('POST', '/api/chat/send', {
    content: 'hi',
    stream: false
  });
  assert.equal(data.code, 200);
  assert.ok(data.data?.content, 'should have reply');
  assert.ok(!data.data.content.includes('服务暂时不可用'), 'should not be error');
});

// Chat — with agent
test('integration: chat with agent', async () => {
  const data = await api('POST', '/api/chat/send', {
    content: '用 search_faq 工具查询登录问题',
    agent: 'support-agent',
    stream: false
  });
  assert.equal(data.code, 200);
  assert.ok(data.data?.content, 'should have reply');
});

// Direct plugin tool call
test('integration: plugin tool via executor', async () => {
  const { exec } = require('../agents/executor');
  require('../agents/plugin-manager').loadAll();
  const result = await exec('system_info', { detail: 'summary' }, null);
  assert.ok(result.success, 'system_info should succeed');
  assert.ok(result.hostname, 'should have hostname');
  assert.ok(result.platform, 'should have platform');
  assert.gt(result.cpus, 0, 'should have CPUs');
});

// Export plugin tool
test('integration: export_data tool', async () => {
  const { exec } = require('../agents/executor');
  require('../agents/plugin-manager').loadAll();
  const result = await exec('export_data', { type: 'audit', format: 'csv' }, null);
  assert.ok(result.success, 'export_data should succeed');
  assert.ok(result.filename, 'should have filename');
  assert.gt(result.rows, 0, 'should have rows');
});
