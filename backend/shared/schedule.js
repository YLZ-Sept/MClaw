// 解析调度规则字符串，返回 OpenClaw schedule 格式
function parseSchedule(s) {
  if (!s) return { kind: 'at', at: new Date(Date.now() + 86400000).toISOString() };

  // cron 表达式: "0 9 * * *" 或 "0 9 * * 1-5"
  if (/^[\d*,/\-]+\s+[\d*,/\-]+\s+[\d*,/\-]+\s+[\d*,/\-]+\s+[\d*,/\-]+(\s+[\d*,/\-]+)?$/.test(s.trim())) {
    return { kind: 'cron', expr: s.trim() };
  }

  // 间隔: "1h", "30m", "5s"
  const intervalMatch = s.trim().match(/^(\d+)\s*(h|m|s)$/i);
  if (intervalMatch) {
    const mult = { h: 3600000, m: 60000, s: 1000 };
    return { kind: 'every', everyMs: parseInt(intervalMatch[1]) * mult[intervalMatch[2].toLowerCase()] };
  }

  // 默认: 作为 ISO 时间戳处理
  return { kind: 'at', at: s.trim() };
}

module.exports = { parseSchedule };
