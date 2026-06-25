// 短视频/带货爆款文案改写 — 提取+改写两阶段，三版本输出（标题+正文+标签）
const { chat } = require('./llm');

const EXTRACT_PROMPT = `你是爆款文案信息提取专家。从原文中提取以下结构化信息，只输出JSON，不输出其他内容：

{
  "product_name": "产品/品牌名称",
  "price": "价格（如有）",
  "selling_points": "核心卖点，逗号分隔",
  "pain_points": "用户痛点，逗号分隔",
  "discount": "优惠/福利（如有）",
  "cta": "行动指令（如有）"
}

严格规则：
- 原文没有的字段填空字符串 ""
- 不编造、不推理、不做任何改写
- 只输出一个合法JSON对象`;

const SYSTEM_PROMPT = `你是千万粉丝爆款文案操盘手，专攻短视频带货文案改写。

## 改写硬性要求
1. 完整保留产品名、价格、卖点、福利、痛点、行动指令，核心信息一字不改；
2. 开头3秒抓眼球，前置痛点/福利/反差，多用短句、反问、口语化对话感；
3. 弱化生硬广告感，用用户视角叙事，增强代入感。

## 输出格式（严格遵守）
每个版本用 <version name="名称"> 包裹，内部用 <title> <body> <tags> 标签：

<version name="口播版">
<title>15字以内，钩子前置</title>
<body>口播台词正文</body>
<tags>tag1, tag2, tag3, tag4, tag5</tags>
</version>

<version name="种草版">
<title>小红书风格标题</title>
<body>走心种草正文</body>
<tags>tag1, tag2, tag3, tag4, tag5</tags>
</version>

<version name="促单版">
<title>促销转化标题</title>
<body>促单脚本正文</body>
<tags>tag1, tag2, tag3, tag4, tag5</tags>
</version>

## 参考示例

原文：
"还在为厨房收纳头疼吗？这款多功能置物架就是你的救星！三层大容量设计，锅碗瓢盆随便放，承重50斤稳稳当当。免打孔安装不伤墙面，碳钢材质防锈耐用。原价99今天只要39.9，买就送挂钩5件套，限量500单赶紧冲！"

关键信息：
- 产品：多功能厨房置物架
- 价格：原价99，活动价39.9
- 卖点：三层大容量、承重50斤、免打孔、碳钢防锈
- 痛点：厨房收纳乱、打孔伤墙
- 福利：买就送挂钩5件套，限量500单

<version name="口播版">
<title>厨房乱得像垃圾场？39.9搞定！</title>
<body>你家厨房是不是也这样？锅碗瓢盆堆一地，想找个东西翻半天。今天我挖到一个宝藏置物架，三层大空间，锅碗瓢盆随便放，50斤重物放上去纹丝不动！关键免打孔，女生徒手就能装，不伤墙面！碳钢材质防锈耐用，用个三五年跟新的一样。原价99今天只要39.9，还送5个挂钩，限量500单，手慢无，左下角赶紧的！</body>
<tags>厨房收纳, 置物架, 厨房神器, 收纳好物, 家居好物</tags>
</version>

<version name="种草版">
<title>租房党福音｜39.9拯救了我的5平米小厨房</title>
<body>姐妹们谁懂啊！租房厨房台面小到连砧板都放不下，锅碗瓢盆堆得跟杂物间一样。上个月跟风入了这个置物架，真的绝了姐妹们！三层设计，一层放锅、一层放调料、一层放碗碟，整个厨房瞬间清爽了！安装巨简单，免打孔卡扣直接扣上去就行，我一个手残党5分钟装好。碳钢材质用了一个月没生锈，承重50斤，我放了铸铁锅都稳稳的。原价99现在39.9还送挂钩5件套，冲就完了！</body>
<tags>租房改造, 厨房收纳, 租房好物, 收纳神器, 小厨房改造</tags>
</version>

<version name="促单版">
<title>最后500单！39.9抢99元厨房置物架</title>
<body>停下手上的活听我说！你家厨房是不是乱到不想做饭？今天就帮你解决！这款三层多功能置物架，原价99块，今天直接打到39.9！三层大容量、50斤承重、免打孔不伤墙、碳钢防锈，买就送5个挂钩！就500单，卖完恢复原价！姐妹们想清楚，39.9你买不了吃亏买不了上当，但错过这波就真没了！左下角现在下单，还来得及！</body>
<tags>限时优惠, 厨房神器, 必买清单, 性价比好物, 收纳架</tags>
</version>

## 注意事项
- 标签5个，精准匹配内容主题，不带#号
- 标题必须根据版本风格独立创作，不可共用
- 正文完整保留价格、福利、限量等关键信息
- 正文中禁止出现任何括号内的表演指导，如（语气急促）（语速加快）（停顿一下）等，这是纯文案输出，不是脚本`;

function buildUserPrompt({ source_body, versions, remove_ai_trace, word_limit, user_prompt }, extracted) {
  const selected = versions && versions.length ? versions : ['口播版', '种草版', '促单版'];

  const parts = [];

  // 附加提取的结构化信息
  if (extracted) {
    const lines = [];
    if (extracted.product_name) lines.push(`- 产品：${extracted.product_name}`);
    if (extracted.price) lines.push(`- 价格：${extracted.price}`);
    if (extracted.selling_points) lines.push(`- 核心卖点：${extracted.selling_points}`);
    if (extracted.pain_points) lines.push(`- 用户痛点：${extracted.pain_points}`);
    if (extracted.discount) lines.push(`- 优惠/福利：${extracted.discount}`);
    if (extracted.cta) lines.push(`- 行动指令：${extracted.cta}`);
    if (lines.length) {
      parts.push(`## 关键信息（必须完整保留）\n${lines.join('\n')}`);
    }
  }

  parts.push(`## 输出版本\n输出以下${selected.length}个版本：${selected.join('、')}`);

  if (remove_ai_trace) {
    parts.push(`\n## 去AI痕迹\n全程使用人类真实写作语感，减少排比堆砌，模拟真人手写，看不出AI生成痕迹。`);
  }

  if (word_limit && word_limit > 0) {
    parts.push(`\n## 控制字数\n每个版本正文控制在${word_limit}字以内，信息不丢，语句紧凑。`);
  }

  if (user_prompt && user_prompt.trim()) {
    parts.push(`\n## 额外要求\n${user_prompt.trim()}`);
  }

  parts.push(`\n## 原文\n${source_body || ''}`);

  return parts.join('\n');
}

function parseResult(text, versions) {
  const result = {};
  for (const v of versions) {
    const entry = {};
    // Match <version name="v">...</version>
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockRegex = new RegExp(
      `<version\\s+name=["']${escaped}["']\\s*>([\\s\\S]*?)</version>`,
      'i'
    );
    const blockMatch = text.match(blockRegex);
    if (!blockMatch) continue;

    const block = blockMatch[1];

    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) entry.title = titleMatch[1].trim();

    const bodyMatch = block.match(/<body>([\s\S]*?)<\/body>/i);
    if (bodyMatch) entry.body = bodyMatch[1].trim();

    const tagsMatch = block.match(/<tags>([\s\S]*?)<\/tags>/i);
    if (tagsMatch) entry.tags = tagsMatch[1].trim();

    if (entry.body) {
      result[v] = entry;
    }
  }
  return result;
}

async function extractKeyInfo(source_body) {
  const response = await chat([
    { role: 'system', content: EXTRACT_PROMPT },
    { role: 'user', content: source_body }
  ], 0.3);
  try {
    const cleaned = response.trim()
      .replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned);
  } catch (e) {
    console.log('[rewrite] extractKeyInfo parse failed, proceeding without extraction');
    return null;
  }
}

async function rewriteContent({ source_body, versions, remove_ai_trace, word_limit, user_prompt }) {
  const selectedVersions = versions && versions.length ? versions : ['口播版', '种草版', '促单版'];

  // Stage 1: extract key info (low temperature)
  const extracted = await extractKeyInfo(source_body);
  console.log('[rewrite] extracted:', extracted ? Object.keys(extracted).filter(k => extracted[k]) : 'null');

  // Stage 2: rewrite with extracted info
  const userMsg = buildUserPrompt(
    { source_body, versions: selectedVersions, remove_ai_trace, word_limit, user_prompt },
    extracted
  );

  const response = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMsg }
  ], 0.7);

  console.log('[rewrite] raw response length:', response.length);
  console.log('[rewrite] raw preview:', response.slice(0, 200));

  const result = parseResult(response, selectedVersions);

  if (!Object.keys(result).length) {
    console.log('[rewrite] parseResult returned empty, using raw response in first version');
    result[selectedVersions[0]] = { body: response.trim(), title: '', tags: '' };
  }

  return result;
}

module.exports = { rewriteContent };
