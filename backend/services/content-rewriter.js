// 短视频/带货爆款文案改写 — 三版本自然文本输出
const { chat } = require('./llm');

const SYSTEM_PROMPT = `你是千万粉丝爆款文案操盘手，专攻短视频带货文案改写。

## 改写硬性要求
1. 完整保留产品卖点、价格、福利、痛点、引导行动，核心信息一字不漏；
2. 开头3秒抓眼球，前置痛点/福利/反差，多用短句、反问、口语化对话感；
3. 弱化生硬广告感，用用户视角叙事，增强代入感；
4. 不要使用任何Markdown标记，纯文本输出。`;

const VERSION_LABELS = {
  '口播版': '短平快口播版：口语对话感强，节奏快，短句密集、钩子前置、情绪饱满',
  '种草版': '走心种草版：用户视角叙事，真实体验分享感，细腻有代入感，适合小红书图文',
  '促单版': '强转化促单版：促销节奏感强，有明确行动指令和紧迫感，适合直播脚本',
};

function buildUserPrompt({ source_body, versions, remove_ai_trace, word_limit, user_prompt }) {
  const selected = versions && versions.length ? versions : ['口播版', '种草版', '促单版'];

  const specs = selected.map(k => `- ${k}：${VERSION_LABELS[k]}`).join('\n');

  const parts = [
    `## 输出版本要求\n${specs}`,
    `\n## 输出格式\n严格按以下格式输出，每个版本以【版本名】作为独立标题，文案正文另起一行：\n${selected.map(k => `【${k}】\n<文案正文>`).join('\n\n')}`,
  ];

  if (remove_ai_trace) {
    parts.push(`\n## 进阶要求：去AI痕迹\n全程使用人类真实写作语感，减少排比堆砌、标准化模板句，增加细微生活化表达，避免统一工整句式，模拟真人手写，看不出AI生成痕迹。`);
  }

  if (word_limit && word_limit > 0) {
    parts.push(`\n## 进阶要求：控制字数\n严格控制每个版本总字数在${word_limit}字以内，重点信息不丢失，压缩冗余修饰，语句紧凑。`);
  }

  if (user_prompt && user_prompt.trim()) {
    parts.push(`\n## 额外改写要求\n${user_prompt.trim()}`);
  }

  parts.push(`\n## 原文\n${source_body || ''}`);

  return parts.join('\n');
}

function parseResult(text, versions) {
  const result = {};
  for (const v of versions) {
    // Match 【版本名】\n...content... until next 【 or end
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`【${escaped}】\\s*\\n([\\s\\S]*?)(?=\\n【[^】]+】|$)`, 'i');
    const match = text.match(regex);
    if (match) {
      result[v] = match[1].trim();
    }
  }
  return result;
}

async function rewriteContent({ source_body, versions, remove_ai_trace, word_limit, user_prompt }) {
  const selectedVersions = versions && versions.length ? versions : ['口播版', '种草版', '促单版'];

  const userMsg = buildUserPrompt({ source_body, versions: selectedVersions, remove_ai_trace, word_limit, user_prompt });

  const response = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg }
  ], 0.75);

  console.log('[rewrite] raw response length:', response.length);
  console.log('[rewrite] raw preview:', response.slice(0, 200));

  const result = parseResult(response, selectedVersions);

  // Fallback: if parsing failed, put raw text in first version
  if (!Object.keys(result).length) {
    console.log('[rewrite] parseResult returned empty, using raw response');
    result[selectedVersions[0]] = response.trim();
  }

  return result;
}

module.exports = { rewriteContent };
