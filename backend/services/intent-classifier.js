// Intent classifier — Node.js port of intent_classifier.py
const { chat } = require('./llm');

const CLASSIFY_PROMPT = `分析以下抖音用户消息的意图，归类为以下之一：
- inquiry：询价、咨询产品、问联系方式（用户想购买或了解价格）
- consult：一般咨询、问功能、问使用方法
- complaint：投诉、负面反馈、不满
- invalid：无关内容、垃圾信息、无意义内容

用户消息："{text}"

只输出意图类型（inquiry/consult/complaint/invalid），不要输出其他内容。`;

async function classifyIntent(text) {
  const response = await chat([
    { role: 'system', content: '你是一个客服意图分类助手，只输出intent标签。' },
    { role: 'user', content: CLASSIFY_PROMPT.replace('{text}', text) }
  ], 0.1);
  const intent = response.trim().toLowerCase();
  const valid = new Set(['inquiry', 'consult', 'complaint', 'invalid']);
  return valid.has(intent) ? intent : 'invalid';
}

module.exports = { classifyIntent };
