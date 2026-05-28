// Lead detector — Node.js port of lead_detector.py
const { chat, parseJSON } = require('./llm');

const LEAD_PROMPT = `判断以下对话是否是一个高意向销售线索。高意向标准：
- 用户明确询问价格、购买方式、联系方式
- 用户留下了手机号、微信号、邮箱等联系方式
- 用户表达了明确的购买意向

用户消息："{text}"
AI回复："{reply}"
产品行业：{industry}

请以JSON格式输出：
{"is_lead": true/false, "summary": "线索摘要，包括用户需求和意向级别的简短描述", "contact": "如果用户消息中包含联系方式则提取，否则为空字符串"}`;

async function detectLead(text, reply, industry) {
  const prompt = LEAD_PROMPT
    .replace('{text}', text)
    .replace('{reply}', reply)
    .replace('{industry}', industry || '');

  const response = await chat([
    { role: 'system', content: '你是一个销售线索识别助手。只输出有效JSON。' },
    { role: 'user', content: prompt }
  ], 0.2);

  return parseJSON(response);
}

module.exports = { detectLead };
