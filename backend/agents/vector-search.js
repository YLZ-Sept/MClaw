// FAQ 向量检索 — TF-IDF + 余弦相似度，纯 JS 零依赖

let faqDocs = [];         // [{id, question, answer, tags}]
let idf = new Map();      // term → idf 值
let docVectors = [];      // 每个 FAQ 的 TF-IDF 向量 [{id, vec: Map}]
let dirty = false;

function tokenize(text) {
  const cleaned = (text || '').replace(/[，,。.！!？?、；;：:（）()【】\[\]""''\s\r\n\d]+/g, '');
  const toks = [];
  // 提取 2-gram 和 3-gram
  for (let len = 2; len <= 3; len++) {
    for (let i = 0; i <= cleaned.length - len; i++) {
      toks.push(cleaned.substring(i, i + len));
    }
  }
  return toks;
}

function buildIndex() {
  const db = require('../db');
  faqDocs = db.prepare('SELECT id, question, answer, tags FROM faq').all();

  // 统计每个 term 出现在多少文档中
  const df = new Map();
  for (const doc of faqDocs) {
    const terms = new Set(tokenize([doc.question, doc.tags, doc.similar_questions].filter(Boolean).join(' ')));
    for (const t of terms) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }

  // 计算 IDF
  const N = faqDocs.length || 1;
  idf = new Map();
  for (const [t, d] of df) {
    idf.set(t, Math.log((N + 1) / (d + 1)) + 1);
  }

  // 计算每个文档的 TF-IDF 向量
  docVectors = faqDocs.map(doc => {
    const terms = tokenize([doc.question, doc.tags, doc.similar_questions].filter(Boolean).join(' '));
    const tf = new Map();
    for (const t of terms) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    const vec = new Map();
    for (const [t, f] of tf) {
      vec.set(t, f * (idf.get(t) || 0));
    }
    return { id: doc.id, vec };
  });

  dirty = false;
}

function ensureIndex() {
  if (dirty || docVectors.length === 0) buildIndex();
}

// 计算余弦相似度
function cosineSimilarity(queryVec, docVec) {
  let dot = 0, qNorm = 0, dNorm = 0;
  for (const [t, qv] of queryVec) {
    qNorm += qv * qv;
    const dv = docVec.get(t) || 0;
    dot += qv * dv;
  }
  for (const [, dv] of docVec) {
    dNorm += dv * dv;
  }
  if (qNorm === 0 || dNorm === 0) return 0;
  return dot / (Math.sqrt(qNorm) * Math.sqrt(dNorm));
}

// 搜索 FAQ，返回 topK 匹配结果
function search(query, topK = 3) {
  ensureIndex();

  // 构建查询向量
  const queryTerms = tokenize(query);
  const tf = new Map();
  for (const t of queryTerms) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  const queryVec = new Map();
  for (const [t, f] of tf) {
    queryVec.set(t, f * (idf.get(t) || 0));
  }

  // 计算每个文档的相似度
  const scored = docVectors.map(({ id, vec }) => ({
    id,
    score: cosineSimilarity(queryVec, vec)
  })).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);

  // 返回完整 FAQ 对象
  return scored.map(({ id, score }) => {
    const doc = faqDocs.find(d => d.id === id);
    return doc ? { ...doc, score: Math.round(score * 1000) / 1000 } : null;
  }).filter(Boolean);
}

// 标记索引需要重建（FAQ 增删改后调用）
function invalidate() {
  dirty = true;
}

module.exports = { search, invalidate, ensureIndex };
