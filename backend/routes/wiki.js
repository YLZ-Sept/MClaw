// LLM Wiki API — 页面 CRUD + AI 消化 + 版本管理 + 来源溯源
const { Router } = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const db = require('../db');
const { ALLOWED_EXTS, extractText, fetchWebContent } = require('../services/document-parser');
const { digestRawMaterial, saveDigestResult, regeneratePage } = require('../services/wiki-digest');

const router = Router();

const uploadDir = path.join(__dirname, '..', 'uploads', 'wiki');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, randomUUID() + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    cb(null, ALLOWED_EXTS.has(ext));
  }
});

// ═══ 页面 CRUD ═══

// 列表
router.get('/pages', (req, res) => {
  const { category, kb_id, keyword, status, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM wiki_pages WHERE 1=1';
  const params = [];
  if (kb_id) { sql += ' AND kb_id=?'; params.push(kb_id); }
  else if (category) { sql += ' AND category=?'; params.push(category); }
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (keyword) { sql += ' AND (title LIKE ? OR plain_content LIKE ? OR summary LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY updated_at DESC';
  const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) AS cnt')).get(...params)?.cnt || 0;
  const offset = (Number(page) - 1) * Number(pageSize);
  const rows = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, Number(pageSize), offset);
  // 附加每个页面的入链数
  for (const row of rows) {
    row.incoming_links = db.prepare('SELECT COUNT(*) AS c FROM wiki_links WHERE target_page_id=?').get(row.id)?.c || 0;
    row.outgoing_links = db.prepare('SELECT COUNT(*) AS c FROM wiki_links WHERE source_page_id=?').get(row.id)?.c || 0;
  }
  res.json({ code: 200, data: { rows, total, page: Number(page), pageSize: Number(pageSize) } });
});

// 单页详情
router.get('/pages/:id', (req, res) => {
  const page = db.prepare('SELECT * FROM wiki_pages WHERE id=?').get(req.params.id);
  if (!page) return res.status(404).json({ code: 404, message: '页面不存在' });
  // 增加阅读计数
  db.prepare('UPDATE wiki_pages SET view_count=view_count+1 WHERE id=?').run(req.params.id);
  // 来源
  page.sources = db.prepare('SELECT * FROM wiki_sources WHERE wiki_page_id=? ORDER BY source_chunk_index').all(req.params.id);
  // 出链
  page.outgoing_links = db.prepare('SELECT wl.*, wp.title AS target_title_display FROM wiki_links wl LEFT JOIN wiki_pages wp ON wl.target_page_id=wp.id WHERE wl.source_page_id=?',).all(req.params.id);
  // 入链
  page.incoming_links = db.prepare('SELECT wl.*, wp.title AS source_title FROM wiki_links wl JOIN wiki_pages wp ON wl.source_page_id=wp.id WHERE wl.target_page_id=?').all(req.params.id);
  // 关联的知识库文章：直接查 wiki_page_id 关联 + wiki_sources 中 kb_article 类型的来源
  page.linked_kb = db.prepare("SELECT id, title, category FROM kb_articles WHERE wiki_page_id=?").all(req.params.id);
  const kbSourceNames = db.prepare("SELECT DISTINCT source_name FROM wiki_sources WHERE wiki_page_id=? AND source_type='kb_article'").all(req.params.id);
  for (const s of kbSourceNames) {
    const arts = db.prepare('SELECT id, title, category FROM kb_articles WHERE title=? AND wiki_page_id!=?').all(s.source_name, req.params.id);
    page.linked_kb.push(...arts);
  }
  res.json({ code: 200, data: page });
});

// 手动创建
router.post('/pages', (req, res) => {
  const { title, content, summary, key_concepts, category, kb_id } = req.body;
  if (!title) return res.status(400).json({ code: 400, message: '标题必填' });
  const id = randomUUID();
  const plainContent = (content || '').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[source:[^\]]*\]/g, '');
  db.prepare(`INSERT INTO wiki_pages (id, title, content, plain_content, summary, key_concepts, category, kb_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, title, content || '', plainContent, summary || '',
    JSON.stringify(key_concepts || []), category || '通用', kb_id || ''
  );
  // 解析并保存链接
  saveLinksForPage(id, content || '');
  res.json({ code: 200, data: { id } });
});

// 更新
router.put('/pages/:id', (req, res) => {
  const page = db.prepare('SELECT * FROM wiki_pages WHERE id=?').get(req.params.id);
  if (!page) return res.status(404).json({ code: 404, message: '页面不存在' });
  const { title, content, summary, key_concepts, category, kb_id, status } = req.body;
  const newContent = content !== undefined ? content : page.content;
  const plainContent = newContent.replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[source:[^\]]*\]/g, '');
  db.prepare(`UPDATE wiki_pages SET title=COALESCE(?,title), content=COALESCE(?,content),
    plain_content=COALESCE(?,plain_content), summary=COALESCE(?,summary),
    key_concepts=COALESCE(?,key_concepts), category=COALESCE(?,category), kb_id=COALESCE(?,kb_id), status=COALESCE(?,status),
    version=version+1, updated_at=datetime('now','localtime') WHERE id=?`).run(
    title, content !== undefined ? content : null, content !== undefined ? plainContent : null,
    summary, key_concepts !== undefined ? JSON.stringify(key_concepts) : null,
    category, kb_id, status, req.params.id
  );
  // 更新链接
  if (content !== undefined) {
    db.prepare('DELETE FROM wiki_links WHERE source_page_id=?').run(req.params.id);
    saveLinksForPage(req.params.id, newContent);
  }
  res.json({ code: 200 });
});

// 删除
router.delete('/pages/:id', (req, res) => {
  const page = db.prepare('SELECT id FROM wiki_pages WHERE id=?').get(req.params.id);
  if (!page) return res.status(404).json({ code: 404, message: '页面不存在' });
  db.prepare('DELETE FROM wiki_links WHERE source_page_id=? OR target_page_id=?').run(req.params.id, req.params.id);
  db.prepare('DELETE FROM wiki_sources WHERE wiki_page_id=?').run(req.params.id);
  db.prepare('DELETE FROM wiki_page_versions WHERE wiki_page_id=?').run(req.params.id);
  db.prepare('DELETE FROM wiki_pages WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// ═══ AI 消化 ═══

// 多文件 + URL + 文本消化
router.post('/digest', upload.array('files', 20), async (req, res) => {
  try {
    const allTexts = [];
    const sources = [];

    // 处理上传文件
    if (req.files && req.files.length) {
      for (const file of req.files) {
        const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
        const result = await extractText(file.path, ext);
        if (result.text) {
          allTexts.push(`【文件: ${file.originalname}】\n${result.text}`);
          sources.push({ name: file.originalname, type: 'file', text: result.text });
        }
        // 清理临时文件
        try { fs.unlinkSync(file.path); } catch {}
      }
    }

    // 处理 URL
    let urls = [];
    if (req.body.urls) {
      try { urls = JSON.parse(req.body.urls); } catch { urls = [req.body.urls]; }
    }
    if (Array.isArray(urls)) {
      for (const u of urls) {
        if (typeof u !== 'string' || !u.startsWith('http')) continue;
        const web = await fetchWebContent(u);
        if (web.content && !web.content.startsWith('抓取失败')) {
          allTexts.push(`【网址: ${web.title}】\n来源: ${u}\n${web.content}`);
          sources.push({ name: web.title || u, type: 'url', text: web.content });
        }
      }
    }

    // 处理直接文本
    if (req.body.textContent) {
      allTexts.push(req.body.textContent);
      sources.push({ name: '手动输入', type: 'text', text: req.body.textContent });
    }

    if (!allTexts.length) return res.status(400).json({ code: 400, message: '请提供文档、URL 或文本内容' });

    const combinedText = allTexts.join('\n\n---\n\n');
    const category = req.body.category || '通用';
    const kbId = req.body.kb_id || '';
    const sourceName = sources.map(s => s.name).join(', ');

    // AI 消化
    const result = await digestRawMaterial(combinedText, sourceName, 'mixed', { category, kbId });

    if (!result.pages.length) {
      return res.json({ code: 200, data: { pages: [], totalPages: 0, message: 'AI 未提取到可结构化的知识点' } });
    }

    // 保存
    const { savedPages } = saveDigestResult(result);

    res.json({ code: 200, data: { pages: savedPages, totalPages: savedPages.length } });
  } catch (e) {
    res.status(500).json({ code: 500, message: '消化失败: ' + e.message });
  }
});

// 单 URL 消化
router.post('/digest-url', async (req, res) => {
  try {
    const { url, category = '通用', kb_id = '' } = req.body;
    if (!url) return res.status(400).json({ code: 400, message: 'URL 必填' });
    const web = await fetchWebContent(url);
    if (!web.content || web.content.startsWith('抓取失败')) {
      return res.status(400).json({ code: 400, message: '抓取失败: ' + web.content });
    }
    const sourceText = `【网址: ${web.title}】\n来源: ${url}\n${web.content}`;
    const result = await digestRawMaterial(sourceText, web.title || url, 'url', { category, kbId: kb_id });
    if (!result.pages.length) {
      return res.json({ code: 200, data: { pages: [], totalPages: 0, message: 'AI 未提取到可结构化的知识点' } });
    }
    const { savedPages } = saveDigestResult(result);
    res.json({ code: 200, data: { pages: savedPages, totalPages: savedPages.length } });
  } catch (e) {
    res.status(500).json({ code: 500, message: '消化失败: ' + e.message });
  }
});

// 重新消化
router.post('/regenerate/:id', async (req, res) => {
  try {
    const result = await regeneratePage(req.params.id);
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(500).json({ code: 500, message: '重新生成失败: ' + e.message });
  }
});

// ═══ 版本管理 ═══

router.get('/pages/:id/versions', (req, res) => {
  const rows = db.prepare('SELECT id, wiki_page_id, version, summary, change_description, created_at FROM wiki_page_versions WHERE wiki_page_id=? ORDER BY version DESC').all(req.params.id);
  res.json({ code: 200, data: rows });
});

router.get('/pages/:id/diff/:versionId', (req, res) => {
  const page = db.prepare('SELECT * FROM wiki_pages WHERE id=?').get(req.params.id);
  if (!page) return res.status(404).json({ code: 404, message: '页面不存在' });
  const oldVer = db.prepare('SELECT * FROM wiki_page_versions WHERE id=? AND wiki_page_id=?').get(req.params.versionId, req.params.id);
  if (!oldVer) return res.status(404).json({ code: 404, message: '版本不存在' });
  // 简单行级 diff
  const oldLines = (oldVer.content || '').split('\n');
  const newLines = (page.content || '').split('\n');
  const diff = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const ol = oldLines[i] || '';
    const nl = newLines[i] || '';
    if (ol === nl) {
      diff.push({ type: 'same', line: ol });
    } else {
      if (ol) diff.push({ type: 'removed', line: ol });
      if (nl) diff.push({ type: 'added', line: nl });
    }
  }
  res.json({ code: 200, data: {
    currentVersion: page.version,
    oldVersion: oldVer.version,
    diff,
    oldCreatedAt: oldVer.created_at,
  }});
});

// ═══ 辅助 ═══

function saveLinksForPage(pageId, content) {
  const { parseWikiLinks } = require('../services/wiki-digest');
  const links = parseWikiLinks(content);
  for (const link of links) {
    const target = db.prepare('SELECT id FROM wiki_pages WHERE title=?').get(link.targetTitle);
    if (!target) continue; // 跳过幽灵链接（目标页面尚不存在）
    db.prepare('INSERT INTO wiki_links (id, source_page_id, target_page_id, target_title, context) VALUES (?,?,?,?,?)')
      .run(randomUUID(), pageId, target.id, link.targetTitle, '');
  }
}

module.exports = router;
