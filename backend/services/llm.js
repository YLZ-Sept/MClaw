// Shared LLM utility for hot-video services
const { getActiveConfig } = require('../routes/model-configs');

async function chat(messages, temperature = 0.7) {
  const config = getActiveConfig();
  if (!config) throw new Error('没有可用的模型配置');
  const res = await fetch(`${config.api_base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
    body: JSON.stringify({ model: config.model, messages, temperature, max_tokens: 1024 })
  });
  if (!res.ok) { const err = await res.text().catch(() => ''); throw new Error(`LLM ${res.status}: ${err.slice(0, 300)}`); }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseJSON(response) {
  let text = response.trim();
  if (text.startsWith('```')) {
    const lines = text.split('\n');
    text = lines.slice(1, lines[lines.length - 1].startsWith('```') ? -1 : lines.length).join('\n');
  }
  return JSON.parse(text);
}

module.exports = { chat, parseJSON };
