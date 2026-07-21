// 渠道管理器 — 统一处理多渠道消息收发、会话管理、Agent 路由
const { randomUUID } = require('crypto');
const db = require('../db');
const { loadAgentConfig, callLLM, execTool, polishReply, scoreAgentForMessage } = require('./agent-bridge');
const { setExecutionContext } = require('../shared/execution-context');
const { broadcast } = require('./event-bus');
const { rewriteDownloadUrls } = require('../shared/rewrite-download-urls');

// ─── 内部缓存：WebSocket 连接 ───
const channelSockets = {}; // { account_id: ws }

function registerSocket(accountId, ws) {
  channelSockets[accountId] = ws;
  console.log(`[channels] 渠道上线: ${accountId}`);
  broadcast({ type: 'account_status', account_id: accountId, online: true });
}
function unregisterSocket(accountId) {
  delete channelSockets[accountId];
  console.log(`[channels] 渠道离线: ${accountId}`);
  broadcast({ type: 'account_status', account_id: accountId, online: false });
}

function kickSocket(accountId) {
  const ws = channelSockets[accountId];
  if (ws) {
    ws.send(JSON.stringify({ type: 'disabled', message: '账号已被停用' }));
    ws.close();
  }
}

// ─── 会话管理 ───

function getOrCreateConversation({ account_id, platform, contact_name, agent_id, reply_mode, content, contact_external_id }) {
  // 账号不存在则跳过（可能已被删除）
  const account = db.prepare('SELECT * FROM channel_accounts WHERE id=?').get(account_id);
  if (!account) {
    console.warn(`[channels] 账号 ${account_id} 不存在，忽略消息`);
    return null;
  }

  // 先用平台侧稳定 ID 匹配，避免重命名联系人后重复创建会话
  let existing = null;
  if (contact_external_id) {
    existing = db.prepare(
      'SELECT * FROM channel_conversations WHERE account_id=? AND contact_external_id=? AND status=?'
    ).get(account_id, contact_external_id, 'active');
  }
  // 降级：用 contact_name 匹配（兼容旧数据和无 external ID 的渠道）
  if (!existing) {
    existing = db.prepare(
      'SELECT * FROM channel_conversations WHERE account_id=? AND contact_name=? AND status=?'
    ).get(account_id, contact_name, 'active');
  }

  if (existing) {
    // 如果外部 ID 变化（如之前没有，现在有了），补上
    if (contact_external_id && (!existing.contact_external_id || existing.contact_external_id !== contact_external_id)) {
      db.prepare('UPDATE channel_conversations SET contact_external_id=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(contact_external_id, existing.id);
    } else {
      db.prepare('UPDATE channel_conversations SET updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(existing.id);
    }
    return existing;
  }
  const accountAgentIds = (() => { try { const a = JSON.parse(account.agent_id); return Array.isArray(a) ? a : [account.agent_id] } catch { return account.agent_id ? [account.agent_id] : [] } })();

  let effectiveAgentId;
  if (agent_id) {
    effectiveAgentId = agent_id;
  } else if (accountAgentIds.length <= 1) {
    effectiveAgentId = accountAgentIds[0] || 'sales-agent';
  } else if (content) {
    let bestAgent = accountAgentIds[0];
    let bestScore = 0;
    for (const aid of accountAgentIds) {
      const s = scoreAgentForMessage(aid, content);
      if (s > bestScore) { bestScore = s; bestAgent = aid; }
    }
    effectiveAgentId = bestAgent;
    console.log(`[channels] 智能体自动分配: ${effectiveAgentId} (分数: ${bestScore})`);
  } else {
    effectiveAgentId = accountAgentIds[0] || 'sales-agent';
  }

  const effectiveMode = reply_mode || account.default_reply_mode || 'manual';

  const id = randomUUID();
  db.prepare(`INSERT INTO channel_conversations (id,account_id,platform,contact_name,contact_external_id,agent_id,reply_mode)
    VALUES (?,?,?,?,?,?,?)`).run(id, account_id, platform, contact_name, contact_external_id || '', effectiveAgentId, effectiveMode);
  const conv = db.prepare('SELECT * FROM channel_conversations WHERE id=?').get(id);
  broadcast({ type: 'new_conversation', conversation: conv });
  return conv;
}

function saveMessage({ conversation_id, direction, content, reply_mode, ai_suggestion, status, raw_data }) {
  const id = randomUUID();
  db.prepare(`INSERT INTO channel_messages (id,conversation_id,direction,content,reply_mode,ai_suggestion,status,raw_data)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    id, conversation_id, direction, content, reply_mode || 'manual', ai_suggestion || null, status || 'sent', raw_data || null
  );
  // 更新会话摘要
  db.prepare(`UPDATE channel_conversations SET
    last_message=?, last_message_at=datetime('now','localtime'),
    unread_count=CASE WHEN ?='incoming' THEN unread_count+1 ELSE unread_count END,
    updated_at=datetime('now','localtime')
    WHERE id=?`).run(content.slice(0, 100), direction, conversation_id);
  const msg = db.prepare('SELECT * FROM channel_messages WHERE id=?').get(id);
  broadcast({ type: 'new_message', message: msg, conversation_id: conversation_id });
  return msg;
}

function setConversationMode(conversationId, mode) {
  db.prepare('UPDATE channel_conversations SET reply_mode=? WHERE id=?').run(mode, conversationId);
  return { id: conversationId, reply_mode: mode };
}

function setConversationAgent(conversationId, agentId) {
  const conv = db.prepare('SELECT * FROM channel_conversations WHERE id=?').get(conversationId);
  if (!conv) throw new Error('会话不存在');
  const config = loadAgentConfig(agentId);
  if (!config) throw new Error('Agent 不存在');
  db.prepare('UPDATE channel_conversations SET agent_id=? WHERE id=?').run(agentId, conversationId);
  broadcast({ type: 'agent_changed', conversation_id: conversationId, agent_id: agentId });
  return { id: conversationId, agent_id: agentId };
}

// ─── Agent 回复生成 ───

async function generateAIReply(conversationId, platform, agentId) {
  const conv = db.prepare('SELECT * FROM channel_conversations WHERE id=?').get(conversationId);
  if (!conv) return null;

  // 加载 Agent 配置
  const config = loadAgentConfig(agentId || 'sales-agent');

  // 取最近 20 条消息作为上下文
  const msgs = db.prepare(
    'SELECT * FROM channel_messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 20'
  ).all(conversationId).reverse();

  const basePrompt = config.systemPrompt + `\n\n## 当前场景\n你正在${platform}平台上与「${conv.contact_name}」对话。请用口语化的中文回复，简洁自然。`;

  const messages = [{ role: 'system', content: basePrompt }];
  for (const m of msgs) {
    const role = m.direction === 'incoming' ? 'user' : 'assistant';
    messages.push({ role, content: m.content });
  }

  try {
    const dsRes = await callLLM(messages, config.tools, false);
    const dsData = await dsRes.json();
    const msg = dsData.choices?.[0]?.message;
    let reply = msg?.content || '';

    // 如果有工具调用（最多1轮）
    setExecutionContext(agentId);
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      messages.push({ role: 'assistant', content: null, tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        let args;
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
        const result = await execTool(tc.function.name, args);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      const dsRes2 = await callLLM(messages, config.tools, false);
      const dsData2 = await dsRes2.json();
      reply = dsData2.choices?.[0]?.message?.content || reply;
    }

    // 润色（polishReply 内部已做 URL 重写）
    try {
      const polished = await polishReply(reply);
      if (polished && polished.length > 10) reply = polished;
    } catch {}

    // 兜底 URL 重写：确保远程用户可下载生成的文件
    reply = rewriteDownloadUrls(reply);
    return reply;
  } catch (err) {
    console.error('[channels] AI reply error:', err.message);
    return null;
  }
}

// ─── 从 raw_data 提取平台侧稳定用户 ID ───
function extractExternalId(platform, raw_data, extra) {
  if (!raw_data) return null;
  switch (platform) {
    case 'wechat':
      return raw_data.from_user_id || null;
    case 'wecom':
      return raw_data.FromUserName || null;
    case 'wecom_kf':
      return raw_data.FromUserName || null;
    case 'feishu':
      return extra?.sender_id || raw_data.sender?.sender_id?.open_id || null;
    default:
      return raw_data.from_user_id || raw_data.user_id || raw_data.sender_id || null;
  }
}

// ─── 处理 incoming 消息的完整流程 ───
// 返回值：{ conversation, message, aiSuggestion }
async function handleIncoming({ account_id, platform, contact_name, contact_avatar, content, raw_data, extra }) {
  // 打字指示器：通知渠道"正在输入..."
  let typingAdapter = null;
  try {
    const { channelManager } = require('./manager');
    typingAdapter = channelManager.get(account_id);
    if (typingAdapter) typingAdapter.sendTyping(extra?.targetId || contact_external_id || '');
  } catch {}

  const contact_external_id = extractExternalId(platform, raw_data, extra);

  // 1. 获取或创建会话（账号不存在则跳过）
  const conv = getOrCreateConversation({ account_id, platform, contact_name, content, contact_external_id });
  if (!conv) return { conversation: null, message: null, aiSuggestion: null };

  // 2. 保存消息
  const msg = saveMessage({
    conversation_id: conv.id,
    direction: 'incoming',
    content,
    reply_mode: conv.reply_mode,
    raw_data: raw_data ? JSON.stringify(raw_data) : null
  });

  // 3. 根据回复模式处理
  let aiSuggestion = null;
  if (conv.reply_mode === 'auto') {
    // AI 托管：自动生成并发送回复
    aiSuggestion = await generateAIReply(conv.id, platform, conv.agent_id);
    if (aiSuggestion) {
      // 发送 AI 回复
      await sendReply(conv.id, aiSuggestion, 'auto');
    }
  } else if (conv.reply_mode === 'assisted') {
    // 协同模式：生成建议，不自动发送
    aiSuggestion = await generateAIReply(conv.id, platform, conv.agent_id);
  }
  // manual 模式：什么也不做，等人手动回复

  return { conversation: conv, message: msg, aiSuggestion };
}

// 企微只支持纯文本，去掉 Markdown 语法
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')       // **bold**
    .replace(/\*(.+?)\*/g, '$1')           // *italic*
    .replace(/__(.+?)__/g, '$1')           // __bold__
    .replace(/_(.+?)_/g, '$1')             // _italic_
    .replace(/~~(.+?)~~/g, '$1')           // ~~strikethrough~~
    .replace(/`{1,3}(.+?)`{1,3}/g, '$1')   // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url)
    .replace(/^#{1,6}\s+/gm, '')           // # headers
    .replace(/^>\s+/gm, '')                // > blockquote
    .replace(/^-{3,}/gm, '')               // --- horizontal rules
    .replace(/^\s*[-*+]\s+/gm, '')         // - list items
    .replace(/\n{3,}/g, '\n\n')            // collapse excessive newlines
    .trim();
}

// ─── 发送回复 ───
async function sendReply(conversationId, content, replyMode) {
  const conv = db.prepare('SELECT * FROM channel_conversations WHERE id=?').get(conversationId);
  if (!conv) throw new Error('会话不存在');

  // 保存 outgoing 消息
  const msg = saveMessage({
    conversation_id: conv.id,
    direction: 'outgoing',
    content,
    reply_mode: replyMode || conv.reply_mode,
    status: 'sent'
  });

  // 企微/飞书：通过官方 API 发送
  if (conv.platform === 'wecom') {
    try {
      const account = db.prepare('SELECT * FROM channel_accounts WHERE id=?').get(conv.account_id);
      // 企微 API touser 必须是成员 UserID，优先用 contact_external_id（不会被重命名覆盖）
      const wecomUserId = conv.contact_external_id || conv.contact_name;
      if (account) await require('./wecom').sendMessage(account, wecomUserId, stripMarkdown(content));
    } catch (e) { console.error('[channels] 企微发送失败:', e.message); }
  } else if (conv.platform === 'wecom_kf') {
    try {
      const account = db.prepare('SELECT * FROM channel_accounts WHERE id=?').get(conv.account_id);
      const kfUserId = conv.contact_external_id || conv.contact_name;
      if (account) await require('./wecom-kf').sendMessage(account, kfUserId, stripMarkdown(content));
    } catch (e) { console.error('[channels] 企微客服发送失败:', e.message); }
  } else if (conv.platform === 'feishu') {
    try {
      const account = db.prepare('SELECT * FROM channel_accounts WHERE id=?').get(conv.account_id);
      // 飞书 receive_id 同样优先用 contact_external_id
      const feishuUserId = conv.contact_external_id || conv.contact_name;
      if (account) await require('./feishu').sendMessage(account, feishuUserId, content);
    } catch (e) { console.error('[channels] 飞书发送失败:', e.message); }
  }

  // 微信：通过 iLink Bot API 直接发送
  if (conv.platform === 'wechat') {
    try {
      const account = db.prepare('SELECT * FROM channel_accounts WHERE id=?').get(conv.account_id);
      if (account) await require('./wechat-bot').sendMessage(account, conv.contact_name, content);
    } catch (e) { console.error('[channels] 微信发送失败:', e.message); }
  }

  // 标记会话已读
  db.prepare('UPDATE channel_conversations SET unread_count=0 WHERE id=?').run(conv.id);

  // 清除打字指示器
  if (typingAdapter) try { typingAdapter.cancelTyping(extra?.targetId || contact_external_id || ''); } catch {}

  return msg;
}

module.exports = {
  registerSocket, unregisterSocket, kickSocket,
  getOrCreateConversation, saveMessage, setConversationMode, setConversationAgent,
  handleIncoming, sendReply, generateAIReply
};
