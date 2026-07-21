// Tool Loop Guard — 检测 ReAct 循环中的重复/无效工具调用
// 参考 mateclaw ToolLoopGuard.java，纯函数，无副作用
const crypto = require('crypto');

// 只读工具集合（用于无进展检测，写工具即使结果相同也可能是合法的）
const IDEMPOTENT_TOOLS = new Set([
  'read_file', 'read_local_file', 'search_local_files', 'list_local_files',
  'web_search', 'stealth_extract',
  'list_customers', 'get_customer', 'search_customer',
  'list_contacts', 'list_opportunities', 'get_opportunity',
  'list_contracts', 'get_contract',
  'list_purchase_orders', 'get_purchase_order',
  'list_sales_orders', 'get_sales_order',
  'list_returns', 'get_return',
  'list_employees', 'get_employee', 'search_employee',
  'list_departments', 'list_recruitment', 'list_candidates',
  'list_documents', 'search_documents', 'list_document_folders',
  'list_tickets', 'get_ticket', 'list_feedback',
  'search_faq', 'list_hot_products', 'get_hot_product',
  'list_hot_contents', 'get_hot_content', 'list_hot_leads',
  'list_bid_items', 'search_bid_items', 'list_bid_sources', 'list_bid_keywords',
  'list_bid_statistics', 'list_finance_records', 'get_finance_summary',
  'get_dashboard_stats', 'get_dashboard_hot_stats',
  'list_asset_ledger', 'list_performance_reports', 'list_attendance_reports'
]);

// 阈值常量
const EXACT_FAILURE_WARN_AFTER = 2;   // 相同参数失败 2 次 → 警告
const EXACT_FAILURE_HALT_AFTER = 5;   // 相同参数失败 5 次 → 强制终止
const SAME_TOOL_FAILURE_WARN_AFTER = 3; // 同一工具失败 3 次 → 警告
const SAME_TOOL_FAILURE_HALT_AFTER = 8; // 同一工具失败 8 次 → 强制终止
const NO_PROGRESS_WARN_AFTER = 2;     // 只读工具相同结果 2 次 → 警告
const NO_PROGRESS_HALT_AFTER = 5;     // 只读工具相同结果 5 次 → 强制终止

function sha256(text) {
  return crypto.createHash('sha256').update(text || '').digest('hex').slice(0, 24);
}

function canonicalizeArgs(args) {
  if (!args || typeof args !== 'object') return '';
  try {
    // 按 key 排序序列化，确保相同的参数对象生成相同签名
    return JSON.stringify(args, Object.keys(args).sort());
  } catch {
    return String(args);
  }
}

/**
 * 判断工具执行结果是否为失败
 */
function isFailure(result) {
  if (!result) return false;
  const str = typeof result === 'string' ? result : JSON.stringify(result);
  const head = str.slice(0, 300).toLowerCase();

  if (head.startsWith('tool execution failed')) return true;
  if (head.includes('[安全拦截]')) return true;
  if (head.startsWith('error:')) return true;
  if (head.startsWith('错误') || head.startsWith('错误:')) return true;

  // 结构化错误
  try {
    const obj = typeof result === 'string' ? JSON.parse(result) : result;
    if (obj && typeof obj === 'object') {
      if (obj.error && obj.error !== null && obj.error !== '') return true;
      if (obj.success === false) return true;
    }
  } catch {}

  return false;
}

/**
 * 评估一轮工具调用，返回 { warnings, haltReason, updatedStats }
 * @param {Object} previousStats - 上一轮的统计计数器 (Map 或普通对象)
 * @param {Array} toolCalls - [{ id, function: { name, arguments } }]
 * @param {Array} toolResults - 对应的执行结果，位置对齐
 */
function evaluate(previousStats = {}, toolCalls = [], toolResults = []) {
  const stats = { ...previousStats };
  const warnings = [];
  let haltReason = null;

  if (!toolResults || !toolResults.length) {
    return { stats, warnings, haltReason: null };
  }

  for (let i = 0; i < toolResults.length; i++) {
    const result = toolResults[i];
    const tc = toolCalls[i] || {};
    const toolName = tc.function?.name || (result.toolName || 'unknown');

    if (!toolName) continue;

    const argsJson = tc.function?.arguments || '{}';
    const canonicalArgs = canonicalizeArgs(
      typeof argsJson === 'string' ? (() => { try { return JSON.parse(argsJson); } catch { return argsJson; } })() : argsJson
    );
    const signature = `${toolName}:${sha256(canonicalArgs)}`;
    const failed = isFailure(result);

    if (failed) {
      // 检测器 1：相同参数重复失败
      const exactKey = `ef:${signature}`;
      const exactCount = (stats[exactKey] || 0) + 1;
      stats[exactKey] = exactCount;

      // 检测器 2：单工具重复失败（不考虑参数）
      const toolKey = `tf:${toolName}`;
      const toolCount = (stats[toolKey] || 0) + 1;
      stats[toolKey] = toolCount;

      if (exactCount >= EXACT_FAILURE_HALT_AFTER) {
        haltReason = `工具调用陷入循环：${toolName} 已连续 ${exactCount} 次以相同参数失败，已强制收尾`;
      } else if (toolCount >= SAME_TOOL_FAILURE_HALT_AFTER) {
        haltReason = `工具调用陷入循环：${toolName} 累计失败 ${toolCount} 次，已强制收尾`;
      } else if (exactCount >= EXACT_FAILURE_WARN_AFTER) {
        warnings.push(
          `[🔁 循环警告] 工具 ${toolName} 已连续 ${exactCount} 次以相同参数失败。` +
          '请勿原样重试：分析上面的错误信息并改变策略（调整参数或改用其他工具），或向用户说明具体阻塞点。'
        );
      } else if (toolCount >= SAME_TOOL_FAILURE_WARN_AFTER) {
        warnings.push(
          `[🔁 循环警告] 工具 ${toolName} 本次运行已失败 ${toolCount} 次。` +
          '请先诊断根因（检查路径、参数、前置条件）再继续，不要盲目换参数重试。'
        );
      }
    } else {
      // 成功：清除失败计数
      delete stats[`ef:${signature}`];
      delete stats[`tf:${toolName}`];

      // 检测器 3：只读工具无进展检测
      if (IDEMPOTENT_TOOLS.has(toolName)) {
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        const resultHash = sha256(resultStr);
        const hashKey = `nph:${signature}`;
        const countKey = `npc:${signature}`;
        const lastHash = stats[hashKey];

        let repeatCount;
        if (resultHash === lastHash) {
          repeatCount = (stats[countKey] || 0) + 1;
          stats[countKey] = repeatCount;
        } else {
          repeatCount = 1;
          stats[countKey] = 1;
        }
        stats[hashKey] = resultHash;

        if (repeatCount >= NO_PROGRESS_HALT_AFTER) {
          haltReason = `工具调用陷入循环：${toolName} 已连续 ${repeatCount} 次返回完全相同的结果，已强制收尾`;
        } else if (repeatCount >= NO_PROGRESS_WARN_AFTER) {
          warnings.push(
            `[🔁 循环提示] 工具 ${toolName} 已连续 ${repeatCount} 次返回完全相同的结果。` +
            '请直接使用已获得的结果继续任务，不要重复调用。'
          );
        }
      }
    }
  }

  return { stats, warnings, haltReason };
}

/**
 * 重置工具循环统计（新对话开始时调用）
 */
function createStats() {
  return {};
}

module.exports = { evaluate, createStats, isFailure, IDEMPOTENT_TOOLS };
