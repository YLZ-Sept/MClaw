// Shared LLM utility for hot-video services
const { getActiveConfig } = require('../routes/model-configs');

async function chat(messages, temperature = 0.7) {
  const config = getActiveConfig();
  if (!config) throw new Error('没有可用的模型配置');
  const res = await fetch(`${config.api_base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
    body: JSON.stringify({ model: config.model, messages, temperature, max_tokens: 4096 })
  });
  if (!res.ok) { const err = await res.text().catch(() => ''); throw new Error(`LLM ${res.status}: ${err.slice(0, 300)}`); }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseJSON(response) {
  let text = response.trim();
  // Strip markdown code fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // Try to find a JSON object in the response
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) text = objMatch[0];
  try {
    return JSON.parse(text);
  } catch {
    // Retry with escaped newlines if needed
    try {
      return JSON.parse(text.replace(/\n/g, '\\n'));
    } catch {
      throw new Error('AI返回格式异常，请重试');
    }
  }
}

module.exports = { chat, parseJSON };
