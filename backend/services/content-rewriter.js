// AI content rewriter — Node.js port of content_rewriter.py
const { chat, parseJSON } = require('./llm');

const REWRITE_PROMPT = `你是一个抖音爆款文案二次改写专家。你的核心方法论：

**保留爆款情绪 + 换掉全部句式 + 调换叙事顺序 + 换场景换人群 + 微调痛点卖点**
不换内核，只换皮囊，流量属性不变，原创度拉满。

---

## 改写流程

### 第一步：拆骨架
先提炼原文的3样东西：
- 核心情绪：治愈 / 扎心 / 逆袭 / 省钱 / 共鸣 / 愤怒 / 搞笑
- 核心痛点：用户最怕什么、最想要什么
- 核心结论：最后传递什么观点

### 第二步：换叙事结构
原顺序打乱重排，选一种：
- 先结论后故事
- 先反问再共情
- 先吐槽再安抚
- 先现状再对比

### 第三步：替换词汇体系
- 口语换文艺 / 温柔换犀利
- 网络热词换通俗大白话
- 短句拉长句，长句缩短句
- 人称互换：你→我→我们→过来人

### 第四步：更换场景与人群
- 原文案人群换成另一群人（职场人→宝妈/学生/创业者）
- 原场景换成另一场景（上班→居家/交友/消费/生活）

### 第五步：微调观点，不颠覆内核
同款道理，换角度说：
- 正向说→反向说
- 直白说→隐喻说
- 说教说→亲身经历说

---

## 三种改写模板（根据原文类型自动匹配）

### 情感共鸣类
**反问引入 → 现实现状 → 温柔劝解 → 自我释怀收尾**

### 干货种草类
**踩坑痛点 → 对比差距 → 精简步骤 → 落地结果**

### 人间清醒扎心类
**亲身经历开头 → 落差感悟 → 现实真相 → 清醒忠告**

---

## 避坑原则
1. **绝对不动核心情绪**，一改就没流量
2. 不删减黄金痛点句子，只换表达方式
3. 开头3秒钩子必须保留，换话术不换吸引力
4. 结尾升华句重新造句，寓意一致即可

---

## 极速改写公式
**旧钩子 + 新台词 + 同痛点 + 新叙事 + 同三观 + 新结尾**

---

## 输入
- 原文标题：{source_title}
- 原文正文：{source_body}
- 原文标签：{source_tags}
- 来源平台：{source_platform}
{user_requirements}

## 输出要求
1. 标题：前3秒抓眼球，用反常识/痛点/数字/悬念（≤30字）
2. 文案：纯文案正文，复刻原爆款的结构节奏（200字以内）
3. 话题标签：5个抖音热门标签，英文逗号分隔（不要#号）

请严格以JSON格式输出：
{"title": "标题", "body": "文案正文", "tags": "标签1,标签2,标签3,标签4,标签5"}`;

async function rewriteContent(source, userPrompt) {
  const userReq = userPrompt && userPrompt.trim() ? `额外改写要求：${userPrompt.trim()}` : '';
  const prompt = REWRITE_PROMPT
    .replace('{source_title}', source.title || '')
    .replace('{source_body}', source.body || '')
    .replace('{source_tags}', source.tags || '')
    .replace('{source_platform}', source.platform || 'other')
    .replace('{user_requirements}', userReq);

  const response = await chat([
    { role: 'system', content: '你是一个专业的抖音爆款文案改写专家。严格遵循5步改写流程，只输出有效JSON，不输出其他内容。' },
    { role: 'user', content: prompt }
  ], 0.85);

  return parseJSON(response);
}

module.exports = { rewriteContent };
