// Hello World Plugin — 示例插件
// 演示 plugins/ 目录下的插件如何自动被发现和加载

const manifest = {
  name: 'hello-world',
  version: '0.1.0',
  description: '示例插件：演示插件系统',
  tools: [
    {
      name: 'hello_world',
      description: '返回问候语，演示插件工具注册',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '要问候的名字' }
        }
      },
      handler: async (args) => {
        const name = args.name || '世界';
        return {
          success: true,
          message: `你好，${name}！这是来自 hello-world 插件的问候 👋`,
          timestamp: new Date().toISOString()
        };
      }
    },
    {
      name: 'plugin_status',
      description: '查看插件系统状态',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        const { list, loadedPlugins } = require('../agents/plugin-manager');
        const { count } = require('../agents/tool-registry');
        return {
          success: true,
          plugins_loaded: loadedPlugins.size,
          plugins: list(),
          total_tools: count()
        };
      }
    }
  ]
};

function onLoad(ctx) {
  console.log('[hello-world] onLoad: 插件初始化');
}

function onEnable() {
  console.log('[hello-world] onEnable: 插件已激活');
}

function onDisable() {
  console.log('[hello-world] onDisable: 插件已停用');
}

module.exports = { manifest, onLoad, onEnable, onDisable };
