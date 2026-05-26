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

// 列表
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM agent_apps ORDER BY created_at DESC').all();
  res.json({ code: 200, data: rows });
});

// 新增
router.post('/', (req, res) => {
  const { name, desc, icon, color, emoji, base_agent, system_prompt, kb_article_ids } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '名称必填' });
  const id = randomUUID();
  db.prepare(`INSERT INTO agent_apps (id,name,desc,icon,color,emoji,base_agent,system_prompt,kb_article_ids)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, name, desc || '', icon || 'Avatar', color || '', emoji || '🤖', base_agent || '', system_prompt || '', kb_article_ids || '');
  res.json({ code: 200, data: { id } });
});

// 更新
router.put('/:id', (req, res) => {
  const { name, desc, icon, color, emoji, base_agent, system_prompt, status, kb_article_ids } = req.body;
  db.prepare(`UPDATE agent_apps SET
    name=COALESCE(?,name), desc=COALESCE(?,desc), icon=COALESCE(?,icon),
    color=COALESCE(?,color), emoji=COALESCE(?,emoji), base_agent=COALESCE(?,base_agent),
    system_prompt=COALESCE(?,system_prompt), status=COALESCE(?,status),
    kb_article_ids=COALESCE(?,kb_article_ids)
    WHERE id=?`).run(name, desc, icon, color, emoji, base_agent, system_prompt, status, kb_article_ids, req.params.id);
  res.json({ code: 200 });
});

// 删除
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM agent_apps WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
