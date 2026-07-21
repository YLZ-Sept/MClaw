// LLM Failover — 错误分类 + 指数退避重试 + 两层健康追踪
// 参考 mateclaw NodeStreamingChatHelper + ProviderHealthTracker + AvailableProviderPool
const crypto = require('crypto');

// ── 错误类型枚举 ──
const ErrorType = Object.freeze({
  PROMPT_TOO_LONG: 'PROMPT_TOO_LONG',     // 上下文过长 → 触发压缩
  AUTH_ERROR: 'AUTH_ERROR',               // 401/403 → 0次重试，provider 移出池
  BILLING: 'BILLING',                     // 402/配额耗尽 → 0次重试，provider 移出池
  RATE_LIMIT: 'RATE_LIMIT',              // 429 → 最多2次重试
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',    // 模型不存在 → 0次重试，切换 provider
  SERVER_ERROR: 'SERVER_ERROR',          // 5xx → 最多10次重试
  EMPTY_RESPONSE: 'EMPTY_RESPONSE',      // 空响应 → 最多3次重试
  THINKING_BLOCK_ERROR: 'THINKING_BLOCK_ERROR', // thinking块错误 → 去thinking重试
  CLIENT_ERROR: 'CLIENT_ERROR',          // 400 → 不重试，立即返回
  UNKNOWN: 'UNKNOWN'                     // 未知 → 最多5次重试
});

// ── 各错误类型的重试预算 ──
const RETRY_BUDGETS = {
  [ErrorType.PROMPT_TOO_LONG]: 0,
  [ErrorType.AUTH_ERROR]: 0,
  [ErrorType.BILLING]: 0,
  [ErrorType.RATE_LIMIT]: 2,
  [ErrorType.MODEL_NOT_FOUND]: 0,
  [ErrorType.SERVER_ERROR]: 10,
  [ErrorType.EMPTY_RESPONSE]: 3,
  [ErrorType.THINKING_BLOCK_ERROR]: 1,
  [ErrorType.CLIENT_ERROR]: 0,
  [ErrorType.UNKNOWN]: 5
};

// ── 错误分类器 ──
function classifyError(status, body, errorMessage = '') {
  const msg = `${errorMessage} | ${body || ''}`.toLowerCase();

  // Prompt Too Long — 上下文过长
  if (msg.includes('prompt is too long')
      || msg.includes('context_length_exceeded')
      || msg.includes('context length exceeded')
      || msg.includes('maximum context length')
      || msg.includes('token limit')
      || msg.includes('this model\'s maximum context length')
      || msg.includes('input tokens 总数超出了模型允许')) {
    return ErrorType.PROMPT_TOO_LONG;
  }

  // Auth Error — 永久性认证失败
  if (status === 401 || status === 403
      || msg.includes('unauthorized')
      || msg.includes('invalid api key')
      || msg.includes('authentication')
      || msg.includes('authenticationerror')
      || msg.includes('unknownhostexception')
      || msg.includes('certificate')
      || msg.includes('pkix path building failed')) {
    return ErrorType.AUTH_ERROR;
  }

  // Rate Limit
  if (status === 429
      || msg.includes('rate_limit')
      || msg.includes('ratelimiterror')
      || msg.includes('too many requests')
      || msg.includes('engine_overloaded')) {
    return ErrorType.RATE_LIMIT;
  }

  // Billing — 配额耗尽
  if (status === 402
      || msg.includes('insufficient_quota')
      || msg.includes('credit balance is too low')
      || msg.includes('billing_error')
      || msg.includes('you exceeded your current quota')
      || msg.includes('quota exceeded')
      || msg.includes('余额不足')
      || msg.includes('请充值')
      || msg.includes('accountbalancenotenough')) {
    return ErrorType.BILLING;
  }

  // Model Not Found
  if (msg.includes('model not exist')
      || msg.includes('model_not_found')
      || msg.includes('model not found')
      || msg.includes('does not exist')
      || msg.includes('modelnotopen')
      || msg.includes('invalidendpointormodel')) {
    return ErrorType.MODEL_NOT_FOUND;
  }

  // Thinking Block Error (Anthropic)
  if (msg.includes('thinking blocks cannot be modified')
      || msg.includes('thinking content is not allowed')
      || msg.includes('thinking block')) {
    return ErrorType.THINKING_BLOCK_ERROR;
  }

  // Server Error — 临时性服务端故障
  if (status >= 500
      || msg.includes('timeout')
      || msg.includes('connection reset')
      || msg.includes('connection refused')
      || msg.includes('connection closed')
      || msg.includes('premature close')
      || msg.includes('sslexception')
      || msg.includes('socketexception')
      || msg.includes('broken pipe')
      || msg.includes('network connection error')
      || msg.includes('temporarily unavailable')
      || msg.includes('service unavailable')
      || msg.includes('model is overloaded')) {
    return ErrorType.SERVER_ERROR;
  }

  // Client Error — 请求格式问题（必须在 EMPTY_RESPONSE 之前检查）
  if (status === 400
      || msg.includes('bad request')
      || msg.includes('invalid_request_error')
      || msg.includes('unsupported')) {
    return ErrorType.CLIENT_ERROR;
  }

  // Empty response（真正无内容时才判定）
  if (!body && !errorMessage) {
    return ErrorType.EMPTY_RESPONSE;
  }

  return ErrorType.UNKNOWN;
}

// ── 两层健康追踪 ──

// Tier 1: AvailableProviderPool — 硬故障，进程生命周期
class AvailableProviderPool {
  constructor() { this._members = new Set(); this._removalReasons = new Map(); }

  add(providerId) {
    if (!providerId) return;
    const wasNew = !this._members.has(providerId);
    this._members.add(providerId);
    this._removalReasons.delete(providerId);
    if (wasNew) console.log(`[Pool] +${providerId}`);
  }

  remove(providerId, source, message) {
    if (!providerId) return;
    const wasMember = this._members.delete(providerId);
    this._removalReasons.set(providerId, { source, message, at: Date.now() });
    if (wasMember) console.warn(`[Pool] -${providerId} (${source}): ${message}`);
  }

  contains(providerId) {
    if (!providerId) return true;
    if (this._members.has(providerId)) return true;
    // 首次遇到的 provider 自动加入可用池（未被显式移除时）
    if (!this._removalReasons.has(providerId)) {
      this.add(providerId);
      return true;
    }
    return false;
  }

  snapshot() {
    const result = {};
    for (const id of this._members) result[id] = null; // null = in pool
    for (const [id, reason] of this._removalReasons) {
      if (!(id in result)) result[id] = reason;
    }
    return result;
  }
}

// Tier 2: ProviderHealthTracker — 软故障，时间冷却
class ProviderHealthTracker {
  constructor(failureThreshold = 3, cooldownMs = 5 * 60 * 1000) {
    this._failureThreshold = failureThreshold;
    this._cooldownMs = cooldownMs;
    this._failures = new Map();     // providerId → count
    this._cooldowns = new Map();    // providerId → cooldownEndMs
  }

  recordFailure(providerId) {
    if (!providerId) return;
    const count = (this._failures.get(providerId) || 0) + 1;
    this._failures.set(providerId, count);
    if (count >= this._failureThreshold) {
      const end = Date.now() + this._cooldownMs;
      this._cooldowns.set(providerId, end);
      console.warn(`[Health] ${providerId} 连续失败 ${count} 次，进入 ${this._cooldownMs / 1000}s 冷却`);
    }
  }

  recordSuccess(providerId) {
    if (!providerId) return;
    this._failures.set(providerId, 0);
    if (this._cooldowns.delete(providerId)) {
      console.log(`[Health] ${providerId} 已恢复，冷却清除`);
    }
  }

  isInCooldown(providerId) {
    if (!providerId) return false;
    const until = this._cooldowns.get(providerId);
    if (!until) return false;
    if (Date.now() >= until) {
      // 冷却过期，惰性清除
      this._cooldowns.delete(providerId);
      this._failures.set(providerId, 0);
      return false;
    }
    return true;
  }

  snapshot() {
    const result = {};
    for (const [id, count] of this._failures) {
      const until = this._cooldowns.get(id);
      result[id] = { consecutiveFailures: count, cooldownRemainingMs: until && until > Date.now() ? until - Date.now() : 0 };
    }
    return result;
  }
}

// 全局单例
const providerPool = new AvailableProviderPool();
const healthTracker = new ProviderHealthTracker();

// ── LLM 调用（带重试 + 故障转移） ──

/**
 * 带容错的 LLM 调用
 * @param {Function} doCall - 实际的 fetch 调用函数，签名为 (stream) => Promise<Response>
 * @param {Object} options
 * @param {string} options.providerId - Provider 标识（用于健康追踪）
 * @param {number} options.maxRetries - 最大重试次数（使用内置预算）
 * @param {number} options.maxTotalDurationMs - 总时间预算（默认 3 分钟）
 * @param {Function} options.onRetry - 重试回调 (attempt, error, delay)
 * @returns {Promise<Response>}
 */
async function callWithFailover(doCall, options = {}) {
  const {
    providerId = 'default',
    maxTotalDurationMs = 3 * 60 * 1000,
    onRetry = null
  } = options;

  // 检查 provider 是否在硬故障池中
  if (!providerPool.contains(providerId)) {
    const reason = providerPool.snapshot()[providerId];
    throw Object.assign(
      new Error(`Provider ${providerId} 不可用: ${reason?.message || '已被移出可用池'}`),
      { errorType: reason?.source === 'AUTH_ERROR' ? ErrorType.AUTH_ERROR : ErrorType.BILLING }
    );
  }

  // 检查 provider 是否在冷却中
  if (healthTracker.isInCooldown(providerId)) {
    console.log(`[Failover] ${providerId} 在冷却中，跳过`);
    throw Object.assign(
      new Error(`Provider ${providerId} 处于冷却期`),
      { errorType: ErrorType.SERVER_ERROR, inCooldown: true }
    );
  }

  const startTime = Date.now();
  let lastError = null;
  let lastErrorType = null;

  const attemptCall = async (attempt) => {
    // 检查总时间预算
    if (Date.now() - startTime > maxTotalDurationMs) {
      throw Object.assign(
        new Error('LLM 调用超时（总重试时间预算耗尽）'),
        { errorType: lastErrorType || ErrorType.UNKNOWN, timedOut: true }
      );
    }

    try {
      const stream = false; // 非流式用于错误检测
      const response = await doCall(stream);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const errorType = classifyError(response.status, body);

        lastErrorType = errorType;
        const err = new Error(`LLM ${response.status}: ${body.slice(0, 300)}`);
        err.errorType = errorType;
        err.httpStatus = response.status;
        err.body = body;
        throw err;
      }

      // 成功 → 记录到健康追踪器
      healthTracker.recordSuccess(providerId);
      providerPool.add(providerId);
      return response;

    } catch (err) {
      if (err.errorType) throw err; // 已分类的错误，继续抛出

      // 网络层错误 → 分类
      const errorType = classifyError(0, '', err.message);
      err.errorType = errorType;
      lastErrorType = errorType;
      throw err;
    }
  };

  // 主重试循环
  let attempt = 0;

  while (true) {
    try {
      return await attemptCall(attempt);
    } catch (err) {
      lastError = err;
      const errorType = err.errorType || ErrorType.UNKNOWN;

      // HARD 错误 → 移出可用池，停止重试
      if (errorType === ErrorType.AUTH_ERROR || errorType === ErrorType.BILLING) {
        providerPool.remove(providerId, errorType === ErrorType.AUTH_ERROR ? 'AUTH_ERROR' : 'BILLING',
          err.message.slice(0, 200));
        healthTracker.recordFailure(providerId);
        throw err;
      }

      // 不可重试的错误 → 直接抛出
      if (errorType === ErrorType.PROMPT_TOO_LONG
          || errorType === ErrorType.CLIENT_ERROR
          || errorType === ErrorType.MODEL_NOT_FOUND) {
        throw err;
      }

      // Thinking block → 不增加失败计数（属于模型行为问题）
      if (errorType === ErrorType.THINKING_BLOCK_ERROR) {
        console.log(`[Failover] thinking block error, retry without thinking`);
      }

      const budget = RETRY_BUDGETS[errorType] || 5;
      attempt++;

      if (attempt > budget || Date.now() - startTime > maxTotalDurationMs) {
        // 预算耗尽 → 记录硬故障
        healthTracker.recordFailure(providerId);
        throw err;
      }

      // 指数退避重试
      const baseDelay = 3000;
      const cap = 60000;
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), cap);
      const jitter = delay * 0.2 * (Math.random() - 0.5);
      const actualDelay = delay + jitter;

      console.log(`[Failover] ${providerId} ${errorType} retry ${attempt}/${budget} in ${Math.round(actualDelay / 1000)}s`);
      if (onRetry) onRetry(attempt, err, actualDelay);
      await new Promise(r => setTimeout(r, actualDelay));
    }
  }
}

/**
 * 流式 LLM 调用（带容错）
 */
async function streamCallWithFailover(doStreamCall, options = {}) {
  const {
    providerId = 'default',
    maxTotalDurationMs = 3 * 60 * 1000,
    onRetry = null
  } = options;

  if (!providerPool.contains(providerId)) {
    const reason = providerPool.snapshot()[providerId];
    throw Object.assign(
      new Error(`Provider ${providerId} 不可用: ${reason?.message || '已被移出可用池'}`),
      { errorType: ErrorType.AUTH_ERROR }
    );
  }

  if (healthTracker.isInCooldown(providerId)) {
    throw Object.assign(
      new Error(`Provider ${providerId} 处于冷却期`),
      { errorType: ErrorType.SERVER_ERROR, inCooldown: true }
    );
  }

  const startTime = Date.now();

  try {
    const result = await doStreamCall();
    healthTracker.recordSuccess(providerId);
    providerPool.add(providerId);
    return result;
  } catch (err) {
    const errorType = classifyError(0, '', err.message);
    if (errorType === ErrorType.AUTH_ERROR || errorType === ErrorType.BILLING) {
      providerPool.remove(providerId, errorType === ErrorType.AUTH_ERROR ? 'AUTH_ERROR' : 'BILLING',
        err.message.slice(0, 200));
    }
    healthTracker.recordFailure(providerId);
    throw err;
  }
}

// ── 健康状态 API ──
function getHealthSnapshot() {
  return {
    pool: providerPool.snapshot(),
    health: healthTracker.snapshot(),
    summary: {
      poolSize: Object.values(providerPool.snapshot()).filter(v => v === null).length,
      inCooldown: Object.values(healthTracker.snapshot()).filter(v => v.cooldownRemainingMs > 0).length,
    }
  };
}

module.exports = {
  ErrorType,
  classifyError,
  callWithFailover,
  streamCallWithFailover,
  providerPool,
  healthTracker,
  getHealthSnapshot,
  RETRY_BUDGETS
};
