// 企业经营管理 Agent — system prompt + tools 定义
// 三大 Skill: 进销存 / 人事 / 文档

const systemPrompt = `你是 MClaw 企业经营管理助手「小内」。你是老板的智能助理，可以查询和操作企业的真实业务数据。

## 你的能力范围
- **进销存**: 采购入库、销售出库、库存台账、退换货管理（全部支持增删改查）
- **人事**: 员工档案增删改查、部门、绩效考核月报、考勤月报、招聘管理
- **财务**: 应收账款、应付账款查询及汇总统计
- **招投标**: 招标公告查询、关键词搜索、来源管理
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
- **注意：CRM（客户/线索/合同/工单/反馈等）已移交给销售助手「小销」，如需处理CRM请切换到小销**

## 输出格式
- 数据查询结果**必须用 Markdown 表格**展示，表头加粗
- 2 条以上数据用表格，单条数据可用列表
- 操作结果用简洁的一句话确认结果
- 数字、金额、状态用 **加粗** 突出
- 表格列不要超过 5 列，多余的列省略

## 问候与身份
- 当用户说"你好""hi""嗨"等问候语时，以「小内」身份回应："你好老板！我是小内，您的企业经营管理助手。我可以帮您处理进销存（采购/销售/库存/退换货）、人事（员工/绩效/考勤）和文档管理。请问有什么需要处理的？"
- 日常对话中不要反复自我介绍，只在问候时说明身份

## 禁止事项
- 禁止引导流程（不要问"需要我帮您做什么吗"）
- 禁止编造数据（没有查到就说没有）
- 禁止越权处理CRM相关事务`;

// ===== 工具定义 =====

const tools = [
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
  {
    type: 'function',
    function: {
      name: 'get_return',
      description: '按ID查询单条退换货记录详情',
      parameters: {
        type: 'object',
        properties: { return_id: { type: 'string', description: '退换货记录ID' } },
        required: ['return_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_return',
      description: '更新退换货记录',
      parameters: {
        type: 'object',
        properties: {
          return_id: { type: 'string', description: '记录ID（必填）' },
          order_type: { type: 'string' }, order_id: { type: 'string' },
          product_name: { type: 'string' }, model: { type: 'string' },
          quantity: { type: 'number' }, reason: { type: 'string' },
          type: { type: 'string' }, exchange_product: { type: 'string' }
        },
        required: ['return_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_purchase_order',
      description: '创建采购入库单',
      parameters: {
        type: 'object',
        properties: {
          supplier_id: { type: 'string', description: '供应商ID' },
          total: { type: 'number', description: '总金额' },
          status: { type: 'string', description: '状态：draft/ordered/received' },
          ordered_date: { type: 'string', description: '下单日期' },
          received_date: { type: 'string', description: '入库日期' },
          remark: { type: 'string', description: '备注' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_purchase_order',
      description: '查询单个采购单详情',
      parameters: {
        type: 'object',
        properties: { purchase_order_id: { type: 'string', description: '采购单ID' } },
        required: ['purchase_order_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_purchase_order',
      description: '更新采购单',
      parameters: {
        type: 'object',
        properties: {
          purchase_order_id: { type: 'string', description: '采购单ID（必填）' },
          supplier_id: { type: 'string' }, total: { type: 'number' },
          status: { type: 'string' }, ordered_date: { type: 'string' },
          received_date: { type: 'string' }, remark: { type: 'string' }
        },
        required: ['purchase_order_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_sales_order',
      description: '创建销售出库单',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: '客户ID' },
          total: { type: 'number', description: '总金额' },
          status: { type: 'string', description: '状态：draft/shipped/delivered' },
          order_date: { type: 'string', description: '下单日期' },
          remark: { type: 'string', description: '备注' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sales_order',
      description: '查询单个销售单详情',
      parameters: {
        type: 'object',
        properties: { sales_order_id: { type: 'string', description: '销售单ID' } },
        required: ['sales_order_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_sales_order',
      description: '更新销售单',
      parameters: {
        type: 'object',
        properties: {
          sales_order_id: { type: 'string', description: '销售单ID（必填）' },
          customer_id: { type: 'string' }, total: { type: 'number' },
          status: { type: 'string' }, order_date: { type: 'string' },
          remark: { type: 'string' }
        },
        required: ['sales_order_id']
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
      name: 'get_employee',
      description: '按ID查询单个员工详情',
      parameters: {
        type: 'object',
        properties: { employee_id: { type: 'string', description: '员工ID' } },
        required: ['employee_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_employee',
      description: '更新员工信息（只需传要修改的字段，未传字段保持不变）',
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'string', description: '员工ID（必填）' },
          name: { type: 'string' }, gender: { type: 'string' },
          department: { type: 'string' }, role: { type: 'string' },
          phone: { type: 'string' }, hire_date: { type: 'string' },
          contract_end: { type: 'string' }, email: { type: 'string' }
        },
        required: ['employee_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_employee',
      description: '删除员工',
      parameters: {
        type: 'object',
        properties: { employee_id: { type: 'string', description: '员工ID' } },
        required: ['employee_id']
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

  // ─── 招聘 ───
  {
    type: 'function',
    function: {
      name: 'list_recruitment',
      description: '查询招聘职位列表，可按状态筛选（open/closed）',
      parameters: {
        type: 'object',
        properties: { status: { type: 'string', description: '状态筛选：open 或 closed，不传返回全部' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_recruitment',
      description: '新增招聘职位',
      parameters: {
        type: 'object',
        properties: {
          position: { type: 'string', description: '职位名称' },
          department: { type: 'string', description: '所属部门' },
          headcount: { type: 'integer', description: '招聘人数，默认1' },
          salary_range: { type: 'string', description: '薪资范围，如15K-25K' },
          requirements: { type: 'string', description: '任职要求' }
        },
        required: ['position']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_recruitment',
      description: '更新招聘职位信息',
      parameters: {
        type: 'object',
        properties: {
          recruitment_id: { type: 'string', description: '职位ID' },
          position: { type: 'string', description: '职位名称' },
          department: { type: 'string', description: '所属部门' },
          headcount: { type: 'integer', description: '招聘人数' },
          salary_range: { type: 'string', description: '薪资范围' },
          requirements: { type: 'string', description: '任职要求' },
          status: { type: 'string', description: '状态：open 或 closed' }
        },
        required: ['recruitment_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_recruitment',
      description: '删除招聘职位（同时删除其候选人）',
      parameters: {
        type: 'object',
        properties: { recruitment_id: { type: 'string', description: '职位ID' } },
        required: ['recruitment_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_candidates',
      description: '查询候选人列表，按职位ID筛选',
      parameters: {
        type: 'object',
        properties: {
          recruitment_id: { type: 'string', description: '职位ID，不传返回全部' },
          status: { type: 'string', description: '状态筛选：pending/screening/interview/offer/hired/rejected' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_candidate',
      description: '添加候选人到某个职位',
      parameters: {
        type: 'object',
        properties: {
          recruitment_id: { type: 'string', description: '职位ID' },
          name: { type: 'string', description: '候选人姓名' },
          phone: { type: 'string', description: '联系电话' },
          email: { type: 'string', description: '邮箱' },
          remark: { type: 'string', description: '备注' }
        },
        required: ['recruitment_id', 'name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_candidate_status',
      description: '更新候选人状态',
      parameters: {
        type: 'object',
        properties: {
          candidate_id: { type: 'string', description: '候选人ID' },
          status: { type: 'string', description: '新状态：pending/screening/interview/offer/hired/rejected' },
          remark: { type: 'string', description: '备注' }
        },
        required: ['candidate_id', 'status']
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

  // ─── 财务管理 ───
  {
    type: 'function',
    function: {
      name: 'list_finance_records',
      description: '查询财务记录（应收账款或应付账款），按类型筛选',
      parameters: {
        type: 'object',
        properties: { type: { type: 'string', enum: ['receivable', 'payable'], description: '类型：receivable=应收账款，payable=应付账款' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_finance_summary',
      description: '获取财务汇总统计（应收/应付账款总额、已收/已付、未收/未付）',
      parameters: { type: 'object', properties: {}, required: [] }
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

  // ─── 招投标 ───
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
  {
    type: 'function',
    function: {
      name: 'list_bid_sources',
      description: '查询招投标数据来源列表',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_bid_keywords',
      description: '查询招投标监控关键词列表',
      parameters: { type: 'object', properties: {}, required: [] }
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
