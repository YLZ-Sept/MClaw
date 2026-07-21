// Multi-Agent Delegation tests
const dl = require('../agents/delegate');

// loadChildConfig
test('loadChildConfig: returns config for non-existent agent (fallback to default)', () => {
  const config = dl.loadChildConfig('nonexistent-agent-id');
  // loadAgentConfig returns a default fallback config even for unknown agents
  assert.ok(config !== null, 'should return fallback default config');
  assert.ok(config.systemPrompt.length > 0, 'should have a system prompt');
  assert.ok(Array.isArray(config.tools), 'should have tools array');
});

test('MAX_DEPTH is 3', () => {
  assert.equal(dl.MAX_DEPTH, 3);
});

test('DENIED_CHILD_TOOLS blocks delegate tools', () => {
  assert.ok(dl.DENIED_CHILD_TOOLS.has('delegate_to_agent'));
  assert.ok(dl.DENIED_CHILD_TOOLS.has('delegate_parallel'));
  assert.ok(dl.DENIED_CHILD_TOOLS.has('tool_remember'));
  assert.ok(dl.DENIED_CHILD_TOOLS.has('tool_recall'));
});

test('delegateParallel: empty tasks returns error', async () => {
  const result = await dl.delegateParallel([], {});
  assert.ok(result.error);
});

test('delegateParallel: too many tasks returns error', async () => {
  const tasks = Array.from({ length: 10 }, (_, i) => ({ agent_id: 'test', task: 't' + i }));
  const result = await dl.delegateParallel(tasks, {});
  assert.ok(result.error);
  assert.includes(result.error, '8');
});

test('delegateToAgent: depth exceeds max returns error', async () => {
  const result = await dl.delegateToAgent('test', 'task', { depth: 3 });
  assert.ok(result.error);
  assert.includes(result.error, '深度');
});
