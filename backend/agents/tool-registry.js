// Central Tool Registry — 替代 executor.js 的硬编码 switch
// 支持插件动态注册工具

const registry = new Map();  // toolName → { handler, source, signature }

function register(toolName, handler, source = 'builtin') {
  if (registry.has(toolName)) {
    console.warn(`[registry] 工具 ${toolName} 已注册，将被覆盖 (source: ${source})`);
  }
  registry.set(toolName, { handler, source, registeredAt: Date.now() });
  console.log(`[registry] +${toolName} (${source})`);
}

function unregister(toolName) {
  registry.delete(toolName);
  console.log(`[registry] -${toolName}`);
}

function get(toolName) {
  return registry.get(toolName);
}

function has(toolName) {
  return registry.has(toolName);
}

function list(source = null) {
  const all = [...registry.entries()].map(([name, info]) => ({ name, source: info.source }));
  return source ? all.filter(t => t.source === source) : all;
}

function count() {
  return registry.size;
}

module.exports = { register, unregister, get, has, list, count, registry };
