// Audit Trail — 敏感操作审计轨迹
const db = require('../db');
const crypto = require('crypto');

// 建表
db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor TEXT DEFAULT '',
  tool_name TEXT DEFAULT '',
  args_summary TEXT DEFAULT '',
  result_summary TEXT DEFAULT '',
  approval_id TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 索引
try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_logs(event_type)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)'); } catch {}

/**
 * 记录审计事件
 * @param {Object} event
 * @param {string} event.eventType — 'tool_executed' | 'tool_denied' | 'approval_granted' | 'approval_denied' | 'approval_requested'
 * @param {string} event.actor — 谁触发的（agent id 或用户名）
 * @param {string} event.toolName — 工具名
 * @param {string} event.argsSummary — 参数摘要
 * @param {string} event.resultSummary — 结果摘要
 * @param {string} event.approvalId — 审批 ID
 * @param {string} event.ip — 客户端 IP
 */
function recordAudit(event = {}) {
  const id = 'audit_' + crypto.randomUUID().slice(0, 12);
  try {
    db.prepare(`INSERT INTO audit_logs (id, event_type, actor, tool_name, args_summary, result_summary, approval_id, ip)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      id,
      event.eventType || 'unknown',
      event.actor || '',
      event.toolName || '',
      (event.argsSummary || '').slice(0, 500),
      (event.resultSummary || '').slice(0, 500),
      event.approvalId || '',
      event.ip || ''
    );
  } catch (e) {
    console.error('[audit] 写入失败:', e.message);
  }
}

/**
 * 查询审计日志
 */
function queryAudit({ eventType, toolName, limit = 100, offset = 0 } = {}) {
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  if (eventType) { sql += ' AND event_type=?'; params.push(eventType); }
  if (toolName) { sql += ' AND tool_name=?'; params.push(toolName); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

/**
 * 统计摘要
 */
function auditStats() {
  const total = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
  const byType = db.prepare(
    'SELECT event_type, COUNT(*) as c FROM audit_logs GROUP BY event_type ORDER BY c DESC'
  ).all();
  return { total, byType };
}

module.exports = { recordAudit, queryAudit, auditStats };
