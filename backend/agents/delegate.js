// Multi-Agent Delegation Engine
// 参考 mateclaw DelegateAgentTool — 串行/并行子 Agent 委派
const { exec } = require('./executor');
const { loadAgentConfig } = require('../channels/agent-bridge');

const MAX_DEPTH = 3; // 最大委派深度，防止无限递归
const DENIED_CHILD_TOOLS = new Set([
  'delegate_to_agent', 'delegate_parallel', 'delegate_async',
  'tool_remember', 'tool_recall' // 子 Agent 不操作父记忆
]);

/**
 * 加载子 Agent 配置（复用 agent-bridge 的 loadAgentConfig）
 */
function loadChildConfig(agentId) {
  if (!agentId) return null;
  try {
    const config = loadAgentConfig(agentId);
    if (!config || !config.systemPrompt) return null;
    // 过滤被禁用的工具
    const tools = (config.tools || []).filter(t => {
      const name = typeof t === 'string' ? t : t.name || t.function?.name || '';
      return !DENIED_CHILD_TOOLS.has(name);
    });
    return { id: agentId, systemPrompt: config.systemPrompt, tools };
  } catch { return null; }
}

/**
 * 调用 OpenClaw 获取子 Agent 回复（简化版，非流式）
 * @param {Array} messages — 消息列表
 * @param {Array} tools — 可用工具
 * @param {Object} gw — { url, token }
 */
async function callLLM(messages, tools, gw) {
  const body = { model: 'openclaw', messages, stream: false };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }

  const res = await fetch(`${gw.url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gw.token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Child LLM error ${res.status}: ${errText.slice(0, 200)}`);
  }

  return res.json();
}

/**
 * 获取 OpenClaw 网关配置
 */
function getGateway() {
  try {
    const path = require('path');
    const os = require('os');
    const raw = require('fs').readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf8').replace(/^﻿/, '');
    const cfg = JSON.parse(raw);
    return {
      url: process.env.OPENCLAW_CHAT_URL || `http://127.0.0.1:${cfg.gateway?.port || 18622}`,
      token: cfg.gateway?.auth?.token || ''
    };
  } catch { return { url: 'http://127.0.0.1:18622', token: '' }; }
}

/**
 * 串行委派：单个子 Agent 执行任务
 * @param {string} agentId — 子 Agent ID
 * @param {string} task — 任务描述
 * @param {Object} options — { depth, parentContext }
 */
async function delegateToAgent(agentId, task, options = {}) {
  const depth = (options.depth || 0) + 1;
  if (depth > MAX_DEPTH) {
    return { error: `委派深度已达上限 (${MAX_DEPTH})，拒绝递归委派` };
  }

  const config = loadChildConfig(agentId);
  if (!config) return { error: `子 Agent ${agentId} 不存在或未配置工具` };

  const gw = getGateway();
  const messages = [
    { role: 'user', content: `[系统指令]\n${config.systemPrompt}\n\n---\n\n[委派任务]\n${task}` }
  ];

  let childReply = '';
  let loop = 0;
  const MAX_CHILD_LOOPS = 4; // 子 Agent 工具调用轮数限制

  try {
    let data = await callLLM(messages, config.tools, gw);
    let msg = data.choices?.[0]?.message;

    while (msg?.tool_calls && msg.tool_calls.length > 0 && loop < MAX_CHILD_LOOPS) {
      loop++;
      messages.push({ role: 'assistant', content: null, tool_calls: msg.tool_calls });

      for (const tc of msg.tool_calls) {
        let args;
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
        const name = tc.function.name;
        if (DENIED_CHILD_TOOLS.has(name)) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: `子 Agent 无权使用 ${name}` }) });
          continue;
        }
        try {
          const result = await exec(name, args, { agentId });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        } catch (e) {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: e.message }) });
        }
      }

      data = await callLLM(messages, config.tools, gw);
      msg = data.choices?.[0]?.message;
    }

    childReply = msg?.content || '子 Agent 未返回有效回复';

  } catch (e) {
    return { error: `子 Agent 执行失败: ${e.message}`, partial_reply: childReply || '' };
  }

  return {
    success: true,
    agent_id: agentId,
    agent_name: config.name,
    reply: childReply,
    tool_loops: loop,
    depth
  };
}

/**
 * 并行委派：多个子 Agent 并发执行
 * @param {Array} tasks — [{ agent_id, task }]
 * @param {Object} options
 */
async function delegateParallel(tasks, options = {}) {
  if (!tasks || !tasks.length) return { error: '无委派任务' };
  if (tasks.length > 8) return { error: `并行委派最多 8 个，收到 ${tasks.length}` };

  const results = await Promise.all(
    tasks.map((t, i) =>
      delegateToAgent(t.agent_id, t.task, { ...options, taskIndex: i })
        .catch(e => ({ error: `子 Agent ${i} 崩溃: ${e.message}` }))
    )
  );

  return {
    success: true,
    total: tasks.length,
    completed: results.filter(r => r && !r.error).length,
    failed: results.filter(r => r && r.error).length,
    results: results.map((r, i) => ({
      index: i,
      agent_id: tasks[i].agent_id,
      success: !r.error,
      reply: r.reply || r.error || ''
    }))
  };
}

module.exports = {
  delegateToAgent,
  delegateParallel,
  loadChildConfig,
  MAX_DEPTH,
  DENIED_CHILD_TOOLS
};
