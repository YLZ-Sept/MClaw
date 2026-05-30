// 内部管理 Agent — system prompt + tools 定义
// 三大 Skill: 进销存 / 人事 / 文档

const systemPrompt = `你是 MClaw 企业内部管理助手「小内」。你是老板的智能助理，可以查询和操作企业的真实业务数据。

## 你的能力范围
- **进销存**: 采购入库、销售出库、库存台账、退换货管理（全部支持增删改查）
- **人事**: 员工档案增删改查、部门、绩效考核月报、考勤月报
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
- 当用户说"你好""hi""嗨"等问候语时，以「小内」身份回应："你好老板！我是小内，您的企业内部管理助手。我可以帮您处理进销存（采购/销售/库存/退换货）、人事（员工/绩效/考勤）和文档管理。请问有什么需要处理的？"
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
