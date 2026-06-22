// 中文分词 + 词频统计，用于词云图
// 复用 vector-search.js 的 tokenize 逻辑

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '他', '她', '它', '们', '那', '些', '什么', '怎么', '哪', '吗',
  '啊', '哦', '嗯', '吧', '呢', '可以', '这个', '那个', '还', '让', '被', '把',
  '但', '却', '只', '太', '又', '更', '所以', '因为', '如果', '虽然', '然后',
  '能', '做', '想', '知道', '觉得', '应该', '真', '比较', '非常', '特别', '多',
  '少', '已经', '再', '还是', '跟', '对', '从', '以', '中', '与', '或', '等',
  '之', '为', '所', '而', '及', '其', '将', '向', '已', '该', '则', '各', '并',
  '得', '地', '的', '着', '了', '过', '啊', '呢', '吧', '嘛', '呀', '哦',
]);

function tokenize(text) {
  const cleaned = (text || '').replace(/[，,。.！!？?、；;：:（）()【】\[\]""''\s\r\n\d]+/g, '');
  const toks = [];
  for (let len = 2; len <= 3; len++) {
    for (let i = 0; i <= cleaned.length - len; i++) {
      const w = cleaned.substring(i, i + len);
      if (!STOP_WORDS.has(w)) toks.push(w);
    }
  }
  return toks;
}

function wordFreq(texts) {
  const freq = new Map();
  for (const text of texts) {
    for (const tok of tokenize(text)) {
      freq.set(tok, (freq.get(tok) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 200);
}

module.exports = { wordFreq, tokenize };
