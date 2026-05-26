// 内部管理 Agent — system prompt + tools 定义
// 四大 Skill: CRM / 进销存 / 人事 / 文档

const systemPrompt = `你是 MClaw 企业内部管理助手「小内」。你是老板的智能助理，可以查询和操作企业的真实业务数据。

## 你的能力范围
- **CRM**: 客户管理、联系人、销售机会、线索、合同、工单、报价、营销活动、客户反馈
- **进销存**: 采购入库、销售出库、库存台账、退换货管理、库存预警
- **人事**: 员工档案、部门、绩效考核月报、考勤月报
- **文档**: 文档列表、文档搜索、文档分类

## 行为准则
- 用户叫"老板"，用中文回复，简洁直接
- **如果系统提示中包含「相关FAQ知识库」且能回答用户问题，直接使用FAQ内容回答，不要调用工具**
- 查询数据时**必须调用工具**获取真实数据，禁止编造
- 创建/修改数据时**必须调用工具**执行操作
- 涉及具体员工姓名时，先用 search_employee 找到员工ID再操作
- 用户问"如何""怎么""流程"等知识类问题时，用 search_faq 搜索知识库
- 如果老板的指令不明确，主动调用最可能的查询工具
- 返回数据后，用表格展示关键字段，不要原样输出 JSON
- 禁止问老板"是哪位员工"之类的反问，直接搜

## 输出格式
- 数据查询结果**必须用 Markdown 表格**展示，表头加粗
- 2 条以上数据用表格，单条数据可用列表
- 操作结果用简洁的一句话确认结果
- 数字、金额、状态用 **加粗** 突出
- 表格列不要超过 5 列，多余的列省略

## 问候与身份
- 当用户说"你好""hi""嗨"等问候语时，以「小内」身份回应："你好老板！我是小内，您的企业内部管理助手。我可以帮您处理 CRM（客户/线索/合同/工单）、进销存（采购/销售/库存/退换货）、人事（员工/绩效）和文档管理。请问有什么需要处理的？"
- 日常对话中不要反复自我介绍，只在问候时说明身份

## 禁止事项
- 禁止引导流程（不要问"需要我帮您做什么吗"）
- 禁止编造数据（没有查到就说没有）`;

// ===== 工具定义 =====

const tools = [
  // ─── CRM ───
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
      name: 'list_tickets',
      description: '查询所有工单',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_ticket',
      description: '创建新工单',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: '关联客户ID' },
          title: { type: 'string', description: '工单标题（必填）' },
          description: { type: 'string', description: '工单描述' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: '优先级' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_feedback',
      description: '查询所有客户反馈',
      parameters: { type: 'object', properties: {}, required: [] }
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
      name: 'list_asset_ledger',
      description: '查询库存台账（含厂商、品类、产品名称、型号、入库数量、出库数量、库存余量、单价、库存价值）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },

  // ─── 进销存 ───
  {
    type: 'function',
    function: {
      name: 'list_purchase_orders',
      description: '查询采购入库记录（含供应商、品牌、品类、名称、型号、数量、单价、总价、入库日期）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_sales_orders',
      description: '查询销售出库记录（含客户、经销商、产品名称、型号、数量、单价、总价、出库日期）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_returns',
      description: '查询退换货记录（含单据类型、关联单号、产品名称、型号、数量、原因、类型、状态）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_return',
      description: '创建退换货记录',
      parameters: {
        type: 'object',
        properties: {
          order_type: { type: 'string', enum: ['sales', 'purchase'], description: '单据类型：sales=销售，purchase=采购' },
          order_id: { type: 'string', description: '关联单号' },
          product_name: { type: 'string', description: '产品名称（必填）' },
          model: { type: 'string', description: '型号' },
          quantity: { type: 'number', description: '数量' },
          reason: { type: 'string', description: '原因' },
          type: { type: 'string', enum: ['return', 'exchange'], description: '类型：return=退货，exchange=换货' },
          exchange_product: { type: 'string', description: '换货产品名称（换货时填写）' }
        },
        required: ['product_name']
      }
    }
  },

  // ─── 人事 ───
  {
    type: 'function',
    function: {
      name: 'list_employees',
      description: '查询所有员工列表（含性别、部门、职位、电话、入职时间、合同到期、邮箱）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_employee',
      description: '新增员工',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '姓名（必填）' },
          gender: { type: 'string', description: '性别：男/女' },
          department: { type: 'string', description: '部门' },
          role: { type: 'string', description: '职位' },
          phone: { type: 'string', description: '电话' },
          hire_date: { type: 'string', description: '入职时间，如 2025.1.1' },
          contract_end: { type: 'string', description: '劳动合同到期时间，如 2030.6.30' },
          email: { type: 'string', description: '邮箱' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_departments',
      description: '查询组织架构（部门列表）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_performance_reports',
      description: '查询绩效考核月报。返回员工各维度评分明细和总分，按月筛选',
      parameters: {
        type: 'object',
        properties: { month: { type: 'string', description: '月份，格式YYYY-MM，不传默认当月' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_attendance_reports',
        description: '查询考勤月报，返回员工出勤天数、迟到、旷工、加班、各类假期等明细',
        parameters: {
          type: 'object',
          properties: { month: { type: 'string', description: '月份，格式YYYY-MM，不传默认当月' } },
          required: []
        }
      }
    },

  // ─── 文档 ───
  {
    type: 'function',
    function: {
      name: 'list_documents',
      description: '查询所有文档列表',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_documents',
      description: '按关键词搜索文档',
      parameters: {
        type: 'object',
        properties: { q: { type: 'string', description: '搜索关键词' } },
        required: ['q']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_document_folders',
      description: '查询文档分类列表',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },

  // ─── 搜索 ───
  {
    type: 'function',
    function: {
      name: 'search_employee',
      description: '按姓名模糊搜索员工（名字包含关键词即可）',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: '员工姓名关键词' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_faq',
      description: '搜索 FAQ 知识库，匹配相关问题及答案',
      parameters: {
        type: 'object',
        properties: { q: { type: 'string', description: '搜索问题关键词' } },
        required: ['q']
      }
    }
  },

  // ─── 通用统计 ───
  {
    type: 'function',
    function: {
      name: 'get_dashboard_stats',
      description: '获取企业数据概览（各模块记录数统计）',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  }
];

module.exports = { systemPrompt, tools };
