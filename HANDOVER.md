# MClaw 蛙蔻面板 — 接手文档

> 最后更新：2026-05-29（合同模块修复 + 蝉镜升级 + DB 毒丸清理）

## 项目概述

企业智能体管理平台，集成 CRM、进销存、人事、招投标、爆款视频营销等模块，支持多模型 AI 聊天。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + Element Plus + Vite |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| AI | OpenAI 兼容 API（DeepSeek/小米 MiMo/Anthropic/智谱/Kimi 等） |
| 视频 | FFmpeg + edge-tts + 可灵/蝉镜 |
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
│   │   ├── chanjing-api.js        # 蝉镜 API（16 函数：TTS/对口型/视频/数字人）
│   │   ├── kling-video.js         # 可灵 AI 视频
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
│               ├── InventoryManagement.vue # 5 个 Tab
│               ├── HRManagement.vue        # 10 个 Tab
│               ├── DocumentManagement.vue
│               ├── SalesManagement.vue     # CRM(客户/商机/合同) + 招投标 + 内容发布（⚠️ /internal/sales 路由目标）
│               ├── HotVideoPipeline.vue    # 5 步视频流水线
│               ├── HotProductConfig.vue    # 产品配置
│               ├── HotLeads.vue            # 线索管理
│               ├── HotQuickReply.vue       # 快捷回复
│               └── HistoryTable.vue        # 历史表格组件
│           ├── ChanjingStudio.vue   # 蝉镜工作室（8 个 Tab）
```

## 启动方式

```bash
# 后端（端口 3001）
cd backend && node server.js

# 前端（端口 4173）
cd frontend && npx vite --host 0.0.0.0
```

前端 Vite 代理 `/api` → `http://localhost:3001`

**注意**: 后端启动前需在 `backend/.env` 配置 API 密钥，`server.js` 通过 `require('dotenv').config()` 加载。

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
[Step 1 提取] → [Step 2 改写] → [Step 3 编辑] → [Step 4 视频] → [Step 5 发布]
   粘贴链接         AI 改写         编辑文案         生成视频         发布平台
```

**2 种视频模式**：

| 模式 | 说明 | 需要的 API Key |
|---|---|---|
| `chanjing` | 蝉镜数字人播报（默认） | `CHANJING_APP_ID` + `SECRET_KEY` |
| `kling` | 可灵 AI 视频生成 | `KLINGAI_ACCESS_KEY` + `SECRET_KEY` |

> 已移除：`standard`（FFmpeg 标准字幕合成）、`inference`、`hyperframes`、`image_sequence`。

**蝉镜数字人选择界面**（Step 4）：
- 数字人/音色/字体弹窗卡片网格选择，从蝉镜 API 实时拉取
- 723 个数字人，分页加载（50/页），支持标签筛选（性别/年龄/职业）
- 选中数字人后自动带出默认音色、figure 类型和尺寸（类型和尺寸隐藏不显示）
- 字幕默认位于画面底部（y=1680）
- 音色库 91 个，支持试听预览

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

`backend/config.js` 从 `backend/.env` 加载环境变量（`server.js` 启动时调用 `dotenv.config()`）：

| 变量 | 必需 | 说明 |
|---|---|---|
| `FFMPEG_BIN` | 否 | FFmpeg 路径，默认 `ffmpeg` |
| `FFPROBE_BIN` | 否 | FFprobe 路径，默认 `ffprobe` |
| `FONT_PATH` | 否 | 中文字体，默认 `simhei.ttf`（黑体，不用微软雅黑 .ttc） |
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

## 蝉镜 API 集成

蝉镜（open-api.chanjing.cc）提供数字人视频合成能力，`hot-chanjing.js` 路由代理了 16 个端点：

### 已接通功能

| 分类 | 路由 | 功能 |
|---|---|---|
| 公共资源 | `GET /digital-persons` | 723 个公共数字人（分页/标签筛选） |
| 公共资源 | `GET /voices` | 100+ 公共音色（试听预览） |
| 公共资源 | `GET /fonts` | 平台字体列表 |
| 公共资源 | `GET /tags` | 标签字典 |
| 视频合成 | `POST /create-video` | 创建数字人视频合成任务 |
| 视频合成 | `GET /video/:id` | 查询任务状态/结果 |
| 视频合成 | `GET /videos` | 视频列表（分页） |
| 视频合成 | `DELETE /videos/:id` | 删除视频 |
| 视频合成 | `GET /videos/:id/download` | 下载视频（302 重定向） |
| 对口型 | `POST /lip-sync` | 照片说话 — 图片+音频合成对口型视频 |
| 对口型 | `GET /lip-sync/:id` | 查询对口型任务状态 |
| 对口型 | `GET /lip-sync` | 对口型任务列表 |
| TTS | `POST /tts` | 文字转语音 |
| TTS | `GET /tts/:taskId` | 查询 TTS 任务状态 |
| 文件 | `GET /upload-url` | 获取 OSS 预签名上传 URL |
| 用户 | `GET /user/info` | 用户信息/配额 |
| 用户 | `GET /user/duration` | 蝉豆余额 |

### 前端集成

- **爆款流水线 Step 3**：蝉镜模式 — 数字人/音色/字体弹窗卡片选择，自动填充 figure 类型和尺寸
- **ChanjingStudio.vue**（8 个 Tab）：文案提取、文案创作、智能成片、照片说话、数字人库、声音库、批量生成、我的视频

### 配置

`backend/.env` 中的 `CHANJING_APP_ID` + `CHANJING_SECRET_KEY`，`server.js` 启动时通过 `require('dotenv').config()` 加载。

**⚠️ Token 轮换**：蝉镜 API 每次请求 `access_token` 会令旧 token 失效。如果另开进程或用 curl 测试获取了新 token，运行中的服务器缓存的旧 token 会立即失效，报 `AccessToken已失效`。此时需重启后端。

## 2026-05-29 修复记录

### 🔴 db.js 破坏性 DROP TABLE（数据丢失）

**问题**：`db.js` 第 15-61 行在每次 `require('./db')` 时无条件执行 11 个 `DROP TABLE IF EXISTS`，导致 contracts/customers/opportunities 等表在每次服务重启或新 node 进程启动时被清空。

**修复**：删除所有 `DROP TABLE IF EXISTS`（除 `inventory` 迁移用的那一个），保留 `CREATE TABLE IF NOT EXISTS`。

### 🔴 io-configs.js contracts 列配置错位

**问题**：`contracts` 的导入导出配置用了不存在的字段（customer_id/total/status/start_date/end_date），与实际 DB schema（14 个业务字段）完全不匹配。导致「下载模板」「导出」「导入」全部生成错误列。

**修复**：重写 `contracts` 配置，14 列对齐 DB schema + Excel 模板。

### 🔴 SalesManagement.vue slot 变量 bug（编辑/删除失效）

**问题**：表格 `el-table-column` 的 slot 用了 `#default="{r}"`，但 Element Plus 的 slot scope 属性是 `row`，`r` 恒为 `undefined`。导致编辑按钮永远不触发编辑模式、删除按钮永远拿不到 id。

**修复**：`{r}` → `{row}`，涉及合同、商机、联系人三处表格。

### 🟡 合同订单表 13 条数据导入

从 `G:/桌面/客户关系管理模块/合同订单表V1.0(1).xlsx` 导入到 `contracts` 表，字段完全匹配。

### 🟡 CRM 功能补全

- 商机表格：加编辑按钮 + 编辑对话框 + update API
- 合同表格：加编辑按钮 + 编辑对话框 + update API  
- 合同表格从 7 列扩展到 14 列（对齐 DB schema）
- 商机/合同删除增加确认弹窗（ElMessageBox.confirm）
- 金额列 ¥ 格式化

### 🟡 蝉镜工作室升级

- 智能成片 Tab：数字人/声音从 `el-select` 下拉 → `pipe-sel` 预览条 + 卡片弹窗选择
- 数字人库 Tab：加性别/年龄/职业筛选标签 + 分页加载
- 声音库 Tab：统一 `resource-card voice-card` 风格 + 选中高亮 + 试听

### 🟡 API 兼容：system role → user

`server.js` `makeMessages()` 将 `role: 'system'` 改为 `role: 'user'`，兼容不支持 system 角色的模型 API（豆包等）。

## 常见问题

**Q: 视频生成报 `ffmpeg: command not found`**
A: 安装 FFmpeg 并加入 PATH，或在 `config.js` 的 `FFMPEG_BIN` 指定完整路径。

**Q: TTS 报 `surrogates not allowed`**
A: 已修复（`sanitizeText()` 过滤孤立代理字符 + Python 端 `surrogateescape`），如再出现检查输入文本编码。

**Q: FFmpeg 内存暴增到 7-8GB**
A: 已修复（`loop=-1:32767` 改为 `-stream_loop -1` 输入选项），如再出现检查 filter 链中是否误用了 loop 滤镜。

**Q: `.db` 文件冲突**
A: `internal.db` 已加入 `.gitignore`，但如已被 Git 跟踪需手动 `git rm --cached` 移除。

**Q: 蝉镜数字人/音色库加载为空 或 AccessToken已失效**
A: ①检查 `backend/.env` 配置了 `CHANJING_APP_ID`/`SECRET_KEY`。②Token 会因重新获取而失效，直接重启后端即可刷新。

**Q: 表格的编辑/删除按钮点击无反应**
A: 检查 `el-table-column` 的 `#default` slot 是否用了 `{row}` 而非 `{r}`。Element Plus 的 scope 属性名是 `row`，写成 `{r}` 会导致变量恒为 undefined。

**Q: FFmpeg 报 `font_index` Option not found 或字体错误**
A: 默认字体已改为 `C:/Windows/Fonts/simhei.ttf`（黑体），避免微软雅黑 `.ttc` 字体集合兼容问题。`_escapeFontPath()` 会自动检测 `.ttc` 并替换。

## 模型配置

9 个提供商预设：DeepSeek / 小米 MiMo / Anthropic / 智谱 / Kimi / 通义千问 / 豆包 / Ollama / 自定义。在 `/model-config` 页面配置，`getActiveConfig()` 每次请求动态读取，非硬编码。
