// LLM Wiki 消化引擎 — AI 阅读原材料 → 生成结构化 Wiki 页面
const { randomUUID } = require('crypto');
const crypto = require('crypto');
const db = require('../db');
const { chat, parseJSON } = require('./llm');

const CHUNK_SIZE = 6000;    // 每块最大字符数
const CHUNK_OVERLAP = 1000; // 块间重叠字符数

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 24);
}

// 文本分块
function chunkText(text) {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

// 合并和去重 chunk 结果
function mergePages(allPages) {
  const seen = new Set();
  const merged = [];
  for (const page of allPages) {
    const key = (page.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(page);
  }
  return merged;
}

// 解析 Wiki 链接 [[Target]] 或 [[Target|Display]]
function parseWikiLinks(content) {
  const links = [];
  const re = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    links.push({
      targetTitle: (m[1] || '').trim(),
      displayText: (m[2] || m[1] || '').trim(),
    });
  }
  return links;
}

// 核心：消化原材料生成 Wiki 页面
async function digestRawMaterial(rawText, sourceName, sourceType, opts = {}) {
  const { category = '通用', maxPages = 30 } = opts;
  const sourceHash = sha256(rawText);
  const chunks = chunkText(rawText);
  const allPages = [];
  const allLinks = [];

  console.log(`[wiki-digest] 开始消化 "${sourceName}" (${rawText.length} 字符, ${chunks.length} 块)`);

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const prompt = `你是企业知识管理专家。阅读以下文档内容，提取关键知识点，生成结构化 Wiki 页面。

【来源】${sourceName}
【分块】${ci + 1}/${chunks.length}

【文档内容】
${chunk.slice(0, 8000)}

【要求】
1. 提取核心概念，每个概念一个 Wiki 页面
2. 每个页面包含：
   - title: 简洁准确的标题
   - summary: 1-2 句话概括
   - key_concepts: 3-5 个关键词
   - content: Markdown 格式详细内容（用标题、列表等结构）
   - 在 content 中用 [[其他页面标题]] 标记相关概念
   - 用 [source: 段落N] 标记信息来源
3. 不同概念分成不同页面，不要合并
4. 如果该分块中无独立概念，返回空数组

严格输出 JSON（不要 Markdown 代码块）：
{"pages":[{"title":"...","summary":"...","key_concepts":["..."],"content":"...","links_to":["..."]}]}`;

    try {
      const response = await chat([
        { role: 'system', content: '你是一个企业知识管理专家。你只输出严格格式的 JSON，不包含任何 Markdown 标记或额外解释。' },
        { role: 'user', content: prompt }
      ], 0.3);

      const data = parseJSON(response);
      if (data && data.pages && Array.isArray(data.pages)) {
        for (const page of data.pages) {
          if (!page.title || !page.content) continue;
          allPages.push({
            title: page.title.trim().substring(0, 200),
            summary: (page.summary || '').trim().substring(0, 500),
            key_concepts: Array.isArray(page.key_concepts) ? page.key_concepts.slice(0, 10) : [],
            content: page.content.trim(),
            source_name: sourceName,
            source_type: sourceType,
            source_hash: sourceHash,
            source_chunk_index: ci,
            source_content: chunk,
            links_to: Array.isArray(page.links_to) ? page.links_to : [],
            category,
          });
        }
        console.log(`[wiki-digest] 块 ${ci + 1}/${chunks.length}: 提取 ${data.pages.length} 个概念`);
      }
    } catch (e) {
      console.log(`[wiki-digest] 块 ${ci + 1} 消化失败: ${e.message}`);
    }
  }

  // 去重合并
  const merged = mergePages(allPages);
  console.log(`[wiki-digest] 去重后: ${merged.length} 个页面（原始 ${allPages.length}）`);

  // 限流
  const limited = merged.slice(0, maxPages);

  return {
    pages: limited,
    totalRaw: allPages.length,
    totalMerged: limited.length,
    sourceName,
    sourceHash,
  };
}

// 保存消化结果到数据库
function saveDigestResult(digestResult) {
  const { pages, sourceHash } = digestResult;
  const savedPages = [];
  const savedLinks = [];

  const insertPage = db.prepare(`INSERT INTO wiki_pages (id, title, content, plain_content, summary, key_concepts, category, status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published', 1)`);
  const insertSource = db.prepare(`INSERT INTO wiki_sources (id, wiki_page_id, source_type, source_name, source_path, source_content, source_hash, source_chunk_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertLink = db.prepare(`INSERT INTO wiki_links (id, source_page_id, target_page_id, target_title, context)
    VALUES (?, ?, ?, ?, ?)`);

  const transaction = db.transaction(() => {
    for (const page of pages) {
      const pageId = randomUUID();
      const plainContent = page.content.replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[source:[^\]]*\]/g, '');

      // 保存页面
      insertPage.run(
        pageId, page.title, page.content, plainContent,
        page.summary || '', JSON.stringify(page.key_concepts || []), page.category || '通用'
      );

      // 保存来源
      insertSource.run(
        randomUUID(), pageId, page.source_type, page.source_name,
        '', page.source_content || '', sourceHash, page.source_chunk_index || 0
      );

      // 解析并保存链接（只保存已存在的目标页面）
      const links = parseWikiLinks(page.content);
      for (const link of links) {
        const target = db.prepare('SELECT id FROM wiki_pages WHERE title=?').get(link.targetTitle);
        if (!target) continue;
        insertLink.run(randomUUID(), pageId, target.id, link.targetTitle, '');
        savedLinks.push({ sourceId: pageId, targetTitle: link.targetTitle, targetId: target.id });
      }

      savedPages.push({ id: pageId, title: page.title, summary: page.summary });
    }
  });

  transaction();
  return { savedPages, savedLinks };
}

// 重新消化已有页面（从 sources 重新生成，创建版本快照）
async function regeneratePage(wikiPageId) {
  const page = db.prepare('SELECT * FROM wiki_pages WHERE id=?').get(wikiPageId);
  if (!page) throw new Error('页面不存在');

  const sources = db.prepare('SELECT * FROM wiki_sources WHERE wiki_page_id=? ORDER BY source_chunk_index').all(wikiPageId);
  if (!sources.length) throw new Error('无来源数据，无法重新生成');

  // 保存版本快照
  db.prepare(`INSERT INTO wiki_page_versions (id, wiki_page_id, version, content, summary, change_description)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    randomUUID(), wikiPageId, page.version, page.content, page.summary || '', '重新消化前快照'
  );

  // 合并所有来源文本
  const allText = sources.map(s => s.source_content || '').join('\n\n---\n\n');
  if (!allText.trim()) throw new Error('来源内容为空');

  // 重新消化
  const result = await digestRawMaterial(allText, `regenerate-${page.title}`, 'regenerate', {
    category: page.category,
    maxPages: 1,
  });

  if (result.pages.length === 0) throw new Error('AI 未能从来源重新生成内容');

  const newPage = result.pages[0];

  // 更新页面
  const newVersion = page.version + 1;
  db.prepare(`UPDATE wiki_pages SET title=?, content=?, plain_content=?, summary=?, key_concepts=?, version=?, updated_at=datetime('now','localtime')
    WHERE id=?`).run(
    newPage.title, newPage.content, newPage.content.replace(/\[\[([^\]]+)\]\]/g, '$1'),
    newPage.summary || '', JSON.stringify(newPage.key_concepts || []), newVersion, wikiPageId
  );

  // 更新链接
  db.prepare('DELETE FROM wiki_links WHERE source_page_id=?').run(wikiPageId);
  const links = parseWikiLinks(newPage.content);
  for (const link of links) {
    const target = db.prepare('SELECT id FROM wiki_pages WHERE title=?').get(link.targetTitle);
    db.prepare('INSERT INTO wiki_links (id, source_page_id, target_page_id, target_title, context) VALUES (?,?,?,?,?)')
      .run(randomUUID(), wikiPageId, target ? target.id : '', link.targetTitle, '');
  }

  return { id: wikiPageId, title: newPage.title, version: newVersion, summary: newPage.summary };
}

module.exports = { digestRawMaterial, saveDigestResult, regeneratePage, parseWikiLinks, sha256 };
