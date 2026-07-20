require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const app = express();

app.use(cors());
app.use(express.json());

// 生产模式：serve 前端构建产物（无 dist 时走 Vite 开发代理）
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  console.log('[server] 生产模式：serve 前端静态文件', frontendDist);
}
require('./db');

// ── 授权校验（全局，白名单例外）──
const { requireLicense } = require('./license');
app.use(requireLicense);

// 迁移：channel_accounts.agent_id 从单值转为 JSON 数组
const db = require('./db');
try {
  const rows = db.prepare('SELECT id, agent_id FROM channel_accounts WHERE agent_id IS NOT NULL AND agent_id != \'\'').all();
  let migrated = 0;
  for (const r of rows) {
    if (!r.agent_id.startsWith('[')) {
      db.prepare('UPDATE channel_accounts SET agent_id=? WHERE id=?').run(JSON.stringify([r.agent_id]), r.id);
      migrated++;
    }
  }
  if (migrated > 0) console.log(`[migrate] channel_accounts.agent_id 转数组: ${migrated} 条`);
} catch (e) { /* 表可能尚未创建 */ }

// 权限守卫：URL 路径 → 权限点映射
const routePermMap = [
  { prefix: '/api/customers', perm: 'crm' },
  { prefix: '/api/contacts', perm: 'crm' },
  { prefix: '/api/contracts', perm: 'crm' },
  { prefix: '/api/opportunities', perm: 'crm' },
  { prefix: '/api/asset-ledger', perm: 'crm' },
  { prefix: '/api/purchase-orders', perm: 'inventory' },
  { prefix: '/api/sales-orders', perm: 'inventory' },
  { prefix: '/api/returns', perm: 'inventory' },
  { prefix: '/api/employees', perm: 'hr' },
  { prefix: '/api/departments', perm: 'hr' },
  { prefix: '/api/recruitment', perm: 'hr' },
  { prefix: '/api/recruitment-stats', perm: 'hr' },
  { prefix: '/api/candidates', perm: 'hr' },
  { prefix: '/api/attendance', perm: 'hr' },
  { prefix: '/api/personnel-changes', perm: 'hr' },
  { prefix: '/api/performance', perm: 'hr' },
  { prefix: '/api/finance', perm: 'crm' },
  { prefix: '/api/documents', perm: 'docs' },
  { prefix: '/api/doc-folders', perm: 'docs' },
  { prefix: '/api/org-charts', perm: 'docs' },
  { prefix: '/api/chat-sessions', perm: 'chat' },
  { prefix: '/api/agent-apps', perm: 'digital' },
  { prefix: '/api/agent-openclaw-skills', perm: 'digital' },
  { prefix: '/api/digital-employees', perm: 'digital' },
  { prefix: '/api/digital-human', perm: 'digital' },
  { prefix: '/api/trending', perm: 'trending' },
  { prefix: '/api/hot-products', perm: 'trending' },
  { prefix: '/api/hot-contents', perm: 'trending' },
  { prefix: '/api/hot-extract', perm: 'trending' },
  { prefix: '/api/hot-quick-reply', perm: 'trending' },
  { prefix: '/api/hot-leads', perm: 'trending' },
  { prefix: '/api/hot-chanjing', perm: 'trending' },
  { prefix: '/api/social-acquisition', perm: 'trending' },
  { prefix: '/api/faq', perm: 'knowledge' },
  { prefix: '/api/knowledge-base', perm: 'knowledge' },
  { prefix: '/api/doc-import', perm: 'knowledge' },
  { prefix: '/api/wiki', perm: 'knowledge' },
  { prefix: '/api/model-configs', perm: 'model' },
  { prefix: '/api/channel-accounts', perm: 'channels' },
  { prefix: '/api/channel-conversations', perm: 'channels' },
  { prefix: '/api/bids', perm: 'publish' },
  { prefix: '/api/bid-statistics', perm: 'publish' },
  { prefix: '/api/publish', perm: 'publish' },
  { prefix: '/api/tasks', perm: 'tasks' },
  { prefix: '/api/clawhub', perm: 'skills' },
];
function guardByRoute(req, res, next) {
  const match = routePermMap.find(r => req.path.startsWith(r.prefix));
  if (match) {
    return requirePermission(match.perm)(req, res, next);
  }
  next();
}
app.use(guardByRoute);

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
app.use('/api/recruitment-stats', require('./routes/hr-recruitment-stats'));
app.use('/api/candidates', require('./routes/hr-recruitment'));
app.use('/api/attendance', require('./routes/hr-attendance'));
app.use('/api/personnel-changes', require('./routes/hr-changes'));
app.use('/api/performance', require('./routes/hr-performance'));
app.use('/api/finance', require('./routes/finance'));
const { requireAuth, requirePermission } = require('./routes/auth');

app.use('/uploads', requireAuth, express.static(path.join(__dirname, 'uploads')));

app.get('/api/info', (req, res) => {
  res.json({ code: 200, data: { version: 'v2026.6.16', engine: 'OpenClaw', status: 'running' } });
});

app.get('/api/agents', requireAuth, (req, res) => {
  const builtin = [
    { id: 'bid-agent', name: '招投标采集 Agent', icon: 'Search', emoji: '🎯', bg: 'linear-gradient(135deg,#e67e22 0%,#f1c40f 100%)', desc: '招标项目查询、关键词监控、Crawl4AI + Scrapling + 乙方宝三引擎采集', builtin: true },
    { id: 'customer-service-agent', name: '智能客服系统', icon: 'Headset', emoji: '🎧', bg: 'linear-gradient(135deg,#06b6d4 0%,#3b82f6 100%)', desc: '腾讯元器 AI 智能客服，在线问答、知识库检索、自动回复', builtin: true },
  ];
  try {
    const custom = require('./db').prepare('SELECT id,name,desc,icon,color AS bg,emoji,base_agent,system_prompt,status,kb_article_ids,kb_folder_paths FROM agent_apps WHERE is_expert IS NULL OR is_expert=0 ORDER BY created_at DESC').all();
    res.json({ code: 200, data: [...builtin, ...custom.map(c => ({ ...c, builtin: false }))] });
  } catch { res.json({ code: 200, data: builtin }); }
});

// 智能客服系统：自定义链接存取
const csConfigPath = path.join(__dirname, 'data', 'customer-service-config.json');
function readCsConfig() {
  try { return JSON.parse(fs.readFileSync(csConfigPath, 'utf-8')); } catch { return { url: '' }; }
}
function writeCsConfig(cfg) {
  const dir = path.dirname(csConfigPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(csConfigPath, JSON.stringify(cfg, null, 2));
}
app.get('/api/customer-service/url', requireAuth, (req, res) => {
  res.json({ code: 200, data: readCsConfig() });
});
app.put('/api/customer-service/url', requireAuth, (req, res) => {
  const { url } = req.body;
  if (typeof url !== 'string') return res.status(400).json({ code: 400, message: 'url 必填' });
  writeCsConfig({ url });
  res.json({ code: 200, message: '已保存' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/license', require('./routes/license'));
app.use('/api/users', requireAuth, require('./routes/users'));
app.use('/api/roles', requireAuth, require('./routes/roles'));
app.use('/api/security', requirePermission('security'), require('./routes/security'));
app.use('/api/logs', requireAuth, require('./routes/logs'));
app.use('/api/io', requireAuth, require('./routes/io'));
app.use('/api/bids', require('./routes/bids'));
app.use('/api/bid-statistics', require('./routes/bid-statistics'));
app.use('/api/bid-agent', require('./routes/bid-settings'));
app.use('/api/chat-sessions', requireAuth, require('./routes/chat-sessions'));
app.use('/api/agent-apps', require('./routes/agent-apps'));
app.use('/api/agent-openclaw-skills', require('./routes/agent-openclaw-skills'));
app.use('/api/expert-agents', requireAuth, require('./routes/expert-agents'));
app.use('/api/digital-employees', require('./routes/digital-employees'));
app.use('/api/digital-human', require('./routes/digital-human'));
app.use('/api/faq', require('./routes/faq'));
app.use('/api/model-configs', require('./routes/model-configs').router);
app.use('/api/trending', require('./routes/trending'));
app.use('/api/knowledge-base', require('./routes/knowledge-base'));
app.use('/api/doc-import', require('./routes/doc-import'));
app.use('/api/wiki', require('./routes/wiki'));
app.use('/api/channel-accounts', require('./routes/channel-accounts'));
app.use('/api/channel-conversations', require('./routes/channel-conversations'));

// 消息渠道 webhook（企微/飞书/ClawBot 微信）
app.use('/api/channels/wecom', express.text({ type: '*/*' }), require('./channels/wecom').router);
app.use('/api/channels/wecom/kf', express.text({ type: '*/*' }), require('./channels/wecom-kf').router);
app.use('/api/channels/feishu', require('./channels/feishu').router);
app.use('/api/channels/clawbot', require('./channels/clawbot').router);

// 微信 iLink Bot 渠道（长轮询模式）
app.use('/api/channels/wechat', require('./channels/wechat-bot').router || (() => {}));

// 爆款视频
app.use('/api/hot-products', require('./routes/hot-products'));
app.use('/api/hot-contents', require('./routes/hot-contents'));
app.use('/api/hot-extract', require('./routes/hot-extract'));
app.use('/api/hot-quick-reply', require('./routes/hot-quick-reply'));
app.use('/api/hot-leads', require('./routes/hot-leads'));
app.use('/api/hot-chanjing', require('./routes/hot-chanjing'));
app.use('/api/social-acquisition', require('./routes/social-acquisition'));
app.use('/api/download', require('./routes/downloads'));

// 多平台发布 (抖音/小红书/微信视频号)
app.use('/api/publish', require('./routes/multi-publish'));

// 文档
app.use('/api/documents', require('./routes/documents'));
app.use('/api/doc-folders', require('./routes/doc-folders'));
app.use('/api/org-charts', require('./routes/org-charts'));

// OpenClaw 集成 — 任务调度 & 技能市场
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/clawhub', require('./routes/clawhub'));
app.use('/api/settings', require('./routes/settings'));

// 动态读取当前激活的模型配置
const { getActiveConfig } = require('./routes/model-configs');
const { loadAgentConfig, execTool } = require('./channels/agent-bridge');
const { setExecutionContext } = require('./shared/execution-context');

// OpenClaw 模型同步 + 通用聊天透传
const { syncModelConfig } = require('./openclaw/model-sync');
const os = require('os');
function getOpenClawGateway() {
  try {
    const raw = require('fs').readFileSync(require('path').join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf8').replace(/^﻿/, '');
    const cfg = JSON.parse(raw);
    return {
      url: process.env.OPENCLAW_CHAT_URL || `http://127.0.0.1:${cfg.gateway?.port || 18622}`,
      token: cfg.gateway?.auth?.token || ''
    };
  } catch { return { url: 'http://127.0.0.1:18622', token: '' }; }
}

// ── SSE 工具 ──
function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function streamReply(ocRes, res) {
  const reader = ocRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', fullText = '';
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
        if (delta) { fullText += delta; sse(res, 'text', { content: delta }); }
      } catch {}
    }
  }
  // 将 OpenClaw 本地下载 URL 替换为 MClaw 代理下载
  return rewriteOpenClawUrls(fullText);
}

// 将本地文件绝对 URL 替换为相对路径（远程用户可下载）
const { rewriteDownloadUrls: rewriteOpenClawUrls } = require('./shared/rewrite-download-urls');

// ── MClaw 聊天辅助 ──
const { getHistory, addToHistory, clearHistory } = require('./shared/chat-history');

function loadSessionHistory(sessionId) {
  const rows = db.prepare('SELECT id, role, content FROM chat_messages WHERE session_id=? ORDER BY created_at ASC LIMIT 50').all(sessionId);
  return rows.map(r => ({ role: r.role, content: r.content }));
}

function saveSessionMessage(sessionId, role, content) {
  const { randomUUID } = require('crypto');
  db.prepare('INSERT INTO chat_messages (id,session_id,role,content) VALUES (?,?,?,?)')
    .run(randomUUID(), sessionId, role, content);
  db.prepare("UPDATE chat_sessions SET updated_at=datetime('now','localtime') WHERE id=?").run(sessionId);
}

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

function matchWiki(content) {
  try {
    const db = require('./db');
    // 中文 n-gram 分词（2-3字词组），同 vector-search.js 模式
    const clean = content.replace(/[^一-龥a-zA-Z0-9]/g, '');
    const grams = new Set();
    for (let i = 0; i < clean.length - 1; i++) {
      grams.add(clean.slice(i, i + 2));
      if (i < clean.length - 2) grams.add(clean.slice(i, i + 3));
    }
    const keywords = [...grams].slice(0, 30);
    if (!keywords.length) return null;

    const allPages = db.prepare("SELECT id, title, summary, plain_content FROM wiki_pages WHERE status='published' ORDER BY updated_at DESC LIMIT 200").all();
    if (!allPages.length) return null;

    // 评分：标题命中 +3，摘要命中 +2，内容命中 +1
    const scored = allPages.map(p => {
      let score = 0;
      const title = (p.title || '').toLowerCase();
      const summary = (p.summary || '').toLowerCase();
      const text = (p.plain_content || '').toLowerCase();
      for (const kw of keywords) {
        const k = kw.toLowerCase();
        if (title.includes(k)) score += 3;
        if (summary.includes(k)) score += 2;
        if (text.includes(k)) score += 1;
      }
      return { ...p, score };
    }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

    if (scored.length > 0) {
      return scored.map(p => ({
        title: p.title,
        summary: p.summary || '',
        snippet: (p.plain_content || '').slice(0, 500)
      }));
    }
    return null;
  } catch(e) { console.log('[matchWiki] error:', e.message); return null; }
}

function makeMessages(config, history, faqMatches, wikiMatches) {
  let systemContent = config.systemPrompt;
  if (faqMatches) {
    systemContent += `\n\n【相关FAQ知识库】\n${faqMatches.map(m => `Q: ${m.question}\nA: ${m.answer}`).join('\n\n')}`;
  }
  if (wikiMatches) {
    systemContent += `\n\n【相关Wiki知识】\n${wikiMatches.map(m => `## ${m.title}\n${m.summary ? '> ' + m.summary + '\n' : ''}${m.snippet}`).join('\n\n---\n\n')}`;
  }
  return [{ role: 'user', content: `[系统指令]\n${systemContent}` }, ...history.slice(-10)];
}

// ── 聊天路由 ──
app.get('/api/chat/history', requireAuth, (req, res) => {
  const history = getHistory(req.query.agent);
  res.json({ code: 200, data: history });
});

app.post('/api/chat/clear', requireAuth, (req, res) => {
  const key = req.body.agent || 'default';
  clearHistory(key);
  res.json({ code: 200 });
});

app.post('/api/chat/send', requireAuth, async (req, res) => {
  const { content, agent, stream: wantStream, messages: clientMessages, session_id } = req.body;
  const isStream = wantStream !== false;

  if (isStream) {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  }

  try {
    // scope 校验：限制普通用户只能使用授权的数字员工
    if (agent) {
      const reqToken = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
      if (reqToken) {
        const { tokens } = require('./routes/auth');
        const user = tokens[reqToken];
        const scope = user?.scope;
        if (scope?.digital_employee_ids && Array.isArray(scope.digital_employee_ids) && scope.digital_employee_ids.length > 0) {
          // 检查 agent 是否为数字员工（在 digital_employees 表中）
          const de = db.prepare('SELECT id FROM digital_employees WHERE id=?').get(agent);
          // 也检查是否通过数字员工代理（loadAgentConfig 内部解析）
          if (de && !scope.digital_employee_ids.includes(agent)) {
            if (isStream) { sse(res, 'error', { message: '您没有权限使用该数字员工' }); sse(res, 'done', {}); res.end(); }
            else res.status(403).json({ code: 403, message: '您没有权限使用该数字员工' });
            return;
          }
        }
      }
    }

    // 判断是否为专家 Agent（走 OpenClaw，调用技能）
    const expertRow = agent ? db.prepare('SELECT name, is_expert FROM agent_apps WHERE id=? AND is_expert=1').get(agent) : null;
    const isExpert = !!expertRow;

    if (agent && !isExpert) {
      // 数字员工路径：OpenClaw + 工具执行循环
      const gw = getOpenClawGateway();
      const history = session_id ? loadSessionHistory(session_id) : getHistory(agent);
      const config = loadAgentConfig(agent);

      console.log(`[chat] OpenClaw(de) agent=${agent} session=${session_id||'memory'} content="${(content||'').slice(0,80)}"`);

      history.push({ role: 'user', content });
      if (session_id) saveSessionMessage(session_id, 'user', content);

      const faqMatches = matchFAQ(content);
      const wikiMatches = matchWiki(content);
      const messages = makeMessages(config, history, faqMatches, wikiMatches);

      const callOpenClaw = async (msgs, tools, stream) => {
        const body = { model: 'openclaw', messages: msgs, stream };
        if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
        if (session_id) body.user = session_id;
        return fetch(`${gw.url}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gw.token}` },
          body: JSON.stringify(body)
        });
      };

      // 工具调用轮（非流式，最多2轮）
      let ocRes = await callOpenClaw(messages, config.tools, false);
      if (!ocRes.ok) {
        const errText = await ocRes.text();
        throw new Error(`OpenClaw ${ocRes.status}: ${errText.slice(0, 300)}`);
      }
      let ocData = await ocRes.json();
      let msg = ocData.choices?.[0]?.message;
      let loop = 0;
      setExecutionContext(agent);
      while (msg?.tool_calls && msg.tool_calls.length > 0 && loop < 2) {
        loop++;
        messages.push({ role: 'assistant', content: null, tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          let args;
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
          console.log(`[tool] ${tc.function.name} args:`, JSON.stringify(args).slice(0, 200));
          const result = await execTool(tc.function.name, args);
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        ocRes = await callOpenClaw(messages, config.tools, false);
        if (!ocRes.ok) {
          const errText = await ocRes.text();
          throw new Error(`OpenClaw ${ocRes.status}: ${errText.slice(0, 300)}`);
        }
        ocData = await ocRes.json();
        msg = ocData.choices?.[0]?.message;
      }

      let reply = msg?.content || '未返回有效回复';
      reply = rewriteOpenClawUrls(reply);

      history.push({ role: 'assistant', content: reply });
      if (session_id) saveSessionMessage(session_id, 'assistant', reply);

      if (isStream) {
        sse(res, 'text', { content: reply });
        sse(res, 'done', {});
        res.end();
      } else {
        res.json({ code: 200, data: { content: reply } });
      }
    } else {
      // OpenClaw 路径：专家 Agent 或通用聊天 → 透传 OpenClaw
      const gw = getOpenClawGateway();
      const historyKey = agent || 'default';
      const history = session_id ? loadSessionHistory(session_id) : getHistory(historyKey);

      console.log(`[chat] → OpenClaw agent=${agent||'none'} expert=${!!isExpert} session=${session_id||'memory'} content="${(content||'').slice(0,80)}"`);

      // 保存用户消息
      history.push({ role: 'user', content });
      if (session_id) saveSessionMessage(session_id, 'user', content);

      // 专家 Agent：将系统提示词嵌入用户消息（OpenClaw 默认 Agent 忽略 role:system）
      let msgs;
      if (isExpert) {
        const config = loadAgentConfig(agent);
        const expertName = expertRow.name || '专家';
        const isNewConversation = history.filter(m => m.role === 'user').length <= 1;
        const header = isNewConversation
          ? `[系统指令]\n你从现在开始扮演以下角色，严格遵循身份设定，不要提及 OpenClaw、MClaw 或任何技术框架：\n\n---\n`
          : `[系统指令]\n继续扮演「${expertName}」，严格遵循身份设定：\n\n---\n`;
        const enriched = `${header}${config.systemPrompt}\n---\n\n[用户消息]\n${content}`;
        msgs = [...history.slice(0, -1), { role: 'user', content: enriched }];
        console.log(`[chat] Expert → OpenClaw name="${expertName}" newConv=${isNewConversation} promptChars=${config.systemPrompt.length}`);
      } else {
        msgs = [...history];
      }

      const body = { model: 'openclaw', messages: msgs, stream: isStream };
      if (session_id) body.user = session_id;
      const ocRes = await fetch(`${gw.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gw.token}` },
        body: JSON.stringify(body)
      });

      if (!ocRes.ok) {
        const errText = await ocRes.text();
        throw new Error(`OpenClaw ${ocRes.status}: ${errText.slice(0, 300)}`);
      }

      let reply;
      if (isStream) {
        reply = await streamReply(ocRes, res);
        sse(res, 'done', {});
        res.end();
      } else {
        const data = await ocRes.json();
        reply = data.choices?.[0]?.message?.content || '';
        reply = rewriteOpenClawUrls(reply);
        res.json({ code: 200, data: { content: reply } });
      }

      // 保存 AI 回复
      history.push({ role: 'assistant', content: reply });
      if (session_id) saveSessionMessage(session_id, 'assistant', reply);
    }
  } catch (err) {
    console.error('[chat] error:', err.message);
    if (isStream) {
      try { sse(res, 'error', { message: err.message }); sse(res, 'done', {}); res.end(); } catch {}
    } else {
      res.json({ code: 200, data: { content: '抱歉，服务暂时不可用。' } });
    }
  }
});

app.get('/api/status', async (req, res) => {
  const multiPublish = require('./services/multi-publish');
  const wsClient = require('./openclaw/ws-client');
  const os = require('os');

  const [publishHealth] = await Promise.all([
    multiPublish.health().catch(() => ({ status: 'unhealthy' })),
  ]);

  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60);

  res.json({
    code: 200,
    data: {
      services: [
        { name: '后端 API 服务', status: 'running', port: 18621, uptime: `${h}h ${m}m` },
        { name: '多平台发布服务', status: publishHealth.status === 'healthy' ? 'running' : 'stopped', port: 18623, uptime: publishHealth.status === 'healthy' ? '-' : '-' },
        { name: '前端 Web 服务', status: 'running', port: 18621, uptime: `${h}h ${m}m` },
        { name: 'AI引擎服务', status: wsClient.isConnected() ? 'running' : 'stopped', port: 18622, uptime: wsClient.isConnected() ? '-' : '-' },
      ],
      system: {
        cpu: `${Math.round(os.loadavg()[0] * 100) / 100}%`,
        memory: `${Math.round((os.totalmem() - os.freemem()) / 1024 / 1024)}MB / ${Math.round(os.totalmem() / 1024 / 1024)}MB`,
      },
    },
  });
});

// SPA fallback：非 API 请求返回 index.html（生产模式）
if (fs.existsSync(frontendDist)) {
  app.get(/^\/(?!api\/|ws\/).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 全局错误处理（防止 multer/async 中间件异常导致进程崩溃）
app.use((err, req, res, next) => {
  if (err) {
    console.error('[server] unhandled error:', err.message || err);
    res.status(err.status || 500).json({ code: err.status || 500, message: err.message || '服务器内部错误' });
  } else { next(); }
});

const PORT = 18621;

// 进程兜底 — 未捕获异常不直接崩，留日志便于排查
process.on('unhandledRejection', (reason) => console.error('[process] unhandledRejection:', reason));
process.on('uncaughtException', (err) => console.error('[process] uncaughtException:', err));

const server = http.createServer(app);

// 启动 WebSocket 服务器（Events 前端推送）
try { require('./channels/ws-server').startWSServer(server); } catch (e) { console.log('[server] WS 启动失败:', e.message); }

server.listen(PORT, () => {
  console.log(`MClaw 后端运行在 http://localhost:${PORT}`);
  // 同步模型配置到 OpenClaw
  try { syncModelConfig(getActiveConfig()); } catch (e) { console.log('[server] model-sync 失败:', e.message); }
  // 启动 OpenClaw 网关（如果未运行）
  try {
    const { execSync } = require('child_process');
    const net = require('net');
    const sock = new net.Socket();
    sock.setTimeout(500);
    sock.connect(18622, '127.0.0.1', () => { sock.destroy(); });
    sock.on('error', () => {
      // 端口未监听，启动网关（直接 node 拉起，脱离终端进程组）
      // 动态获取 npm 全局模块路径（兼容不同 npm prefix 配置）
      let gatewayEntry = null;
      try {
        const npmRoot = require('child_process').execSync('npm root -g', { encoding: 'utf8', timeout: 5000 }).trim();
        const candidate = path.join(npmRoot, 'openclaw', 'dist', 'index.js');
        if (fs.existsSync(candidate)) gatewayEntry = candidate;
      } catch {}
      // 兼容旧路径（AppData\Roaming\npm）
      if (!gatewayEntry) {
        const legacyPath = path.join(require('os').homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', 'openclaw', 'dist', 'index.js');
        if (fs.existsSync(legacyPath)) gatewayEntry = legacyPath;
      }
      if (gatewayEntry) {
        const { spawn } = require('child_process');
        spawn(process.execPath, [gatewayEntry, 'gateway', '--port', '18622'], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        }).unref();
        console.log('[server] OpenClaw 网关已启动');
      } else {
        console.log('[server] 未找到 OpenClaw 网关入口文件，跳过启动');
      }
    });
    sock.on('timeout', () => sock.destroy());
  } catch {}

  // 连接 OpenClaw Gateway
  setTimeout(() => {
    try { require('./openclaw/ws-client').connect(); } catch (e) { console.log('[server] OpenClaw WS 连接失败:', e.message); }
  }, 3000);
  // 启动招投标定时采集（多引擎，间隔来自 bid-route-intervals.json）
  try {
    const fs = require('fs');
    const path = require('path');
    const intervalFile = path.join(__dirname, 'data', 'bid-route-intervals.json');
    const intervals = JSON.parse(fs.readFileSync(intervalFile, 'utf-8'));
    const { startScheduler: startCrawl4ai } = require('./services/crawl4ai-collector');
    const { startScheduler: startScrapling } = require('./services/scrapling-collector');
    const { startScheduler: startWoyaobid } = require('./services/woyaobid-crawler');
    startCrawl4ai((intervals.crawl4ai || 12) * 60 * 60 * 1000);
    startScrapling((intervals.scrapling || 12) * 60 * 60 * 1000);
    startWoyaobid((intervals.woyaobid || 2) * 60 * 60 * 1000);
    console.log(`[server] 招投标定时采集已启动 (crawl4ai:${intervals.crawl4ai||12}h scrapling:${intervals.scrapling||12}h woyaobid:${intervals.woyaobid||2}h)`);
  } catch (e) { console.log('[server] 招投标定时采集启动失败:', e.message); }
  // 启动微信机器人长轮询
  try { const { startAllBots, ensureWechatAccount } = require('./channels/wechat-bot'); ensureWechatAccount(); startAllBots(); } catch (e) { console.log('[server] 微信 Bot 启动失败:', e.message); }
});
