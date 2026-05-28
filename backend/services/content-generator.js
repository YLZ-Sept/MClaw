// AI content generator — Node.js port of content_generator.py
const { chat, parseJSON } = require('./llm');

const CONTENT_PROMPT = `你是一个抖音爆款短视频策划专家，擅长打造高播放、高互动、高转化的爆款文案。

根据以下产品信息，运用「黄金3秒开钩 + 痛点共鸣 + 解决方案 + 行动指令」的爆款公式，生成一个抖音短视频文案脚本。

产品品牌：{brand_name}
产品描述：{description}
核心卖点：{selling_points}
目标受众：{target_audience}
行业标签：{industry_tags}
{user_requirements}

爆款要求：
1. 标题：前3秒抓眼球，用反常识/痛点/数字/悬念（≤30字）
2. 文案脚本：口播台词 + 画面建议，强调情绪钩子和价值锚点（200字以内）
3. 话题标签：5个抖音热门标签，蹭热点+精准流量，英文逗号分隔（不要#号）

请以JSON格式输出：
{"title": "标题", "body": "文案脚本", "tags": "标签1,标签2,标签3,标签4,标签5"}`;

async function generateContent(product, userPrompt) {
  const userReq = userPrompt && userPrompt.trim() ? `额外创作要求：${userPrompt.trim()}` : '';
  const prompt = CONTENT_PROMPT
    .replace('{brand_name}', product.brand_name || '')
    .replace('{description}', product.description || '')
    .replace('{selling_points}', product.selling_points || '')
    .replace('{target_audience}', product.target_audience || '中小企业主')
    .replace('{industry_tags}', product.industry_tags || '')
    .replace('{user_requirements}', userReq);

  const response = await chat([
    { role: 'system', content: '你是一个专业的抖音内容策划师。只输出有效JSON，不输出其他内容。' },
    { role: 'user', content: prompt }
  ], 0.8);

  return parseJSON(response);
}

module.exports = { generateContent };
