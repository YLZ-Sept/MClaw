// 售后管理 Agent — SupportSkill（智能客服）
// 范围：FAQ 问答 + 工单管理 + 客户反馈 + 客户信息查询

const systemPrompt = `你是 MClaw 售后客服助手「小客」。你负责处理客户咨询、创建和跟进工单、记录客户反馈。

## 你的能力范围
- FAQ 知识库问答（退货、使用问题、常见故障等）
- 工单管理（查看、创建、更新、删除）
- 客户信息查询（按姓名或电话查找客户）
- 客户反馈记录

## 行为准则
- 用户叫"老板"，用中文回复，简洁直接
- 如果系统提示中包含「相关FAQ知识库」且能回答用户问题，优先使用FAQ内容回答
- 查询工单、客户等数据时必须调用工具获取真实数据
- 创建工单时必须调用工具，不要凭空捏造
- 按姓名或电话查客户时，用 search_customer 搜索
- 返回数据用表格展示关键字段

## 输出格式
- 数据查询结果**必须用 Markdown 表格**展示，表头加粗
- 2 条以上数据用表格，单条数据可用列表
- FAQ 回答直接引用知识库内容，保持原文风格
- 工单创建成功显示工单 ID 和摘要

## 转人工条件
满足以下任一条件时，**不要做任何其他查询，立刻调用 handoff_to_human 工具**：
- 用户明确表示投诉、愤怒、数据丢失、要求赔偿
- 用户直接说"转人工""找你们领导""投诉"
- FAQ 知识库无匹配且工单无法解决问题
- 连续两轮对话无法解决用户问题

调用时 summary 请包含：用户身份（如已知）、核心诉求、情绪状态、建议转接部门（技术/商务/售后）。

转人工后回复："非常抱歉给您带来不便，我已为您记录并通知人工客服优先处理。以下是对话摘要：……"

## 问候与身份
- 当用户说"你好""hi""嗨"等问候语时，以「小客」身份回应："你好！我是小客，MClaw 售后客服助手。我可以帮您查询 FAQ 知识库、管理工单、查看客户信息和记录反馈。请问有什么可以帮您的？"
- 日常对话中不要反复自我介绍，只在问候时说明身份

## 禁止事项
- 禁止操作产品、库存、员工、合同等非客服数据
- 禁止修改客户信息或删除数据`;

const tools = [
  {
    type: 'function',
    function: {
      name: 'search_faq',
      description: '搜索 FAQ 知识库',
      parameters: {
        type: 'object',
        properties: { q: { type: 'string', description: '问题关键词' } },
        required: ['q']
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
      name: 'get_ticket',
      description: '查询单个工单详情',
      parameters: {
        type: 'object',
        properties: { ticket_id: { type: 'string', description: '工单ID' } },
        required: ['ticket_id']
      }
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
          customer_id: { type: 'string', description: '客户ID（可选）' },
          title: { type: 'string', description: '工单标题（必填）' },
          description: { type: 'string', description: '问题描述' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: '优先级' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_ticket',
      description: '更新工单状态或指派人',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string', description: '工单ID' },
          status: { type: 'string', enum: ['open', 'in_progress', 'resolved'], description: '新状态' },
          assigned_to: { type: 'string', description: '指派人' }
        },
        required: ['ticket_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_ticket',
      description: '删除工单',
      parameters: {
        type: 'object',
        properties: { ticket_id: { type: 'string', description: '工单ID' } },
        required: ['ticket_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_customer',
      description: '按姓名或电话搜索客户',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '姓名或电话关键词' }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_customer',
      description: '查询单个客户详情及跟进记录',
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
      name: 'list_feedback',
      description: '查询所有客户反馈',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_feedback',
      description: '记录客户反馈',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: '客户ID（可选）' },
          rating: { type: 'integer', description: '评分 1-5' },
          category: { type: 'string', description: '类别' },
          content: { type: 'string', description: '反馈内容' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_feedback',
      description: '删除客户反馈记录',
      parameters: {
        type: 'object',
        properties: { feedback_id: { type: 'string', description: '反馈ID' } },
        required: ['feedback_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'handoff_to_human',
      description: '转人工客服：问题无法解决时创建紧急工单并附对话摘要',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: '关联客户ID（如有）' },
          summary: { type: 'string', description: '对话摘要：用户是谁、核心问题、已尝试的方式、建议转接部门' },
          priority: { type: 'string', enum: ['high', 'urgent'], description: '紧急程度，默认 high' }
        },
        required: ['summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard_stats',
      description: '获取数据概览（工单数、反馈数、FAQ数等）',
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
          name: { type: 'string', description: '任务名称，如「每日工单汇总」' },
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
