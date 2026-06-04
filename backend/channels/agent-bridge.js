// Agent Bridge — shared LLM/Agent/Tool utilities for channel system
const db = require('../db');
const { getActiveConfig } = require('../routes/model-configs');
const { exec: execTool } = require('../agents/executor');

// Built-in agent definitions (keep in sync with server.js)
const agentConfigs = {
  'internal-agent': require('../agents/internal'),
  'support-agent': require('../agents/support'),
  'sales-agent': require('../agents/sales'),
  'default': require('../agents/internal')
};

function loadAgentConfig(agent) {
  let base;
  let dbRow = null;
  let persona = null; // 数字人身份信息

  // 解析数字人：查 digital_employees 表，取其底层 agent
  let resolvedAgent = agent;
  try {
    const de = db.prepare('SELECT * FROM digital_employees WHERE id=? AND status=?').get(agent, 'active');
    if (de) {
      persona = { name: de.name, role: de.role, emoji: de.avatar_emoji, avatar: de.avatar_url };
      // 优先用 agent_id，其次解析 agent_ids
      if (de.agent_id && de.agent_id.trim()) {
        resolvedAgent = de.agent_id.trim();
      } else if (de.agent_ids && de.agent_ids.trim()) {
        try {
          const ids = JSON.parse(de.agent_ids);
          resolvedAgent = Array.isArray(ids) ? ids[0] : de.agent_ids;
        } catch {
          resolvedAgent = de.agent_ids.split(',')[0].trim();
        }
      }
    }
  } catch {}

  if (agentConfigs[resolvedAgent]) {
    base = agentConfigs[resolvedAgent];
  } else {
    try {
      dbRow = db.prepare('SELECT * FROM agent_apps WHERE id=? AND status=?').get(resolvedAgent, 'active');
      if (dbRow) {
        if (dbRow.base_agent && agentConfigs[dbRow.base_agent]) {
          const b = agentConfigs[dbRow.base_agent];
          base = { systemPrompt: dbRow.system_prompt || b.systemPrompt, tools: [...b.tools] };
        } else {
          base = { systemPrompt: dbRow.system_prompt || '你是 MClaw 智能助手，请用中文简洁回复。', tools: [] };
        }
      }
    } catch {}
  }
  if (!base) base = agentConfigs['default'];

  // 数字人身份注入 system prompt
  if (persona) {
    const personaPrompt = `你现在的身份是「${persona.name}」${persona.role ? `，职位：${persona.role}` : ''}。请以此身份与用户交流。`;
    base = { ...base, systemPrompt: personaPrompt + '\n\n' + base.systemPrompt };
  }

  let extraPrompt = '';

  // 附加技能
  try {
    const skills = db.prepare('SELECT * FROM agent_skills WHERE (agent_id=? OR agent_id IS NULL OR agent_id=\'\') AND status=\'active\'').all(agent);
    if (skills.length) {
      const prompts = skills.filter(s => s.prompt_snippet).map(s => `## ${s.name}\n${s.prompt_snippet}`).join('\n\n');
      if (prompts) extraPrompt += '\n\n---\n\n# 附加技能\n' + prompts;
    }
  } catch {}

  // 绑定的知识库文档
  try {
    const articleIds = dbRow?.kb_article_ids;
    if (articleIds) {
      const ids = articleIds.split(',').filter(Boolean);
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        const articles = db.prepare(
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

async function callLLM(messages, tools, stream, forceTool) {
  const config = getActiveConfig();
  if (!config) throw new Error('没有可用的模型配置');
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

module.exports = { loadAgentConfig, callLLM, execTool, polishReply };
