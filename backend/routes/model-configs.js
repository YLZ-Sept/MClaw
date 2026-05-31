const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

// 提供商预设
const PROVIDER_PRESETS = {
  deepseek:  { label:'DeepSeek',  baseUrl:'https://api.deepseek.com/v1',      models:['deepseek-chat','deepseek-reasoner'] },
  xiaomi:    { label:'小米 MiMo',  baseUrl:'https://api.xiaomimimo.com/v1',    models:['mimo-v2.5-pro','mimo-v2-pro','mimo-v2-omni','mimo-v2-flash'] },
  anthropic: { label:'Anthropic', baseUrl:'https://api.anthropic.com/v1',      models:['claude-opus-4-7','claude-sonnet-4-6','claude-haiku-4-5'] },
  zhipu:     { label:'智谱 GLM',  baseUrl:'https://open.bigmodel.cn/api/paas/v4', models:['glm-5','glm-4-flash'] },
  moonshot:  { label:'Kimi',      baseUrl:'https://api.moonshot.cn/v1',        models:['moonshot-v1-8k','moonshot-v1-auto'] },
  qwen:      { label:'通义千问',  baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1', models:['qwen-max','qwen-plus','qwen-turbo'] },
  doubao:    { label:'豆包',      baseUrl:'https://ark.cn-beijing.volces.com/api/v3', models:['doubao-4.5','doubao-4.0'] },
  ollama:    { label:'Ollama 本地', baseUrl:'http://localhost:11434/v1',        models:[] },
  custom:    { label:'自定义',    baseUrl:'',                                    models:[] },
  // 视频生成供应商
  chanjing:  { label:'蝉镜',      category:'video', baseUrl:'https://open-api.chanjing.cc',     fields:['api_key','secret_key'], fieldLabels:{api_key:'App ID',secret_key:'Secret Key'} },
  kling:     { label:'可灵 Kling AI', category:'video', baseUrl:'https://api-beijing.klingai.com', fields:['api_key','secret_key'], fieldLabels:{api_key:'Access Key',secret_key:'Secret Key'} },
};

db.exec(`CREATE TABLE IF NOT EXISTS model_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'deepseek',
  api_base TEXT NOT NULL,
  api_key TEXT DEFAULT '',
  model TEXT NOT NULL DEFAULT 'deepseek-chat',
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 2048,
  timeout INTEGER DEFAULT 60,
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 迁移——兼容旧表
try { db.exec('ALTER TABLE model_configs ADD COLUMN is_active INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE model_configs ADD COLUMN is_default INTEGER DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE model_configs ADD COLUMN category TEXT DEFAULT 'chat'"); } catch {}
try { db.exec("ALTER TABLE model_configs ADD COLUMN secret_key TEXT DEFAULT ''"); } catch {}

// 种子：如果没有配置，插入一个占位配置提醒用户填写 Key
const existing = db.prepare('SELECT COUNT(*) AS c FROM model_configs').get();
if (existing.c === 0) {
  db.prepare(`INSERT INTO model_configs (id,name,provider,api_base,api_key,model,temperature,max_tokens,timeout,is_active,is_default)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(randomUUID(), 'DeepSeek（请填写 Key）', 'deepseek',
      'https://api.deepseek.com/v1', '',
      'deepseek-chat', 0.7, 2048, 60, 1, 1);
}

// 获取提供商预设列表
router.get('/providers', (req, res) => {
  res.json({ code: 200, data: Object.entries(PROVIDER_PRESETS).map(([id, p]) => ({ id, ...p })) });
});

// 探测本地 Ollama 模型列表
router.post('/probe', async (req, res) => {
  const { api_base } = req.body;
  try {
    const base = (api_base || 'http://localhost:11434').replace(/\/+$/, '');
    const r = await fetch(base + '/api/tags', { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const models = (j.models || []).map(m => m.name);
    res.json({ code: 200, data: { models } });
  } catch (e) {
    res.json({ code: 200, data: { models: [], error: e.message } });
  }
});

// 测试模型连接（通过配置ID，避免前端掩码Key问题）
router.post('/:id/test', async (req, res) => {
  const cfg = db.prepare('SELECT * FROM model_configs WHERE id=?').get(req.params.id);
  if (!cfg) return res.status(404).json({ code: 404, message: '配置不存在' });

  // 视频供应商使用专用验证
  if (cfg.category === 'video') {
    const start = Date.now();
    try {
      if (cfg.provider === 'chanjing') {
        const r = await fetch(`${(cfg.api_base || 'https://open-api.chanjing.cc').replace(/\/+$/, '')}/open/v1/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_id: cfg.api_key, secret_key: cfg.secret_key }),
          signal: AbortSignal.timeout(15000)
        });
        const data = await r.json();
        const latency = Date.now() - start;
        if (data.code === 0) {
          return res.json({ code: 200, data: { success: true, latency, detail: '蝉镜凭证有效' } });
        }
        return res.json({ code: 200, data: { success: false, latency, error: data.msg || `code=${data.code}` } });
      }
      if (cfg.provider === 'kling') {
        const crypto = require('crypto');
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ iss: cfg.api_key, exp: now + 30, nbf: now - 5 })).toString('base64url');
        const sig = crypto.createHmac('sha256', cfg.secret_key).update(`${header}.${payload}`).digest('base64url');
        const token = `${header}.${payload}.${sig}`;
        const r = await fetch(`${(cfg.api_base || 'https://api-beijing.klingai.com').replace(/\/+$/, '')}/v1/videos/text2video`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_name: 'kling-v2-6', prompt: 'test', duration: '5', mode: 'std' }),
          signal: AbortSignal.timeout(15000)
        });
        const data = await r.json();
        const latency = Date.now() - start;
        if (data.code === 0) {
          return res.json({ code: 200, data: { success: true, latency, detail: '可灵凭证有效' } });
        }
        // code=1000 参数错误但鉴权可能通过，code=1002 鉴权失败
        if (data.code === 1000) {
          return res.json({ code: 200, data: { success: true, latency, detail: '可灵凭证有效（测试参数被拒，但鉴权通过）' } });
        }
        return res.json({ code: 200, data: { success: false, latency, error: data.message || `code=${data.code}` } });
      }
      return res.json({ code: 200, data: { success: false, latency: 0, error: '未知视频供应商' } });
    } catch (e) {
      return res.json({ code: 200, data: { success: false, latency: Date.now() - start, error: e.message } });
    }
  }

  // 聊天模型测试
  const { api_base, api_key, model } = cfg;
  const start = Date.now();
  try {
    const r = await fetch(`${api_base.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(15000)
    });
    const latency = Date.now() - start;
    if (!r.ok) {
      const errText = await r.text();
      return res.json({ code: 200, data: { success: false, latency, error: `HTTP ${r.status}: ${errText.slice(0, 200)}` } });
    }
    res.json({ code: 200, data: { success: true, latency } });
  } catch (e) {
    res.json({ code: 200, data: { success: false, latency: Date.now() - start, error: e.message } });
  }
});

// 测试模型连接（直接用参数，用于新建时未保存的配置）
router.post('/test', async (req, res) => {
  const { api_base, api_key, model, category, provider, secret_key } = req.body;

  // 视频供应商
  if (category === 'video') {
    const start = Date.now();
    try {
      if (provider === 'chanjing') {
        const r = await fetch(`${(api_base || 'https://open-api.chanjing.cc').replace(/\/+$/, '')}/open/v1/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_id: api_key, secret_key }),
          signal: AbortSignal.timeout(15000)
        });
        const data = await r.json();
        const latency = Date.now() - start;
        if (data.code === 0) {
          return res.json({ code: 200, data: { success: true, latency, detail: '蝉镜凭证有效' } });
        }
        return res.json({ code: 200, data: { success: false, latency, error: data.msg || `code=${data.code}` } });
      }
      if (provider === 'kling') {
        const crypto = require('crypto');
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ iss: api_key, exp: now + 30, nbf: now - 5 })).toString('base64url');
        const sig = crypto.createHmac('sha256', secret_key).update(`${header}.${payload}`).digest('base64url');
        const token = `${header}.${payload}.${sig}`;
        const r = await fetch(`${(api_base || 'https://api-beijing.klingai.com').replace(/\/+$/, '')}/v1/videos/text2video`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_name: 'kling-v2-6', prompt: 'test', duration: '5', mode: 'std' }),
          signal: AbortSignal.timeout(15000)
        });
        const data = await r.json();
        const latency = Date.now() - start;
        if (data.code === 0) {
          return res.json({ code: 200, data: { success: true, latency, detail: '可灵凭证有效' } });
        }
        if (data.code === 1000) {
          return res.json({ code: 200, data: { success: true, latency, detail: '可灵凭证有效（测试参数被拒，但鉴权通过）' } });
        }
        return res.json({ code: 200, data: { success: false, latency, error: data.message || `code=${data.code}` } });
      }
      return res.json({ code: 200, data: { success: false, latency: 0, error: '未知视频供应商' } });
    } catch (e) {
      return res.json({ code: 200, data: { success: false, latency: Date.now() - start, error: e.message } });
    }
  }

  // 聊天模型
  const start = Date.now();
  try {
    const r = await fetch(`${api_base.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(15000)
    });
    const latency = Date.now() - start;
    if (!r.ok) {
      const errText = await r.text();
      return res.json({ code: 200, data: { success: false, latency, error: `HTTP ${r.status}: ${errText.slice(0, 200)}` } });
    }
    res.json({ code: 200, data: { success: true, latency } });
  } catch (e) {
    res.json({ code: 200, data: { success: false, latency: Date.now() - start, error: e.message } });
  }
});

// 列表
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM model_configs ORDER BY is_default DESC, created_at DESC').all();
  // 脱敏：只返回 key 后4位
  const safe = rows.map(r => ({
    ...r,
    api_key: r.api_key ? '***' + r.api_key.slice(-4) : '',
    secret_key: r.secret_key ? '***' + r.secret_key.slice(-4) : ''
  }));
  res.json({ code: 200, data: safe });
});

// 新增
router.post('/', (req, res) => {
  const { name, provider, api_base, api_key, model, temperature, max_tokens, timeout, category, secret_key } = req.body;
  if (!name || !provider) return res.status(400).json({ code: 400, message: '名称和提供商必填' });
  const id = randomUUID();
  const preset = PROVIDER_PRESETS[provider] || {};
  const cat = category || preset.category || 'chat';
  db.prepare(`INSERT INTO model_configs (id,name,provider,api_base,api_key,model,temperature,max_tokens,timeout,is_active,is_default,category,secret_key)
    VALUES (?,?,?,?,?,?,?,?,?,1,0,?,?)`)
    .run(id, name, provider, api_base || preset.baseUrl, api_key || '', model || preset.models?.[0] || '',
      temperature ?? 0.7, max_tokens ?? 2048, timeout ?? 60, cat, secret_key || '');
  res.json({ code: 200, data: { id } });
});

// 编辑
router.put('/:id', (req, res) => {
  const { name, provider, api_base, api_key, model, temperature, max_tokens, timeout, is_active, category, secret_key } = req.body;
  const cur = db.prepare('SELECT * FROM model_configs WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '配置不存在' });

  const preset = PROVIDER_PRESETS[provider] || {};
  const cat = category || preset.category || 'chat';
  db.prepare(`UPDATE model_configs SET
    name=COALESCE(?,name), provider=COALESCE(?,provider),
    api_base=COALESCE(?,api_base), api_key=COALESCE(?,api_key),
    model=COALESCE(?,model), temperature=COALESCE(?,temperature),
    max_tokens=COALESCE(?,max_tokens), timeout=COALESCE(?,timeout),
    is_active=COALESCE(?,is_active), category=COALESCE(?,category),
    secret_key=COALESCE(?,secret_key)
    WHERE id=?`).run(
    name, provider,
    api_base || (provider ? preset.baseUrl : undefined),
    api_key !== undefined ? api_key : undefined,
    model || (preset.models?.[0] || undefined),
    temperature, max_tokens, timeout, is_active,
    cat,
    secret_key !== undefined ? secret_key : undefined,
    req.params.id);
  res.json({ code: 200 });
});

// 设为默认
router.post('/:id/set-default', (req, res) => {
  db.prepare('UPDATE model_configs SET is_default=0').run();
  db.prepare('UPDATE model_configs SET is_default=1, is_active=1 WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 删除
router.delete('/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM model_configs WHERE id=?').get(req.params.id);
  if (cur && cur.is_default) {
    // 不让删默认配置，先切到其他
    const other = db.prepare('SELECT id FROM model_configs WHERE id!=? LIMIT 1').get(req.params.id);
    if (other) db.prepare('UPDATE model_configs SET is_default=1 WHERE id=?').run(other.id);
  }
  db.prepare('DELETE FROM model_configs WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 导出：获取当前活跃的默认配置（给 server.js chat 用）
function getActiveConfig() {
  const row = db.prepare('SELECT * FROM model_configs WHERE is_default=1 AND is_active=1').get();
  if (!row) return db.prepare('SELECT * FROM model_configs WHERE is_active=1 LIMIT 1').get();
  return row;
}

// 获取视频供应商凭证：优先读 DB，fallback 到环境变量
function getVideoCredentials(provider) {
  const row = db.prepare("SELECT * FROM model_configs WHERE provider=? AND category='video' AND is_active=1 LIMIT 1").get(provider);
  const config = require('../config');

  if (provider === 'chanjing') {
    return {
      appId: row?.api_key || config.chanjingAppId,
      secretKey: row?.secret_key || config.chanjingSecretKey,
      baseUrl: row?.api_base || config.chanjingBaseUrl,
    };
  }
  if (provider === 'kling') {
    return {
      accessKey: row?.api_key || config.klingaiAccessKey,
      secretKey: row?.secret_key || config.klingaiSecretKey,
      baseUrl: row?.api_base || config.klingaiBaseUrl,
    };
  }
  return null;
}

module.exports = { router, getActiveConfig, getVideoCredentials };
