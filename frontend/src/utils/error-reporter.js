// 前端全局错误捕获 + 上报
// 在 main.js 中调用 setupErrorReporting(app, router)

const DEDUP_WINDOW = 5 * 60 * 1000 // 5 分钟内相同错误去重
const MAX_BREADCRUMBS = 20          // 保留最近 20 条用户操作面包屑
const _seenErrors = new Map()       // key → lastReportTime
const _breadcrumbs = []             // 用户操作轨迹

// ── 面包屑：记录用户操作路径帮助复现 ──
export function addBreadcrumb(type, detail) {
  _breadcrumbs.push({ type, detail, time: Date.now() })
  if (_breadcrumbs.length > MAX_BREADCRUMBS) _breadcrumbs.shift()
}

// 自动记录路由导航
export function setupRouterTracking(router) {
  router.afterEach((to) => {
    addBreadcrumb('navigation', `${to.fullPath}`)
  })
}

// ── 核心上报 ──
function _report(payload) {
  try {
    const body = JSON.stringify(payload)
    // fire-and-forget：不阻塞业务，失败不报错
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon('/api/errors/report', blob)
    } else {
      fetch('/api/errors/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {}
}

function _captureError(source, error, extra = {}) {
  if (!error) return

  const message = error.message || String(error)
  const stack = error.stack || ''
  const fileMatch = stack.match(/(https?:\/\/[^)\s]+)/)
  const file = fileMatch ? fileMatch[1].split('?')[0] : ''

  // 去重
  const dedupKey = `${source}:${message}:${file}`
  const last = _seenErrors.get(dedupKey)
  if (last && Date.now() - last < DEDUP_WINDOW) return
  _seenErrors.set(dedupKey, Date.now())

  // 定期清理过期去重记录
  if (_seenErrors.size > 200) {
    const cutoff = Date.now() - DEDUP_WINDOW
    for (const [k, t] of _seenErrors) { if (t < cutoff) _seenErrors.delete(k) }
  }

  const payload = {
    source,             // 'vue' | 'promise' | 'global' | 'console'
    message: message.substring(0, 1000),
    stack: stack.substring(0, 4000),
    file: file.substring(0, 500),
    url: location.href,
    userAgent: navigator.userAgent.substring(0, 500),
    timestamp: new Date().toISOString(),
    breadcrumbs: _breadcrumbs.slice(-10),  // 最近 10 条操作路径
    ...extra,
  }

  _report(payload)
}

// ── 安装全局错误处理 ──
export function setupErrorReporting(app, router) {
  // 1. Vue 组件错误
  app.config.errorHandler = (err, instance, info) => {
    const componentName = instance?.$options?.name || instance?.$options?.__name || instance?.$.type?.__name || 'Unknown'
    _captureError('vue', err, { component: componentName, info })
    console.error('[Vue Error]', err)
  }

  // 2. 未捕获 Promise 拒绝
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    if (reason?.message) {
      _captureError('promise', reason instanceof Error ? reason : new Error(String(reason)))
    }
  })

  // 3. 全局 JS 错误
  window.onerror = (message, source, lineno, colno, error) => {
    _captureError('global', error || new Error(String(message)), {
      file: source || '',
      line: lineno,
      col: colno,
    })
  }

  // 4. 路由错误追踪
  if (router) {
    setupRouterTracking(router)
    router.onError((err) => {
      _captureError('router', err)
    })
  }
}
