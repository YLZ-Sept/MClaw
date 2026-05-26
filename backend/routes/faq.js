const { Router } = require('express');
const { randomUUID } = require('crypto');
const XLSX = require('xlsx');
const db = require('../db');
const { search, invalidate, ensureIndex } = require('../agents/vector-search');
const router = Router();

router.get('/', (req, res) => {
  const { category } = req.query;
  let sql = 'SELECT * FROM faq';
  const params = [];
  if (category) { sql += ' WHERE category=?'; params.push(category); }
  sql += ' ORDER BY created_at DESC';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

router.post('/', (req, res) => {
  const { question, answer, tags, category, similar_questions, notes } = req.body;
  if (!question || !answer) return res.status(400).json({ code: 400, message: '问题和答案必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO faq (id,question,answer,tags,category,similar_questions,notes) VALUES (?,?,?,?,?,?,?)')
    .run(id, question, answer, tags || null, category || '通用', similar_questions || null, notes || null);
  invalidate();
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { question, answer, tags, category, similar_questions, notes } = req.body;
  db.prepare(`UPDATE faq SET
    question=COALESCE(?,question), answer=COALESCE(?,answer), tags=COALESCE(?,tags),
    category=COALESCE(?,category), similar_questions=COALESCE(?,similar_questions), notes=COALESCE(?,notes)
    WHERE id=?`)
    .run(question, answer, tags, category, similar_questions, notes, req.params.id);
  invalidate();
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM faq WHERE id=?').run(req.params.id);
  invalidate();
  res.json({ code: 200 });
});

// TF-IDF 向量检索
router.get('/match', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ code: 200, data: [] });
  const results = search(q, 5);
  res.json({ code: 200, data: results });
});

// 文件导入解析（返回预览数据）
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const { parse: parseFile } = require('../agents/import-parser');

router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ code: 400, message: '请上传文件' });
    const result = await parseFile(req.file.buffer, req.file.originalname);
    // 为每个条目生成临时 ID
    const items = result.items.map((it, i) => ({
      _idx: i,
      question: it.question || '',
      answer: it.answer || '',
      category: it.category || '通用',
      similar_questions: it.similar_questions || '',
      notes: it.notes || ''
    }));
    res.json({ code: 200, data: { type: result.type, items, total: items.length } });
  } catch (err) {
    res.status(400).json({ code: 400, message: '解析失败: ' + err.message });
  }
});

// 批量导入
router.post('/batch', (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) return res.status(400).json({ code: 400, message: '数据格式错误' });
  const insert = db.prepare('INSERT INTO faq (id,question,answer,tags,category,similar_questions,notes) VALUES (?,?,?,?,?,?,?)');
  let count = 0;
  for (const it of items) {
    if (!it.question || !it.answer) continue;
    insert.run(randomUUID(), it.question, it.answer, it.tags || null, it.category || '通用', it.similar_questions || null, it.notes || null);
    count++;
  }
  invalidate();
  res.json({ code: 200, data: { imported: count } });
});

// 导出 Excel
router.get('/export', (req, res) => {
  const data = db.prepare('SELECT category AS 分类, question AS 问题, similar_questions AS 相似问, answer AS 答案, notes AS 备注 FROM faq ORDER BY category, created_at DESC').all();
  const ws = XLSX.utils.json_to_sheet(data);
  // 列宽
  ws['!cols'] = [
    { wch: 12 },  // 分类
    { wch: 40 },  // 问题
    { wch: 40 },  // 相似问
    { wch: 60 },  // 答案
    { wch: 30 },  // 备注
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'FAQ知识库');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = 'attachment; filename="FAQ_knowledge_base.xlsx"; filename*=UTF-8\'\'FAQ%E7%9F%A5%E8%AF%86%E5%BA%93.xlsx';
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', filename);
  res.send(buf);
});

// 预热索引
router.post('/reindex', (req, res) => {
  ensureIndex();
  res.json({ code: 200, message: '索引已重建' });
});

module.exports = router;
