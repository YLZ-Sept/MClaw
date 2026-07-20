# MClaw — 企业智能体管理平台

云南米贝科技，v0.14.0

## 技术栈

- **前端:** Vue 3 (Composition API, `<script setup>`) + Element Plus 2.7 + Vite 5.4 + Axios + marked (Markdown 渲染)
- **后端:** Node.js Express 4.21 + better-sqlite3 + WebSocket (ws) + node-cron
- **AI 引擎:** OpenClaw 网关 (端口 18622)，OpenAI 兼容 API 格式，WebSocket + HTTP 双通道
- **无 TypeScript**，纯 JavaScript
- **其他关键依赖:** Playwright (浏览器自动化)、multer (上传)、xlsx (Excel)、pdf-parse、mammoth (docx)、sharp (图片)、tesseract.js (OCR)、cheerio (HTML 解析)

## 换电脑迁移

全新电脑上恢复项目运行，按以下步骤操作：

### 1. 手动安装三个依赖（setup.bat 不会自动装）

| 依赖 | 原因 | 下载 |
|------|------|------|
| **Visual Studio Build Tools (C++)** | better-sqlite3 需要 C++ 编译，否则 `npm install` 失败 | https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022 勾选「Desktop development with C++」 |
| **FFmpeg** | 视频生成 (`services/video-generator.js` 等) | https://ffmpeg.org/download.html 添加到 PATH |
| **Tesseract OCR** | 图片文字识别，项目含 `chi_sim.traineddata` + `eng.traineddata` | https://github.com/UB-Mannheim/tesseract/wiki 安装到 `C:\Program Files\Tesseract-OCR\`，语言包放入 `tessdata/` |

### 2. 拷贝项目文件夹

整个 `E:\CC\MClaw\` 复制到新电脑，Git 历史、SQLite 数据库、上传文件都在里面。

### 3. 运行 setup.bat

以管理员身份运行，自动完成：
- 安装 Node.js (winget)
- 安装 Python 3.12.9
- 后端 `npm install` (backend/)
- 前端 `npm install` (frontend/)
- 安装 OpenClaw Gateway (`npm install -g openclaw@2026.7.1-2` + 初始化设备身份)
- Python 依赖 (fastapi, playwright, uvicorn 等)
- Playwright Chromium 浏览器
- 前端 `npm run build`
- 创建 `.env` 模板
- 端口检测 + 冒烟测试

### 4. 激活 License

换电脑后硬件指纹 (CPU UUID + 磁盘序列号 + MAC 地址) 全变，旧 License 失效。

- 项目能启动，但 API 返回 402
- `/api/license` 页面获取新机器指纹
- 用 `tools/` 里的私钥生成新授权码激活
- 容错机制：5 段指纹匹配 3 段即通过，换硬盘/网卡不会立即锁死

### 5. 启动

```bash
start.bat
```

访问 `http://localhost:18621`

## 目录结构

```
MClaw/
  setup.bat / setup.ps1       ← Windows 一键环境安装
  start.bat / start-hidden.vbs ← 生产启动脚本
  stop-hidden.vbs             ← 停止脚本
  tools/                      ← License 生成工具

  backend/
    server.js                 ← Express 入口，路由挂载，chat/send 核心编排
    config.js                 ← 蝉镜/KlingAI/视频/ffmpeg 配置
    db.js                     ← SQLite ~50 表 schema + 种子数据 + 迁移
    license.js                ← RSA-PSS 硬件指纹 License 校验

    routes/                   ← ~55 路由文件 (见下方路由表)
    services/                 ← ~36 业务逻辑模块 (见下方服务表)
    agents/                   ← 内置 Agent 工具定义
      executor.js             ← 核心工具执行器，~100 个工具的 switch 分发
      internal.js / sales.js / support.js / bid.js / hot-video.js / import-parser.js
      vector-search.js        ← FAQ 向量相似搜索
    channels/                 ← 多渠道消息接入
      index.js                ← 统一消息处理中心
      agent-bridge.js         ← Agent 配置加载 + 工具注入 + LLM 调用 + 回复润色
      ws-server.js            ← WebSocket 服务端 (前端实时事件推送)
      event-bus.js            ← 进程内事件广播
      wecom.js / wecom-kf.js  ← 企业微信
      feishu.js               ← 飞书
      clawbot.js              ← ClawBot (自定义微信 Bot，已备用)
      wechat-bot.js           ← 微信 iLink Bot (长轮询)
    openclaw/
      ws-client.js            ← OpenClaw WebSocket 客户端 (Ed25519 设备认证)
      model-sync.js           ← 模型配置同步到 openclaw.json

    data/internal.db          ← SQLite 数据库 (WAL + 外键)
    uploads/                  ← 文件上传目录
    videos/                   ← 视频生成输出
    templates/                ← 文档模板
    scripts/                  ← SSH 隧道、代理配置等运维脚本
    auto_douyin/              ← Python 抖音自动发布

  frontend/
    vite.config.js            ← 端口 4173，代理 /api → localhost:18621
    src/
      main.js                 ← Vue 入口，Element Plus 全局图标注册
      App.vue                 ← 仅 `<router-view />`
      router/index.js         ← 路由 + 权限导航守卫
      api/
        index.js              ← Axios 实例 (自动 token、401/402 拦截)
        channels.js / crm.js / docs.js / hot-video.js / hr.js / internal.js / inventory.js
      layouts/MainLayout.vue  ← 侧边栏 + 动态会话列表
      components/
        ChatMessage.vue       ← Markdown 消息气泡
        ImportDialog.vue      ← 数据导入弹窗
      views/                  ← 22 个页面 (见下方路由表)

  dist-backend/               ← 后端混淆构建输出
  backups/                    ← 系统备份
  docs/                       ← 文档
  memory/                     ← 会话记忆存储
```

---

## 端口

| 端口 | 用途 | 环境 |
|------|------|------|
| 18621 | Express 后端，生产同时 serve `frontend/dist/` | 全部 |
| 18622 | OpenClaw AI 网关 (server.js 自动拉起) | 全部 |
| 4173 | Vite 开发服务器，热更新，/api 代理到 18621 | 仅开发 |

---

## 命令

```bash
# === 开发 ===
cd frontend && npm run dev          # Vite 开发服务器 :4173
cd backend && node server.js        # 后端 :18621

# === 构建 ===
cd frontend && npm run build        # 输出 frontend/dist/
cd backend && node build-obfuscate.js  # 混淆输出 dist-backend/

# === 生产 ===
start.bat                           # 前台启动
start.bat --daemon                  # 后台启动 (杀死旧进程 → 后端 → Python 自动发布)
```

---

## 认证与鉴权

### Token 认证
- 登录后颁发随机 UUID token，存储在内存 `tokens = {}` 对象中
- 服务重启全部 token 失效
- 密码存储：scrypt + 随机 salt，格式 `salt:hash`
- 登录锁定：可配置最大尝试次数和锁定时长

### RBAC 权限系统
- `roles` 表存储 `permissions` JSON 数组 + 可选的 `scope` (资源级限制)
- `requirePermission(perm)` 中间件检查 token 对应角色的权限
- 路由→权限映射硬编码在 `server.js` 第 39-85 行

**完整权限键 (25+ 个):**

| 模块 | 权限键 |
|------|--------|
| 对话 | `chat` |
| 任务 | `tasks` |
| 数字员工 | `digital` |
| 追爆款 | `trending` |
| 渠道 | `channels` |
| 知识库 | `knowledge` |
| 技能库 | `skills` |
| 模型配置 | `model` |
| 安全设置 | `security`, `security_users`, `security_roles`, `security_logs`, `security_settings` |
| CRM | `crm` |
| 进销存 | `inventory` |
| HR | `hr` |
| 文档 | `docs` |
| 财务 | `finance` |
| 发布 | `publish` |

### License 校验
- RSA-PSS 签名验证
- 硬件指纹：CPU UUID + 磁盘序列号 + MAC 地址，5 段匹配 3 段即通过
- 公钥内置在 `db.js` 种子数据中，私钥仅存 `tools/`
- 过期后阻止除登录和 license 页面外的所有操作

---

## 后端路由全表

`server.js` 中挂载，按域分组：

### 认证 & 系统
| 前缀 | 文件 | 说明 |
|------|------|------|
| `/api/auth` | `routes/auth.js` | 登录/登出，RBAC token 管理 |
| `/api/license` | `routes/license.js` | License 激活/状态 |
| `/api/users` | `routes/users.js` | 用户 CRUD |
| `/api/roles` | `routes/roles.js` | 角色 CRUD |
| `/api/status` | server.js 内联 | 系统健康检查 |
| `/api/info` | server.js 内联 | 版本信息 |
| `/api/agents` | server.js 内联 | 内置 + 自定义 Agent 列表 |
| `/api/logs` | `routes/logs.js` | 系统日志 |
| `/api/security` | `routes/security.js` | 安全设置 |
| `/api/io` | `routes/io.js` | 文件 IO |
| `/api/tasks` | `routes/tasks.js` | 定时任务 |
| `/api/clawhub` | `routes/clawhub.js` | ClawHub 集成 |

### AI / 数字员工
| 前缀 | 文件 | 说明 |
|------|------|------|
| `/api/chat/send` | server.js 内联 | **核心 Chat 路由** (SSE 流式 + 非流式) |
| `/api/chat/history` | server.js 内联 | 内存聊天历史 (非 session 模式) |
| `/api/chat/clear` | server.js 内联 | 清除历史 |
| `/api/chat-sessions` | `routes/chat-sessions.js` | 数据库持久化会话 |
| `/api/agent-apps` | `routes/agent-apps.js` | 数字员工/Agent 应用 CRUD |
| `/api/agent-openclaw-skills` | `routes/agent-openclaw-skills.js` | Agent 技能绑定 |
| `/api/expert-agents` | `routes/expert-agents.js` | 专家 Agent 管理 |
| `/api/digital-employees` | `routes/digital-employees.js` | 数字员工管理 |
| `/api/digital-human` | `routes/digital-human.js` | 数字人 |
| `/api/model-configs` | `routes/model-configs.js` | AI 模型配置 |

### 追爆款
| 前缀 | 文件 |
|------|------|
| `/api/trending` | `routes/trending.js` |
| `/api/hot-products` | `routes/hot-products.js` |
| `/api/hot-contents` | `routes/hot-contents.js` |
| `/api/hot-extract` | `routes/hot-extract.js` |
| `/api/hot-quick-reply` | `routes/hot-quick-reply.js` |
| `/api/hot-leads` | `routes/hot-leads.js` |
| `/api/hot-chanjing` | `routes/hot-chanjing.js` |
| `/api/social-acquisition` | `routes/social-acquisition.js` |

### 知识库 & FAQ
| 前缀 | 文件 |
|------|------|
| `/api/faq` | `routes/faq.js` |
| `/api/knowledge-base` | `routes/knowledge-base.js` |
| `/api/doc-import` | `routes/doc-import.js` |

### 渠道 / 消息
| 前缀 | 文件 | 说明 |
|------|------|------|
| `/api/channel-accounts` | `routes/channel-accounts.js` | 渠道账号管理 |
| `/api/channel-conversations` | `routes/channel-conversations.js` | 会话管理 |
| `/api/channels/wecom` | `channels/wecom.js` | 企微回调 (text body) |
| `/api/channels/wecom/kf` | `channels/wecom-kf.js` | 企微客服 (text body) |
| `/api/channels/feishu` | `channels/feishu.js` | 飞书回调 |
| `/api/channels/clawbot` | `channels/clawbot.js` | ClawBot 回调 |
| `/api/channels/wechat` | `channels/wechat-bot.js` | 微信 iLink Bot 长轮询 |

### CRM
| `/api/customers` | `routes/customers.js` |
| `/api/contacts` | `routes/crm-contacts.js` |
| `/api/contracts` | `routes/crm-contracts.js` |
| `/api/opportunities` | `routes/crm-opportunities.js` |

### 进销存
| `/api/purchase-orders` | `routes/purchase-orders.js` |
| `/api/sales-orders` | `routes/sales-orders.js` |
| `/api/returns` | `routes/returns.js` |
| `/api/asset-ledger` | `routes/asset-ledger.js` |

### HR
| `/api/employees` | `routes/employees.js` |
| `/api/departments` | `routes/hr-departments.js` |
| `/api/recruitment` | `routes/hr-recruitment.js` |
| `/api/candidates` | `routes/hr-recruitment.js` |
| `/api/recruitment-stats` | `routes/hr-recruitment-stats.js` |
| `/api/attendance` | `routes/hr-attendance.js` |
| `/api/personnel-changes` | `routes/hr-changes.js` |
| `/api/performance` | `routes/hr-performance.js` |

### 招投标
| `/api/bids` | `routes/bids.js` |
| `/api/bid-statistics` | `routes/bid-statistics.js` |
| `/api/bid-agent` | `routes/bid-settings.js` |

### 其他
| `/api/publish` | `routes/multi-publish.js` | 多平台发布 |
| `/api/download` | `routes/downloads.js` | 文件下载 |
| `/api/documents` | `routes/documents.js` | 文档管理 |
| `/api/doc-folders` | `routes/doc-folders.js` | 文档文件夹 |
| `/api/org-charts` | `routes/org-charts.js` | 组织架构 |
| `/api/finance` | `routes/finance.js` | 应收/应付账款 |

---

## 核心服务文件

| 文件 | 功能 |
|------|------|
| `services/llm.js` | LLM API 调用抽象 |
| `services/crawl4ai-collector.js` | Crawl4AI 招投标定时采集 |
| `services/scrapling-collector.js` | Scrapling 备用采集 |
| `services/woyaobid-crawler.js` | 乙方宝 (woyaobid.cn) 爬虫 |
| `services/ztb-sjcj-bridge.js` | ZTB 数据采集桥接 |
| `services/multi-publish.js` | 多平台内容发布引擎 |
| `services/douyin-publish.js` | 抖音发布 |
| `services/content-extractor.js` | 网页内容抽取 |
| `services/content-generator.js` | AI 内容生成 |
| `services/content-rewriter.js` | 内容改写 |
| `services/intent-classifier.js` | 用户意图分类 |
| `services/lead-detector.js` | 销售线索检测 |
| `services/auto-reply.js` | 自动回复规则引擎 |
| `services/mcp-client.js` | MCP 协议客户端 |
| `services/chanjing-api.js` | 蝉镜视频 API |
| `services/kling-video.js` | Kling AI 视频 |
| `services/video-generator.js` | 通用视频生成 |
| `services/tts.js` / `tts.py` | 文字转语音 |
| `services/pdf-generator.js` | PDF 生成 |
| `services/docx-generator.js` | Word 生成 |
| `services/excel-generator.js` | Excel 生成 |
| `services/ppt-generator.js` | PPT 生成 |
| `services/mermaid-generator.js` | Mermaid 图表 |
| `services/skill-translator.js` | OpenClaw 技能翻译 |
| `services/notification.js` | 钉钉 Webhook 通知 |

---

## Chat 路由详解 (`POST /api/chat/send`)

server.js 内联的核心路由，支持三种模式：

### 请求体
```js
{
  message: string,         // 用户消息
  agent: string,           // Agent ID (可选)
  agentName: string,       // Agent 名称 (可选)
  session_id: string,      // 会话 ID (可选，有此参数则走数据库持久化)
  context: object,         // 额外上下文 (可选)
  images: string[],        // 图片 base64 (可选)
  model: string,           // 模型覆盖 (可选)
  provider: string         // Provider 覆盖 (可选)
}
```

### 模式 1：数字员工 (有 agent 且非 expert 类)
1. 查 `agent_apps` 获取工具列表和系统提示词
2. 发消息给 OpenClaw → 可能返回 tool_calls
3. `executor.js` 执行工具 → 结果追加到消息历史
4. 再次发 OpenClaw → 最多 2 轮工具调用
5. 如仍有 tool_calls 未完成，追加"任务未完成"提示

### 模式 2：专家 Agent (agent 类型为 expert)
1. 从 `agent_apps` 查系统提示词
2. 提示词包装为 `<human_sys>...</human_sys>` 注入用户消息开头
3. 发送 OpenClaw → 流式返回

### 模式 3：通用透传 (无 agent)
1. 直接转发 OpenClaw，无额外处理

### SSE 事件格式
```
data: {"type":"text","content":"token 增量"}
data: {"type":"done"}
data: {"type":"error","content":"错误信息"}
```

非流式模式则直接返回 JSON `{ message, tool_calls }`。

---

## Agent 工具体系

### 调用链
```
用户消息 → server.js (chat/send)
  → 查 agent_apps (获取 base_agent + custom_prompt + tools)
  → 如 base_agent 指向 built-in agent → 合并 built-in 的工具和提示词
  → OpenClaw LLM 调用
  → 如返回 tool_calls → agents/executor.js 执行
  → 工具结果返回 OpenClaw 二次调用
  → 最终回复返回用户
```

### 内置 Agent (agents/*.js)
| Agent ID | 文件 | 用途 |
|----------|------|------|
| `internal-agent` | `internal.js` | 内部运营 (CRM/进销存/HR/财务/文档) |
| `sales-agent` | `sales.js` | 销售 CRM |
| `support-agent` | `support.js` | 客服 (工单/退款/投诉) |
| `bid-agent` | `bid.js` | 招投标 (采集/分析) |
| hot-video | `hot-video.js` | 一键追爆款视频流水线 |
| import-parser | `import-parser.js` | 文档导入解析 |

### executor.js 工具分类 (~100 个)
- **CRM:** customers/contacts/opportunities/contracts/quotations/leads 的 CRUD
- **进销存:** products/warehouses/purchase-orders/sales-orders/returns/stock
- **HR:** employees/departments/recruitment/attendance/performance
- **文档:** documents/folders/org-charts
- **招投标:** bid 查询/统计
- **财务:** 应收/应付
- **文件操作:** scanFolder/searchLocalFiles/readLocalFile (支持 xlsx/docx/pdf)
- **脚本执行:** runPython/runNode
- **远程:** SSH 执行、screenshot、浏览器自动化

---

## 多渠道消息系统

### 统一处理流程
```
外部平台 Webhook
  → channels/wecom.js (或 feishu.js / wechat-bot.js)
  → 解析消息体，标准化为 { from, to, content, msgType }
  → channels/index.js → handleIncoming()
    → 获取/创建 channel_conversations 记录
    → 存储 channel_messages
    → 根据回复模式处理:
      - auto: agent-bridge.js 自动生成回复并发送
      - assisted: agent-bridge.js 生成建议，存入数据库等待人工确认
      - manual: 仅存储消息，不做回复
  → 通过对应渠道 API 发送回复
```

### agent-bridge.js 核心逻辑
1. `loadAgentConfig()` — 加载会话关联的 Agent，支持多 Agent 合并 (tools + prompt 去重)
2. 注入额外工具：文件操作、定时任务、OpenClaw 技能、文档生成
3. 调用 LLM → 解析 tool_calls → 执行工具 → 二次 LLM
4. 回复润色 (格式化、去噪)
5. Agent 评分 (用于自动路由决策)

### 各渠道特点
| 渠道 | 文件 | 通信方式 |
|------|------|----------|
| 企业微信 | `wecom.js` | Webhook 回调，云服务器 Apache 反向代理 + SSH 隧道 |
| 企微客服 | `wecom-kf.js` | Webhook 回调 |
| 飞书 | `feishu.js` | SDK 直连 (`@larksuiteoapi/node-sdk`) |
| 微信 iLink Bot | `wechat-bot.js` | 直连 iLink Bot API，长轮询 |
| ClawBot | `clawbot.js` | 自定义微信 Bot (备用) |

---

## OpenClaw 集成

### ws-client.js
- 通过 WebSocket 连接到 OpenClaw 网关 `ws://localhost:18622`
- Ed25519 设备身份签名认证
- RPC 风格请求/响应 + 超时机制
- 自动重连 (指数退避)
- 支持请求：chat、tool_call 结果回传、会话 CRUD 同步

### model-sync.js
- 启动时将 MClaw 活动模型配置写入 OpenClaw 的 `openclaw.json`
- 注册为 provider `"mclaw"`

---

## 数据库要点

- **引擎:** better-sqlite3，单文件 `backend/data/internal.db`
- **模式:** WAL + 外键约束 ON
- **无 ORM:** 所有查询用 `db.prepare().all()/get()/run()`
- **Schema:** 全部定义在 `db.js`，运行时执行 `CREATE TABLE IF NOT EXISTS`
- **迁移:** try/catch `ALTER TABLE ... ADD COLUMN` 逐列添加
- **种子数据:** 超级管理员、默认角色、License 公钥、50 个专家 Agent

### 核心表 (按域分组)

**系统:** `users`, `roles`, `security_settings`, `license`, `logs`
**CRM:** `customers`, `contacts`, `contracts`, `opportunities`, `leads`, `follow_ups`, `tickets`, `quotations`, `quotation_items`, `marketing_campaigns`, `customer_feedback`
**进销存:** `products`, `inventory` (复合 PK: product_id+warehouse_id), `warehouses`, `suppliers`, `purchase_orders`, `purchase_order_items`, `sales_orders`, `sales_order_items`, `returns`, `stock_transactions`, `inventory_alerts`
**HR:** `employees`, `departments`, `recruitment`, `candidates`, `personnel_changes`, `attendance_rules`, `clock_records`, `leave_requests`, `performance_schemes`, `performance_items`, `performance_dimensions`, `performance_records`, `performance_scores`, `performance_reports`, `attendance_reports`
**文档:** `documents`, `document_folders`, `org_charts`
**招投标:** `bid_sources`, `bid_keywords`, `bid_items`, `bid_statistics`
**消息:** `channel_accounts`, `channel_conversations`, `channel_messages`
**AI:** `agent_apps` (含 expert agents), `model_configs`, `chat_sessions`, `chat_messages`, `knowledge_base`, `faq`
**追爆款:** `hot_products`, `hot_contents`, `hot_conversations`, `hot_leads`, `content_publish`, `rewrite_history`
**其他:** `social_tasks`, `social_comments`, `social_replies`, `social_monitors`, `auto_reply_rules`, `auto_reply_logs`, `asset_ledger`

---

## 前端路由表

所有认证路由嵌套在 `MainLayout` 下，侧边栏按权限显示：

| 路径 | 视图 | 权限 |
|------|------|------|
| `/login` | `Login.vue` | 公开 |
| `/help` | `Help.vue` | 公开 |
| `/chat` | `RealtimeChat.vue` | `chat` |
| `/digital` | `AgentManagement.vue` | `digital` |
| `/digital-human` | `DigitalHuman.vue` | `digital` |
| `/expert-hub` | `ExpertHub.vue` | `digital` |
| `/trending` | `TrendTracker.vue` | `trending` |
| `/knowledge-base` | `KnowledgeBase.vue` | `knowledge` |
| `/skill-library` | `SkillLibrary.vue` | `skills` |
| `/internal` | `InternalManagement.vue` | `crm` |
| `/internal/sales` | `SalesManagement.vue` | `publish` |
| `/internal/inventory` | `InventoryManagement.vue` | `inventory` |
| `/internal/hr` | `HRManagement.vue` | `hr` |
| `/internal/docs` | `DocumentManagement.vue` | `docs` |
| `/internal/finance` | `FinanceManagement.vue` | `crm` |
| `/support` | `FAQManagement.vue` | `knowledge` |
| `/tasks` | `Task.vue` | `tasks` |
| `/services` | `ServiceManagement.vue` | `security` |
| `/model-config` | `ModelConfig.vue` | `model` |
| `/channels` | `MessageChannels.vue` | `channels` |
| `/users` | `UserManagement.vue` | `security_users` |
| `/security` | `SecuritySettings.vue` | `security` |

导航守卫检查：公开路由 → License 过期 → Token 有效 → 权限匹配 (无权限则跳转到第一个有权限的路由)

---

## 开发惯例

### 添加新 API 路由
1. 在 `backend/routes/` 创建 `route-name.js`，用 Express Router
2. 在 `server.js` 添加 `app.use('/api/route-prefix', require('./routes/route-name'))`
3. 如需鉴权，在 `server.js` 的路由权限映射中添加权限键
4. 前端 API 调用在 `frontend/src/api/` 对应文件添加

### 添加新 Agent 工具
1. 在 `agents/executor.js` 的 `switch` 中添加 case
2. 在对应 `agents/xxx.js` 的 `tools` 数组中注册工具定义 (name/description/parameters)
3. 工具返回格式：`{ success: true, data/result }` 或 `{ success: false, error }`

### 数据库加字段
- 在 `db.js` 的对应 `CREATE TABLE` 语句中添加列定义
- 在文件末尾的迁移区添加 `ALTER TABLE ... ADD COLUMN` 的 try/catch
- 新表直接加在 `db.js` 对应域的 CREATE TABLE 区域

### 前端页面
- Vue 3 `<script setup>` + Composition API
- Element Plus 组件通过 `unplugin-vue-components` 按需自动导入
- `vue-router` 和 `vue` 核心 API 通过 `unplugin-auto-import` 自动导入，无需手动 import
- Markdown 渲染用 `marked` 库 (ChatMessage 组件)
