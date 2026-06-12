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
  // 未指定 agent 时返回中立默认配置，不绑定任何特定 Agent 身份
  if (!agent) {
    return {
      systemPrompt: '你是 MClaw 平台的通用智能助手。你没有特定身份标签（如"小内""小销"等），你就是一个普通的 AI 助手。请用中文简洁回复，自称"我"。不要说自己是任何公司的客服或特定产品。',
      tools: agentConfigs['default'].tools
    };
  }

  let persona = null;
  let agentIds = [agent]; // 最终要合并的 agent ID 列表

  // 解析数字人：查 digital_employees 表
  try {
    const de = db.prepare('SELECT * FROM digital_employees WHERE id=? AND status=?').get(agent, 'active');
    if (de) {
      persona = { name: de.name, role: de.role, emoji: de.avatar_emoji, avatar: de.avatar_url };
      // 收集所有绑定的 agent ID（仅从 agent_ids 字段读取）
      const ids = [];
      if (de.agent_ids && de.agent_ids.trim()) {
        const raw = de.agent_ids.trim();
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) ids.push(...parsed.filter(Boolean));
          else ids.push(raw);
        } catch {
          ids.push(...raw.split(',').map(s => s.trim()).filter(Boolean));
        }
      }
      if (ids.length > 0) {
        agentIds = [...new Set(ids)];
      } else {
        console.warn('[agent-bridge] 数字员工 %s（%s）的 agent_ids 为空，将回退到默认 Agent', de.name, agent);
      }
    }
  } catch {}

  // 解析每个 agent ID，收集 base config + dbRow
  const bases = [];       // { systemPrompt, tools, agentId }
  const allDbRows = [];   // agent_apps 的 DB 行，用于后续知识库加载
  const seenToolNames = new Set();

  for (const agentId of agentIds) {
    let base = null;
    let dbRow = null;

    if (agentConfigs[agentId]) {
      base = { ...agentConfigs[agentId], agentId };
    } else {
      try {
        dbRow = db.prepare('SELECT * FROM agent_apps WHERE id=? AND status=?').get(agentId, 'active');
        if (dbRow) {
          allDbRows.push(dbRow);
          if (dbRow.base_agent && agentConfigs[dbRow.base_agent]) {
            const b = agentConfigs[dbRow.base_agent];
            base = { systemPrompt: dbRow.system_prompt || b.systemPrompt, tools: [...b.tools], agentId };
          } else {
            if (!dbRow.base_agent) {
              console.warn('[agent-bridge] agent_app %s 未指定 base_agent，tools 将为空', agentId);
            } else {
              console.warn('[agent-bridge] agent_app %s 的 base_agent=%s 未匹配任何内置 Agent', agentId, dbRow.base_agent);
            }
            base = { systemPrompt: dbRow.system_prompt || '你是 MClaw 智能助手，请用中文简洁回复。', tools: [], agentId };
          }
        } else {
          console.warn('[agent-bridge] Agent ID %s 未匹配内置 Agent 或 agent_apps（可能已删除或非 active）', agentId);
        }
      } catch {}
    }

    if (base) bases.push(base);
  }

  if (bases.length === 0) {
    console.warn('[agent-bridge] 所有 Agent 解析失败，回退到默认 Agent。原始 agent 参数: %s', agent);
    bases.push({ ...agentConfigs['default'], agentId: 'default' });
  }

  // 合并 tools：去重
  const mergedTools = [];
  for (const b of bases) {
    for (const tool of (b.tools || [])) {
      const name = tool.function?.name;
      if (name && !seenToolNames.has(name)) {
        seenToolNames.add(name);
        mergedTools.push(tool);
      }
    }
  }

  // 合并 system prompt（多 Agent 时剔除各子的独立问候/身份段落）
  let systemPrompt;
  if (bases.length === 1) {
    systemPrompt = bases[0].systemPrompt;
  } else {
    // 剔除各子 Agent 的「问候与身份」段落，避免与统一问候冲突
    const stripGreeting = (p) => p.replace(/## 问候与身份[\s\S]*?(?=## |$)/, '').trim();
    systemPrompt = bases.map((b, i) => {
      const label = b.agentId && agentConfigs[b.agentId] ? `## 智能体能力 ${i + 1}\n` : `## 智能体能力 ${i + 1}（自定义）\n`;
      return label + stripGreeting(b.systemPrompt);
    }).join('\n\n---\n\n');
  }

  // 数字人身份注入
  if (persona) {
    const capNote = bases.length > 1 ? '你集成了多个智能体的能力。' : '';
    const personaPrompt = `你现在的身份是「${persona.name}」${persona.role ? `，职位：${persona.role}` : ''}。${capNote}请以此身份与用户交流。`;
    systemPrompt = personaPrompt + '\n\n' + systemPrompt;

    // 多智能体合并时，注入统一的问候语指令
    if (bases.length > 1) {
      const agentNames = bases.map(b => {
        const m = b.systemPrompt.match(/你是\s*(?:MClaw\s*)?(.+?)[，。\n]/);
        return m ? m[1].trim().replace(/「.+?」/g, '').trim() : '';
      }).filter(Boolean);
      const greeting = `## 问候与自我介绍
当用户说"你好""hi""嗨""hello"等问候语时，你必须以「${persona.name}」的身份完整介绍自己能提供的全部服务。按以下格式回复：

"你好！我是${persona.name}${persona.role ? `，${persona.role}` : ''}。我整合了以下智能体能力，可以全方位协助你：\n\n${agentNames.map((n, i) => `**${i + 1}. ${n}**`).join('\n')}\n\n请参考上方各「智能体能力」章节了解具体功能。请问今天需要我帮你处理什么业务？"

禁止只介绍其中某一个智能体，禁止以"小销""小内""小客"等其他身份自称。问候语中必须完整列出上面所有智能体能力，不能遗漏。`;
      systemPrompt = greeting + '\n\n' + systemPrompt;
    }
  }

  // 附加技能（prompt snippets + tool definitions）
  // 查询范围：原始 agent（数字人 ID）+ 每个解析出的 agent/agent_app
  const skillAgentIds = [agent, ...agentIds].filter(Boolean);
  try {
    const seenSkillIds = new Set();
    let skillPrompts = '';
    for (const aid of skillAgentIds) {
      const skills = db.prepare(
        'SELECT * FROM agent_skills WHERE (agent_id=? OR agent_id IS NULL OR agent_id=\'\') AND status=\'active\''
      ).all(aid);
      for (const s of skills) {
        if (seenSkillIds.has(s.id)) continue;
        seenSkillIds.add(s.id);
        // prompt snippet
        if (s.prompt_snippet) {
          skillPrompts += `\n## ${s.name}\n${s.prompt_snippet}\n`;
        }
        // tool definitions
        if (s.tools) {
          try {
            const skillTools = JSON.parse(s.tools);
            if (Array.isArray(skillTools)) {
              for (const st of skillTools) {
                const stName = st.function?.name;
                if (stName && !seenToolNames.has(stName)) {
                  seenToolNames.add(stName);
                  mergedTools.push(st);
                }
              }
            }
          } catch {}
        }
      }
    }
    if (skillPrompts) {
      systemPrompt += '\n\n---\n\n# 附加技能' + skillPrompts;
    }
  } catch {}

  // 绑定的知识库文档（所有 agent_app 行）
  try {
    const allArticleIds = allDbRows
      .map(r => r.kb_article_ids)
      .filter(Boolean)
      .flatMap(s => s.split(',').filter(Boolean));
    const uniqueIds = [...new Set(allArticleIds)];
    if (uniqueIds.length) {
      const placeholders = uniqueIds.map(() => '?').join(',');
      const articles = db.prepare(
        `SELECT title, content FROM kb_articles WHERE id IN (${placeholders}) AND status='published'`
      ).all(...uniqueIds);
      if (articles.length) {
        const kbPrompt = articles.map(a => `## ${a.title}\n${(a.content || '').slice(0, 3000)}`).join('\n\n---\n\n');
        systemPrompt += '\n\n---\n\n# 参考知识库\n' + kbPrompt;
      }
    }
  } catch {}

  return { systemPrompt, tools: mergedTools };
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

// ─── 关键词评分（自动分配 Agent） ───

const AGENT_KEYWORDS = {
  'internal-agent': ['进销存', '采购', '入库', '出库', '库存', '退换货', '员工', '人事', '考勤', '绩效', '招聘', '文档', '部门', '台账', '工资', '打卡', '假期', '请假', '入职', '离职', '报表', '审批'],
  'sales-agent': ['客户', '商机', '合同', '订单', '销售', '签约', '报价', '跟进', '线索', '联系人', '成交', 'CRM', '回款', '催款', '收款'],
  'support-agent': ['工单', '投诉', '退款', '退货', '售后', '客服', '反馈', '故障', '报修', '保修', '转人工', '退换', '差评', '不满意', '质量', '问题']
};

function resolveBaseAgent(agentId) {
  try {
    const de = db.prepare('SELECT * FROM digital_employees WHERE id=? AND status=?').get(agentId, 'active');
    if (de && de.agent_ids && de.agent_ids.trim()) {
      try { const ids = JSON.parse(de.agent_ids); return Array.isArray(ids) ? ids[0] : de.agent_ids; } catch { return de.agent_ids.split(',')[0].trim(); }
    }
    const app = db.prepare('SELECT * FROM agent_apps WHERE id=? AND status=?').get(agentId, 'active');
    if (app && app.base_agent) return app.base_agent;
  } catch {}
  return null;
}

function scoreAgentForMessage(agentId, messageContent) {
  if (!messageContent || !agentId) return 0;
  const base = resolveBaseAgent(agentId) || agentId;
  const keywords = AGENT_KEYWORDS[base];
  if (!keywords) return 0;
  let score = 0;
  for (const kw of keywords) {
    const count = (messageContent.match(new RegExp(kw, 'g')) || []).length;
    score += count * 10;
  }
  return Math.min(score, 100);
}

module.exports = { loadAgentConfig, callLLM, execTool, polishReply, scoreAgentForMessage };
