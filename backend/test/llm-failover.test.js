// LLM Failover 测试 — classifyError + RETRY_BUDGETS + ProviderPool
const {
  classifyError, ErrorType, RETRY_BUDGETS,
  providerPool, healthTracker
} = require('../services/llm-failover');

// ─── classifyError: 核心错误分类 ───

test('500 → SERVER_ERROR', () => {
  assert.equal(classifyError(500, ''), ErrorType.SERVER_ERROR);
});

test('503 + timeout → SERVER_ERROR', () => {
  assert.equal(classifyError(503, 'request timeout'), ErrorType.SERVER_ERROR);
});

test('429 → RATE_LIMIT', () => {
  assert.equal(classifyError(429, ''), ErrorType.RATE_LIMIT);
});

test('429 + engine_overloaded → RATE_LIMIT', () => {
  assert.equal(classifyError(429, 'engine_overloaded'), ErrorType.RATE_LIMIT);
});

test('401 → AUTH_ERROR', () => {
  assert.equal(classifyError(401, ''), ErrorType.AUTH_ERROR);
});

test('403 → AUTH_ERROR', () => {
  assert.equal(classifyError(403, 'unauthorized'), ErrorType.AUTH_ERROR);
});

test('402 → BILLING', () => {
  assert.equal(classifyError(402, 'insufficient_quota'), ErrorType.BILLING);
});

test('中文 余额不足 → BILLING', () => {
  assert.equal(classifyError(200, '账户余额不足，请充值'), ErrorType.BILLING);
});

test('中文 请充值 → BILLING', () => {
  assert.equal(classifyError(200, '您的额度已用完，请充值'), ErrorType.BILLING);
});

test('context_length_exceeded → PROMPT_TOO_LONG', () => {
  assert.equal(classifyError(400, 'context_length_exceeded'), ErrorType.PROMPT_TOO_LONG);
});

test('token limit → PROMPT_TOO_LONG', () => {
  assert.equal(classifyError(400, 'maximum context length token limit'), ErrorType.PROMPT_TOO_LONG);
});

test('model not found → MODEL_NOT_FOUND', () => {
  assert.equal(classifyError(404, 'model not exist'), ErrorType.MODEL_NOT_FOUND);
});

test('thinking block error → THINKING_BLOCK_ERROR', () => {
  assert.equal(classifyError(400, 'thinking blocks cannot be modified'), ErrorType.THINKING_BLOCK_ERROR);
});

test('400 bad request → CLIENT_ERROR', () => {
  assert.equal(classifyError(400, 'bad request'), ErrorType.CLIENT_ERROR);
});

test('unknown → UNKNOWN', () => {
  assert.equal(classifyError(418, "i'm a teapot"), ErrorType.UNKNOWN);
});

test('空消息 + 空body → EMPTY_RESPONSE', () => {
  assert.equal(classifyError(0, '', ''), ErrorType.EMPTY_RESPONSE);
});

// ─── RETRY_BUDGETS ───

test('所有 ErrorType 都有对应的 RETRY_BUDGET', () => {
  for (const key of Object.keys(ErrorType)) {
    const type = ErrorType[key];
    assert.ok(type in RETRY_BUDGETS, `${type} 缺 RETRY_BUDGET`);
    assert.ok(typeof RETRY_BUDGETS[type] === 'number', `${type} budget 非数字`);
  }
});

test('AUTH_ERROR / BILLING / CLIENT_ERROR 重试 0 次', () => {
  assert.equal(RETRY_BUDGETS[ErrorType.AUTH_ERROR], 0);
  assert.equal(RETRY_BUDGETS[ErrorType.BILLING], 0);
  assert.equal(RETRY_BUDGETS[ErrorType.CLIENT_ERROR], 0);
});

test('SERVER_ERROR 重试 10 次', () => {
  assert.equal(RETRY_BUDGETS[ErrorType.SERVER_ERROR], 10);
});

test('RATE_LIMIT 重试 2 次', () => {
  assert.equal(RETRY_BUDGETS[ErrorType.RATE_LIMIT], 2);
});

// ─── ProviderPool ───

test('ProviderPool: 首次注册自动加入', () => {
  const id = 'test-provider-' + Date.now();
  assert.ok(providerPool.contains(id), '未知 provider 应自动加入');
});

test('ProviderPool: 移除后 contains 返回 false', () => {
  const id = 'test-provider-removed-' + Date.now();
  providerPool.add(id);
  providerPool.remove(id, 'AUTH_ERROR', 'test removal');
  assert.ok(!providerPool.contains(id), '移除后不应在池中');
});

test('ProviderPool: snapshot 包含移除原因', () => {
  const id = 'test-snapshot-' + Date.now();
  providerPool.add(id);
  providerPool.remove(id, 'BILLING', 'quota exceeded');
  const snap = providerPool.snapshot();
  assert.ok(id in snap, 'snapshot 应包含已移除的 provider');
  assert.ok(snap[id] !== null, '已移除 provider 应有原因');
});

// ─── HealthTracker ───

test('HealthTracker: 连续失败达到阈值进入冷却', () => {
  const id = 'test-health-' + Date.now();
  for (let i = 0; i < 3; i++) healthTracker.recordFailure(id);
  assert.ok(healthTracker.isInCooldown(id), '3次失败应进入冷却');
  healthTracker.recordSuccess(id); // 清理
});

test('HealthTracker: 成功后清除冷却', () => {
  const id = 'test-recover-' + Date.now();
  for (let i = 0; i < 3; i++) healthTracker.recordFailure(id);
  healthTracker.recordSuccess(id);
  assert.ok(!healthTracker.isInCooldown(id), '成功后应清除冷却');
});
