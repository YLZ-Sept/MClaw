// Plugin Manager — 自动发现 + 生命周期管理
// 参考 mateclaw PluginManager (SPI → 简化为 JS require)
const fs = require('fs');
const path = require('path');
const { register, unregister } = require('./tool-registry');

const PLUGINS_DIR = path.join(__dirname, '..', 'plugins');
const loadedPlugins = new Map(); // pluginName → { manifest, exports, status }

/**
 * 扫描并加载所有插件
 */
function loadAll() {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    console.log('[plugin] 创建 plugins 目录');
    return [];
  }

  const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  console.log(`[plugin] 发现 ${files.length} 个插件: ${files.join(', ') || '(无)'}`);

  for (const file of files) {
    try {
      load(path.join(PLUGINS_DIR, file));
    } catch (e) {
      console.error(`[plugin] 加载 ${file} 失败:`, e.message);
    }
  }

  return [...loadedPlugins.keys()];
}

/**
 * 加载单个插件
 */
function load(filePath) {
  const mod = require(filePath);
  const manifest = mod.manifest || mod;

  if (!manifest || !manifest.name) {
    throw new Error('插件缺少 manifest.name');
  }

  const name = manifest.name;

  // 检查重复
  if (loadedPlugins.has(name)) {
    console.warn(`[plugin] ${name} 已加载，跳过`);
    return;
  }

  // 生命周期: onLoad
  if (mod.onLoad) {
    try { mod.onLoad({ registerTool: (n, h) => register(n, h, `plugin:${name}`) }); }
    catch (e) { console.error(`[plugin] ${name} onLoad 失败:`, e.message); }
  }

  // 注册工具
  if (manifest.tools && Array.isArray(manifest.tools)) {
    for (const tool of manifest.tools) {
      if (tool.name && tool.handler) {
        register(tool.name, tool.handler, `plugin:${name}`);
      }
    }
  }

  // 生命周期: onEnable
  if (mod.onEnable) {
    try { mod.onEnable(); } catch (e) { console.error(`[plugin] ${name} onEnable 失败:`, e.message); }
  }

  loadedPlugins.set(name, { manifest, exports: mod, status: 'active', filePath });
  console.log(`[plugin] ✓ ${name} v${manifest.version || '0.1.0'} 已激活`);
}

/**
 * 卸载插件
 */
function unload(name) {
  const entry = loadedPlugins.get(name);
  if (!entry) return false;

  // 注销所有工具
  if (entry.manifest.tools) {
    for (const tool of entry.manifest.tools) {
      if (tool.name) unregister(tool.name);
    }
  }

  // 生命周期: onDisable
  if (entry.exports.onDisable) {
    try { entry.exports.onDisable(); } catch (e) { console.error(`[plugin] ${name} onDisable 失败:`, e.message); }
  }

  loadedPlugins.delete(name);
  console.log(`[plugin] -${name} 已卸载`);
  return true;
}

/**
 * 重载插件
 */
function reload(name) {
  if (!loadedPlugins.has(name)) return false;
  const entry = loadedPlugins.get(name);
  unload(name);
  // 清除 require 缓存
  delete require.cache[require.resolve(entry.filePath)];
  load(entry.filePath);
  return true;
}

/**
 * 获取已加载插件列表
 */
function list() {
  return [...loadedPlugins.entries()].map(([name, entry]) => ({
    name,
    version: entry.manifest.version || '0.1.0',
    status: entry.status,
    toolCount: (entry.manifest.tools || []).length
  }));
}

/**
 * 获取所有插件工具的 LLM 格式定义（{ name, description, parameters }）
 */
function getPluginToolDefs() {
  const defs = [];
  for (const [, entry] of loadedPlugins) {
    if (entry.manifest.tools) {
      for (const tool of entry.manifest.tools) {
        defs.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.parameters || { type: 'object', properties: {} }
          }
        });
      }
    }
  }
  return defs;
}

module.exports = { loadAll, load, unload, reload, list, getPluginToolDefs, loadedPlugins, PLUGINS_DIR };
