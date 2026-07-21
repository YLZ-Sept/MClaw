// Context Window Manager — Token 预算 + 工具结果截断 + 上下文压缩
// 参考 mateclaw ConversationWindowManager.java

// ── Token 估算 ──
// 保守估算：英文 ~4 chars/token，中文 ~1.5 chars/token，混合取 ~2 chars/token
const CHARS_PER_TOKEN = 2;
const MSG_OVERHEAD_TOKENS = 40;     // 每条消息的角色标记等额外开销
const TOOL_SCHEMA_OVERHEAD_TOKENS = 500; // 每个工具 schema 的固定开销
const DEFAULT_MODEL_WINDOW = 128000; // 默认模型窗口大小（常见大模型）
const WINDOW_SAFETY_FACTOR = 0.75;   // 只有 75% 窗口给历史消息，25% 留给回复

// ── 工具结果截断参数 ──
const TOOL_RESULT_MAX_CHARS = 8000;     // 单个工具结果最大字符数
const TOOL_RESULT_HEAD_CHARS = 5000;    // 保留头部字符数
const TOOL_RESULT_TAIL_CHARS = 2000;    // 保留尾部字符数
const TOOL_RESULT_SPILL_CHARS = 50000;  // 超大结果溢出阈值

// 豁免截断的工具（结果必须完整保留）
const EXEMPT_TOOLS = new Set([
  'load_skill', 'generate_file', 'generate_pptx', 'generate_excel',
  'generate_pdf', 'generate_docx'
]);

// 关键工具（软修剪时豁免，但硬清除时仍需替换为占位符）
const CRITICAL_TOOLS = new Set([
  'load_skill', 'read_local_file', 'get_customer', 'get_opportunity',
  'get_employee', 'get_contract'
]);

/**
 * 估算消息列表的 token 数
 */
function estimateTokens(messages, tools = []) {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    total += Math.ceil(content.length / CHARS_PER_TOKEN) + MSG_OVERHEAD_TOKENS;
  }
  // 工具 schema 开销
  total += tools.length * TOOL_SCHEMA_OVERHEAD_TOKENS;
  return total;
}

/**
 * 获取模型上下文窗口大小
 */
function getModelWindow(modelConfig) {
  return modelConfig?.max_input_tokens || DEFAULT_MODEL_WINDOW;
}

/**
 * 截断单个工具结果（head+tail 保留）
 */
function truncateToolResult(content, toolName = '') {
  if (typeof content !== 'string') {
    content = JSON.stringify(content);
  }
  if (content.length <= TOOL_RESULT_MAX_CHARS) return content;
  if (EXEMPT_TOOLS.has(toolName)) return content; // 豁免工具

  const head = content.slice(0, TOOL_RESULT_HEAD_CHARS);
  const tail = content.slice(-TOOL_RESULT_TAIL_CHARS);
  const skipped = content.length - TOOL_RESULT_HEAD_CHARS - TOOL_RESULT_TAIL_CHARS;

  return head
    + `\n\n... [以上内容完整，此处省略 ${skipped.toLocaleString()} 字符] ...\n\n`
    + tail;
}

/**
 * 将超大工具结果替换为溢出占位符（提示模型用 read_file 恢复）
 */
function spillLargeResult(content, toolName, filePath) {
  if (typeof content !== 'string') {
    content = JSON.stringify(content);
  }
  if (content.length <= TOOL_RESULT_SPILL_CHARS) return content;
  if (EXEMPT_TOOLS.has(toolName)) return content;

  const head = content.slice(0, 3000);
  const tail = content.slice(-1500);

  return `[工具 ${toolName} 返回了 ${content.length.toLocaleString()} 字符的大结果。以下是头部和尾部预览。`
    + `如需完整内容，请使用 read_local_file 工具读取：${filePath || '(路径不可用)'}]\n\n`
    + `--- HEAD ---\n${head}\n\n`
    + `... [省略 ${(content.length - 4500).toLocaleString()} 字符] ...\n\n`
    + `--- TAIL ---\n${tail}`;
}

/**
 * 将旧工具结果替换为信息性占位符（阶段 2：硬清除）
 */
function replaceOldToolResult(content, toolName, index, totalMessages) {
  if (typeof content !== 'string') content = JSON.stringify(content);
  if (CRITICAL_TOOLS.has(toolName)) return content;

  const charCount = content.length;
  if (charCount < 1000) return content; // 小结果不替换

  const firstLine = content.split('\n').find(l => l.trim()) || '';
  const snippet = firstLine.slice(0, 120);

  return `[已压缩] 工具「${toolName}」返回了 ${charCount.toLocaleString()} 字符。`
    + `首行预览: ${snippet}${snippet.length >= 120 ? '...' : ''}`
    + `\n如需原始结果，请重新调用 ${toolName}。`;
}

/**
 * 检查上下文是否需要压缩
 * @returns {{ needsCompression: boolean, currentTokens: number, budget: number, ratio: number }}
 */
function checkContextBudget(messages, tools = [], modelConfig = null) {
  const currentTokens = estimateTokens(messages, tools);
  const modelWindow = getModelWindow(modelConfig);
  const budget = Math.floor(modelWindow * WINDOW_SAFETY_FACTOR);
  const ratio = currentTokens / budget;

  return {
    needsCompression: currentTokens > budget,
    currentTokens,
    budget,
    ratio,
    modelWindow,
    severity: ratio > 1.5 ? 'critical' : ratio > 1.0 ? 'high' : ratio > 0.7 ? 'warning' : 'ok'
  };
}

/**
 * 软压缩消息列表（阶段 1：截断旧工具结果）
 * 保留最新的消息不动，只处理旧消息
 */
function softCompress(messages, keepRecent = 6) {
  if (messages.length <= keepRecent) return messages;

  // 先确保工具对完整性
  let result = ensureToolPairIntegrity(messages);
  if (result.length <= keepRecent) return result;
  // 只处理旧的工具消息
  for (let i = 0; i < result.length - keepRecent; i++) {
    if (result[i].role === 'tool') {
      const content = typeof result[i].content === 'string' ? result[i].content : JSON.stringify(result[i].content);
      // 提取工具名称（从相邻的 assistant tool_calls 或内容中推断）
      const toolName = extractToolName(result, i);
      result[i] = {
        ...result[i],
        content: truncateToolResult(content, toolName),
        _compressed: true
      };
    }
  }
  return result;
}

/**
 * 硬压缩消息列表（阶段 2：旧工具结果替换为占位符）
 */
function hardCompress(messages, keepRecent = 4) {
  if (messages.length <= keepRecent) return messages;

  // 先确保工具对完整性
  let result = ensureToolPairIntegrity(messages);
  if (result.length <= keepRecent) return result;
  for (let i = 0; i < result.length - keepRecent; i++) {
    if (result[i].role === 'tool') {
      const content = typeof result[i].content === 'string' ? result[i].content : JSON.stringify(result[i].content);
      const toolName = extractToolName(result, i);
      result[i] = {
        ...result[i],
        content: replaceOldToolResult(content, toolName, i, result.length),
        _compressed: 'hard'
      };
    }
  }
  return result;
}

// ── 去重检测 ──

let _lastCompressionTime = 0;
const COMPRESSION_COOLDOWN_MS = 10 * 60 * 1000; // 10 分钟冷却

const _recentToolOutputs = new Map(); // hash → count

/**
 * 检测工具输出是否与前序调用完全相同
 */
function detectDuplicateOutput(toolName, result) {
  const crypto = require('crypto');
  const str = typeof result === 'string' ? result : JSON.stringify(result);
  const hash = crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
  const key = `${toolName}:${hash}`;
  const count = (_recentToolOutputs.get(key) || 0) + 1;
  _recentToolOutputs.set(key, count);
  // 定期清理（每 50 条清理一次旧数据）
  if (_recentToolOutputs.size > 50) {
    const entries = [..._recentToolOutputs.entries()];
    entries.sort((a, b) => b[1] - a[1]);
    _recentToolOutputs.clear();
    for (const [k, v] of entries.slice(0, 20)) _recentToolOutputs.set(k, v);
  }
  return { hash, isDuplicate: count >= 2, count };
}

/**
 * 检查压缩冷却是否活跃
 */
function isCompressionCooldown() {
  return (Date.now() - _lastCompressionTime) < COMPRESSION_COOLDOWN_MS;
}

function resetCompressionCooldown() {
  _lastCompressionTime = Date.now();
}

// ── LLM 结构化摘要（阶段 3）──

/**
 * 构建上下文摘要提示词
 */
function buildSummaryPrompt(oldMessages) {
  const conversationText = oldMessages.map(m => {
    const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : `工具`;
    const content = typeof m.content === 'string' ? m.content.slice(0, 300) : '(非文本)';
    return `[${role}] ${content}`;
  }).join('\n');

  return `你是一个上下文压缩助手。将以下对话历史压缩为结构化 JSON，提取关键信息：

{
  "goal": "用户的原始任务目标（一句话）",
  "progress": "已完成的工作和进展（2-3句话）",
  "decisions": ["重要决策1", "重要决策2"],
  "files": ["引用文件路径1", "文件路径2"],
  "next_steps": "下一步应该做什么",
  "key_data": {"数据键": "关键值"}
}

规则：
- 只提取重要信息，忽略闲聊和简单确认
- 文件路径从工具调用中提取
- 用中文输出
- 如无相关信息，对应字段置空或空数组

对话历史：
${conversationText.slice(-4000)}`;
}

/**
 * 解析 LLM 摘要结果
 */
function parseSummaryResult(llmText) {
  try {
    // 尝试提取 JSON
    const match = llmText.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      goal: parsed.goal || '',
      progress: parsed.progress || '',
      decisions: parsed.decisions || [],
      files: parsed.files || [],
      nextSteps: parsed.next_steps || '',
      keyData: parsed.key_data || {}
    };
  } catch { return null; }
}

/**
 * 执行 LLM 结构化摘要（阶段 3）
 */
async function llmSummarizeContext(oldMessages, llmCall) {
  const prompt = buildSummaryPrompt(oldMessages);
  try {
    const response = await llmCall([{ role: 'user', content: prompt }]);
    const text = typeof response === 'string' ? response : response.content || '';
    const summary = parseSummaryResult(text);
    return formatSummaryAsMessage(summary);
  } catch (e) {
    console.log('[Context] LLM summary call failed:', e.message);
    return null;
  }
}

/**
 * 将结构化摘要格式化为系统消息
 */
function formatSummaryAsMessage(summary) {
  if (!summary || !summary.goal) return null;
  let text = '## 对话摘要\n';
  if (summary.goal) text += `**目标**: ${summary.goal}\n`;
  if (summary.progress) text += `**进展**: ${summary.progress}\n`;
  if (summary.decisions?.length) text += `**决策**: ${summary.decisions.join('; ')}\n`;
  if (summary.files?.length) text += `**文件**: ${summary.files.join(', ')}\n`;
  if (summary.nextSteps) text += `**下一步**: ${summary.nextSteps}\n`;
  return { role: 'system', content: text, _summary: true };
}

/**
 * 智能压缩：根据严重程度选择策略（含 LLM 摘要）
 * @param {Function} llmCall - 可选，LLM 调用函数 (messages) => Promise<{content}>
 */
async function smartCompress(messages, tools = [], modelConfig = null, llmCall = null) {
  const budget = checkContextBudget(messages, tools, modelConfig);

  if (!budget.needsCompression) return { messages, budget, compressed: false };

  let result = [...messages];

  // severity=warning → 软压缩
  if (budget.severity === 'warning') {
    result = softCompress(result, 8);
  }
  // severity=high → 硬压缩
  else if (budget.severity === 'high') {
    result = softCompress(result, 6);
    // 检查是否够了
    if (checkContextBudget(result, tools, modelConfig).needsCompression) {
      result = hardCompress(result, 4);
    }
  }
  // severity=critical → LLM 摘要 + 压缩冷却
  else {
    // 先做硬压缩
    result = hardCompress(result, 2);

    // 检查冷却：如果 10 分钟内刚压缩过，跳过 LLM 摘要
    if (!isCompressionCooldown() && llmCall && result.length > 8) {
      try {
        // 取前 N-4 条消息做摘要（保留最近 4 条不动）
        const splitPoint = Math.max(0, result.length - 4);
        const oldMessages = result.slice(0, splitPoint);
        const recentMessages = result.slice(splitPoint);

        if (oldMessages.length > 2) {
          const summary = await llmSummarizeContext(oldMessages, llmCall);
          if (summary) {
            result = [summary, ...recentMessages];
            resetCompressionCooldown();
            console.log(`[Context] LLM 摘要完成: ${oldMessages.length} → 1 条摘要 (${estimateTokens(result).toLocaleString()} tokens)`);
          }
        }
      } catch (e) {
        console.log('[Context] LLM 摘要失败，回退硬压缩:', e.message);
        resetCompressionCooldown(); // 失败也冷却，避免反复尝试
      }
    }

    // 即使不是 tool 消息也截断
    for (let i = 0; i < result.length - 2; i++) {
      const content = typeof result[i].content === 'string' ? result[i].content : '';
      if (content.length > TOOL_RESULT_HEAD_CHARS) {
        result[i] = {
          ...result[i],
          content: content.slice(0, TOOL_RESULT_HEAD_CHARS)
            + `\n\n... [严重压缩：省略 ${(content.length - TOOL_RESULT_HEAD_CHARS).toLocaleString()} 字符] ...`,
          _compressed: 'critical'
        };
      }
    }
  }

  const newBudget = checkContextBudget(result, tools, modelConfig);
  return { messages: result, budget: newBudget, compressed: true };
}

/**
 * 从消息列表中推断工具名称
 */
function extractToolName(messages, toolMsgIndex) {
  // 向前找最近的 assistant 消息中的 tool_calls
  for (let i = toolMsgIndex - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.tool_calls) {
      // 按 tool_call_id 匹配
      const toolMsg = messages[toolMsgIndex];
      if (toolMsg.tool_call_id) {
        const matched = msg.tool_calls.find(tc => tc.id === toolMsg.tool_call_id);
        if (matched) return matched.function?.name || 'unknown';
      }
      // 按位置匹配
      const toolIndex = messages.slice(0, toolMsgIndex).filter(m => m.role === 'tool').length;
      if (msg.tool_calls[toolIndex]) {
        return msg.tool_calls[toolIndex].function?.name || 'unknown';
      }
    }
  }
  return 'unknown';
}

/**
 * 构建带预算控制的消息列表
 */
async function buildMessagesWithBudget(systemPrompt, history, faqMatches, wikiMatches, tools = [], modelConfig = null) {
  // 1. 构建初始 system prompt
  let systemContent = systemPrompt;

  // FAQ 注入（限制总长）
  if (faqMatches) {
    let faqText = faqMatches.map(m => `Q: ${m.question}\nA: ${m.answer}`).join('\n\n');
    if (faqText.length > 3000) faqText = faqText.slice(0, 3000) + '\n\n... (更多 FAQ 已截断)';
    systemContent += `\n\n【相关FAQ知识库】\n${faqText}`;
  }

  // Wiki 注入（限制总长）
  if (wikiMatches) {
    let wikiText = wikiMatches.map(m =>
      `## ${m.title}\n${m.summary ? '> ' + m.summary + '\n' : ''}${m.snippet}`
    ).join('\n\n---\n\n');
    if (wikiText.length > 3000) wikiText = wikiText.slice(0, 3000) + '\n\n... (更多 Wiki 已截断)';
    systemContent += `\n\n【相关Wiki知识】\n${wikiText}`;
  }

  // 2. 构建初始消息
  let messages = [
    { role: 'user', content: `[系统指令]\n${systemContent}` },
    ...history.slice(-20) // 从 10 扩大到 20，因为后面有智能压缩
  ];

  // 3. 检查预算并压缩
  const { messages: compressed, budget } = await smartCompress(messages, tools, modelConfig);

  if (budget.needsCompression && budget.ratio > 1.0) {
    console.log(`[Context] 压缩: ${budget.currentTokens.toLocaleString()} tokens → `
      + `${estimateTokens(compressed, tools).toLocaleString()} tokens `
      + `(ratio=${budget.ratio.toFixed(2)}, severity=${budget.severity})`);
  }

  return compressed;
}

/**
 * 确保消息列表中 tool_call ↔ tool_result 配对完整
 * 移除孤立的 assistant(tool_calls) 和孤立的 tool 消息
 */
function ensureToolPairIntegrity(messages) {
  if (!messages || !messages.length) return messages;

  // 收集所有合法的 tool_call_id
  const validToolIds = new Set();
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.id) validToolIds.add(tc.id);
      }
    }
  }

  // 过滤：保留有配对的消息
  const result = [];
  const pendingToolIds = new Set(); // assistant 的 tool_calls 等待匹配

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'assistant' && msg.tool_calls) {
      // 收集此 assistant 的 tool_call ids
      const ids = msg.tool_calls.map(tc => tc.id).filter(Boolean);
      if (ids.length > 0) {
        result.push(msg);
        for (const id of ids) pendingToolIds.add(id);
        continue;
      }
    }

    if (msg.role === 'tool' && msg.tool_call_id) {
      if (pendingToolIds.has(msg.tool_call_id)) {
        result.push(msg);
        pendingToolIds.delete(msg.tool_call_id);
      }
      // 孤立 tool 消息（没有前面的 assistant tool_calls）→ 丢弃
      continue;
    }

    // 其他消息直接保留
    result.push(msg);
  }

  // 移除末尾孤立 assistant（有 tool_calls 但后续 tool 消息不完整）
  // 从后往前找，如果最后一个消息是 assistant+tool_calls 且还有未匹配的
  if (pendingToolIds.size > 0) {
    // 找到最后一个 assistant+tool_calls 消息并移除
    const cleaned = [];
    let skipNextTools = false;
    for (let i = 0; i < result.length; i++) {
      const msg = result[i];
      if (msg.role === 'assistant' && msg.tool_calls) {
        const ids = msg.tool_calls.map(tc => tc.id).filter(Boolean);
        const allOrphan = ids.every(id => pendingToolIds.has(id) && !validToolIds.has(id));
        if (allOrphan) { skipNextTools = true; continue; }
      }
      if (skipNextTools && msg.role === 'tool') { skipNextTools = false; continue; }
      skipNextTools = false;
      cleaned.push(msg);
    }
    return cleaned;
  }

  return result;
}

/**
 * 保留第一条用户消息作为锚点——即使压缩也不丢失原始任务
 */
function preserveFirstUserAnchor(messages) {
  if (!messages || !messages.length) return messages;

  // 找到第一条 user 消息
  const firstUserIdx = messages.findIndex(m => m.role === 'user');
  if (firstUserIdx === -1) return messages;

  const firstUser = messages[firstUserIdx];
  const originalTask = typeof firstUser.content === 'string' ? firstUser.content : '';

  // 检查是否已存在锚点
  const hasAnchor = messages.some(m =>
    m.role === 'user' && m.content && m.content.startsWith('[系统] 原始任务')
  );

  if (hasAnchor || !originalTask) return messages;

  // 在最前面插入锚点
  const anchor = { role: 'system', content: `[系统] 原始任务: ${originalTask.slice(0, 500)}` };
  return [anchor, ...messages];
}

/**
 * PTL 恢复：激进压缩后重试
 * 当 LLM 返回 PROMPT_TOO_LONG 时调用
 */
function recoverFromPTL(messages, tools = [], modelConfig = null) {
  // 先做工具对完整性检查
  let cleaned = ensureToolPairIntegrity(messages);

  // 激进硬压缩：只保留最近 4 条消息
  cleaned = hardCompress(cleaned, 4);

  // 保留首条用户锚点
  cleaned = preserveFirstUserAnchor(cleaned);

  // 进一步截断所有消息内容
  const MAX_CONTENT = 1000;
  cleaned = cleaned.map(m => {
    if (m.role === 'tool' || (m.role === 'assistant' && m.tool_calls)) return m;
    const content = typeof m.content === 'string' ? m.content : '';
    if (content.length > MAX_CONTENT) {
      return { ...m, content: content.slice(0, MAX_CONTENT) + '\n\n... [PTL 恢复: 已截断]', _ptl_compressed: true };
    }
    return m;
  });

  // 确保系统提示词在第一条
  const sysIdx = cleaned.findIndex(m => m.role === 'system' || (m.role === 'user' && m.content && m.content.startsWith('[系统指令]')));
  if (sysIdx > 0) {
    const sysMsg = cleaned.splice(sysIdx, 1)[0];
    cleaned.unshift(sysMsg);
  }

  return { messages: cleaned, recovered: true };
}

module.exports = {
  // Token 估算
  estimateTokens,
  getModelWindow,
  DEFAULT_MODEL_WINDOW,
  WINDOW_SAFETY_FACTOR,

  // 工具结果处理
  truncateToolResult,
  spillLargeResult,
  replaceOldToolResult,
  EXEMPT_TOOLS,
  CRITICAL_TOOLS,

  // 上下文预算
  checkContextBudget,

  // 压缩策略
  softCompress,
  hardCompress,
  smartCompress,

  // 消息构建
  buildMessagesWithBudget,

  // 工具对保护 + PTL 恢复
  ensureToolPairIntegrity,
  preserveFirstUserAnchor,
  recoverFromPTL,

  // LLM 摘要 + 去重
  llmSummarizeContext,
  buildSummaryPrompt,
  parseSummaryResult,
  formatSummaryAsMessage,
  detectDuplicateOutput,
  isCompressionCooldown,
  resetCompressionCooldown
};
