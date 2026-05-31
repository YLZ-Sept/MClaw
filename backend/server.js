require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const app = express();

app.use(cors());
app.use(express.json());

require('./db');

// CRM
app.use('/api/customers', require('./routes/customers'));
app.use('/api/contacts', require('./routes/crm-contacts'));
app.use('/api/contracts', require('./routes/crm-contracts'));
app.use('/api/opportunities', require('./routes/crm-opportunities'));
app.use('/api/asset-ledger', require('./routes/asset-ledger'));

// 进销存
app.use('/api/purchase-orders', require('./routes/purchase-orders'));
app.use('/api/sales-orders', require('./routes/sales-orders'));
app.use('/api/returns', require('./routes/returns'));

// 人事
app.use('/api/employees', require('./routes/employees'));
app.use('/api/departments', require('./routes/hr-departments'));
app.use('/api/recruitment', require('./routes/hr-recruitment'));
app.use('/api/candidates', require('./routes/hr-recruitment'));
app.use('/api/attendance', require('./routes/hr-attendance'));
app.use('/api/personnel-changes', require('./routes/hr-changes'));
app.use('/api/performance', require('./routes/hr-performance'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/io', require('./routes/io'));
app.use('/api/bids', require('./routes/bids'));
app.use('/api/content-publish', require('./routes/content-publish'));
app.use('/api/chat-sessions', require('./routes/chat-sessions'));
app.use('/api/agent-apps', require('./routes/agent-apps'));
app.use('/api/agent-skills', require('./routes/agent-skills'));
app.use('/api/digital-employees', require('./routes/digital-employees'));
app.use('/api/digital-human', require('./routes/digital-human'));
app.use('/api/faq', require('./routes/faq'));
app.use('/api/model-configs', require('./routes/model-configs').router);
app.use('/api/trending', require('./routes/trending'));
app.use('/api/knowledge-base', require('./routes/knowledge-base'));
app.use('/api/doc-import', require('./routes/doc-import'));
app.use('/api/channel-accounts', require('./routes/channel-accounts'));
app.use('/api/channel-conversations', require('./routes/channel-conversations'));

// 爆款视频
app.use('/api/hot-products', require('./routes/hot-products'));
app.use('/api/hot-contents', require('./routes/hot-contents'));
app.use('/api/hot-extract', require('./routes/hot-extract'));
app.use('/api/hot-quick-reply', require('./routes/hot-quick-reply'));
app.use('/api/hot-leads', require('./routes/hot-leads'));
app.use('/api/hot-chanjing', require('./routes/hot-chanjing'));

// 抖音发布
app.use('/api/douyin-publish', require('./routes/douyin-publish'));

// 文档
app.use('/api/documents', require('./routes/documents'));
app.use('/api/doc-folders', require('./routes/doc-folders'));
app.use('/api/org-charts', require('./routes/org-charts'));

// 动态读取当前激活的模型配置
const { getActiveConfig } = require('./routes/model-configs');

let chatHistories = {};

function getHistory(agent) {
  const key = agent || 'default';
  if (!chatHistories[key]) {
    const greetings = {
      'internal-agent': '你好老板！我是小内，您的企业内部管理助手。CRM、进销存、人事、文档，四大模块随时待命。请问有什么需要处理的？',
      'support-agent': '你好！我是小客，MClaw 售后客服助手。FAQ 问答、工单跟进、客户反馈，我都能帮您处理。请问有什么可以帮您的？',
      'sales-agent': '你好老板！我是小销，您的销售管理助手。客户跟进、机会推进、合同签署，销售全流程我都能帮您盯着。请问今天需要处理什么？',
    };
    const greeting = greetings[key] || greetings['internal-agent'];
    chatHistories[key] = [
      { role: 'user', content: '你好！' },
      { role: 'assistant', content: greeting }
    ];
  }
  return chatHistories[key];
}

function loadSessionHistory(sessionId) {
  const rows = require('./db').prepare('SELECT id, role, content FROM chat_messages WHERE session_id=? ORDER BY created_at ASC LIMIT 50').all(sessionId);
  return rows.map(r => ({ role: r.role, content: r.content }));
}

function saveSessionMessage(sessionId, role, content, toolName) {
  const { randomUUID } = require('crypto');
  require('./db').prepare('INSERT INTO chat_messages (id,session_id,role,content,tool_name) VALUES (?,?,?,?,?)')
    .run(randomUUID(), sessionId, role, content, toolName || null);
  require('./db').prepare('UPDATE chat_sessions SET updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(sessionId);
}

// Agent 配置加载
const agentConfigs = {
  'internal-agent': require('./agents/internal'),
  'support-agent': require('./agents/support'),
  'sales-agent': require('./agents/sales'),
  'default': require('./agents/internal')
};
const { exec: execTool } = require('./agents/executor');

function loadAgentConfig(agent) {
  // 基础配置
  let base;
  let dbRow = null;
  if (agentConfigs[agent]) {
    base = agentConfigs[agent];
  } else {
    try {
      dbRow = require('./db').prepare('SELECT * FROM agent_apps WHERE id=? AND status=?').get(agent, 'active');
      if (dbRow) {
        if (dbRow.base_agent && agentConfigs[dbRow.base_agent]) {
          const b = agentConfigs[dbRow.base_agent];
          base = { systemPrompt: dbRow.system_prompt || b.systemPrompt, tools: [...b.tools] };
        } else {
          // 无基础 Agent — 纯自定义，仅系统提示词 + 技能 + 知识库，无内置工具
          base = { systemPrompt: dbRow.system_prompt || '你是 MClaw 智能助手，请用中文简洁回复。', tools: [] };
        }
      }
    } catch {}
  }
  if (!base) base = agentConfigs['default'];

  let extraPrompt = '';

  // 加载该 Agent 绑定的技能
  try {
    const skills = require('./db').prepare('SELECT * FROM agent_skills WHERE (agent_id=? OR agent_id IS NULL OR agent_id=\'\') AND status=\'active\'').all(agent);
    if (skills.length) {
      const prompts = skills.filter(s => s.prompt_snippet).map(s => `## ${s.name}\n${s.prompt_snippet}`).join('\n\n');
      if (prompts) extraPrompt += '\n\n---\n\n# 附加技能\n' + prompts;
    }
  } catch {}

  // 加载该 Agent 绑定的知识库文档
  try {
    const articleIds = dbRow?.kb_article_ids;
    if (articleIds) {
      const ids = articleIds.split(',').filter(Boolean);
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        const articles = require('./db').prepare(
          `SELECT title, content FROM kb_articles WHERE id IN (${placeholders}) AND status='published'`
        ).all(...ids);
        if (articles.length) {
          const kbPrompt = articles.map(a => `## ${a.title}\n${(a.content || '').slice(0, 3000)}`).join('\n\n---\n\n');
          if (kbPrompt) extraPrompt += '\n\n---\n\n# 参考知识库\n' + kbPrompt;
        }
      }
    }
  } catch {}

  if (extraPrompt) {
    return { systemPrompt: base.systemPrompt + extraPrompt, tools: base.tools };
  }
  return base;
}

app.get('/api/info', (req, res) => {
  res.json({
    code: 200,
    data: { version: 'v2026.5.7', engine: 'OpenClaw', status: 'running' }
  });
});

app.get('/api/agents', (req, res) => {
  const builtin = [
    { id: 'sales-agent', name: '销售管理 Agent', icon: 'Coin', emoji: '🤝', bg: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', desc: '管理销售流程、客户跟进、合同签署和业绩统计', builtin: true },
    { id: 'internal-agent', name: '内部管理 Agent', icon: 'Avatar', emoji: '📋', bg: 'linear-gradient(135deg,#0d47a1 0%,#42a5f5 100%)', desc: '处理内部审批、日程安排、文档管理和协作任务', builtin: true },
    { id: 'support-agent', name: '售后管理 Agent', icon: 'Headset', emoji: '🔧', bg: 'linear-gradient(135deg,#2e7d32 0%,#66bb6a 100%)', desc: '处理售后咨询、工单跟进、FAQ解答和客户反馈', builtin: true },
  ];
  try {
    const custom = require('./db').prepare('SELECT id,name,desc,icon,color AS bg,emoji,base_agent,system_prompt,status FROM agent_apps ORDER BY created_at DESC').all();
    res.json({ code: 200, data: [...builtin, ...custom.map(c=>({...c, builtin: false}))] });
  } catch { res.json({ code: 200, data: builtin }); }
});

app.get('/api/chat/history', (req, res) => {
  const history = getHistory(req.query.agent);
  res.json({ code: 200, data: history });
});

app.post('/api/chat/clear', (req, res) => {
  const key = req.body.agent || 'default';
  delete chatHistories[key];
  res.json({ code: 200 });
});

function matchFAQ(content) {
  try {
    const { search } = require('./agents/vector-search');
    const matches = search(content, 3);
    if (matches.length > 0) {
      return matches.map(m => ({ ...m, answer: m.answer && m.answer.length > 500 ? m.answer.slice(0, 500) + '...' : m.answer }));
    }
    return null;
  } catch { return null; }
}

function makeMessages(config, history, faqMatches, escalate) {
  let systemContent = config.systemPrompt + (faqMatches
    ? `\n\n【相关FAQ知识库】\n${faqMatches.map(m => `Q: ${m.question}\nA: ${m.answer}`).join('\n\n')}`
    : '');
  if (escalate) {
    systemContent = '【系统指令：用户表达了投诉/退款/赔偿等敏感诉求，你必须立即调用 handoff_to_human 工具转人工，不要做其他查询。】\n\n' + systemContent;
  }
  // 使用 user 角色兼容不支持 system 角色的 API（如豆包等）
  return [{ role: 'user', content: `[系统指令]\n${systemContent}` }, ...history.slice(-10)];
}

// SSE 辅助：发送事件
function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// 动态读取模型配置并调用 LLM
async function callLLM(messages, tools, stream, forceTool) {
  const config = getActiveConfig();
  if (!config) throw new Error('没有可用的模型配置，请先在模型配置中添加并设为默认');
  const body = { model: config.model, messages, max_tokens: config.max_tokens, temperature: config.temperature };
  if (stream) body.stream = true;
  if (tools) { body.tools = tools; body.tool_choice = forceTool || 'auto'; }
  const dsRes = await fetch(`${config.api_base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
    body: JSON.stringify(body)
  });
  if (!dsRes.ok) {
    const errText = await dsRes.text();
    throw new Error(`LLM ${dsRes.status}: ${errText.slice(0, 300)}`);
  }
  return dsRes;
}

// 流式读取 DeepSeek SSE 响应，逐 token 转发
async function streamReply(dsRes, res) {
  const reader = dsRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let fullText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          sse(res, 'text', { content: delta });
        }
      } catch {}
    }
  }
  return fullText;
}

// 润色回复
async function polishReply(rawReply) {
  try {
    const polishPrompt = `请润色以下回答，使其更专业流畅。保持所有事实数据、数字、表格结构不变，不要添加不存在的信息，不要改变表格列和内容。直接输出润色后的内容，不要加任何前缀、说明或评价：\n\n${rawReply}`;
    const dsRes = await callLLM([{ role: 'user', content: polishPrompt }], null, false);
    const dsData = await dsRes.json();
    const polished = dsData.choices?.[0]?.message?.content;
    return polished && polished.length > 20 ? polished : rawReply;
  } catch {
    return rawReply;
  }
}

app.post('/api/chat/send', async (req, res) => {
  const { content, agent, stream: wantStream, session_id } = req.body;
  const useSession = !!session_id;
  const history = useSession ? loadSessionHistory(session_id) : getHistory(agent);
  const config = loadAgentConfig(agent);
  console.log(`[chat] agent=${agent || 'default'} session=${session_id||'memory'} content="${(content||'').slice(0, 80)}" stream=${!!wantStream}`);
  history.push({ role: 'user', content });
  if (useSession) saveSessionMessage(session_id, 'user', content);

  const isStream = wantStream === true;
  if (isStream) {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  }

  try {
    const faqMatches = matchFAQ(content);
    const escalate = config === agentConfigs['support-agent'] && /投诉|退款|赔偿|数据丢|找领导|叫经理|法律|律师|消协|12315/i.test(content);
    const messages = makeMessages(config, history, faqMatches, escalate);

    // 工具调用轮（非流式），投诉场景强制调用 handoff
    const forceTool = escalate ? { type: 'function', function: { name: 'handoff_to_human' } } : null;
    let dsRes = await callLLM(messages, config.tools, false, forceTool);
    let dsData = await dsRes.json();
    let msg = dsData.choices?.[0]?.message;
    const toolNames = [];

    let loop = 0;
    while (msg?.tool_calls && msg.tool_calls.length > 0 && loop < 2) {
      loop++;
      messages.push({ role: 'assistant', content: null, tool_calls: msg.tool_calls });

      for (const tc of msg.tool_calls) {
        const funcName = tc.function.name;
        let args;
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
        console.log(`[tool] ${funcName} args:`, JSON.stringify(args).slice(0, 200));
        if (isStream) sse(res, 'tool', { name: funcName, status: 'calling' });
        const result = execTool(funcName, args);
        if (isStream) sse(res, 'tool', { name: funcName, status: 'done', result: JSON.stringify(result).slice(0, 300) });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        toolNames.push(funcName);
      }

      dsRes = await callLLM(messages, config.tools, false);
      dsData = await dsRes.json();
      msg = dsData.choices?.[0]?.message;
    }

    const rawReply = msg?.content || '未返回有效回复';

    if (isStream) {
      // SSE 流式模式
      // 先发工具调用过的信息
      if (toolNames.length > 0) {
        sse(res, 'status', { msg: `已执行 ${toolNames.length} 个操作：${toolNames.join('、')}` });
      }

      // 流式输出原始回复
      sse(res, 'text', { content: '\n\n' });
      sse(res, 'text', { content: rawReply });

      // 润色
      sse(res, 'status', { msg: '正在润色...' });
      const polished = await polishReply(rawReply);
      sse(res, 'polished', { content: polished });

      // 存润色后的回复
      history.push({ role: 'assistant', content: polished });
      if (useSession) saveSessionMessage(session_id, 'assistant', polished);
      sse(res, 'done', {});
      res.end();

    } else {
      // 传统 JSON 模式（兼容旧调用）
      // 润色
      const polished = await polishReply(rawReply);
      history.push({ role: 'assistant', content: polished });
      if (useSession) saveSessionMessage(session_id, 'assistant', polished);
      res.json({ code: 200, data: { content: polished } });
    }

  } catch (err) {
    console.error('[chat] error:', err.message);
    if (isStream) {
      try { sse(res, 'error', { message: err.message }); sse(res, 'done', {}); res.end(); } catch {}
    } else {
      let fallback = `抱歉，服务暂时不可用。`;
      try {
        const faqMatches = matchFAQ(content);
        if (faqMatches) fallback = faqMatches.map(m => `**${m.question}**\n${m.answer}`).join('\n\n');
      } catch {}
      history.push({ role: 'assistant', content: fallback });
      if (useSession) saveSessionMessage(session_id, 'assistant', fallback);
      res.json({ code: 200, data: { content: fallback } });
    }
  }
});

app.get('/api/status', (req, res) => {
  res.json({ code: 200, data: { cpu: '12%', memory: '380MB', services: 3 } });
});

const PORT = 3001;
const server = http.createServer(app);

// 启动统一 WebSocket 服务器（Sightflow + Events）
try { require('./channels/ws-server').startWSServer(server); } catch (e) { console.log('[server] WS 启动失败:', e.message); }

server.listen(PORT, () => {
  console.log(`MClaw 后端运行在 http://localhost:${PORT}`);
  // 启动招投标定时采集（API 每6小时，爬虫每2小时）
  try { const { startScheduler } = require('./bid-collector'); startScheduler(6 * 60 * 60 * 1000); } catch {}
  try { const { startScheduler: startCrawler } = require('./bid-crawler'); startCrawler(120 * 60 * 1000); } catch {}
});
