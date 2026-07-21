// Tool Guard — 工具安全审批栅栏
// 参考 mateclaw ToolGuardService，纯函数 + 内存审批状态
const crypto = require('crypto');
let _audit = null;
function audit() { if (!_audit) _audit = require('../services/audit'); return _audit; }

// 危险工具分级
const TOOL_RISK_LEVELS = {
  critical: { desc: '可能造成不可逆损害', needsApproval: true },
  high: { desc: '删除/修改关键数据', needsApproval: true },
  medium: { desc: '创建新数据', needsApproval: false },
  low: { desc: '只读操作', needsApproval: false }
};

// 风险工具清单（name → { level, desc }）
const RISK_TOOLS = {
  execute_command: { level: 'critical', desc: '执行系统命令' },
  run_python: { level: 'critical', desc: '执行 Python 脚本' },
  run_node: { level: 'critical', desc: '执行 Node.js 脚本' },
  ssh_exec: { level: 'critical', desc: 'SSH 远程执行' },

  delete_customer: { level: 'high', desc: '删除客户数据' },
  delete_opportunity: { level: 'high', desc: '删除商机' },
  delete_contract: { level: 'high', desc: '删除合同' },
  delete_employee: { level: 'high', desc: '删除员工' },
  delete_recruitment: { level: 'high', desc: '删除招聘记录' },
  delete_ticket: { level: 'high', desc: '删除工单' },
  delete_feedback: { level: 'high', desc: '删除反馈' },
  delete_hot_product: { level: 'high', desc: '删除爆款产品' },
  delete_hot_content: { level: 'high', desc: '删除爆款内容' },
  delete_document: { level: 'high', desc: '删除文档' },
  remove_customer: { level: 'high', desc: '移除客户' },
  clear_memory: { level: 'high', desc: '清除记忆' },

  create_purchase_order: { level: 'medium', desc: '创建采购单' },
  create_sales_order: { level: 'medium', desc: '创建销售单' },
};

// 审批状态（内存存储，进程生命周期）
const pendingApprovals = new Map();

// 定时清理过期审批（每 10 分钟清理超过 1 小时的审批）
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pendingApprovals) {
    if (now - entry.createdAt > 3600_000) pendingApprovals.delete(id);
  }
}, 600_000).unref();

/**
 * 检查工具是否需要审批
 * @returns {{ needed: boolean, level: string, desc: string }}
 */
function needsApproval(toolName) {
  const risk = RISK_TOOLS[toolName];
  if (!risk) return { needed: false, level: 'low', desc: '' };
  return { needed: TOOL_RISK_LEVELS[risk.level]?.needsApproval || false, ...risk };
}

/**
 * 发起审批请求
 * @returns approval 对象 { id, toolName, args, status, createdAt }
 */
function requestApproval(toolName, args = {}) {
  const id = 'apr_' + crypto.randomUUID().slice(0, 8);
  const entry = {
    id,
    toolName,
    args: JSON.stringify(args, null, 2).slice(0, 500),
    status: 'pending',
    createdAt: Date.now()
  };
  pendingApprovals.set(id, entry);
  audit().recordAudit({ eventType: 'approval_requested', toolName, argsSummary: entry.args, approvalId: id });
  try { require('../channels/event-bus').broadcast({ type: 'approval_requested', tool: toolName, approval_id: id, time: Date.now() }); } catch {}
  return entry;
}

/**
 * 批准
 * @returns {{ success: boolean, entry }}
 */
function approve(id) {
  const entry = pendingApprovals.get(id);
  if (!entry) return { success: false, error: '审批不存在或已过期' };
  entry.status = 'approved';
  pendingApprovals.delete(id);
  audit().recordAudit({ eventType: 'approval_granted', toolName: entry.toolName, approvalId: id });
  return { success: true, entry };
}

/**
 * 拒绝
 * @returns {{ success: boolean, entry }}
 */
function deny(id) {
  const entry = pendingApprovals.get(id);
  if (!entry) return { success: false, error: '审批不存在或已过期' };
  entry.status = 'denied';
  pendingApprovals.delete(id);
  audit().recordAudit({ eventType: 'approval_denied', toolName: entry.toolName, approvalId: id });
  return { success: true, entry };
}

/**
 * 获取等待中的审批列表
 */
function getPendingApprovals() {
  return [...pendingApprovals.values()].sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = {
  TOOL_RISK_LEVELS,
  RISK_TOOLS,
  needsApproval,
  requestApproval,
  approve,
  deny,
  getPendingApprovals,
  pendingApprovals
};
