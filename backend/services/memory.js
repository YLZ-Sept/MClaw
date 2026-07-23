// Memory Service — 数字员工 MEMORY.md 记忆系统
// 参考 mateclaw MemorySummarizationService + MemoryEmergenceService
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { getActiveConfig } = require('../routes/model-configs');

const MEMORY_DIR = path.join(__dirname, '..', 'data', 'memory');

// ── 工具函数 ──

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readMemoryFile(agentId, file = 'MEMORY.md') {
  const fp = path.join(MEMORY_DIR, agentId, file);
  try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; }
}

function writeMemoryFile(agentId, content, file = 'MEMORY.md') {
  const fp = path.join(MEMORY_DIR, agentId, file);
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, content, 'utf8');
}

function appendMemoryFile(agentId, content, file = 'MEMORY.md') {
  const dir = path.join(MEMORY_DIR, agentId);
  ensureDir(dir);
  fs.appendFileSync(path.join(dir, file), content, 'utf8');
}

function appendDailyNote(agentId, content) {
  const date = new Date().toISOString().slice(0, 10);
  const file = `${date}.md`;
  const dir = path.join(MEMORY_DIR, agentId);
  ensureDir(dir);
  const header = `## ${new Date().toLocaleString('zh-CN')}\n`;
  fs.appendFileSync(path.join(dir, file), header + content + '\n\n', 'utf8');
}

/**
 * 用简单中文 n-gram 分词找到记忆文件中与查询相关的段落
 */
function findRelevantSections(memoryContent, query, maxChars = 3000) {
  if (!memoryContent || !query) return '';

  // 中文 n-gram 分词
  const clean = query.replace(/[^一-龥a-zA-Z0-9]/g, '');
  const grams = new Set();
  for (let i = 0; i < clean.length - 1; i++) {
    grams.add(clean.slice(i, i + 2));
    if (i < clean.length - 2) grams.add(clean.slice(i, i + 3));
  }
  const keywords = [...grams];

  if (!keywords.length) return '';

  // 按段落分割记忆内容（## 标题分段）
  const sections = memoryContent.split(/(?=^## )/m);
  const scored = sections.map(section => {
    let score = 0;
    const lower = section.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) score += 1;
      // 标题行额外加分
      const titleLine = section.split('\n')[0];
      if (titleLine.toLowerCase().includes(kw.toLowerCase())) score += 3;
    }
    return { section, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

  if (!scored.length) return '';

  // 拼合相关段落，控制总长度
  let result = '';
  for (const { section } of scored) {
    const candidate = result + section + '\n\n';
    if (candidate.length > maxChars) break;
    result = candidate;
  }

  return result.trim();
}

/**
 * 加载 Agent 上下文记忆（用于注入 system prompt）
 */
function loadMemoryContext(agentId, userMessage = '') {
  if (!agentId) return '';

  const memContent = readMemoryFile(agentId);
  const profileContent = readMemoryFile(agentId, 'PROFILE.md');
  const soulContent = readMemoryFile(agentId, 'SOUL.md');

  const parts = [];

  // SOUL.md（人格画像 — 高优先级）
  if (soulContent) {
    parts.push(`## 人格画像\n${soulContent.slice(0, 2000)}`);
  }

  // PROFILE.md（用户画像 — 总是注入但限制长度）
  if (profileContent) {
    parts.push(`## 用户画像\n${profileContent.slice(0, 2000)}`);
  }

  // 结构化记忆 always-on 块（user + feedback 类型）
  const structuredBlock = buildStructuredBlock(agentId);
  if (structuredBlock) {
    parts.push(structuredBlock);
  }

  // 结构化记忆 prefetch 块（project + reference，按查询匹配）
  if (userMessage) {
    const prefetchBlock = buildPrefetchBlock(agentId, userMessage);
    if (prefetchBlock) {
      parts.push(prefetchBlock);
    }
  }

  // MEMORY.md（按查询相关性注入）
  if (memContent && userMessage) {
    const relevant = findRelevantSections(memContent, userMessage, 3000);
    if (relevant) {
      parts.push(`## 相关记忆\n${relevant}`);
    }
  } else if (memContent) {
    // 无查询时，注入最近的内容
    const recent = memContent.split(/(?=^## )/m).slice(-5).join('\n');
    if (recent) {
      parts.push(`## 最近记忆\n${recent.slice(0, 2000)}`);
    }
  }

  if (parts.length === 0) return '';

  return `\n\n---\n\n# 记忆上下文\n${parts.join('\n\n---\n\n')}`;
}

// ── 对话后自动提取 ──

const EXTRACTION_COOLDOWN_MS = 5 * 60 * 1000; // 5 分钟冷却
const _lastExtraction = new Map(); // agentId → timestamp

/**
 * 从对话历史中提取关键信息并更新记忆
 * @returns {Promise<{extracted: boolean, reason: string}>}
 */
async function extractAndUpdateMemory(agentId, messages, options = {}) {
  if (!agentId) return { extracted: false, reason: 'no agentId' };
  if (!messages || messages.length < 4) return { extracted: false, reason: 'too few messages' };

  // 冷却检查
  const lastTime = _lastExtraction.get(agentId);
  if (lastTime && (Date.now() - lastTime) < EXTRACTION_COOLDOWN_MS) {
    return { extracted: false, reason: 'cooldown' };
  }

  // 门控：至少要有用户消息
  const userMessages = messages.filter(m => m.role === 'user');
  const userContent = userMessages.map(m => m.content).filter(c => c && c.length >= 10);
  if (userContent.length === 0) return { extracted: false, reason: 'no meaningful user messages' };

  _lastExtraction.set(agentId, Date.now());

  try {
    const config = getActiveConfig();
    if (!config) return { extracted: false, reason: 'no model config' };

    // 构建摘要提示
    const conversationText = messages.map(m => {
      const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : `工具(${m.tool_call_id || ''})`;
      const content = typeof m.content === 'string' ? m.content.slice(0, 500) : '(非文本内容)';
      return `[${role}] ${content}`;
    }).join('\n');

    const systemPrompt = `你是一个记忆提取助手。从对话历史中提取以下信息，输出JSON格式：

{
  "key_learnings": ["关键学习点1", "关键学习点2", ...],   // 本次对话中助手学到的重要信息
  "user_preferences": ["偏好1", "偏好2", ...],            // 用户的偏好、习惯
  "user_facts": ["事实1", "事实2", ...],                   // 关于用户的事实
  "should_update_memory": true/false                       // 是否有值得记录的内容
}

规则：
- key_learnings: 助手获得的新知识、经验教训、纠正
- user_preferences: 用户表达的偏好（喜欢/不喜欢什么格式、风格、工具等）
- user_facts: 用户的基本信息（名字、公司、角色、需求等）
- 如果对话只是简单问候或没有新信息，should_update_memory 设为 false
- 每个条目用中文简洁描述（20字以内），最多5条`;

    const response = await fetch(`${config.api_base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `对话历史:\n${conversationText.slice(-6000)}` }
        ],
        temperature: 0.3,
        max_tokens: 1000
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      _lastExtraction.delete(agentId); // 允许重试
      return { extracted: false, reason: `LLM error ${response.status}` };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    // 解析 JSON
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return { extracted: false, reason: 'parse error' };
    }

    if (!parsed || !parsed.should_update_memory) {
      return { extracted: false, reason: 'nothing to record' };
    }

    // 写入 MEMORY.md
    const timestamp = new Date().toISOString();
    let memoryEntry = `\n\n## ${timestamp.slice(0, 10)}\n`;

    if (parsed.user_facts?.length) {
      memoryEntry += `### 用户信息\n${parsed.user_facts.map(f => `- ${f}`).join('\n')}\n`;
    }
    if (parsed.user_preferences?.length) {
      memoryEntry += `### 偏好\n${parsed.user_preferences.map(p => `- ${p}`).join('\n')}\n`;
    }
    if (parsed.key_learnings?.length) {
      memoryEntry += `### 学到什么\n${parsed.key_learnings.map(l => `- ${l}`).join('\n')}\n`;
    }

    appendMemoryFile(agentId, memoryEntry);
    appendDailyNote(agentId, memoryEntry);

    // 强制执行文件大小上限
    enforceMemoryBudget(agentId);

    console.log(`[Memory] ${agentId}: 提取了 ${(parsed.key_learnings?.length || 0) + (parsed.user_preferences?.length || 0) + (parsed.user_facts?.length || 0)} 条记忆`);
    return { extracted: true, entries: parsed };
  } catch (err) {
    _lastExtraction.delete(agentId);
    console.error(`[Memory] ${agentId} 提取失败:`, err.message);
    return { extracted: false, reason: err.message };
  }
}

/**
 * 强制执行记忆文件大小上限
 */
function enforceMemoryBudget(agentId) {
  const MAX_MEMORY_CHARS = 20000;
  const MAX_PROFILE_CHARS = 4000;

  for (const [file, limit] of [['MEMORY.md', MAX_MEMORY_CHARS], ['PROFILE.md', MAX_PROFILE_CHARS]]) {
    const content = readMemoryFile(agentId, file);
    if (content.length > limit) {
      // 保留最近的段落
      const sections = content.split(/(?=^## )/m);
      let kept = '';
      // 从后往前取，直到接近上限
      for (let i = sections.length - 1; i >= 0 && (kept.length + sections[i].length) < limit; i--) {
        kept = sections[i] + '\n' + kept;
      }
      writeMemoryFile(agentId, kept.trim(), file);
      console.log(`[Memory] ${agentId}/${file}: 从 ${content.length} 字符裁剪到 ${kept.length} 字符`);
    }
  }
}

// ── Agent 可调用的记忆工具（供 executor 使用） ──

async function toolRemember(agentId, content, source = 'agent') {
  if (!agentId || !content) return { error: '缺少 agentId 或 content' };
  const timestamp = new Date().toISOString();
  const entry = `\n\n## ${timestamp.slice(0, 10)} (Agent 主动记录)\n> Source: ${source}\n${content}\n`;
  appendMemoryFile(agentId, entry);
  appendDailyNote(agentId, entry);
  enforceMemoryBudget(agentId);
  return { success: true, message: '已记录到记忆' };
}

async function toolRecall(agentId, query) {
  if (!agentId || !query) return { error: '缺少 agentId 或 query' };
  const content = readMemoryFile(agentId);
  if (!content) return { message: '暂无记忆', results: [] };
  const relevant = findRelevantSections(content, query, 5000);
  return { query, content: relevant || '未找到相关记忆', results: relevant ? [relevant] : [] };
}

// ── 递归列出目录下所有文件 ──

function listFilesRecursive(dir, baseDir = dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath, baseDir));
    } else {
      // 返回相对于 baseDir 的路径
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        results.push({ file: relPath, chars: content.length, lines: content.split('\n').length });
      } catch {
        results.push({ file: relPath, chars: 0, lines: 0, error: true });
      }
    }
  }
  return results;
}

function deleteDirRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      deleteDirRecursive(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
  fs.rmdirSync(dir);
}

// ── 记忆管理 API ──

function getMemoryStats(agentId) {
  const dir = path.join(MEMORY_DIR, agentId);
  if (!fs.existsSync(dir)) return { agentId, files: [], totalChars: 0 };

  const files = listFilesRecursive(dir);

  return {
    agentId,
    files,
    totalChars: files.reduce((s, f) => s + f.chars, 0),
    lastUpdated: files.length ? Math.max(...files.map(f => {
      try { return fs.statSync(path.join(dir, f.file)).mtimeMs; } catch { return 0; }
    })) : null
  };
}

function clearMemory(agentId) {
  const dir = path.join(MEMORY_DIR, agentId);
  deleteDirRecursive(dir);
  return { success: true, message: `已清除 ${agentId} 的所有记忆` };
}

function deleteMemoryFile(agentId, filename) {
  if (!filename) return { success: false, message: '缺少文件名' };
  // 防止路径穿越：规范化并确保在 agent 目录内
  const agentDir = path.resolve(MEMORY_DIR, agentId);
  const fp = path.resolve(agentDir, filename);
  if (!fp.startsWith(agentDir + path.sep) && fp !== agentDir) {
    return { success: false, message: '非法路径' };
  }
  if (!fs.existsSync(fp)) return { success: false, message: '文件不存在' };
  fs.unlinkSync(fp);

  // 清理空目录
  let parentDir = path.dirname(fp);
  while (parentDir !== agentDir && parentDir.startsWith(agentDir)) {
    try {
      const remaining = fs.readdirSync(parentDir);
      if (remaining.length === 0) fs.rmdirSync(parentDir);
      else break;
    } catch { break; }
    parentDir = path.dirname(parentDir);
  }

  return { success: true, message: `已删除 ${filename}` };
}

// ── 结构化记忆（对标 mateclaw StructuredMemoryService）──

const VALID_STRUCT_TYPES = ['user', 'feedback', 'project', 'reference'];

/**
 * 存储一条分类记忆条目
 * @param {string} agentId
 * @param {string} type - user | feedback | project | reference
 * @param {string} key - 条目键名（## key）
 * @param {string} content - 条目内容
 * @param {string} source - 记录来源
 */
function rememberStructured(agentId, type, key, content, source = 'agent') {
  if (!VALID_STRUCT_TYPES.includes(type)) {
    return { success: false, message: `无效的记忆类型: ${type}，可选: ${VALID_STRUCT_TYPES.join(', ')}` };
  }
  const filename = `structured/${type}.md`;
  const existing = readMemoryFile(agentId, filename);

  const metadata = `> Source: ${source} | Updated: ${new Date().toISOString().slice(0, 10)}`;
  const newSection = `## ${key}\n${content.trim()}\n${metadata}`;

  // 查找并替换已有的同 key 段落
  const headerIdx = existing.indexOf(`## ${key}\n`);
  let updated;
  if (headerIdx >= 0) {
    // 找到下一个 ## 或 EOF
    const nextIdx = existing.indexOf('\n## ', headerIdx + 1);
    const end = nextIdx >= 0 ? nextIdx : existing.length;
    updated = existing.slice(0, headerIdx) + newSection + existing.slice(end);
  } else {
    updated = existing.trim() ? existing.trim() + '\n\n' + newSection : newSection;
  }

  writeMemoryFile(agentId, updated, filename);
  return { success: true, message: `已记录 ${type}/${key}` };
}

/**
 * 查询结构化记忆条目
 * @param {string} agentId
 * @param {string} type - 分类，不传则查全部
 * @param {string} keyword - 可选关键词过滤
 * @returns {{ type, key, content }[]}
 */
function recallStructured(agentId, type, keyword) {
  const types = type ? [type] : VALID_STRUCT_TYPES;
  const results = [];

  for (const t of types) {
    const content = readMemoryFile(agentId, `structured/${t}.md`);
    if (!content.trim()) continue;

    // 按 ## 分段解析
    const sections = content.split(/(?=^## )/m);
    for (const sec of sections) {
      const match = sec.match(/^## (.+)\n([\s\S]*)/);
      if (!match) continue;
      const key = match[1].trim();
      const body = match[2].trim();
      // 剥离元数据行 (以 > 开头)
      const cleanBody = body.split('\n').filter(l => !l.startsWith('>')).join('\n').trim();

      if (keyword && !key.includes(keyword) && !cleanBody.includes(keyword)) continue;

      results.push({ type: t, key, content: cleanBody });
    }
  }
  return results;
}

/**
 * 删除一条结构化记忆条目
 */
function forgetStructured(agentId, type, key) {
  if (!VALID_STRUCT_TYPES.includes(type)) {
    return { success: false, message: `无效的记忆类型: ${type}` };
  }
  const filename = `structured/${type}.md`;
  const content = readMemoryFile(agentId, filename);
  if (!content.trim()) return { success: false, message: '文件为空' };

  const headerIdx = content.indexOf(`## ${key}\n`);
  if (headerIdx < 0) return { success: false, message: `条目 "${key}" 不存在` };

  const nextIdx = content.indexOf('\n## ', headerIdx + 1);
  const end = nextIdx >= 0 ? nextIdx : content.length;
  const updated = (content.slice(0, headerIdx) + content.slice(end)).trim()
    .replace(/\n{3,}/g, '\n\n');

  writeMemoryFile(agentId, updated, filename);
  return { success: true, message: `已删除 ${type}/${key}` };
}

/**
 * 构建 always-on 注入块（对标 mateclaw buildMemoryBlock）
 * 只包含 user/feedback 两类低量稳定条目
 */
function buildStructuredBlock(agentId) {
  const alwaysOnTypes = ['user', 'feedback'];
  const parts = [];

  for (const type of alwaysOnTypes) {
    const entries = recallStructured(agentId, type, null);
    if (!entries.length) continue;

    const label = { user: '用户信息', feedback: '偏好反馈' }[type] || type;
    const bullets = entries.map(e => `- **${e.key}**: ${e.content.slice(0, 300)}`);
    parts.push(`### ${label}\n${bullets.join('\n')}`);
  }

  if (!parts.length) return '';
  return `## 结构化记忆\n\n${parts.join('\n\n')}`;
}

/**
 * 构建 query-conditioned prefetch 块（对标 mateclaw buildPrefetchBlock）
 */
function buildPrefetchBlock(agentId, userQuery) {
  if (!userQuery) return '';
  const prefetchTypes = ['project', 'reference'];
  const matches = [];

  for (const type of prefetchTypes) {
    const entries = recallStructured(agentId, type, null);
    for (const e of entries) {
      // 简单评分：key 命中 +4，内容命中 +1
      let score = 0;
      if (e.key.includes(userQuery)) score += 4;
      if (e.content.includes(userQuery)) score += 1;
      if (score > 0) matches.push({ ...e, score });
    }
  }

  if (!matches.length) return '';

  matches.sort((a, b) => b.score - a.score);
  const top = matches.slice(0, 6);

  const bullets = top.map(m => `- **${m.key}** (${m.type}): ${m.content.slice(0, 300)}`);
  return `## 相关记忆\n${bullets.join('\n')}`;
}

module.exports = {
  // 基础操作
  readMemoryFile,
  writeMemoryFile,
  appendMemoryFile,
  appendDailyNote,
  findRelevantSections,
  loadMemoryContext,

  // 自动提取
  extractAndUpdateMemory,
  enforceMemoryBudget,

  // Agent 工具
  toolRemember,
  toolRecall,

  // 管理 API
  getMemoryStats,
  clearMemory,
  deleteMemoryFile,
  MEMORY_DIR,

  // 结构化记忆
  rememberStructured,
  recallStructured,
  forgetStructured,
  buildStructuredBlock,
  buildPrefetchBlock
};
