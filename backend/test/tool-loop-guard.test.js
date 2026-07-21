// ToolLoopGuard 测试 — 纯函数，无副作用
const { evaluate, createStats, isFailure, IDEMPOTENT_TOOLS } = require('../agents/tool-loop-guard');

// ─── 辅助函数 ───
function makeToolCall(id, name, args) {
  return { id, function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } };
}

function makeError(msg) { return { error: msg }; }
function makeSuccess(data) { return { success: true, data }; }

// ─── isFailure ───
test('isFailure: 结构化 error 字段 → true', () => {
  assert.ok(isFailure({ error: '操作失败' }));
});

test('isFailure: success=false → true', () => {
  assert.ok(isFailure({ success: false }));
});

test('isFailure: 英文 error: 开头 → true', () => {
  assert.ok(isFailure('error: something went wrong'));
});

test('isFailure: 中文 错误: 开头 → true', () => {
  assert.ok(isFailure('错误: 权限不足'));
});

test('isFailure: 成功结果 → false', () => {
  assert.ok(!isFailure({ success: true, data: [1, 2, 3] }));
});

test('isFailure: 空结果 → false', () => {
  assert.ok(!isFailure(null));
  assert.ok(!isFailure(undefined));
});

// ─── 检测器 1: 相同参数重复失败 ───
test('相同参数失败 2 次 → 警告', () => {
  const stats = createStats();
  const tc = [makeToolCall('1', 'search_faq', { q: 'test' })];

  let s = stats;
  for (let i = 0; i < 2; i++) {
    const r = evaluate(s, tc, [makeError('连接超时')]);
    s = r.stats;
    if (i === 1) {
      assert.ok(r.warnings.length > 0, '第2次应有警告');
      assert.includes(r.warnings[0], 'search_faq');
    }
  }
});

test('相同参数失败 5 次 → 强制终止', () => {
  const stats = createStats();
  const tc = [makeToolCall('1', 'read_file', { path: '/a.txt' })];

  let s = stats;
  let halt = null;
  for (let i = 0; i < 5; i++) {
    const r = evaluate(s, tc, [makeError('File not found')]);
    s = r.stats;
    if (r.haltReason) halt = r.haltReason;
  }
  assert.ok(halt, '第5次应触发强制终止');
  assert.includes(halt, 'read_file');
  assert.includes(halt, '5');
});

// ─── 检测器 2: 同一工具不同参数重复失败 ───
test('同一工具不同参数失败 3 次 → 警告', () => {
  const stats = createStats();

  let s = stats;
  const args = [{ q: 'a' }, { q: 'b' }, { q: 'c' }];
  for (let i = 0; i < 3; i++) {
    const r = evaluate(s, [makeToolCall(String(i), 'search_faq', args[i])], [makeError('timeout')]);
    s = r.stats;
    if (i === 2) assert.ok(r.warnings.length > 0, '第3次应有警告');
  }
});

test('同一工具不同参数失败 8 次 → 强制终止', () => {
  const stats = createStats();
  let s = stats;
  let halt = null;
  for (let i = 0; i < 8; i++) {
    const r = evaluate(s, [makeToolCall(String(i), 'search_faq', { q: String(i) })], [makeError('fail')]);
    s = r.stats;
    if (r.haltReason) halt = r.haltReason;
  }
  assert.ok(halt, '第8次应触发强制终止');
  assert.includes(halt, 'search_faq');
});

// ─── 检测器 3: 只读工具无进展 ───
test('只读工具相同结果 2 次 → 警告', () => {
  const stats = createStats();
  const tc = [makeToolCall('1', 'read_file', { path: '/a.txt' })];

  let s = stats;
  for (let i = 0; i < 2; i++) {
    const r = evaluate(s, tc, [{ content: 'hello world' }]);
    s = r.stats;
    if (i === 1) assert.ok(r.warnings.length > 0, '第2次应有警告');
  }
});

test('只读工具相同结果 5 次 → 强制终止', () => {
  const stats = createStats();
  const tc = [makeToolCall('1', 'read_file', { path: '/a.txt' })];

  let s = stats;
  let halt = null;
  for (let i = 0; i < 5; i++) {
    const r = evaluate(s, tc, [{ content: 'same' }]);
    s = r.stats;
    if (r.haltReason) halt = r.haltReason;
  }
  assert.ok(halt, '第5次应触发强制终止');
});

// ─── 成功后重置 ───
test('失败后成功 → 计数器重置', () => {
  const stats = createStats();
  const tc = [makeToolCall('1', 'search_faq', { q: 'test' })];

  // 先失败 2 次
  let s = stats;
  for (let i = 0; i < 2; i++) {
    const r = evaluate(s, tc, [makeError('fail')]);
    s = r.stats;
  }

  // 然后成功
  const r = evaluate(s, tc, [{ results: ['ok'] }]);
  // 再失败，应从头计数
  const r2 = evaluate(r.stats, tc, [makeError('fail again')]);
  assert.ok(r2.warnings.length === 0, '重置后第1次不应有警告');
});

// ─── 写工具不检测无进展 ───
test('写工具重复调用不触发无进展检测', () => {
  const stats = createStats();
  const tc = [makeToolCall('1', 'update_customer', { id: '1', name: 'test' })];

  let s = stats;
  let halt = null;
  for (let i = 0; i < 5; i++) {
    const r = evaluate(s, tc, [{ success: true }]);
    s = r.stats;
    if (r.haltReason) halt = r.haltReason;
  }
  assert.isNull(halt, '写工具不应触发无进展终止');
});

// ─── 空输入 ───
test('空 toolCalls → 无操作', () => {
  const r = evaluate({}, [], []);
  assert.equal(r.warnings.length, 0);
  assert.isNull(r.haltReason);
});

// ─── 混合成功失败 ───
test('多工具混合：部分成功部分失败', () => {
  const stats = createStats();
  const calls = [
    makeToolCall('1', 'search_faq', { q: 'a' }),
    makeToolCall('2', 'list_customers', { limit: 5 })
  ];
  const results = [makeError('fail'), makeSuccess([{ id: 1 }])];

  const r = evaluate(stats, calls, results);
  // search_faq 失败但 list_customers 成功，不应有 halt
  assert.isNull(r.haltReason);
});
