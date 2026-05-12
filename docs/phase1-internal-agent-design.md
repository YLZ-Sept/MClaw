# Phase 1：内部管理 Agent 实现方案

## 架构

```
Vue 前端表单页面 ←→ MClaw Express 后端 (:3666) ←→ SQLite 数据库
                             ↕ (tool_call)
                      OpenClaw 网关 (:3098) ←→ DeepSeek
```

- 所有数据存在 `backend/data/internal.db`（SQLite）
- 文档向量存在 ChromaDB
- 表单页面 + 聊天自然语言双入口并行

## 数据表（4 个模块）

| 模块 | 表 | 说明 |
|---|---|---|
| 客户管理 | customers, follow_ups | 客户增删改查 + 跟进记录 |
| 进销存 | products, inventory, stock_transactions | 产品管理 + 出入库 |
| 人事考勤 | employees, leave_requests | 员工管理 + 请假 |
| 文档管理 | documents + ChromaDB | 上传/搜索/向量检索 |

## API 设计

```
GET/POST    /api/customers          客户列表/新增
GET/PUT/DEL /api/customers/:id      客户详情/修改/删除
GET/POST    /api/customers/:id/follow-ups  跟进记录

GET/POST    /api/products           产品列表/新增
GET/PUT/DEL /api/products/:id
POST        /api/inventory/stock-in   入库
POST        /api/inventory/stock-out  出库
GET         /api/inventory/query      库存查询

GET/POST    /api/employees
GET/PUT/DEL /api/employees/:id
GET/POST    /api/leave-requests
PUT         /api/leave-requests/:id/approve  审批

POST        /api/documents/upload    上传 + 向量化
GET         /api/documents           文档列表
DEL         /api/documents/:id       删除
GET         /api/documents/search?q= 语义搜索
```

## 前端

新增路由 `/internal`，页面内 4 个 Tab 页：

- 客户管理 → 表格 + 新增/编辑弹窗
- 进销存 → 产品表格 + 出入库表单
- 人事考勤 → 员工列表 + 请假申请
- 文档管理 → 上传区域 + 文件列表 + 搜索框

## OpenClaw 集成

为每个模块注册 1-2 个关键 tool（如 `add_customer`、`query_inventory`），让聊天也能操作数据。高频录入走表单，查询和协作走自然语言。

## 顺序

DB → API → OpenClaw tools → 前端页面 → 验证
