// Video prompt builder — Node.js port of video_prompt.py
const { chat, parseJSON } = require('./llm');

const VIDEO_PROMPT_TEMPLATE = `你是一个专业的 AI 视频导演。根据以下抖音文案，生成两个英文 prompt：

文案标题：{title}
文案内容：{body}

要求：
1. **image_prompt**：适合 FLUX 生成高质量竖屏画面的描述（场景、构图、色调、光影、氛围）。
   - 必须是英文
   - 描述要具体：主体是什么、在什么环境、什么光线、什么色彩风格
   - 适合抖音竖屏 9:16 构图
   - 不要出现文字/logo
   - 控制在 100 词以内

2. **motion_prompt**：适合 Wan 2.5 图生视频的运镜描述（相机运动 + 主体运动 + 氛围变化）。
   - 必须是英文
   - 运动要微妙自然（subtle > dramatic），避免大幅运动导致画面扭曲
   - 典型写法："gentle camera pan right, subtle motion in [subject], soft lighting shift, peaceful atmosphere"
   - 控制在 50 词以内

请以 JSON 格式输出：
{"image_prompt": "...", "motion_prompt": "..."}`;

const KLING_PROMPT_TEMPLATE = `你是一个专业的抖音短视频导演。根据以下文案，生成一个适合 Kling（可灵）AI 文生视频的画面描述 prompt。

文案标题：{title}
文案内容：{body}

要求：
1. 输出一个中文 prompt，描述视频画面内容
2. 包含：场景设定、主体动作、镜头语言、光影色调、整体氛围
3. 适合竖屏 9:16 构图
4. 描述要具体形象，让 AI 能准确理解画面
5. 不要出现文字、logo、字幕相关内容
6. 控制在 200 字以内
7. 风格参考：电影质感、柔和光线、自然运镜

请以 JSON 格式输出：
{"video_prompt": "画面描述内容"}`;

async function buildVisualPrompt(title, body) {
  const prompt = VIDEO_PROMPT_TEMPLATE.replace('{title}', title).replace('{body}', body);
  const response = await chat([
    { role: 'system', content: '你是一个专业的 AI 视频导演。只输出有效 JSON，不输出其他内容。' },
    { role: 'user', content: prompt }
  ], 0.7);
  return parseJSON(response);
}

async function buildKlingPrompt(title, body) {
  const prompt = KLING_PROMPT_TEMPLATE.replace('{title}', title).replace('{body}', body);
  const response = await chat([
    { role: 'system', content: '你是一个专业的抖音短视频导演。只输出有效 JSON，不输出其他内容。' },
    { role: 'user', content: prompt }
  ], 0.7);
  const data = parseJSON(response);
  return data.video_prompt;
}

module.exports = { buildVisualPrompt, buildKlingPrompt };
