// Agent Bridge — shared LLM/Agent/Tool utilities for channel system
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { getActiveConfig } = require('../routes/model-configs');
const { exec: execTool } = require('../agents/executor');

// 文件夹引用：可读文本扩展名
const TEXT_EXTS = new Set(['txt','md','markdown','json','yaml','yml','xml','html','htm','css','js','ts','jsx','tsx','vue','py','go','rs','java','c','cpp','h','sh','bat','ps1','sql','csv','log','env','cfg','ini','toml','rst','tex']);
// 跳过目录
const SKIP_DIRS = new Set(['node_modules','.git','.svn','dist','build','__pycache__','.venv','venv','.next','.nuxt','coverage','.cache','uploads','.idea','.vscode','target','out']);

function readFileText(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    if (!TEXT_EXTS.has(ext)) return null;
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) return `[文件过大，跳过: ${filePath}]`;
    return fs.readFileSync(filePath, 'utf-8');
  } catch { return null; }
}

function scanFolder(folderPath, maxChars = 50000) {
  const results = [];
  let total = 0;
  const walk = (dir, depth) => {
    if (depth > 5 || total >= maxChars) return;
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (total >= maxChars) return;
        if (e.isDirectory()) {
          if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
          walk(path.join(dir, e.name), depth + 1);
        } else if (e.isFile()) {
          const fp = path.join(dir, e.name);
          const txt = readFileText(fp);
          if (txt !== null) {
            results.push({ relPath: path.relative(folderPath, fp), text: txt });
            total += txt.length;
          }
        }
      }
    } catch {}
  };
  walk(folderPath, 0);
  return results;
}

// Built-in agent definitions (keep in sync with server.js)
const agentConfigs = {
  'internal-agent': require('../agents/internal'),
  'sales-agent': require('../agents/sales'),
  'support-agent': require('../agents/support'),
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
          // 支持多 base_agent（逗号分隔），合并多个内置 Agent 的 tools + prompt
          const baseIds = dbRow.base_agent ? dbRow.base_agent.split(',').map(s => s.trim()).filter(Boolean) : [];
          const matched = baseIds.filter(id => agentConfigs[id]);
          const unmatched = baseIds.filter(id => !agentConfigs[id]);
          if (matched.length > 0) {
            const mergedTools = [];
            const seen = new Set();
            const prompts = [];
            for (const bid of matched) {
              const b = agentConfigs[bid];
              prompts.push(b.systemPrompt);
              for (const t of (b.tools || [])) {
                const n = t.function?.name;
                if (n && !seen.has(n)) { seen.add(n); mergedTools.push(t); }
              }
            }
            const mergedPrompt = matched.length === 1
              ? agentConfigs[matched[0]].systemPrompt
              : prompts.join('\n\n---\n\n');
            base = { systemPrompt: dbRow.system_prompt || mergedPrompt, tools: mergedTools, agentId };
          } else {
            if (!dbRow.base_agent) {
              console.warn('[agent-bridge] agent_app %s 未指定 base_agent，tools 将为空', agentId);
            } else if (unmatched.length > 0) {
              console.warn('[agent-bridge] agent_app %s 的 base_agent=%s 未匹配任何内置 Agent', agentId, unmatched.join(','));
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

  // 绑定的本地文件夹/文件引用（所有 agent_app 行）
  try {
    const allFolderPaths = allDbRows
      .map(r => r.kb_folder_paths)
      .filter(Boolean)
      .flatMap(s => s.split(',').map(p => p.trim()).filter(Boolean));
    const uniquePaths = [...new Set(allFolderPaths)];
    if (uniquePaths.length) {
      const folderContents = [];
      for (const fp of uniquePaths) {
        try {
          const stat = fs.statSync(fp);
          if (stat.isDirectory()) {
            const files = scanFolder(fp);
            if (files.length) {
              const content = files.map(f => `### ${f.relPath}\n${f.text.slice(0, 3000)}`).join('\n\n');
              folderContents.push(`## 📁 ${fp}\n${content.slice(0, 10000)}`);
            }
          } else if (stat.isFile()) {
            const ext = path.extname(fp).toLowerCase().replace('.', '');
            if (TEXT_EXTS.has(ext)) {
              const txt = readFileText(fp);
              if (txt) {
                folderContents.push(`## 📄 ${path.basename(fp)}\n${txt.slice(0, 5000)}`);
              }
            } else {
              folderContents.push(`## 📄 ${path.basename(fp)}\n[非文本文件，格式: ${ext || '未知'}]`);
            }
          }
        } catch { folderContents.push(`## ❌ ${fp}\n[路径不存在或无法访问]`); }
      }
      if (folderContents.length) {
        systemPrompt += '\n\n---\n\n# 本地文件/文件夹引用\n以下内容来自智能体配置中引用的本地路径，实时读取于磁盘：\n\n' + folderContents.join('\n\n---\n\n');
      }
    }
  } catch {}

  // 所有 Agent 自动注入 create_scheduled_task 工具
  if (!seenToolNames.has('create_scheduled_task')) {
    mergedTools.push({
      type: 'function',
      function: {
        name: 'create_scheduled_task',
        description: '创建一个定时任务。用户用自然语言描述调度需求时调用此工具。任务创建后出现在「任务调度」管理页面。如用户未指定执行Agent，默认使用当前对话的Agent。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '任务名称' },
            schedule: { type: 'string', description: '调度规则。cron表达式如"0 9 * * *"（每天9点）、"0 9 * * 1"（每周一9点）；或间隔如"30m"/"1h"；或ISO时间戳。请根据用户描述转换。' },
            message: { type: 'string', description: '任务执行的具体内容，Agent收到后据此执行' },
            agent_id: { type: 'string', description: '执行此任务的Agent ID。可选，默认使用当前对话的Agent（推荐），除非用户明确指定其他Agent。' },
            description: { type: 'string', description: '任务描述或备注（可选）' }
          },
          required: ['name', 'schedule', 'message']
        }
      }
    });
  }

  // 注入已勾选的 OpenClaw 技能（prompt + openclaw_exec 工具）
  try {
    const enabledSkills = db.prepare(
      "SELECT skill_name FROM agent_openclaw_skills WHERE (agent_id=? OR agent_id='*') AND enabled=1"
    ).all(agent);
    if (enabledSkills.length > 0) {
      const os = require('os');
      const homeDir = os.homedir();
      let skillPrompts = '';

      for (const { skill_name } of enabledSkills) {
        // 尝试从 agents 目录和 plugin-skills 目录找 SKILL.md
        const candidates = [
          path.join(homeDir, '.agents', 'skills', skill_name, 'SKILL.md'),
          path.join(homeDir, '.openclaw', 'plugin-skills', skill_name, 'SKILL.md'),
          path.join(homeDir, '.openclaw', 'workspace', 'skills', skill_name, 'SKILL.md')
        ];
        let skillContent = null;
        for (const p of candidates) {
          try { skillContent = fs.readFileSync(p, 'utf8'); break; } catch {}
        }
        if (!skillContent) continue;

        // 解析 YAML frontmatter（--- 包围）
        let body = skillContent;
        if (body.startsWith('---')) {
          const end = body.indexOf('---', 4);
          if (end !== -1) body = body.slice(end + 3).trim();
        }
        if (!body) continue;

        skillPrompts += `\n\n---\n\n# OpenClaw 技能: ${skill_name}\n${body}`;
      }

      if (skillPrompts) {
        systemPrompt += '\n\n---\n\n# OpenClaw 技能\n以下技能来自 OpenClaw，你可以通过调用 execute_command 工具来运行这些技能的 CLI 命令。' + skillPrompts;
      }

      // 注入 openclaw_exec 工具
      if (!seenToolNames.has('execute_command')) {
        mergedTools.push({
          type: 'function',
          function: {
            name: 'execute_command',
            description: '执行一个 OpenClaw 技能的命令。当你需要使用 OpenClaw 技能（如 agent-browser、agent-tools 等）时调用此工具。命令会在 OpenClaw 环境中执行并返回结果。',
            parameters: {
              type: 'object',
              properties: {
                command: { type: 'string', description: '要执行的命令，如 "npx agent-browser skills get core" 或 "infsh app run falai/flux-dev-lora"' }
              },
              required: ['command']
            }
          }
        });
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
