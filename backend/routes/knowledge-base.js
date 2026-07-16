const { Router } = require('express');
const { randomUUID } = require('crypto');
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
  let sql = 'SELECT * FROM kb_articles WHERE 1=1';
  const params = [];
  if (category) { sql += ' AND category=?'; params.push(category); }
  if (keyword) { sql += ' AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (status) { sql += ' AND status=?'; params.push(status); }
  sql += ' ORDER BY updated_at DESC LIMIT 100';
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
router.post('/browse', (req, res) => {
  const { filePath } = req.body;
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  try {
    // 未指定路径：返回驱动器列表(Windows)或根目录
    if (!filePath || !filePath.trim()) {
      if (process.platform === 'win32') {
        // Windows: 列出可用驱动器
        const items = [];
        for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
          const drive = String.fromCharCode(c) + ':\\';
          try { fs.accessSync(drive); items.push({ name: drive, path: drive, type: 'dir' }); } catch {}
        }
        return res.json({ code: 200, data: { current: '此电脑', parent: null, items } });
      } else {
        const items = fs.readdirSync('/').map(n => {
          const p = '/' + n;
          try { return { name: n, path: p, type: fs.statSync(p).isDirectory() ? 'dir' : 'file' }; } catch { return null; }
        }).filter(Boolean);
        return res.json({ code: 200, data: { current: '/', parent: null, items } });
      }
    }

    const resolved = path.resolve(filePath.trim());
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return res.json({ code: 200, data: { current: resolved, parent: path.dirname(resolved), items: [] } });
    }

    const skipDirs = new Set(['node_modules','.git','.svn','dist','build','__pycache__','.venv','venv','.next','.nuxt','coverage','.cache','uploads','.idea','.vscode','target','out']);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries
      .filter(e => e.isDirectory() ? (!e.name.startsWith('.') && !skipDirs.has(e.name)) : true)
      .map(e => ({
        name: e.name,
        path: path.join(resolved, e.name),
        type: e.isDirectory() ? 'dir' : 'file'
      }));

    const parent = path.dirname(resolved);
    res.json({
      code: 200,
      data: { current: resolved, parent: parent === resolved ? null : parent, items }
    });
  } catch (e) {
    res.json({ code: 400, message: '路径无效或无法访问: ' + e.message });
  }
});

// 上传本地文件到服务器知识库目录（供远程/局域网用户使用）
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const kbUploadDir = path.join(__dirname, '..', 'uploads', 'kb');
fs.mkdirSync(kbUploadDir, { recursive: true });

const kbUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // 按用户名分目录
      const user = (req.user && req.user.username) || 'anonymous';
      const userDir = path.join(kbUploadDir, user);
      fs.mkdirSync(userDir, { recursive: true });
      cb(null, userDir);
    },
    filename: (req, file, cb) => {
      // 保留中文文件名
      const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
      cb(null, original);
    }
  }),
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB 单文件
});

router.post('/upload-kb', kbUpload.array('files', 50), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择文件' });
    }
    const user = (req.user && req.user.username) || 'anonymous';
    const userDir = path.join(kbUploadDir, user);
    // 返回服务器上的目录路径，自动填入"本地引用"
    res.json({
      code: 200,
      message: `成功上传 ${req.files.length} 个文件`,
      data: {
        serverPath: userDir,
        files: req.files.map(f => ({
          name: f.originalname,
          size: f.size,
          path: f.path
        }))
      }
    });
  } catch (e) {
    res.status(500).json({ code: 500, message: '上传失败: ' + e.message });
  }
});

module.exports = router;
