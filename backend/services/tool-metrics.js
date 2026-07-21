// Tool Execution Metrics — 工具调用次数/耗时/成功率追踪
const db = require('../db');

// 内存缓存（高性能写入，定期刷到 SQLite）
const buffer = [];
const FLUSH_INTERVAL_MS = 30_000;  // 30 秒刷一次
const MAX_BUFFER = 500;

// 建表
db.exec(`CREATE TABLE IF NOT EXISTS tool_metrics (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  agent TEXT DEFAULT '',
  duration_ms INTEGER DEFAULT 0,
  success INTEGER DEFAULT 1,
  error_msg TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_tm_tool ON tool_metrics(tool_name)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_tm_agent ON tool_metrics(agent)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_tm_created ON tool_metrics(created_at)'); } catch {}

/**
 * 记录工具调用
 */
function record(toolName, durationMs, success, errorMsg = '', agent = '') {
  buffer.push({
    id: 'tm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    toolName, durationMs, success: success ? 1 : 0, errorMsg: (errorMsg || '').slice(0, 200), agent
  });
}

/**
 * 将缓冲区刷到 SQLite
 */
function flush() {
  if (!buffer.length) return;
  const batch = buffer.splice(0, MAX_BUFFER);
  const insert = db.prepare('INSERT INTO tool_metrics (id, tool_name, agent, duration_ms, success, error_msg) VALUES (?,?,?,?,?,?)');
  const tx = db.transaction(() => {
    for (const m of batch) {
      insert.run(m.id, m.toolName, m.agent, m.durationMs, m.success, m.errorMsg);
    }
  });
  try { tx(); } catch (e) { console.error('[metrics] flush error:', e.message); }
}

// 定时刷
const _interval = setInterval(flush, FLUSH_INTERVAL_MS);
if (_interval.unref) _interval.unref();

/**
 * 查询工具指标摘要
 */
function summary(hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
  const rows = db.prepare(`
    SELECT tool_name,
      COUNT(*) as total,
      SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as successes,
      SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as failures,
      ROUND(AVG(duration_ms)) as avg_ms,
      MAX(duration_ms) as max_ms,
      MIN(duration_ms) as min_ms
    FROM tool_metrics
    WHERE created_at >= ?
    GROUP BY tool_name
    ORDER BY total DESC
    LIMIT 50
  `).all(since);

  const total = db.prepare('SELECT COUNT(*) as c FROM tool_metrics WHERE created_at >= ?').get(since).c;

  return {
    hours,
    total_calls: total,
    tools: rows.map(r => ({
      name: r.tool_name,
      total: r.total,
      successes: r.successes,
      failures: r.failures,
      success_rate: r.total > 0 ? Math.round(r.successes / r.total * 100) : 0,
      avg_ms: r.avg_ms,
      max_ms: r.max_ms,
      min_ms: r.min_ms
    }))
  };
}

/**
 * 最近 N 条调用（时间线）
 */
function recent(limit = 50) {
  return db.prepare('SELECT * FROM tool_metrics ORDER BY created_at DESC LIMIT ?').all(limit);
}

/**
 * 获取最慢的工具（Top N）
 */
function slowest(limit = 10, hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
  return db.prepare(`
    SELECT tool_name, duration_ms, agent, success, created_at
    FROM tool_metrics
    WHERE created_at >= ?
    ORDER BY duration_ms DESC
    LIMIT ?
  `).all(since, limit);
}

module.exports = { record, flush, summary, recent, slowest };
