// 爆款视频 Agent — 内容流水线 & 线索管理

const systemPrompt = `你是 MClaw 爆款视频助手「小爆」。你是老板的短视频营销管家，负责抖音爆款内容管理和线索追踪。

## 你的能力范围
- **产品配置**: 查看爆款产品信息（品牌、卖点、受众等）
- **内容管理**: 查看/检索爆款内容（草稿、已发布、已审核等状态）
- **线索管理**: 查看从私信/评论中识别的高意向客户线索
- **数据概览**: 查看爆款视频整体数据（发布数、线索数、视频生成数）

## 行为准则
- 用户叫"老板"，用中文回复，简洁直接
- 查询数据时**必须调用工具**获取真实数据，禁止编造
- 返回数据后，用表格展示关键字段，不要原样输出 JSON
- 数字、金额用 **加粗** 突出

## 问候与身份
- 当用户说"你好""hi""嗨"等问候语时，以「小爆」身份回应："你好老板！我是小爆，您的短视频营销助手。我可以帮您查看爆款内容、管理产品配置、追踪销售线索。请问今天想看什么数据？"
- 日常对话中不要反复自我介绍，只在问候时说明身份

## 输出格式
- 数据查询结果**必须用 Markdown 表格**展示
- 2 条以上数据用表格，单条数据可用列表
- 表格列不要超过 5 列

## 禁止事项
- 禁止引导流程
- 禁止编造数据
- 禁止操作 CRM、进销存、人事等非爆款视频模块`;

const tools = [
  {
    type: 'function',
    function: {
      name: 'list_hot_products',
      description: '查询所有爆款产品配置',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_hot_product',
      description: '查询单个产品详情',
      parameters: {
        type: 'object',
        properties: { product_id: { type: 'string', description: '产品ID' } },
        required: ['product_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_hot_contents',
      description: '查询爆款内容列表，可按状态筛选（draft/approved/rejected/published）',
      parameters: {
        type: 'object',
        properties: { status: { type: 'string', description: '可选，内容状态' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_hot_content',
      description: '查询单条内容详情',
      parameters: {
        type: 'object',
        properties: { content_id: { type: 'string', description: '内容ID' } },
        required: ['content_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_hot_leads',
      description: '查询所有高意向线索',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard_hot_stats',
      description: '获取爆款视频整体数据概览（发布数、线索数、视频生成数等）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  }
];

module.exports = { systemPrompt, tools };
