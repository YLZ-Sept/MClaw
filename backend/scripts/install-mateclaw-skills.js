// 一键安装 mateclaw 专家 Agent 引用的全部 OpenClaw 技能
// 用法: node scripts/install-mateclaw-skills.js

const wsClient = require('../openclaw/ws-client');
const db = require('../db');
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(require('os').homedir(), '.openclaw', 'workspace', 'skills');

// 专家 Agent 引用的 29 个技能 → ClawHub slug 映射（未映射的留在本地手动创建）
const SKILL_CLUBHUB_MAP = {
  'code-review': null,           // 本地创建（代码审查专用提示词）
  'comment-analyze': null,       // 本地创建（评论分析）
  'docx-read': null,             // 本地创建（Word 读取，已有后端实现）
  'excel-analysis': 'ws-excel',  // ClawHub: Excel 操作
  'excel-write': 'ws-excel',     // 同一技能
  'file-sort': null,             // 本地创建（文件批量整理）
  'finance-report-calc': null,   // 本地创建（财务报表计算）
  'fund-data-fetch': null,       // 本地创建（基金数据抓取）
  'git-helper': 'git-tools',     // ClawHub: Git 工具集
  'hot-news-digest': null,       // 本地创建（热点新闻摘要）
  'image-prompt': null,          // 本地创建（图片提示词生成）
  'law-search': null,            // 本地创建（法规检索）
  'list-files': null,            // 本地创建（文件列表扫描）
  'log-parse': null,             // 本地创建（日志解析）
  'memory-save': null,           // 本地创建（记忆保存，已有后端实现）
  'pdf-extract': 'pdf-reader',   // ClawHub: PDF 读取
  'ppt-generate': null,          // 本地创建（PPT 生成，已有后端实现）
  'read-file': null,             // 本地创建（通用文件读取）
  'report-generate': null,       // 本地创建（报告生成，已有后端实现）
  'run-script': 'shell-executor', // ClawHub: Shell 执行
  'server-healthcheck': null,    // 本地创建（服务器巡检）
  'short-video-script': null,    // 本地创建（短视频脚本）
  'social-copy-writer': null,    // 本地创建（社媒文案）
  'supply-chain-analyze': null,  // 本地创建（供应链分析）
  'web-fetch': 'browser-automation', // ClawHub: 浏览器自动化（含网页抓取）
  'web-search': 'web-search',    // ClawHub: 网页搜索（MClaw 插件已有）
  'word-write': null,            // 本地创建（Word 写入，已有后端实现）
  'write-file': null,            // 本地创建（通用文件写入）
  'xlsx-parse': 'ws-excel',      // ClawHub: Excel 操作
};

// 本地技能模板（SKILL.md 内容）
function getLocalSkillMD(skillName) {
  const templates = {
    'code-review': {
      name: '代码审查',
      description: '安全漏洞检测、性能问题识别与优化方案。审查意见分行号描述，区分严重/中/低风险等级。',
      body: `# 代码审查技能

## 功能
对提交的代码进行安全审查、性能分析和规范检查。

## 使用方式
1. 使用 read_file 读取目标代码文件
2. 逐行分析代码逻辑
3. 按严重程度分类输出：
   - 🔴 严重：安全漏洞、数据泄露风险
   - 🟡 中等：性能问题、潜在 Bug
   - 🟢 低：代码风格、命名规范

## 输出格式
\`\`\`
文件: <路径>
行号: <行号>
级别: <严重/中/低>
问题: <描述>
建议: <修改方案>
\`\`\``,
    },
    'comment-analyze': {
      name: '评论分析',
      description: '评论情感分类、标准化回复与负面预警。区分好评/差评/中性评论。',
      body: `# 评论情感分析

## 功能
批量分析用户评论，按情感分类并生成标准化回复。

## 分类标准
- 😊 好评：推荐、感谢、满意
- 😐 中性：咨询、建议
- 😡 差评：投诉、退费、不满

## 输出
每类评论生成对应的回复模板，标记需人工处理的负面评论。`,
    },
    'docx-read': {
      name: 'Word 文档读取',
      description: '读取 .docx 文件内容，提取文本和表格数据。',
      body: `# Word 文档读取

## 功能
解析 .docx 格式的 Word 文档，提取正文内容、表格数据和元信息。

## 使用方式
调用 MClaw 后端的 docx 解析服务读取文件内容。
文件路径支持绝对路径和工作区相对路径。`,
    },
    'file-sort': {
      name: '文件批量整理',
      description: '批量重命名、分类归档与文件目录清单生成。按日期/业务类型自动分类。',
      body: `# 文件批量整理

## 功能
- 遍历指定目录，按规则批量重命名
- 按文件类型/日期自动归档
- 生成文件目录清单

## 使用方式
1. list-files 扫描目录
2. 按规则匹配文件名
3. write-file 输出整理结果清单`,
    },
    'finance-report-calc': {
      name: '财务报表计算',
      description: '财务报表解读、盈利指标计算与异动标注。读报表，算基础盈利指标。',
      body: `# 财务报表计算

## 功能
- 读取 Excel 格式的财务报表
- 计算基础盈利指标：毛利率、净利率、ROE、ROA
- 标注数据异动（同比/环比超过 20%）

## 使用方式
1. xlsx-parse 读取报表数据
2. 按公式计算各指标
3. excel-write 输出分析结果表`,
    },
    'fund-data-fetch': {
      name: '基金数据抓取',
      description: '基金净值/持仓抓取与客观数据整理。仅客观数据，不做买入推荐。',
      body: `# 基金数据抓取

## 功能
联网抓取公开基金数据：净值走势、持仓明细、基金经理信息。

## 使用方式
1. web-search 搜索基金代码
2. web-fetch 抓取详情页
3. excel-write 汇总数据表`,
    },
    'hot-news-digest': {
      name: '热点新闻摘要',
      description: '行业热点抓取、热度分级与选题策划。每日抓取全网行业热点。',
      body: `# 热点新闻摘要

## 功能
抓取全网热点内容，按行业分类，热度分级，输出选题建议。

## 输出格式
| 标题 | 热度 | 行业 | 选题建议 |
`,
    },
    'image-prompt': {
      name: '图片提示词生成',
      description: 'AI 图片生成提示词撰写，适配 Midjourney/Stable Diffusion/DALL-E。',
      body: `# 图片提示词生成

## 功能
根据需求描述生成高质量的 AI 图片提示词。

## 输出格式
\`\`\`
主题: <核心主题>
风格: <艺术风格>
构图: <画面描述>
提示词: <英文 prompt>
参数: <推荐参数>
\`\`\``,
    },
    'law-search': {
      name: '法规检索',
      description: '法律法规检索，按关键词/领域搜索现行有效法规条款。',
      body: `# 法规检索

## 功能
搜索现行有效的法律法规，提取相关条款内容。

## 使用方式
1. web-search 搜索法规关键词
2. web-fetch 抓取法规全文
3. 提取相关条款并标注施行日期`,
    },
    'list-files': {
      name: '文件列表扫描',
      description: '扫描本地目录，列出文件名、大小、修改时间。支持递归和过滤。',
      body: `# 文件列表扫描

## 功能
扫描指定目录，生成文件清单。支持：
- 递归子目录
- 按扩展名过滤
- 按时间范围过滤`,
    },
    'log-parse': {
      name: '日志解析',
      description: '异常堆栈过滤、根因定位与修复步骤。过滤日志报错堆栈。',
      body: `# 日志解析

## 功能
- 读取日志文件，过滤异常/错误行
- 识别堆栈跟踪
- 归类错误类型（超时、内存、连接、权限）

## 使用方式
1. read-file 读取日志文件
2. 按关键词过滤：ERROR, FATAL, Exception, timeout
3. 输出分类汇总`,
    },
    'memory-save': {
      name: '记忆保存',
      description: '将重要信息保存到持久记忆，后续对话可自动调用。',
      body: `# 记忆保存

## 功能
将对话中的重要信息保存为长期记忆：
- 用户偏好、习惯
- 业务上下文、项目信息
- 决策记录、待办事项

## 使用方式
调用后端的 memory-save 功能自动存储。`,
    },
    'ppt-generate': {
      name: 'PPT 生成',
      description: '幻灯片自动分页、商务模板与图文排版。支持 Markdown 转 PPT。',
      body: `# PPT 生成

## 功能
根据 Markdown 大纲自动生成 PPT 幻灯片：
- 自动分页（# 标题 → 新页面）
- 商务模板排版
- 表格和图表插入

## 使用方式
提供 Markdown 格式的大纲，调用后端的 ppt-generate 工具生成。`,
    },
    'read-file': {
      name: '通用文件读取',
      description: '读取文本文件、代码文件、配置文件内容。支持大文件分页。',
      body: `# 文件读取

## 功能
读取本地文件内容，支持多种格式：
- 纯文本、代码、配置文件
- 大文件自动分页（500行/页）`,
    },
    'report-generate': {
      name: '报告生成',
      description: '工作汇报结构优化、数据填充与专业话术。标准化周报/月报生成。',
      body: `# 报告生成

## 功能
根据数据自动生成标准化报告：
- 周报/月报：完成事项、存在问题、下周计划
- 分析报告：背景、数据、结论、建议

## 使用方式
提供关键数据和要点，调用后端 report-generator 服务自动排版。`,
    },
    'server-healthcheck': {
      name: '服务器巡检',
      description: '资源负载检测、风险识别与巡检报告。CPU/内存/磁盘/服务状态。',
      body: `# 服务器巡检

## 功能
执行服务器健康巡检：
- CPU 负载、内存使用率
- 磁盘空间、I/O 状态
- 关键服务运行状态

## 使用方式
调用后端的 server-healthcheck 工具执行巡检并生成报告。`,
    },
    'short-video-script': {
      name: '短视频脚本',
      description: '分镜脚本、口播文案与平台适配。15s/60s 短视频脚本模板。',
      body: `# 短视频脚本

## 功能
生成短视频分镜脚本表格：
| 镜头 | 时长 | 画面 | 台词 | BGM | 字幕 |

## 平台适配
- 抖音：竖屏 9:16，快节奏
- B站：横屏 16:9，内容深度`,
    },
    'social-copy-writer': {
      name: '社媒文案',
      description: '多平台社媒文案撰写：小红书、公众号、朋友圈。适配多风格。',
      body: `# 社媒文案

## 功能
撰写适配各社交平台的营销文案：
- 小红书：种草体、测评体
- 公众号：深度长文
- 朋友圈：短文案+配图建议`,
    },
    'supply-chain-analyze': {
      name: '供应链分析',
      description: '供应商报价对比、比价分析与最优方案筛选。多维度评估。',
      body: `# 供应链分析

## 功能
- 供应商报价汇总对比
- 单价/账期/售后多维度评分
- 最优方案推荐

## 使用方式
1. xlsx-parse 读取报价单
2. 统一单位，计算综合得分
3. excel-write 输出对比表`,
    },
    'word-write': {
      name: 'Word 文档写入',
      description: '生成 .docx 格式的 Word 文档。支持文本、表格、图片。',
      body: `# Word 文档生成

## 功能
生成标准格式的 Word 文档：
- 标题层级、页眉页脚
- 表格数据填充
- 商务排版模板

## 使用方式
提供 Markdown 内容和格式要求，调用后端 docx-generator 服务生成。`,
    },
    'write-file': {
      name: '文件写入',
      description: '写入文本内容到本地文件。支持创建、追加、覆盖模式。',
      body: `# 文件写入

## 功能
将文本内容写入本地文件：
- 创建新文件
- 追加到已有文件
- 覆盖已有文件

## 使用方式
指定文件路径和内容，调用后端文件写入服务。`,
    },
    'excel-analysis': {
      name: 'Excel 数据分析',
      description: '表格清洗、函数公式、透视表与图表生成。配合 ws-excel ClawHub 技能使用。',
      body: `# Excel 数据分析

## 功能
引用 ws-excel 技能进行 Excel 数据处理：
- 数据清洗、去重
- 透视表、图表生成
- 函数公式编写`,
    },
    'excel-write': {
      name: 'Excel 写入',
      description: '生成 .xlsx 文件。创建带格式的电子表格。配合 ws-excel ClawHub 技能使用。',
      body: `# Excel 写入

## 功能
引用 ws-excel 技能生成 Excel 文件：
- 多 Sheet 工作簿
- 单元格格式、条件格式
- 公式自动计算`,
    },
    'git-helper': {
      name: 'Git 版本管理',
      description: '提交记录梳理、冲突解决与分支管理规范。常用 Git 操作辅助。',
      body: `# Git 辅助工具

## 功能
- 查看提交历史和差异
- 分支创建、切换、合并
- 冲突解决建议
- 生成规范的 commit message`,
    },
    'pdf-extract': {
      name: 'PDF 解析提取',
      description: 'PDF 文档文本提取、表格识别与字段抽取。支持电子发票 OCR。',
      body: `# PDF 解析

## 功能
- 提取 PDF 文本内容
- 识别表格数据
- 电子发票/单据字段提取

## 使用方式
调用后端 pdf-parse 服务读取 PDF 文件。`,
    },
    'run-script': {
      name: '脚本执行',
      description: '安全执行 Python/Node.js/Shell 脚本。沙箱隔离，返回 stdout/stderr。',
      body: `# 脚本执行

## 功能
在沙箱环境中执行脚本：
- Python 脚本
- Node.js 脚本
- Shell 命令（受限黑名单）

## 使用方式
调用后端 run-script 工具，传入代码和语言类型。`,
    },
    'web-fetch': {
      name: '网页抓取',
      description: '抓取网页内容并提取正文，支持动态页面。配合 browser-automation 使用。',
      body: `# 网页内容抓取

## 功能
- 抓取网页 HTML 并提取正文
- 支持静态和动态页面
- 自动清理广告、导航等噪音

## 使用方式
调用 web-fetch 传入目标 URL，返回清洗后的文本内容。`,
    },
    'web-search': {
      name: '网页搜索',
      description: '搜索引擎检索，返回前 N 条结果的标题、摘要和链接。MClaw 已有内置插件。',
      body: `# 网页搜索

## 功能
调用 MClaw 内置的 web-search 插件进行搜索：
- DuckDuckGo 搜索引擎
- 返回标题、摘要、链接

## 使用方式
调用 web_search 工具，传入搜索关键词。`,
    },
    'xlsx-parse': {
      name: 'Excel 读取解析',
      description: '读取 .xlsx 文件，提取工作表数据。配合 ws-excel ClawHub 技能使用。',
      body: `# Excel 读取

## 功能
引用 ws-excel 技能读取 Excel 文件：
- 指定工作表读取
- 数据预览（前 N 行）
- 自动检测表头

## 使用方式
提供文件路径，调用 xlsx-parse 工具读取。`,
    },
  };

  return templates[skillName] || null;
}

async function main() {
  console.log('=== 安装 mateclaw 技能到 MClaw ===\n');

  // 确保技能目录存在
  fs.mkdirSync(SKILLS_DIR, { recursive: true });

  // 第一步：连接 OpenClaw 网关
  console.log('[1/3] 连接 OpenClaw 网关...');
  try {
    await wsClient.connect();
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) {
    console.log('连接超时，将仅创建本地技能');
  }

  const connected = wsClient.isConnected();
  console.log(connected ? '已连接\n' : '未连接（将跳过 ClawHub 安装）\n');

  // 第二步：安装/创建技能
  console.log(`[2/3] 处理 ${Object.keys(SKILL_CLUBHUB_MAP).length} 个技能...\n`);

  let installed = 0, created = 0, skipped = 0;

  for (const [skillName, clubhubSlug] of Object.entries(SKILL_CLUBHUB_MAP)) {
    const skillDir = path.join(SKILLS_DIR, skillName);

    // 检查是否已安装
    if (fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
      console.log(`  ✓ ${skillName} — 已存在`);
      skipped++;
      continue;
    }

    // 尝试从 ClawHub 安装
    let clubhubInstalled = false;
    if (connected && clubhubSlug) {
      try {
        console.log(`  ↓ ${skillName} — 从 ClawHub 安装 (${clubhubSlug})...`);
        await wsClient.request('skills.install', { slug: clubhubSlug });
        await new Promise(r => setTimeout(r, 500));
        if (fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
          console.log(`  ✓ ${skillName} — ClawHub 安装成功`);
          installed++;
          clubhubInstalled = true;
        }
      } catch (e) {
        // ClawHub 安装失败，继续创建本地版本
      }
    }

    // 创建本地技能
    if (!clubhubInstalled) {
      const template = getLocalSkillMD(skillName);
      if (template) {
        fs.mkdirSync(skillDir, { recursive: true });
        const md = `---
name: ${skillName}
description: ${template.description}
version: 1.0.0
category: ${guessCategory(skillName)}
---

${template.body}`;
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), md, 'utf-8');

        // 写 _meta.json（name 必须用英文目录名，中文名留给翻译系统处理）
        const meta = { name: skillName, displayName: template.name, description: template.description, version: '1.0.0', category: guessCategory(skillName) };
        fs.writeFileSync(path.join(skillDir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

        console.log(`  ✓ ${skillName} — 本地创建`);
        created++;
      } else {
        console.log(`  ✗ ${skillName} — 无模板`);
        skipped++;
      }
    }
  }

  // 第三步：触发翻译
  console.log(`\n[3/3] 完成: ${installed} ClawHub安装 + ${created} 本地创建 + ${skipped} 跳过`);

  if (created > 0) {
    console.log('\n💡 提示: 本地创建的技能需重启后端后在前端"技能库"页面进行中文翻译');
  }

  process.exit(0);
}

function guessCategory(skillName) {
  const map = {
    'code-review': 'devops', 'comment-analyze': 'content', 'docx-read': 'productivity',
    'excel-analysis': 'productivity', 'excel-write': 'productivity', 'file-sort': 'productivity',
    'finance-report-calc': 'finance', 'fund-data-fetch': 'finance', 'git-helper': 'devops',
    'hot-news-digest': 'content', 'image-prompt': 'content', 'law-search': 'finance',
    'list-files': 'productivity', 'log-parse': 'devops', 'memory-save': 'productivity',
    'ppt-generate': 'productivity', 'read-file': 'devops', 'report-generate': 'productivity',
    'run-script': 'devops', 'server-healthcheck': 'devops', 'short-video-script': 'content',
    'social-copy-writer': 'content', 'supply-chain-analyze': 'finance',
    'web-fetch': 'devops', 'web-search': 'devops', 'word-write': 'productivity',
    'write-file': 'devops', 'xlsx-parse': 'productivity',
  };
  return map[skillName] || 'productivity';
}

main().catch(e => { console.error(e.message); process.exit(1); });
