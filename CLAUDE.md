# 蛙蔻面板 (MClaw V1.0)

基于 Vue3 + Element Plus + Express + SQLite + 多模型 API 的企业智能体管理平台。

## 协作原则

以第一性原理思考，从原始需求和问题本质出发，不从惯例或模板出发。

1. 不要假设我清楚自己想要什么。动机或目标不清晰时，停下来讨论。
2. 目标清晰但路径不是最短的，直接告诉我并建议更好的办法。
3. 遇到问题追根因，不打补丁。每个决策都要能回答"为什么"。
4. 输出说重点，砍掉一切不改变决策的信息。

## 项目结构

```
backend/
  server.js              ← 主入口，路由注册，聊天 SSE，Agent 配置加载
  db.js                  ← SQLite (better-sqlite3)
  agents/
    internal.js          ← 内部管理 Agent「小内」：CRM/进销存/人事/文档 + system prompt
    support.js           ← 售后管理 Agent「小客」：FAQ/工单/反馈 + system prompt
    sales.js             ← 销售管理 Agent「小销」：客户/机会/合同 + system prompt
    executor.js          ← 工具执行器，直接操作 SQLite
    vector-search.js     ← TF-IDF 中文向量检索，纯 JS 零依赖
    import-parser.js     ← 多格式 FAQ 导入：Excel/Word/PDF/MD
  routes/                ← RESTful 路由文件
    model-configs.js     ← 模型配置 CRUD + 提供商预设 + Ollama 探测（导出 getActiveConfig）
    employees.js         ← 员工档案（含性别/入职/合同到期）+ Excel 种子导入
    agent-apps.js        ← 自定义智能体 CRUD（base_agent 可选）
    agent-skills.js      ← 自定义技能管理
    doc-import.js         ← 多格式文档导入（pdf-parse v2 API）
  data/internal.db       ← SQLite 数据库文件

frontend/
  src/
    router/index.js      ← 路由表
    api/index.js         ← axios 实例，/api 代理到 :3666
    api/crm.js, hr.js, inventory.js, docs.js, internal.js  ← 各模块 API
    views/
      RealtimeChat.vue   ← SSE 流式聊天 + marked 渲染
      AgentManagement.vue ← Agent 卡片 + 自定义智能体（技能/知识库绑定）
      ModelConfig.vue    ← 多模型配置（9 提供商预设 + 自定义 + Ollama）
      InternalManagement.vue ← 内部管理模块导航（CRM/进销存/人事/文档）
      KnowledgeBase.vue  ← 知识库（多格式导入/网页抓取/批量导入）
      Login.vue          ← 登录页
      internal/
        CRMManagement.vue       ← 9 Tab
        InventoryManagement.vue ← 5 Tab（采购入库/销售出库/库存台账/退换货/预警）
        HRManagement.vue        ← 10 Tab（员工/部门/招聘/候选人/假期/打卡/规则/月报/异动/绩效）
        DocumentManagement.vue  ← 文档上传/搜索/分类
        SalesManagement.vue     ← 招投标采集 + 内容发布
        FAQManagement.vue       ← FAQ 列表/搜索/多格式导入/Excel 导出
    components/
      ChatMessage.vue    ← Markdown 渲染消息气泡
```

## Agent 聊天流程

```
POST /api/chat/send {content, agent, stream, session_id}
  → 加载 Agent 配置 (systemPrompt + tools + 技能 + 知识库)
  → FAQ 预匹配（TF-IDF 向量检索）
  → 投诉关键词检测（强制 handoff_to_human）
  → 调用活跃模型 API (从 model_configs 动态读取，非硬编码)
  → 模型返回 tool_call → 执行工具 → 结果回传（最多2轮）
  → 流式输出文本 (SSE: tool/text/polished/done)
  → 润色轮 (二次 LLM 调用)
  → 存入历史（session 模式写 DB，非 session 写内存）
```

## Agent 注册

在 `server.js` 的 `agentConfigs` 对象中添加：
```js
const agentConfigs = {
  'internal-agent': require('./agents/internal'),
  'support-agent': require('./agents/support'),
  'sales-agent': require('./agents/sales'),
  'default': require('./agents/internal')
};
```

自定义 Agent（通过 UI 创建）存储在 `agent_apps` 表，可指定 `base_agent` 继承工具集，也可不继承（纯自定义提示词 + 技能 + 知识库）。

## 模型配置系统

- 9 个提供商预设：DeepSeek / 小米 MiMo / Anthropic / 智谱 / Kimi / 通义千问 / 豆包 / Ollama / 自定义
- DB 表 `model_configs`，`getActiveConfig()` 每次请求动态读取
- 前端 API Key 脱敏：列表返回 `***last4`，测试已保存配置走 `POST /:id/test`（后端读真实 Key）
- 路由顺序注意：`POST /test` 须在 `POST /:id/test` 之前

## 启动方式

```bash
cd backend && node server.js          # 后端 :3666
cd frontend && npx vite --host 0.0.0.0  # 前端 :5174
```

## 核心依赖

- **后端**：express, better-sqlite3, cors, xlsx, mammoth, pdf-parse(≥2.x), multer, cheerio
- **前端**：vue3, element-plus, vue-router, axios, marked
- **AI**：OpenAI 兼容 API（当前默认小米 MiMo mimo-v2.5-pro）

## 关键设计

- 所有 ID 用 `crypto.randomUUID()` 生成
- DB 表用 `db.exec()` 内 SQL，兼容旧表用 try/catch ALTER TABLE
- 向量检索修改后需调 `invalidate()` 重建索引
- 前端 Vite 代理 `/api` → `http://localhost:3666`
- Agent 聊天历史按 agent key 隔离存储
- pdf-parse v2.x 用法：`new PDFParse(new Uint8Array(buf))` → `load()` → `getText()`，结果 `{ pages: [{ text }] }`
- 所有 Agent 有独立身份（小内/小客/小销），问候语和系统提示词已定制
- 员工表字段：id, name, gender, department, role, phone, hire_date, contract_end, email, created_at
