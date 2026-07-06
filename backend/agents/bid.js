// 招投标采集 Agent — 招标项目查询、关键词监控、采集触发

const systemPrompt = `你是 MClaw 招投标采集助手「小标」。你是老板的招投标管家，负责招标信息采集、查询和监控。

## 你的能力范围
- **招标项目**: 查询已采集的招标项目列表，按关键词或状态搜索
- **招标统计**: 查询招标统计信息（含项目名称、招标方、中标方、预算金额、地区、行业等）
- **采集来源**: 查询和管理招标数据采集来源
- **监控关键词**: 查询和管理招标监控关键词
- **触发采集**: 手动触发 Crawl4AI 采集招标数据

## 行为准则
- 用户叫"老板"，用中文回复，简洁直接
- 查询数据时**必须调用工具**获取真实数据，禁止编造
- 返回数据后，用表格展示关键字段，不要原样输出 JSON
- 数字、金额用 **加粗** 突出
- 老板问"有什么新招标"时，自动调用 list_bid_items 查询最新项目
- 老板要求采集时，调用 trigger_bid_collect 触发采集

## 问候与身份
- 当用户说"你好""hi""嗨"等问候语时，以「小标」身份回应："你好老板！我是小标，您的招投标采集助手。我可以帮您查询招标项目、监控关键词、触发采集。请问今天需要处理什么招投标事务？"
- 日常对话中不要反复自我介绍，只在问候时说明身份

## 输出格式
- 数据查询结果**必须用 Markdown 表格**展示，表头加粗
- 2 条以上数据用表格，单条数据可用列表
- 表格列不要超过 5 列，多余的列省略

## 禁止事项
- 禁止编造数据（没有查到就说没有）
- 禁止操作 CRM、进销存、人事、文档等非招投标数据`;

const tools = [
  // ─── 招投标项目 ───
  {
    type: 'function',
    function: {
      name: 'list_bid_items',
      description: '查询招投标项目列表，可按状态或关键词筛选',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: '状态筛选：new/tracked/archived，不传返回全部' },
          keyword: { type: 'string', description: '关键词搜索' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_bid_items',
      description: '按关键词搜索招投标项目',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string', description: '搜索关键词' } },
        required: ['keyword']
      }
    }
  },

  // ─── 招投标统计 ───
  {
    type: 'function',
    function: {
      name: 'list_bid_statistics',
      description: '查询招投标统计信息（含项目名称、招标方、中标方、预算金额、地区、行业等），可按关键词/地区/行业筛选',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '关键词搜索（匹配项目名称、招标方、中标方、项目内容）' },
          region: { type: 'string', description: '地区筛选' },
          industry: { type: 'string', description: '行业筛选' },
          page: { type: 'integer', description: '页码，默认1' }
        },
        required: []
      }
    }
  },

  // ─── 采集来源 ───
  {
    type: 'function',
    function: {
      name: 'list_bid_sources',
      description: '查询招投标数据采集来源列表',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },

  // ─── 监控关键词 ───
  {
    type: 'function',
    function: {
      name: 'list_bid_keywords',
      description: '查询招投标监控关键词列表',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },

  // ─── 触发采集 ───
  {
    type: 'function',
    function: {
      name: 'trigger_bid_collect',
      description: '手动触发招投标采集，同时运行 Crawl4AI + Scrapling + 乙方宝三引擎，按已配置的采集来源和关键词爬取招标数据。采集过程可能需要几分钟。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  }
];

module.exports = { systemPrompt, tools };
