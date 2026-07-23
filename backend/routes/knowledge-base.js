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

// ── WikiHub 多知识库（必须排在 /:id 通用路由之前）──
db.exec(`CREATE TABLE IF NOT EXISTS wikihub_kbs (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', model_id TEXT DEFAULT '', rules TEXT DEFAULT '', page_count INTEGER DEFAULT 0, raw_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT DEFAULT (datetime('now','localtime')))`);
db.exec(`CREATE TABLE IF NOT EXISTS wikihub_materials (id TEXT PRIMARY KEY, kb_id TEXT NOT NULL, title TEXT, filename TEXT, source_type TEXT DEFAULT 'file', status TEXT DEFAULT 'pending', file_size INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime')))`);
try { db.exec('ALTER TABLE wikihub_kbs ADD COLUMN model_id TEXT DEFAULT \'\''); } catch {}
try { db.exec('ALTER TABLE wikihub_kbs ADD COLUMN rules TEXT DEFAULT \'\''); } catch {}
try { db.exec('ALTER TABLE wikihub_kbs ADD COLUMN summary TEXT DEFAULT \'\''); } catch {}
try { db.exec('ALTER TABLE wikihub_materials ADD COLUMN digest_error TEXT DEFAULT \'\''); } catch {}

const wikiMulter = require('multer');
const wikiDir = path.join(__dirname, '..', 'uploads', 'wiki'); fs.mkdirSync(wikiDir, { recursive: true });
const wikiUpload = wikiMulter({ storage: wikiMulter.diskStorage({ destination: (r,f,cb)=>cb(null,wikiDir), filename: (r,f,cb)=>cb(null,Date.now()+'_'+f.originalname) }), limits:{fileSize:50*1024*1024} });

router.get('/kbs', (req, res) => { res.json({ code:200, data: db.prepare('SELECT * FROM wikihub_kbs ORDER BY updated_at DESC').all().map(k=>({...k,pageCount:k.page_count,rawCount:k.raw_count})) }); });
router.post('/kbs', (req, res) => {
  const {name,description}=req.body; if(!name) return res.status(400).json({code:400,message:'名称必填'});
  const id=randomUUID(); db.prepare('INSERT INTO wikihub_kbs(id,name,description) VALUES(?,?,?)').run(id,name,description||'');
  res.json({code:200,data:{id,name,message:'知识库创建成功'}});
});
router.delete('/kbs/:id', (req, res) => {
  db.prepare('DELETE FROM wikihub_materials WHERE kb_id=?').run(req.params.id);
  const r=db.prepare('DELETE FROM wikihub_kbs WHERE id=?').run(req.params.id);
  res.json({code:r.changes?200:404,message:r.changes?'已删除':'不存在'});
});
// 页面列表：直接从 wiki_pages 表读取（AI 消化结果）
router.get('/kbs/:id/pages', (req, res) => {
  const sql = "SELECT wp.*, ws.source_name FROM wiki_pages wp LEFT JOIN wiki_sources ws ON ws.wiki_page_id=wp.id WHERE wp.kb_id=? ORDER BY wp.updated_at DESC";
  const pages = db.prepare(sql).all(req.params.id);
  const out = pages.map(function(p){ p.slug = p.id; p.page_type = p.category || 'concept'; p.version = p.version || 1; return p; });
  res.json({code:200,data:out});
});
router.get('/kbs/:id/pages/:slug', (req, res) => {
  const p = db.prepare('SELECT * FROM wiki_pages WHERE id=?').get(req.params.slug);
  if(p) { p.slug = p.id; p.page_type = p.category || 'concept'; p.version = p.version || 1; }
  p ? res.json({code:200,data:p}) : res.status(404).json({code:404,message:'页面不存在'});
});
router.put('/kbs/:id/pages/:slug', (req, res) => {
  const p = db.prepare('SELECT id FROM wiki_pages WHERE id=?').get(req.params.slug);
  if(!p) return res.status(404).json({code:404,message:'页面不存在'});
  if(req.body.content!==undefined) db.prepare("UPDATE wiki_pages SET content=?,version=version+1,updated_at=datetime('now','localtime') WHERE id=?").run(req.body.content,req.params.slug);
  res.json({code:200,message:'已保存'});
});
router.get('/kbs/:id/materials', (req, res) => { res.json({code:200,data:db.prepare('SELECT * FROM wikihub_materials WHERE kb_id=? ORDER BY created_at DESC').all(req.params.id)}); });
router.post('/kbs/:id/materials/upload', wikiUpload.single('file'), async (req, res) => {
  if(!req.file) return res.status(400).json({code:400,message:'请选择文件'});
  const mid=randomUUID();
  // 修复 multer 中文文件名编码问题
  const origName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const ext = require('path').extname(origName).toLowerCase().replace('.','');
  let status='pending', parsedText='', errorMsg='';

  // 解析文件内容
  try {
    const { extractText } = require('../services/document-parser');
    const result = await extractText(req.file.path, ext);
    if (result.text) {
      parsedText = result.text;
      status = 'completed';
    }
    if (result.error) { errorMsg = result.error; status = 'failed'; }
  } catch(e) { errorMsg = e.message; status = 'failed'; }

  if (!parsedText && !errorMsg) errorMsg = '未支持格式: ' + ext;

  // 保存素材记录
  db.prepare('INSERT INTO wikihub_materials(id,kb_id,title,filename,source_type,status,file_size) VALUES(?,?,?,?,?,?,?)')
    .run(mid,req.params.id,origName,req.file.filename,'file',status,req.file.size);
  db.prepare('UPDATE wikihub_kbs SET raw_count=raw_count+1,updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(req.params.id);

  // AI 消化
  if (parsedText) {
    db.prepare('UPDATE wikihub_materials SET status=? WHERE id=?').run('digesting', mid);
    res.json({code:200,data:{id:mid,status:'digesting',message:'正在 AI 消化中…'}});

    (async () => {
      try {
        const { digestRawMaterial, saveDigestResult } = require('../services/wiki-digest');
        const result = await digestRawMaterial(parsedText, origName, 'file', { kbId: req.params.id, maxPages: 30 });
        if (result.pages.length > 0) {
          saveDigestResult(result);
        }
        db.prepare('UPDATE wikihub_kbs SET page_count=(SELECT COUNT(*) FROM wiki_pages WHERE kb_id=?), raw_count=raw_count+1, updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(req.params.id, req.params.id);
        db.prepare('UPDATE wikihub_materials SET status=? WHERE id=?').run('completed', mid);
      } catch(e) {
        console.error('[wiki-digest] 失败:', e.message);
        db.prepare('UPDATE wikihub_materials SET status=? WHERE id=?').run('failed', mid);
      }
    })();
  } else {
    res.json({code:200,data:{id:mid,status,message:errorMsg||'已上传'}});
  }
});
// 图谱数据：页面节点 + Wikilink 边
router.get('/kbs/:id/graph', (req, res) => {
  const pages = db.prepare("SELECT id, title, summary, category FROM wiki_pages WHERE kb_id=? AND status='published'").all(req.params.id);
  const nodes = pages.map(p => ({ id: p.id, name: p.title, category: p.category, symbolSize: 20 + Math.min((p.title||'').length * 2, 40) }));
  const nodeMap = new Map(pages.map(p => [p.title, p.id]));
  // 从 wiki_links 表获取边
  const links = db.prepare("SELECT wl.source_page_id, wl.target_page_id, wl.target_title FROM wiki_links wl INNER JOIN wiki_pages wp ON wl.source_page_id=wp.id WHERE wp.kb_id=? AND wl.target_page_id != ''").all(req.params.id);
  const edges = links.filter(l => nodeMap.has(l.target_title)).map(l => ({ source: l.source_page_id, target: l.target_page_id }));
  res.json({code:200,data:{nodes,edges}});
});

// 反向链接：哪些页面链接到当前页
router.get('/kbs/:id/pages/:slug/backlinks', (req, res) => {
  const page = db.prepare('SELECT id, title FROM wiki_pages WHERE id=?').get(req.params.slug);
  if (!page) return res.status(404).json({code:404,message:'页面不存在'});
  const backlinks = db.prepare("SELECT wl.source_page_id, wp.title as source_title FROM wiki_links wl INNER JOIN wiki_pages wp ON wl.source_page_id=wp.id WHERE wl.target_title=? AND wl.target_page_id=?").all(page.title, page.id);
  res.json({code:200,data:backlinks});
});

// POST /kbs/:id/pages — 手动创建页面
router.post('/kbs/:id/pages', (req, res) => {
  const { title, content } = req.body;
  if (!title) return res.status(400).json({code:400,message:'标题必填'});
  const pageId = randomUUID();
  const plainContent = (content||'').replace(/\[\[([^\]]+)\]\]/g,'$1').replace(/\[source:[^\]]*\]/g,'');
  db.prepare('INSERT INTO wiki_pages(id,title,content,plain_content,category,kb_id,status,version) VALUES(?,?,?,?,?,?,?,1)').run(pageId,title,content||'',plainContent,req.params.id,req.params.id,'published');
  db.prepare('UPDATE wikihub_kbs SET page_count=page_count+1,updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(req.params.id);
  res.json({code:200,data:{id:pageId,title,message:'页面已创建'}});
});

// 相关页面：共享同一 KB 的最近页面
router.get('/kbs/:id/pages/:slug/related', (req, res) => {
  const recent = db.prepare("SELECT id,title,summary FROM wiki_pages WHERE kb_id=? AND id!=? ORDER BY updated_at DESC LIMIT 5").all(req.params.id, req.params.slug);
  res.json({code:200,data:recent});
});

// 热缓存摘要：AI 生成 KB 全局摘要
router.post('/kbs/:id/summary', async (req, res) => {
  try {
    const pages = db.prepare("SELECT title,summary,content FROM wiki_pages WHERE kb_id=? AND status='published' LIMIT 10").all(req.params.id);
    if (!pages.length) return res.json({code:200,data:{content:'暂无页面，请先上传文件或创建页面'}});
    const combinedText = pages.map(p => `## ${p.title}\n${p.summary||''}\n${(p.content||'').slice(0,500)}`).join('\n\n');
    const { chat } = require('../services/llm');
    const response = await chat([
      { role:'system', content:'你是知识库管理专家。根据提供的页面列表，生成一段200字以内的知识库全局摘要。' },
      { role:'user', content:`请为以下知识库页面生成全局摘要：\n\n${combinedText.slice(0,4000)}` }
    ], 0.5);
    const summaryText = response.choices?.[0]?.message?.content || '';
    db.prepare("UPDATE wikihub_kbs SET summary=?, updated_at=datetime('now','localtime') WHERE id=?").run(summaryText, req.params.id);
    res.json({code:200,data:{content:summaryText}});
  } catch(e) { res.status(500).json({code:500,message:e.message}); }
});

router.get('/kbs/:id/config', (req, res) => {
  const kb=db.prepare('SELECT model_id,rules FROM wikihub_kbs WHERE id=?').get(req.params.id);
  kb?res.json({code:200,data:{modelId:kb.model_id||'',rules:kb.rules||''}}):res.status(404).json({code:404,message:'不存在'});
});
router.put('/kbs/:id/config', (req, res) => {
  db.prepare('UPDATE wikihub_kbs SET model_id=?,rules=?,updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(req.body.modelId||'',req.body.rules||'',req.params.id);
  res.json({code:200,message:'配置已保存'});
});

// ── 分类接口 ──
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
      category: article.category || '通用',
      kbId: ''
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
          category: article.category || '通用',
          kbId: ''
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
