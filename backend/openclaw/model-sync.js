const fs = require('fs');
const path = require('path');
const os = require('os');

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

function syncModelConfig(activeConfig) {
  if (!activeConfig?.api_base || !activeConfig?.model) return;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.warn('[model-sync] Cannot read openclaw.json:', e.message);
    return;
  }

  if (!config.models) config.models = { mode: 'merge' };
  if (!config.models.providers) config.models.providers = {};

  const providerKey = 'mclaw';
  config.models.providers[providerKey] = {
    baseUrl: activeConfig.api_base,
    apiKey: activeConfig.api_key || '',
    api: 'openai-completions',
    models: [{ id: activeConfig.model, name: activeConfig.name || activeConfig.model }]
  };

  if (!config.agents) config.agents = {};
  if (!config.agents.defaults) config.agents.defaults = {};
  if (!config.agents.defaults.model) config.agents.defaults.model = {};
  config.agents.defaults.model.primary = `${providerKey}/${activeConfig.model}`;

  try {
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('[model-sync] Synced to OpenClaw:', `${providerKey}/${activeConfig.model}`);
  } catch (e) {
    console.warn('[model-sync] Write failed:', e.message);
  }
}

module.exports = { syncModelConfig };
