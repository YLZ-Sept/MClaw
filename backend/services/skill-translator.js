const db = require('../db');
const { chat, parseJSON } = require('./llm');

db.exec(`CREATE TABLE IF NOT EXISTS skill_translations (
  skill_key TEXT PRIMARY KEY,
  name_zh TEXT NOT NULL,
  desc_zh TEXT DEFAULT '',
  translated_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 内存缓存：skill_key → { name_zh, desc_zh }
const cache = new Map();

// 启动时加载已有缓存
(function loadCache() {
  try {
    const rows = db.prepare('SELECT skill_key, name_zh, desc_zh FROM skill_translations').all();
    for (const r of rows) cache.set(r.skill_key, { name_zh: r.name_zh, desc_zh: r.desc_zh });
  } catch {}
})();

async function translateSkill(skillKey, name, description) {
  if (cache.has(skillKey)) return cache.get(skillKey);

  const prompt = [
    `把以下技能名称和描述翻译成简洁的中文。只返回 JSON：{"name_zh":"...","desc_zh":"..."}`,
    `名称：${name}`,
    description ? `描述：${description}` : ''
  ].filter(Boolean).join('\n');

  try {
    const content = await chat([{ role: 'user', content: prompt }], 0.3);
    const result = parseJSON(content);
    const entry = {
      name_zh: result.name_zh || name,
      desc_zh: result.desc_zh || ''
    };
    db.prepare('INSERT OR REPLACE INTO skill_translations (skill_key, name_zh, desc_zh, translated_at) VALUES (?,?,?,datetime(\'now\',\'localtime\'))')
      .run(skillKey, entry.name_zh, entry.desc_zh);
    cache.set(skillKey, entry);
    console.log(`[translator] ✓ ${skillKey} → ${entry.name_zh}`);
    return entry;
  } catch (e) {
    console.error(`[translator] ✗ ${skillKey}:`, e.message);
    return null;
  }
}

async function translateBatch(skills, concurrency = 3) {
  const untranslated = skills.filter(s => !cache.has(s.skillKey || s.name));
  if (untranslated.length === 0) return { translated: 0, total: skills.length };

  console.log(`[translator] batch start: ${untranslated.length} to translate`);
  let count = 0;

  for (let i = 0; i < untranslated.length; i += concurrency) {
    const batch = untranslated.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(s => translateSkill(
        s.skillKey || s.name,
        s.name,
        s.description || s.summary || ''
      ))
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) count++;
    }
  }

  console.log(`[translator] batch done: ${count}/${untranslated.length} translated`);
  return { translated: count, total: skills.length };
}

function getTranslations() {
  const result = {};
  for (const [key, val] of cache) result[key] = val;
  return result;
}

// 异步后台翻译（不阻塞）
function translateInBackground(skills) {
  setImmediate(() => translateBatch(skills).catch(() => {}));
}

module.exports = { translateSkill, translateBatch, getTranslations, translateInBackground };
