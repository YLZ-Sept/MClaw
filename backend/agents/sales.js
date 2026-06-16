// 销售管理 Agent — CRM 核心：客户/联系人/机会/线索/合同

const systemPrompt = `你是 MClaw 销售管理助手「小销」。你是老板的销售管家，负责客户关系管理（CRM）。

## 你的能力范围
- **客户信息**: 查询/新增/更新/删除客户，添加跟进记录，查看客户联系人
- **项目商机**: 查看、创建、更新、删除项目商机（初步接触→需求确认→方案报价→商务谈判→签约）
- **合同订单**: 查看、创建、更新、删除合同

## 行为准则
- 用户叫"老板"，用中文回复，简洁直接
- 查询数据时**必须调用工具**获取真实数据，禁止编造
- 创建/修改数据时**必须调用工具**执行操作
- 返回数据后，用表格展示关键字段，不要原样输出 JSON
- 数字、金额用 **加粗** 突出

## 问候与身份
- 当用户说"你好""hi""嗨"等问候语时，以「小销」身份回应："你好老板！我是小销，您的销售管理助手。我可以帮您管理客户信息、项目商机和合同订单。请问今天需要处理什么销售事务？"
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
          name: { type: 'string', description: '客户名称（必填）' },
          phone: { type: 'string', description: '联系电话' },
          company: { type: 'string', description: '所属单位' },
          position: { type: 'string', description: '职务' },
          gender: { type: 'string', description: '性别' },
          age: { type: 'integer', description: '年龄' },
          traits: { type: 'string', description: '个人特征' },
          preferences: { type: 'string', description: '个人喜好' },
          contact_frequency: { type: 'string', description: '接触频次' },
          address: { type: 'string', description: '地址' }
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
          company: { type: 'string' }, position: { type: 'string' },
          gender: { type: 'string' }, age: { type: 'integer' },
          traits: { type: 'string' }, preferences: { type: 'string' },
          contact_frequency: { type: 'string' }, address: { type: 'string' }
        },
        required: ['customer_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_customer',
      description: '删除客户（同时删除关联的跟进记录）',
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
      description: '创建新的项目商机',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '商机名称（必填）' },
          sales_owner: { type: 'string', description: '所属销售' },
          contact_name: { type: 'string', description: '客户联系人' },
          contact_phone: { type: 'string', description: '联系电话' },
          description: { type: 'string', description: '商机需求描述' },
          amount: { type: 'number', description: '商机金额' },
          stage: { type: 'string', enum: ['contact', 'demo', 'proposal', 'negotiation', 'closed'], description: '阶段' },
          competition: { type: 'string', description: '竞争情况' },
          progress: { type: 'string', description: '商机进展' },
          next_plan: { type: 'string', description: '下一步计划' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_opportunity',
      description: '查询单个商机详情',
      parameters: {
        type: 'object',
        properties: { opportunity_id: { type: 'string', description: '商机ID' } },
        required: ['opportunity_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_opportunity',
      description: '更新项目商机信息（只需传要修改的字段）',
      parameters: {
        type: 'object',
        properties: {
          opportunity_id: { type: 'string', description: '商机ID（必填）' },
          title: { type: 'string' }, sales_owner: { type: 'string' },
          contact_name: { type: 'string' }, contact_phone: { type: 'string' },
          description: { type: 'string' }, amount: { type: 'number' },
          stage: { type: 'string', enum: ['contact', 'demo', 'proposal', 'negotiation', 'closed'] },
          competition: { type: 'string' }, progress: { type: 'string' },
          next_plan: { type: 'string' }
        },
        required: ['opportunity_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_opportunity',
      description: '删除项目商机',
      parameters: {
        type: 'object',
        properties: { opportunity_id: { type: 'string', description: '商机ID' } },
        required: ['opportunity_id']
      }
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
      description: '创建新合同订单',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '合同名称（必填）' },
          contract_no: { type: 'string', description: '合同编号' },
          sales_owner: { type: 'string', description: '所属销售' },
          contact_name: { type: 'string', description: '客户联系人' },
          contact_phone: { type: 'string', description: '联系电话' },
          content: { type: 'string', description: '合同内容（产品/服务）' },
          amount: { type: 'number', description: '合同金额' },
          signed_date: { type: 'string', description: '合同签订时间' },
          warranty_period: { type: 'string', description: '合同/质保期限' },
          prepaid_amount: { type: 'number', description: '预付金额' },
          receivable_amount: { type: 'number', description: '应收金额' },
          invoice: { type: 'string', description: '发票开具' },
          delivery_progress: { type: 'string', description: '合同交付进度' },
          remark: { type: 'string', description: '备注' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_contract',
      description: '查询单个合同详情（按合同ID）',
      parameters: {
        type: 'object',
        properties: { contract_id: { type: 'string', description: '合同ID' } },
        required: ['contract_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_contract',
      description: '更新合同信息（只需传要修改的字段，未传字段保持不变）',
      parameters: {
        type: 'object',
        properties: {
          contract_id: { type: 'string', description: '合同ID（必填）' },
          title: { type: 'string', description: '合同名称' },
          contract_no: { type: 'string', description: '合同编号' },
          sales_owner: { type: 'string', description: '所属销售' },
          contact_name: { type: 'string', description: '客户联系人' },
          contact_phone: { type: 'string', description: '联系电话' },
          content: { type: 'string', description: '合同内容' },
          amount: { type: 'number', description: '合同金额' },
          signed_date: { type: 'string', description: '签订时间' },
          warranty_period: { type: 'string', description: '合同/质保期限' },
          prepaid_amount: { type: 'number', description: '预付金额' },
          receivable_amount: { type: 'number', description: '应收金额' },
          invoice: { type: 'string', description: '发票开具' },
          delivery_progress: { type: 'string', description: '交付进度' },
          remark: { type: 'string', description: '备注' }
        },
        required: ['contract_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_contract',
      description: '删除合同',
      parameters: {
        type: 'object',
        properties: { contract_id: { type: 'string', description: '合同ID' } },
        required: ['contract_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard_stats',
      description: '获取企业数据概览（客户数、机会数、合同数等）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_scheduled_task',
      description: '创建一个定时任务。用户会用自然语言描述调度时间，你需要将自然语言转换为cron表达式或时间间隔格式。创建成功后任务会出现在「任务调度」管理页面中。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '任务名称，如「每日销售报表」' },
          schedule: { type: 'string', description: '调度规则。必须为以下格式之一：1)cron表达式如"0 9 * * *"（每天早上9点）或"0 9 * * 1"（每周一早上9点）；2)时间间隔如"30m"/"1h"；3)ISO时间戳表示一次性执行。请根据用户描述的频率转换为此格式。' },
          message: { type: 'string', description: '任务执行的具体内容，Agent将收到此消息并据此执行操作' },
          agent_id: { type: 'string', description: '执行此任务的智能体ID。可选：internal-agent(企业经营管理)、sales-agent(销售管理)、support-agent(售后管理)。留空使用默认。' },
          description: { type: 'string', description: '任务描述或备注（可选）' }
        },
        required: ['name', 'schedule', 'message']
      }
    }
  }
];

module.exports = { systemPrompt, tools };
