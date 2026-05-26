// 销售管理 Agent — 客户跟进 + 销售机会 + 合同签署 + 业绩统计

const systemPrompt = `你是 MClaw 销售管理助手「小销」。你负责管理销售全流程：客户跟进、线索转化、销售机会推进、合同签署和业绩统计。

## 你的能力范围
- **客户管理**: 查询/新增/更新客户信息，添加跟进记录
- **联系人**: 查看客户联系人
- **销售机会**: 查看和创建销售机会，跟踪阶段推进
- **线索**: 查看线索列表
- **合同**: 查看和创建合同
- **报价单**: 查看报价单
- **营销活动**: 查看营销活动

## 行为准则
- 用户叫"老板"，用中文回复，简洁直接
- 查询数据时**必须调用工具**获取真实数据，禁止编造
- 创建/修改数据时**必须调用工具**执行操作
- 返回数据后，用表格展示关键字段，不要原样输出 JSON
- 数字、金额用 **加粗** 突出

## 问候与身份
- 当用户说"你好""hi""嗨"等问候语时，以「小销」身份回应："你好老板！我是小销，您的销售管理助手。我可以帮您管理客户跟进、销售机会、线索转化、合同签署和报价。请问今天需要处理什么销售事务？"
- 日常对话中不要反复自我介绍，只在问候时说明身份

## 输出格式
- 数据查询结果**必须用 Markdown 表格**展示，表头加粗
- 2 条以上数据用表格，单条数据可用列表
- 表格列不要超过 5 列，多余的列省略

## 禁止事项
- 禁止引导流程（不要问"需要我帮您做什么吗"）
- 禁止编造数据（没有查到就说没有）
- 禁止操作进销存、人事、文档等非销售数据`;

const tools = [
  {
    type: 'function',
    function: {
      name: 'list_customers',
      description: '查询所有客户列表',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_customer',
      description: '查询单个客户详情，包含跟进记录',
      parameters: {
        type: 'object',
        properties: { customer_id: { type: 'string', description: '客户ID' } },
        required: ['customer_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_customer',
      description: '新增客户',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '客户姓名（必填）' },
          phone: { type: 'string', description: '电话' },
          company: { type: 'string', description: '公司名称' },
          source: { type: 'string', description: '客户来源' },
          remark: { type: 'string', description: '备注' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_customer',
      description: '更新客户信息',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: '客户ID' },
          name: { type: 'string' }, phone: { type: 'string' },
          company: { type: 'string' }, source: { type: 'string' }, remark: { type: 'string' }
        },
        required: ['customer_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_follow_up',
      description: '为客户添加跟进记录',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: '客户ID' },
          content: { type: 'string', description: '跟进内容' },
          next_contact_date: { type: 'string', description: '下次联系日期 YYYY-MM-DD' }
        },
        required: ['customer_id', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_contacts',
      description: '查询联系人列表，可按客户ID过滤',
      parameters: {
        type: 'object',
        properties: { customer_id: { type: 'string', description: '可选，按客户ID过滤' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_opportunities',
      description: '查询所有销售机会',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_opportunity',
      description: '创建新的销售机会',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '机会名称（必填）' },
          customer_id: { type: 'string', description: '关联客户ID' },
          stage: { type: 'string', enum: ['contact', 'demo', 'proposal', 'negotiation', 'closed'], description: '阶段' },
          amount: { type: 'number', description: '预计金额' },
          probability: { type: 'integer', description: '赢率 0-100' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_leads',
      description: '查询所有线索',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_contracts',
      description: '查询所有合同',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_contract',
      description: '创建新合同',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: '关联客户ID' },
          title: { type: 'string', description: '合同标题（必填）' },
          total: { type: 'number', description: '合同金额' },
          start_date: { type: 'string', description: '开始日期' },
          end_date: { type: 'string', description: '结束日期' },
          content: { type: 'string', description: '合同内容' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_quotations',
      description: '查询所有报价单',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_campaigns',
      description: '查询所有营销活动',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard_stats',
      description: '获取企业数据概览（客户数、机会数、合同数等）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  }
];

module.exports = { systemPrompt, tools };
