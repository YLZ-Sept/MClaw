// Production Middleware — 速率限制 + 请求日志 + CORS
// 纯函数 Express 中间件，无外部依赖

/**
 * 简易令牌桶速率限制
 * @param {object} options — { windowMs, max, message }
 */
function rateLimit(options = {}) {
  const windowMs = options.windowMs || 60_000; // 1 分钟窗口
  const max = options.max || 60;              // 最多 60 次/分钟
  const message = options.message || '请求过于频繁，请稍后再试';

  const buckets = new Map(); // IP → { tokens, lastRefill }

  // 定期清理（每 5 分钟清理过期桶）
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > windowMs * 2) buckets.delete(key);
    }
  }, 300_000).unref();

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = { tokens: max, lastRefill: Date.now() };
      buckets.set(key, bucket);
    }

    // 补充令牌
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor(elapsed / windowMs * max);
    if (refill > 0) {
      bucket.tokens = Math.min(max, bucket.tokens + refill);
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      res.set('X-RateLimit-Remaining', bucket.tokens);
      res.set('X-RateLimit-Limit', max);
      next();
    } else {
      res.status(429).json({ code: 429, message });
    }
  };
}

/**
 * 请求日志中间件
 */
function requestLogger() {
  return (req, res, next) => {
    const start = Date.now();

    // 监听响应完成
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 400 ? 'WARN' : 'INFO';
      const msg = `${req.method} ${req.path} ${res.statusCode} ${duration}ms`;

      if (level === 'WARN') {
        console.warn(`[http] ${msg}`);
      } else if (duration > 1000) {
        console.log(`[http] SLOW ${msg}`);
      } else {
        // 只记录非静态资源的请求
        if (!req.path.startsWith('/assets/') && !req.path.startsWith('/favicon')) {
          console.log(`[http] ${msg}`);
        }
      }
    });

    next();
  };
}

module.exports = { rateLimit, requestLogger };
