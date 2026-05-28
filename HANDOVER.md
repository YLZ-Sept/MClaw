# MClaw 蛙蔻面板 — 接手文档

## 项目概述

企业智能体管理平台，集成 CRM、进销存、人事、招投标、爆款视频营销等模块，支持多模型 AI 聊天。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Element Plus + Vite |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| AI | OpenAI 兼容 API（DeepSeek/小米 MiMo/Anthropic/智谱/Kimi 等） |
| 视频 | FFmpeg + edge-tts + HyperFrames + 可灵/蝉镜/Inference.sh |
| 浏览器自动化 | Playwright |

## 目录结构

```
MClaw/
├── backend/
│   ├── server.js              # 主入口，路由注册，Agent 管理，聊天 SSE
│   ├── db.js                  # SQLite 建表 + 种子数据（40+ 表）
│   ├── config.js              # 环境变量（FFmpeg/视频 API Key）
│   ├── agents/                # Agent 定义 + 工具执行器
│   │   ├── internal.js        # "小内" — 内部管理
│   │   ├── sales.js           # "小销" — 销售管理
│   │   ├── support.js         # "小客" — 售后支持
│   │   ├── hot-video.js       # 爆款视频 Agent
│   │   ├── executor.js        # 工具执行调度（直连 SQLite）
│   │   ├── vector-search.js   # TF-IDF 中文向量检索
│   │   └── import-parser.js   # 多格式文档解析
│   ├── routes/                # Express RESTful 路由（39 个前缀）
│   │   ├── hot-contents.js    # 爆款内容 CRUD + 视频生成全流程
│   │   ├── hot-*.js           # 爆款视频配套路由
│   │   ├── channel-*.js       # 渠道/消息管理
│   │   ├── crm-*.js           # 客户/合同/机会
│   │   ├── hr-*.js            # 员工/考勤/绩效/招聘
│   │   ├── auth.js            # 登录认证
│   │   └── bids.js            # 招投标采集
│   ├── services/              # 业务逻辑层（纯函数，不依赖 HTTP）
│   │   ├── video-generator.js     # FFmpeg 视频合成引擎
│   │   ├── hyperframes-video.js   # HyperFrames 动态视频
│   │   ├── tts.js + tts.py        # edge-tts 语音合成
│   │   ├── chanjing-api.js        # 蝉镜数字人 API
│   │   ├── kling-video.js         # 可灵 AI 视频
│   │   ├── ai-video.js            # Inference.sh AI 视频
│   │   ├── image-sequence-video.js # 图片序列转视频
│   │   ├── content-*.js           # 内容提取/改写/生成
│   │   ├── intent-classifier.js   # 意图分类
│   │   ├── auto-reply.js          # 自动回复
│   │   ├── lead-detector.js       # 线索识别
│   │   ├── browser-collector.js   # 浏览器自动化
│   │   ├── llm.js                 # LLM 调用封装
│   │   └── notification.js        # 钉钉通知
│   ├── channels/              # SightFlow 渠道桥接
│   │   ├── index.js           # 渠道管理入口
│   │   ├── ws-server.js       # WebSocket 服务
│   │   ├── sightflow-agent.js # 自动化 Agent
│   │   └── *.ps1/*.py         # 微信桥接脚本
│   ├── data/internal.db       # SQLite 数据库文件
│   └── videos/                # 生成的视频输出（不提交 Git）
├── frontend/
│   └── src/
│       ├── router/index.js    # 路由表（17 子路由）
│       ├── api/               # axios API 模块
│       │   ├── index.js       # axios 实例，/api → :3001
│       │   ├── crm.js, hr.js, inventory.js, docs.js
│       │   ├── channels.js, hot-video.js
│       └── views/
│           ├── Login.vue      # 登录页
│           ├── RealtimeChat.vue  # SSE 流式聊天
│           ├── ModelConfig.vue   # 多模型配置
│           ├── MessageChannels.vue # 渠道消息
│           └── internal/
│               ├── CRMManagement.vue       # 9 个 Tab
│               ├── InventoryManagement.vue # 5 个 Tab
│               ├── HRManagement.vue        # 10 个 Tab
│               ├── DocumentManagement.vue
│               ├── SalesManagement.vue     # 招投标 + 爆款视频
│               ├── HotVideoPipeline.vue    # 5 步视频流水线
│               ├── HotProductConfig.vue    # 产品配置
│               ├── HotLeads.vue            # 线索管理
│               ├── HotQuickReply.vue       # 快捷回复
│               └── HistoryTable.vue        # 历史表格组件
```

## 启动方式

```bash
# 后端（端口 3001）
cd backend && node server.js

# 前端（端口 5174）
cd frontend && npx vite --host 0.0.0.0
```

前端 Vite 代理 `/api` → `http://localhost:3001`

## 数据库核心表

### 爆款视频（hot_ 前缀）
| 表 | 用途 |
|---|---|
| `hot_products` | 产品信息（品牌名/行业/卖点） |
| `hot_contents` | 内容流水线（标题/正文/标签/审核/视频状态） |
| `hot_conversations` | 私信会话记录 |
| `hot_leads` | 高意向线索 |

### CRM
`customers`, `contacts`, `contracts`, `opportunities`, `follow_ups`, `asset_ledger`

### 进销存
`products`, `inventory`, `warehouses`, `suppliers`, `purchase_orders`, `sales_orders`, `returns`, `stock_transactions`, `inventory_alerts`

### 人事
`employees`, `departments`, `recruitment`, `candidates`, `clock_records`, `attendance_rules`, `attendance_reports`, `leave_requests`, `personnel_changes`, `performance_*`

### 其他
`bid_sources/keywords/items`（招投标）、`channel_accounts/conversations/messages`（渠道）、`faq`、`documents`、`content_publish`、`model_configs`、`agent_apps/skills`、`chat_sessions/messages`

## 核心工作流

### 1. 爆款视频流水线（5 步）

```
[Step 1 提取] → [Step 2 改写] → [Step 3 视频] → [Step 4 发布] → [Step 5 监控]
   粘贴链接         AI 改写         生成视频         发布平台         数据看板
```

**6 种视频模式**：

| 模式 | 说明 | 需要的 API Key |
|---|---|---|
| `standard` | FFmpeg 标准合成（HUD 字幕 + BGM） | FFmpeg + edge-tts |
| `hyperframes` | HTML 模板 → Chrome 渲染动画视频 | 无（本地 npx） |
| `inference` | FLUX 生图 + Wan 生成视频 | `INFERENCE_API_KEY` |
| `kling` | 可灵 AI 视频生成 | `KLINGAI_ACCESS_KEY` + `SECRET_KEY` |
| `chanjing` | 蝉镜数字人播报 | `CHANJING_APP_ID` + `SECRET_KEY` |
| `image_sequence` | AI 图片序列幻灯片 | FFmpeg + AI 图片 API |

### 2. Agent 聊天流程

```
POST /api/chat/send {content, agent, stream}
  → 加载 Agent systemPrompt + tools + 技能 + 知识库
  → FAQ 预匹配（TF-IDF 向量检索）
  → 调用活跃模型 API（从 model_configs 动态读取）
  → 模型 tool_call → executor 执行 → 结果回传（最多 2 轮）
  → SSE 流式输出（tool/text/polished/done 事件）
```

### 3. 招投标采集

```
定时器（每 6h API / 每 2h 爬虫）
  → bid-collector.js（API 源采集）
  → bid-crawler.js（网页爬虫 + Playwright）
  → 存入 bid_items 表
```

## 关键配置

`backend/config.js` 需要配置的环境变量：

| 变量 | 必需 | 说明 |
|---|---|---|
| `FFMPEG_BIN` | 否 | FFmpeg 路径，默认 `ffmpeg` |
| `FFPROBE_BIN` | 否 | FFprobe 路径，默认 `ffprobe` |
| `FONT_PATH` | 推荐 | 中文字体，默认微软雅黑 |
| `KLINGAI_ACCESS_KEY` / `SECRET_KEY` | kling 模式需 | 可灵 API |
| `CHANJING_APP_ID` / `SECRET_KEY` | chanjing 模式需 | 蝉镜 API |
| `INFERENCE_API_KEY` | inference 模式需 | Inference.sh |
| `DINGTALK_WEBHOOK` | 否 | 钉钉通知 Webhook |

## Agent 说明

| Agent | Key | 职责 |
|---|---|---|
| 小内 | `internal-agent` | CRM/进销存/人事/文档查询管理 |
| 小销 | `sales-agent` | 客户/销售机会/合同管理 |
| 小客 | `support-agent` | FAQ 检索/工单/售后 |
| 小爆 | `hot-video-agent` | 爆款内容创作/视频生成 |

自定义 Agent 通过 UI（AgentManagement.vue）创建，存储在 `agent_apps` 表。

## 常见问题

**Q: 视频生成报 `ffmpeg: command not found`**
A: 安装 FFmpeg 并加入 PATH，或在 `config.js` 的 `FFMPEG_BIN` 指定完整路径。

**Q: TTS 报 `surrogates not allowed`**
A: 已修复（`sanitizeText()` 过滤孤立代理字符 + Python 端 `surrogateescape`），如再出现检查输入文本编码。

**Q: FFmpeg 内存暴增到 7-8GB**
A: 已修复（`loop=-1:32767` 改为 `-stream_loop -1` 输入选项），如再出现检查 filter 链中是否误用了 loop 滤镜。

**Q: HyperFrames 视频没内容/没效果**
A: 已修复（CSS 动画替代 GSAP CDN、中文字体映射、分句逻辑重写），渲染日志无报错即可正常生成。

**Q: `npx hyperframes render` 报 ENOENT**
A: Windows 下使用 `exec(cmd, {shell: true})` 而非 `execFile`，已修复。

**Q: `.db` 文件冲突**
A: `internal.db` 已加入 `.gitignore`，但如已被 Git 跟踪需手动 `git rm --cached` 移除。

## 模型配置

9 个提供商预设：DeepSeek / 小米 MiMo / Anthropic / 智谱 / Kimi / 通义千问 / 豆包 / Ollama / 自定义。在 `/model-config` 页面配置，`getActiveConfig()` 每次请求动态读取，非硬编码。
