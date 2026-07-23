const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS agent_apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  desc TEXT,
  icon TEXT DEFAULT 'Avatar',
  color TEXT DEFAULT 'linear-gradient(135deg, #667eea, #764ba2)',
  emoji TEXT DEFAULT '🤖',
  base_agent TEXT DEFAULT 'internal-agent',
  system_prompt TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

try { db.exec('ALTER TABLE agent_apps ADD COLUMN kb_article_ids TEXT'); } catch {}
try { db.exec('ALTER TABLE agent_apps ADD COLUMN kb_folder_paths TEXT'); } catch {}

// 列表
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM agent_apps WHERE is_expert IS NULL OR is_expert=0 ORDER BY created_at DESC').all();
  res.json({ code: 200, data: rows });
});

// 新增
router.post('/', (req, res) => {
  const { name, desc, icon, color, emoji, base_agent, system_prompt, kb_article_ids, kb_folder_paths, wiki_page_ids, kb_ids } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '名称必填' });
  const id = randomUUID();
  db.prepare(`INSERT INTO agent_apps (id,name,desc,icon,color,emoji,base_agent,system_prompt,kb_article_ids,kb_folder_paths,wiki_page_ids,kb_ids)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, name, desc || '', icon || 'Avatar', color || '', emoji || '🤖', base_agent || '', system_prompt || '', kb_article_ids || '', kb_folder_paths || '', wiki_page_ids || '', kb_ids || '');
  res.json({ code: 200, data: { id } });
});

// 更新
router.put('/:id', (req, res) => {
  const { name, desc, icon, color, emoji, base_agent, system_prompt, status, kb_article_ids, kb_folder_paths, wiki_page_ids, kb_ids } = req.body;
  db.prepare(`UPDATE agent_apps SET
    name=COALESCE(?,name), desc=COALESCE(?,desc), icon=COALESCE(?,icon),
    color=COALESCE(?,color), emoji=COALESCE(?,emoji), base_agent=COALESCE(?,base_agent),
    system_prompt=COALESCE(?,system_prompt), status=COALESCE(?,status),
    kb_article_ids=COALESCE(?,kb_article_ids),
    kb_folder_paths=COALESCE(?,kb_folder_paths),
    wiki_page_ids=COALESCE(?,wiki_page_ids),
    kb_ids=COALESCE(?,kb_ids)
    WHERE id=?`).run(name, desc, icon, color, emoji, base_agent, system_prompt, status, kb_article_ids, kb_folder_paths, wiki_page_ids, kb_ids, req.params.id);
  res.json({ code: 200 });
});

// 删除
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM agent_apps WHERE id=?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ code: 404, message: '智能体不存在' });
  res.json({ code: 200 });
});

// AI 生成系统提示词
router.post('/generate-prompt', async (req, res) => {
  try {
    const { name, desc, base_agent } = req.body;
    if (!name) return res.status(400).json({ code: 400, message: '名称必填' });

    const baseInfo = base_agent
      ? `继承自 ${base_agent} 的工具集和能力。`
      : '无预设工具，纯靠系统提示词定义行为。';

    const { chat } = require('../services/llm');
    const response = await chat([
      { role: 'system', content: '你是一个 AI Agent 系统提示词撰写专家。根据用户提供的智能体名称和描述，生成一段专业、精炼的系统提示词（200字以内）。用中文，直接定义角色身份、能力范围、行为准则、回复风格。不要包含工具调用细节。' },
      { role: 'user', content: `名称：${name}\n描述：${desc || '(无)'}\n基础能力：${baseInfo}\n\n请生成系统提示词：` }
    ], 0.8);

    const prompt = response.trim().replace(/^["']|["']$/g, '');
    res.json({ code: 200, data: { system_prompt: prompt } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// AI 生成 Agent 完整配置
router.post('/generate-config', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ code: 400, message: '描述必填' });
    const { chat } = require('../services/llm');
    const response = await chat([
      { role: 'system', content: '你是 Agent 配置专家。根据用户描述，生成 JSON：{"name":"简洁名称(≤15字)","iconEmoji":"1个emoji","prompt":"系统提示词(≤300字)","baseAgent":""}。baseAgent 可选值：internal-agent/internal-agent,sales-agent,support-agent,bid-agent，选最匹配的，都不匹配为空。只输出JSON，不要markdown。' },
      { role: 'user', content: description }
    ], 0.7);
    try {
      const cfg = JSON.parse(response.trim().replace(/```json\n?|\n?```/g, ''));
      cfg.name = cfg.name || description.slice(0, 15);
      cfg.iconEmoji = cfg.iconEmoji || '🤖';
      cfg.prompt = cfg.prompt || '';
      cfg.baseAgent = cfg.baseAgent || '';
      res.json({ code: 200, data: cfg });
    } catch {
      const name = description.slice(0, 15);
      const prompt = '你是' + description + '。请始终以专业、友好的态度帮助用户。';
      res.json({ code: 200, data: { name, iconEmoji: '🤖', prompt, baseAgent: '' } });
    }
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
