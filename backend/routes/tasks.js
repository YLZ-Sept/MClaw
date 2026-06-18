const express = require('express');
const router = express.Router();
const os = require('os');
const path = require('path');
const fs = require('fs');
const wsClient = require('../openclaw/ws-client');
const { addToHistory } = require('../shared/chat-history');
const { parseSchedule } = require('../shared/schedule');
const { setExecutionContext } = require('../shared/execution-context');
const db = require('../db');
const crypto = require('crypto');

function openclaw(method, params) {
  return wsClient.request(method, params).catch(err => {
    throw { status: 503, message: 'OpenClaw 服务不可用: ' + err.message };
  });
}

function getOpenClawGateway() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf8').replace(/^﻿/, ''));
    return {
      url: `http://127.0.0.1:${cfg.gateway?.port || 18622}`,
      token: cfg.gateway?.auth?.token || ''
    };
  } catch { return { url: 'http://127.0.0.1:18622', token: '' }; }
}

// GET /api/tasks — list cron jobs
router.get('/', async (req, res) => {
  try {
    const { enabled, query, limit } = req.query;
    const result = await openclaw('cron.list', {
      includeDisabled: true,
      limit: parseInt(limit) || 50,
      ...(query ? { query } : {}),
      ...(enabled === 'true' || enabled === 'false' ? { enabled: enabled === 'true' ? 'enabled' : 'disabled' } : { enabled: 'all' })
    });
    res.json({ code: 200, data: result.jobs || [], total: result.total || 0 });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// POST /api/tasks — create cron job
router.post('/', async (req, res) => {
  try {
    const { name, description, schedule, agentId, message, enabled, sessionTarget } = req.body;
    if (!name || !schedule || !message) {
      return res.status(400).json({ code: 400, message: 'name, schedule, message 为必填项' });
    }
    const params = {
      name,
      description: description || '',
      enabled: enabled !== false,
      schedule: parseSchedule(schedule),
      sessionTarget: sessionTarget || 'isolated',
      wakeMode: 'now',
      payload: { kind: 'agentTurn', message }
    };
    if (agentId) params.agentId = agentId;
    const result = await openclaw('cron.add', params);
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// PUT /api/tasks/:id — update cron job
router.put('/:id', async (req, res) => {
  try {
    const { name, description, schedule, agentId, message, enabled, sessionTarget } = req.body;
    const params = { id: req.params.id };
    if (name !== undefined) params.name = name;
    if (description !== undefined) params.description = description;
    if (schedule !== undefined) params.schedule = parseSchedule(schedule);
    if (agentId !== undefined) params.agentId = agentId;
    if (message !== undefined) params.payload = { kind: 'agentTurn', message };
    if (enabled !== undefined) params.enabled = enabled;
    if (sessionTarget !== undefined) params.sessionTarget = sessionTarget;
    const result = await openclaw('cron.add', params);
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await openclaw('cron.remove', { id: req.params.id });
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// POST /api/tasks/:id/run — 立即执行并返回结果
router.post('/:id/run', async (req, res) => {
  try {
    // 1. 获取任务详情
    const listResult = await openclaw('cron.list', { includeDisabled: true, limit: 100 });
    const job = (listResult.jobs || []).find(j => j.id === req.params.id);
    if (!job) return res.status(404).json({ code: 404, message: '任务不存在' });

    const agentId = job.agentId;
    const message = job.payload?.message || '';
    if (!message) return res.status(400).json({ code: 400, message: '任务无执行内容' });

    // 2. 根据是否有 agentId 选择执行路径
    let content;
    if (agentId) {
      // MClaw 路径：走 agent-bridge（工具执行+润色）
      const { loadAgentConfig, callLLM, execTool, polishReply } = require('../channels/agent-bridge');
      const config = loadAgentConfig(agentId);
      const messages = [
        { role: 'user', content: `[系统指令]\n${config.systemPrompt}` },
        { role: 'user', content: message }
      ];

      let dsRes = await callLLM(messages, config.tools, false);
      let dsData = await dsRes.json();
      let msg = dsData.choices?.[0]?.message;
      let loop = 0;
      setExecutionContext(agentId);
      while (msg?.tool_calls && msg.tool_calls.length > 0 && loop < 2) {
        loop++;
        messages.push({ role: 'assistant', content: null, tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          let args;
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
          console.log(`[task] tool: ${tc.function.name}`);
          const result = await execTool(tc.function.name, args);
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        dsRes = await callLLM(messages, config.tools, false);
        dsData = await dsRes.json();
        msg = dsData.choices?.[0]?.message;
      }
      content = msg?.content || '';

      try {
        const polished = await polishReply(content);
        if (polished && polished.length > 10) content = polished;
      } catch {}
    } else {
      // OpenClaw 路径：透传通用 Agent
      const gw = getOpenClawGateway();
      const chatBody = { model: 'openclaw', messages: [{ role: 'user', content: message }], stream: false };
      const chatRes = await fetch(`${gw.url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gw.token}` },
        body: JSON.stringify(chatBody)
      });
      if (!chatRes.ok) {
        const errText = await chatRes.text();
        throw new Error(`OpenClaw ${chatRes.status}: ${errText.slice(0, 300)}`);
      }
      const chatData = await chatRes.json();
      content = chatData.choices?.[0]?.message?.content || '';
    }

    // 保存执行结果到聊天记录（内存 + DB 双写，重启不丢失）
    if (agentId) {
      addToHistory(agentId, 'user', message);
      addToHistory(agentId, 'assistant', content);

      // 持久化到 DB：按任务名创建会话，同名任务复用，不同任务各自独立
      const taskName = job.name || agentId;
      const sessionName = `任务执行记录 - ${taskName}`;
      let session = db.prepare('SELECT id FROM chat_sessions WHERE name=? AND agent_id=? LIMIT 1').get(sessionName, agentId);
      if (!session) {
        const sessionId = crypto.randomUUID();
        db.prepare("INSERT INTO chat_sessions (id,name,agent_id,created_at,updated_at) VALUES (?,?,?,datetime('now','localtime'),datetime('now','localtime'))").run(sessionId, sessionName, agentId);
        session = { id: sessionId };
      }
      db.prepare('INSERT INTO chat_messages (id,session_id,role,content,created_at) VALUES (?,?,?,?,datetime(\'now\',\'localtime\'))').run(crypto.randomUUID(), session.id, 'user', message);
      db.prepare('INSERT INTO chat_messages (id,session_id,role,content,created_at) VALUES (?,?,?,?,datetime(\'now\',\'localtime\'))').run(crypto.randomUUID(), session.id, 'assistant', content);
      db.prepare("UPDATE chat_sessions SET updated_at=datetime('now','localtime') WHERE id=?").run(session.id);
    }

    res.json({ code: 200, data: { ok: true, content } });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

module.exports = router;
