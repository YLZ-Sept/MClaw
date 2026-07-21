// Context Window tests
const cw = require('../services/context-window');

// truncateToolResult
test('short content not truncated', () => {
  const short = 'hello world';
  assert.equal(cw.truncateToolResult(short, 'search_faq'), short);
});

test('long content truncated with ellipsis', () => {
  const long = 'x'.repeat(10000);
  const result = cw.truncateToolResult(long, 'search_faq');
  assert.gt(result.length, 0);
  assert.ok(result.length < 10000);
  assert.includes(result, '...');
});

test('exempt tools not truncated', () => {
  const long = 'x'.repeat(10000);
  assert.equal(cw.truncateToolResult(long, 'generate_file'), long);
});

test('non-string JSONified then truncated', () => {
  const obj = { data: 'x'.repeat(10000) };
  const result = cw.truncateToolResult(obj, 'read_file');
  assert.ok(result.length < 10000);
});

// estimateTokens
test('empty messages = 0', () => {
  assert.equal(cw.estimateTokens([], []), 0);
});

test('normal message estimation', () => {
  const msgs = [{ role: 'user', content: 'hello world' }, { role: 'assistant', content: 'hi' }];
  assert.gt(cw.estimateTokens(msgs, []), 0);
});

test('tool schemas add overhead', () => {
  const msgs = [{ role: 'user', content: 'test' }];
  const noTools = cw.estimateTokens(msgs, []);
  const withTools = cw.estimateTokens(msgs, [{ name: 't1' }, { name: 't2' }]);
  assert.gt(withTools, noTools);
});

// checkContextBudget
test('empty messages severity=ok', () => {
  const b = cw.checkContextBudget([], []);
  assert.equal(b.severity, 'ok');
  assert.ok(!b.needsCompression);
});

test('few messages severity=ok', () => {
  const b = cw.checkContextBudget([{ role: 'user', content: 'hi' }], []);
  assert.equal(b.severity, 'ok');
});

// spillLargeResult
test('small result not spilled', () => {
  assert.equal(cw.spillLargeResult('short', 'read_file', '/tmp/t.txt'), 'short');
});

test('huge result spilled with file path', () => {
  const huge = 'x'.repeat(60000);
  const result = cw.spillLargeResult(huge, 'search_faq', '/tmp/r.json');
  assert.includes(result, 'read_local_file');
  assert.includes(result, '/tmp/r.json');
  assert.ok(result.length < 60000);
});

// replaceOldToolResult
test('small result not replaced', () => {
  assert.equal(cw.replaceOldToolResult('short', 'search', 1, 10), 'short');
});

test('large result replaced with placeholder', () => {
  const large = 'x'.repeat(2000);
  const result = cw.replaceOldToolResult(large, 'search', 1, 10);
  assert.includes(result, 'search');
  assert.ok(result.length < 2000);
});

test('critical tool not replaced', () => {
  const large = 'x'.repeat(2000);
  assert.equal(cw.replaceOldToolResult(large, 'load_skill', 1, 10), large);
});

// EXEMPT_TOOLS / CRITICAL_TOOLS
test('generate_file is exempt', () => { assert.ok(cw.EXEMPT_TOOLS.has('generate_file')); });
test('load_skill is critical', () => { assert.ok(cw.CRITICAL_TOOLS.has('load_skill')); });

// ensureToolPairIntegrity
test('intact tool_call/tool_result pair preserved', () => {
  const msgs = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: null, tool_calls: [{ id: 't1', function: { name: 's', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 't1', content: 'result' },
    { role: 'assistant', content: 'answer' }
  ];
  assert.equal(cw.ensureToolPairIntegrity(msgs).length, 4);
});

test('orphan tool message removed', () => {
  const msgs = [
    { role: 'user', content: 'hi' },
    { role: 'tool', tool_call_id: 'orphan', content: 'no parent' },
    { role: 'assistant', content: 'answer' }
  ];
  const r = cw.ensureToolPairIntegrity(msgs);
  assert.equal(r.length, 2);
  assert.equal(r[0].role, 'user');
});

test('plain assistant not removed', () => {
  const msgs = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'plain' }
  ];
  assert.equal(cw.ensureToolPairIntegrity(msgs).length, 2);
});

// preserveFirstUserAnchor
test('first user anchor preserved', () => {
  const msgs = [
    { role: 'user', content: 'task: analyze data' },
    { role: 'assistant', content: 'analyzing...' },
    { role: 'user', content: 'more analysis' }
  ];
  const r = cw.preserveFirstUserAnchor(msgs);
  assert.ok(r.length >= msgs.length);
  assert.ok(r.some(m => m.content && m.content.includes('task:')));
});

test('no user messages handled', () => {
  const msgs = [{ role: 'system', content: 'sys' }, { role: 'assistant', content: 'reply' }];
  assert.deepEqual(cw.preserveFirstUserAnchor(msgs), msgs);
});

// recoverFromPTL
test('PTL recovery compresses token count', () => {
  const msgs = [{ role: 'user', content: 'original task: analyze sales' }];
  for (let i = 0; i < 20; i++) {
    msgs.push({ role: 'assistant', content: null, tool_calls: [{ id: 't' + i, function: { name: 'search', arguments: '{}' } }] });
    msgs.push({ role: 'tool', tool_call_id: 't' + i, content: 'x'.repeat(3000) });
    msgs.push({ role: 'assistant', content: 'reply ' + i });
  }
  const before = cw.estimateTokens(msgs);
  const recovered = cw.recoverFromPTL(msgs, []);
  assert.ok(recovered.recovered);
  assert.gt(recovered.messages.length, 0);
  const after = cw.estimateTokens(recovered.messages);
  assert.ok(after < before, 'tokens should decrease: ' + before + ' -> ' + after);
});

// buildSummaryPrompt + parseSummaryResult
test('buildSummaryPrompt includes messages', () => {
  const msgs = [
    { role: 'user', content: 'analyze data' },
    { role: 'assistant', content: 'analyzing...' }
  ];
  const prompt = cw.buildSummaryPrompt(msgs);
  assert.includes(prompt, 'analyze data');
  assert.includes(prompt, 'analyzing');
});

test('parseSummaryResult parses valid JSON', () => {
  const json = '{"goal":"test","progress":"done","decisions":["d1"],"files":["/f.txt"],"next_steps":"","key_data":{}}';
  const result = cw.parseSummaryResult(json);
  assert.ok(result);
  assert.equal(result.goal, 'test');
  assert.equal(result.decisions[0], 'd1');
});

test('parseSummaryResult handles invalid text', () => {
  assert.isNull(cw.parseSummaryResult('no json here'));
});

test('formatSummaryAsMessage returns system role', () => {
  const summary = { goal: 'analyze sales', progress: 'processed 100 rows', decisions: ['use csv'], files: ['/data.csv'], nextSteps: 'generate report' };
  const msg = cw.formatSummaryAsMessage(summary);
  assert.equal(msg.role, 'system');
  assert.includes(msg.content, 'analyze sales');
  assert.includes(msg.content, 'processed 100 rows');
});

test('formatSummaryAsMessage handles empty summary', () => {
  assert.isNull(cw.formatSummaryAsMessage(null));
  assert.isNull(cw.formatSummaryAsMessage({ goal: '', progress: '' }));
});

// Dedup detection
test('detectDuplicateOutput: first call is not duplicate', () => {
  const r = cw.detectDuplicateOutput('read_file', 'content-abc-' + Date.now());
  assert.ok(!r.isDuplicate);
});

test('detectDuplicateOutput: second identical call is duplicate', () => {
  const uniqueContent = 'unique-' + Date.now();
  cw.detectDuplicateOutput('search', uniqueContent);
  const r = cw.detectDuplicateOutput('search', uniqueContent);
  assert.ok(r.isDuplicate);
});

// Compression cooldown
test('cooldown not active initially', () => {
  assert.ok(!cw.isCompressionCooldown());
});

test('cooldown active after reset', () => {
  cw.resetCompressionCooldown();
  assert.ok(cw.isCompressionCooldown());
});
