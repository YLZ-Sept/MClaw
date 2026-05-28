// Auto-reply generator — Node.js port of auto_reply.py
const { chat } = require('./llm');

const REPLY_PROMPTS = {
  inquiry: `你是一个热情专业的销售客服。根据以下产品信息回复一位正在询价的用户。

产品：{brand_name}
描述：{description}
联系方式：{contact_info}

用户消息："{text}"

要求：
1. 回复热情专业，介绍产品核心卖点
2. 引导用户留下联系方式，或直接提供联系方式
3. 不超过100字`,

  consult: `你是一个专业的客服人员。根据以下产品信息回复一位咨询问题的用户。

产品：{brand_name}
描述：{description}

用户消息："{text}"

要求：
1. 直接回答用户问题
2. 如果问题超出知识范围，引导联系人工客服
3. 不超过100字`,

  complaint: `你是一个专业的客服人员。用户表达了不满，请回复安抚并解决问题。

用户消息："{text}"

要求：
1. 表示理解和歉意
2. 承诺尽快处理并提供联系方式
3. 不超过80字`
};

async function generateReply(text, intent, product) {
  if (intent === 'invalid') return '';

  const template = REPLY_PROMPTS[intent];
  if (!template) return '感谢您的留言，我们会尽快回复您。';

  const prompt = template
    .replace('{text}', text)
    .replace('{brand_name}', product.brand_name || '')
    .replace('{description}', product.description || '')
    .replace('{contact_info}', product.contact_info || '');

  const response = await chat([
    { role: 'system', content: '你是一个专业客服。回复直接、有用、不废话。' },
    { role: 'user', content: prompt }
  ], 0.7);

  return response.trim();
}

module.exports = { generateReply };
