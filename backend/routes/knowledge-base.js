const { Router } = require('express');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS kb_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT '通用',
  tags TEXT,
  source TEXT,
  status TEXT DEFAULT 'published',
  view_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
)`);

try { db.exec('ALTER TABLE kb_articles ADD COLUMN tags TEXT'); } catch {}
try { db.exec('ALTER TABLE kb_articles ADD COLUMN source TEXT'); } catch {}
try { db.exec('ALTER TABLE kb_articles ADD COLUMN view_count INTEGER DEFAULT 0'); } catch {}

db.exec(`CREATE TABLE IF NOT EXISTS kb_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 初始化默认分类
const defaultCats = ['通用', '产品知识', '销售话术', '售后流程', '规章制度', '技术文档', '培训资料', '其他'];
const insertCat = db.prepare('INSERT OR IGNORE INTO kb_categories (id,name,sort_order) VALUES (?,?,?)');
defaultCats.forEach((c, i) => { try { insertCat.run(randomUUID(), c, i); } catch {} });

// 分类列表
router.get('/categories', (req, res) => {
  const cats = db.prepare('SELECT * FROM kb_categories ORDER BY sort_order, created_at').all();
  const data = cats.map(c => ({
    ...c,
    count: db.prepare('SELECT COUNT(*) AS c FROM kb_articles WHERE category=? AND status=?').get(c.name, 'published')?.c || 0
  }));
  res.json({ code: 200, data });
});

// 新增分类
router.post('/categories', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '名称必填' });
  const maxSort = db.prepare('SELECT MAX(sort_order) AS m FROM kb_categories').get()?.m || 0;
  const id = randomUUID();
  db.prepare('INSERT OR IGNORE INTO kb_categories (id,name,sort_order) VALUES (?,?,?)').run(id, name.trim(), maxSort + 1);
  res.json({ code: 200, data: { id } });
});

// 更新分类
router.put('/categories/:id', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ code: 400, message: '名称必填' });
  const old = db.prepare('SELECT name FROM kb_categories WHERE id=?').get(req.params.id);
  if (!old) return res.status(404).json({ code: 404 });
  db.prepare('UPDATE kb_categories SET name=? WHERE id=?').run(name.trim(), req.params.id);
  db.prepare('UPDATE kb_articles SET category=? WHERE category=?').run(name.trim(), old.name);
  res.json({ code: 200 });
});

// 删除分类
router.delete('/categories/:id', (req, res) => {
  const old = db.prepare('SELECT name FROM kb_categories WHERE id=?').get(req.params.id);
  if (!old) return res.status(404).json({ code: 404, message: '分类不存在' });
  if (old.name === '通用') return res.status(400).json({ code: 400, message: '不能删除"通用"分类' });
  // 确保"通用"分类存在
  const genCat = db.prepare("SELECT id FROM kb_categories WHERE name='通用'").get();
  if (!genCat) {
    db.prepare("INSERT INTO kb_categories (id,name,sort_order) VALUES (?,?,0)").run(randomUUID(), '通用');
  }
  db.prepare('UPDATE kb_articles SET category=? WHERE category=?').run('通用', old.name);
  db.prepare('DELETE FROM kb_categories WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 列表
router.get('/', (req, res) => {
  const { category, keyword, status } = req.query;
  let sql = `SELECT kb.*, wp.title AS wiki_title FROM kb_articles kb
    LEFT JOIN wiki_pages wp ON kb.wiki_page_id=wp.id
    WHERE 1=1`;
  const params = [];
  if (category) { sql += ' AND kb.category=?'; params.push(category); }
  if (keyword) { sql += ' AND (kb.title LIKE ? OR kb.content LIKE ? OR kb.tags LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (status) { sql += ' AND kb.status=?'; params.push(status); }
  sql += ' ORDER BY kb.updated_at DESC LIMIT 100';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

// 单篇
router.get('/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM kb_articles WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ code: 404, message: '文章不存在' });
  db.prepare('UPDATE kb_articles SET view_count=view_count+1 WHERE id=?').run(req.params.id);
  res.json({ code: 200, data: a });
});

// 新增
router.post('/', (req, res) => {
  const { title, content, category, tags, source, status } = req.body;
  if (!title) return res.status(400).json({ code: 400, message: '标题必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO kb_articles (id,title,content,category,tags,source,status) VALUES (?,?,?,?,?,?,?)')
    .run(id, title, content || '', category || '通用', tags || '', source || '', status || 'published');
  res.json({ code: 200, data: { id } });
});

// 更新
router.put('/:id', (req, res) => {
  const { title, content, category, tags, source, status } = req.body;
  db.prepare(`UPDATE kb_articles SET
    title=COALESCE(?,title), content=COALESCE(?,content), category=COALESCE(?,category),
    tags=COALESCE(?,tags), source=COALESCE(?,source), status=COALESCE(?,status),
    updated_at=datetime('now','localtime') WHERE id=?`)
    .run(title, content, category, tags, source, status, req.params.id);
  res.json({ code: 200 });
});

// 删除
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM kb_articles WHERE id=?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ code: 404, message: '文章不存在' });
  res.json({ code: 200 });
});

// 浏览服务器目录（供智能体选择本地文件夹/文件引用）
// 安全：限制在允许的根目录范围内，防止路径遍历攻击
const BROWSE_ROOTS = (() => {
  const os = require('os');
  const roots = [os.homedir()];
  if (process.platform === 'win32') {
    roots.push('C:\\Users', 'D:\\', 'E:\\');
  } else {
    roots.push('/home', '/opt', '/var', '/tmp');
  }
  return roots.filter(r => { try { require('fs').accessSync(r); return true; } catch { return false; } });
})();

function isPathSafe(targetPath) {
  const resolved = path.resolve(targetPath);
  // 检查是否在允许的根目录下
  for (const root of BROWSE_ROOTS) {
    if (resolved === root || resolved.startsWith(root + path.sep)) return resolved;
  }
  return null;
}

router.post('/browse', (req, res) => {
  const { filePath } = req.body;
  const fs = require('fs');
  const path = require('path');

  try {
    if (!filePath || !filePath.trim()) {
      return res.json({ code: 200, data: { current: '根目录', parent: null, items: BROWSE_ROOTS.map(r => ({ name: r, path: r, type: 'dir' })) } });
    }

    const resolved = isPathSafe(filePath.trim());
    if (!resolved) return res.status(403).json({ code: 403, message: '禁止访问该路径' });

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      // 只返回路径信息，不暴露完整绝对路径
      return res.json({ code: 200, data: { current: path.basename(resolved), parent: path.dirname(resolved), items: [] } });
    }

    const skipDirs = new Set(['node_modules','.git','.svn','dist','build','__pycache__','.venv','venv','.next','.nuxt','coverage','.cache','uploads','.idea','.vscode','target','out','System32','Windows','system32','windows']);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries
      .filter(e => e.isDirectory() ? (!e.name.startsWith('.') && !skipDirs.has(e.name)) : true)
      .slice(0, 200) // 限制单次返回数量
      .map(e => ({
        name: e.name,
        path: path.join(resolved, e.name),
        type: e.isDirectory() ? 'dir' : 'file'
      }));

    const parent = path.dirname(resolved);
    const safeParent = isPathSafe(parent);
    res.json({
      code: 200,
      data: { current: resolved, parent: safeParent || null, items }
    });
  } catch (e) {
    res.status(400).json({ code: 400, message: '路径无效或无法访问' });
  }
});

// 上传本地文件到服务器知识库目录（供远程/局域网用户使用）
const multer = require('multer');
const kbUploadDir = path.join(__dirname, '..', 'uploads', 'kb');
fs.mkdirSync(kbUploadDir, { recursive: true });

const kbUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const user = (req.user && req.user.username) || 'anonymous';
      const userDir = path.join(kbUploadDir, user);
      fs.mkdirSync(userDir, { recursive: true });
      cb(null, userDir);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
  }),
  limits: { fileSize: 200 * 1024 * 1024 }
});

router.post('/upload-kb', kbUpload.array('files', 50), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择文件' });
    }
    const user = (req.user && req.user.username) || 'anonymous';
    res.json({
      code: 200,
      message: `成功上传 ${req.files.length} 个文件`,
      data: {
        serverPath: path.join(kbUploadDir, user),
        files: req.files.map(f => ({ name: f.originalname, size: f.size }))
      }
    });
  } catch (e) {
    res.status(500).json({ code: 500, message: '上传失败: ' + e.message });
  }
});

// ── AI 消化：将知识库文章发送到 LLM Wiki ──
router.post('/:id/digest-to-wiki', async (req, res) => {
  try {
    const article = db.prepare('SELECT * FROM kb_articles WHERE id=?').get(req.params.id);
    if (!article) return res.status(404).json({ code: 404, message: '文章不存在' });
    if (!article.content) return res.status(400).json({ code: 400, message: '文章内容为空' });

    // 如果已消化过，先清理旧的 Wiki 页面
    if (article.wiki_page_id) {
      db.prepare('DELETE FROM wiki_links WHERE source_page_id=? OR target_page_id=?').run(article.wiki_page_id, article.wiki_page_id);
      db.prepare('DELETE FROM wiki_sources WHERE wiki_page_id=?').run(article.wiki_page_id);
      db.prepare('DELETE FROM wiki_page_versions WHERE wiki_page_id=?').run(article.wiki_page_id);
      db.prepare('DELETE FROM wiki_pages WHERE id=?').run(article.wiki_page_id);
    }

    const { digestRawMaterial, saveDigestResult } = require('../services/wiki-digest');
    const sourceText = `【知识库文章: ${article.title}】\n${article.content}`;
    const result = await digestRawMaterial(sourceText, article.title, 'kb_article', {
      category: article.category || '通用'
    });

    if (!result.pages.length) {
      return res.json({ code: 200, data: { pages: [], totalPages: 0, message: 'AI 未提取到可结构化的知识点' } });
    }

    // 保存 Wiki 页面并关联回 kb_articles
    const { savedPages } = saveDigestResult(result);
    if (savedPages.length > 0) {
      // 将第一个（主要）Wiki 页面关联回文章
      db.prepare('UPDATE kb_articles SET wiki_page_id=?, digested=1 WHERE id=?')
        .run(savedPages[0].id, req.params.id);
      // Wiki 页面也记录来源
      for (const p of savedPages) {
        db.prepare('INSERT INTO wiki_sources (id, wiki_page_id, source_type, source_name, source_content) VALUES (?,?,?,?,?)')
          .run(require('crypto').randomUUID(), p.id, 'kb_article', article.title, article.content || '');
      }
    }

    res.json({ code: 200, data: { pages: savedPages, totalPages: savedPages.length } });
  } catch (e) {
    res.status(500).json({ code: 500, message: '消化失败: ' + e.message });
  }
});

// 批量消化：消化分类下所有未处理的文章
router.post('/batch-digest', async (req, res) => {
  try {
    const { category } = req.body;
    let sql = "SELECT * FROM kb_articles WHERE content != '' AND digested = 0";
    const params = [];
    if (category) { sql += ' AND category=?'; params.push(category); }
    sql += ' LIMIT 10'; // 限制批量数量
    const articles = db.prepare(sql).all(...params);

    if (!articles.length) return res.json({ code: 200, data: { processed: 0, message: '没有需要消化的文章' } });

    let processed = 0;
    for (const article of articles) {
      try {
        const { digestRawMaterial, saveDigestResult } = require('../services/wiki-digest');
        const sourceText = `【文章: ${article.title}】\n${article.content}`;
        const result = await digestRawMaterial(sourceText, article.title, 'kb_article', {
          category: article.category || '通用'
        });
        if (result.pages.length > 0) {
          const { savedPages } = saveDigestResult(result);
          db.prepare('UPDATE kb_articles SET wiki_page_id=?, digested=1 WHERE id=?')
            .run(savedPages[0]?.id || '', article.id);
          for (const p of savedPages) {
            db.prepare('INSERT INTO wiki_sources (id, wiki_page_id, source_type, source_name, source_content) VALUES (?,?,?,?,?)')
              .run(require('crypto').randomUUID(), p.id, 'kb_article', article.title, article.content || '');
          }
          processed++;
        }
      } catch (e) {
        console.log(`[batch-digest] ${article.title} 失败: ${e.message}`);
      }
    }

    res.json({ code: 200, data: { processed, total: articles.length } });
  } catch (e) {
    res.status(500).json({ code: 500, message: '批量消化失败: ' + e.message });
  }
});

module.exports = router;
