// 微信 iLink AI 机器人渠道 — 官方 Bot API，长轮询收发消息
// 文档：https://github.com/hao-ji-xing/openclaw-weixin/blob/main/weixin-bot-api.md
const crypto = require('crypto');
const db = require('../db');
const { handleIncoming, sendReply: channelSendReply } = require('./index');

// 每个 bot 的轮询状态
const pollingStates = new Map(); // accountId → { running, lastBuf, timer }

const API_BASE = process.env.WECHAT_ILINK_URL || 'https://ilinkai.weixin.qq.com';

// ─── HTTP helpers ───

function randomUin() {
  const u = crypto.randomInt(0, 0xFFFFFFFF);
  return Buffer.from(u.toString()).toString('base64');
}

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'AuthorizationType': 'ilink_bot_token',
    'X-WECHAT-UIN': randomUin(),
    'Authorization': `Bearer ${token}`
  };
}

async function apiPost(account, path, body, timeout = 30000) {
  const config = parseConfig(account);
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(config.token),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`iLink ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

function parseConfig(account) {
  const raw = typeof account.config === 'string' ? JSON.parse(account.config) : (account.config || {});
  return {
    token: raw.token || account.token || '',
    userId: raw.userId || account.user_id || '',
  };
}

// ─── 长轮询：接收消息 ───

async function pollLoop(accountId) {
  let state = pollingStates.get(accountId);
  if (!state) {
    state = { running: true, lastBuf: '', timer: null };
    pollingStates.set(accountId, state);
  }

  while (state.running) {
    try {
      const account = db.prepare('SELECT * FROM channel_accounts WHERE id=? AND status=?').get(accountId, 'active');
      if (!account || account.platform !== 'wechat') {
        console.log(`[wechat-bot] 账号 ${accountId} 不可用，停止轮询`);
        break;
      }

      const config = parseConfig(account);
      if (!config.token) {
        console.log(`[wechat-bot] 账号 ${accountId} 缺少 token，停止轮询`);
        break;
      }

      // getupdates 长轮询 (hold 30s)
      const resp = await fetch(`${API_BASE}/ilink/bot/getupdates`, {
        method: 'POST',
        headers: authHeaders(config.token),
        body: JSON.stringify({
          get_updates_buf: state.lastBuf,
          base_info: { channel_version: '1.0.2' }
        }),
        signal: AbortSignal.timeout(45000)
      });

      if (!resp.ok) {
        console.log(`[wechat-bot] getupdates 错误 ${resp.status}，3秒后重试`);
        await sleep(3000);
        continue;
      }

      const data = await resp.json();
      state.lastBuf = data.get_updates_buf || state.lastBuf;

      const msgs = data.msgs || [];
      for (const raw of msgs) {
        await handleWechatMessage(account, raw);
      }
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        // 超时正常，继续下一轮
      } else if (state.running) {
        console.log(`[wechat-bot] 轮询异常: ${err.message}，5秒后重试`);
        await sleep(5000);
      }
    }
  }

  pollingStates.delete(accountId);
  console.log(`[wechat-bot] 轮询停止: ${accountId}`);
}

async function handleWechatMessage(account, raw) {
  try {
    // 只处理用户消息 (message_type === 1)
    if (raw.message_type !== 1) return;

    const itemList = raw.item_list || [];
    const textItems = itemList
      .filter(it => it.type === 1 && it.text_item?.text)
      .map(it => it.text_item.text);
    const content = textItems.join('');

    if (!content.trim()) return;

    const contactName = raw.from_user_id || raw.from_nickname || '微信用户';

    await handleIncoming({
      account_id: account.id,
      platform: 'wechat',
      contact_name: contactName,
      content,
      raw_data: {
        from_user_id: raw.from_user_id,
        to_user_id: raw.to_user_id,
        context_token: raw.context_token,
        msg_id: raw.msg_id,
      }
    });
  } catch (err) {
    console.error('[wechat-bot] 消息处理异常:', err.message);
  }
}

// ─── 发送消息 ───

async function sendMessage(account, contactName, content, contextToken) {
  const config = parseConfig(account);

  // 从最近的会话消息中查找 context_token 和实际的 to_user_id
  let toUserId = contactName;
  let ctxToken = contextToken || '';

  if (!ctxToken || !toUserId.includes('@im.wechat')) {
    const conv = db.prepare(
      "SELECT cm.raw_data FROM channel_messages cm JOIN channel_conversations cc ON cm.conversation_id=cc.id WHERE cc.account_id=? AND cc.contact_name=? AND cm.direction='incoming' ORDER BY cm.created_at DESC LIMIT 1"
    ).get(account.id, contactName);
    if (conv && conv.raw_data) {
      try {
        const raw = JSON.parse(conv.raw_data);
        if (raw.from_user_id) toUserId = raw.from_user_id;
        if (raw.context_token) ctxToken = raw.context_token;
      } catch {}
    }
  }

  const body = {
    msg: {
      from_user_id: config.userId,
      to_user_id: toUserId,
      client_id: `mclaw-${crypto.randomBytes(8).toString('hex')}`,
      message_type: 2,
      message_state: 2,
      context_token: ctxToken,
      item_list: [
        { type: 1, text_item: { text: content } }
      ]
    },
    base_info: { channel_version: '1.0.2' }
  };

  try {
    const result = await apiPost(account, '/ilink/bot/sendmessage', body);
    console.log(`[wechat-bot] 发送成功: ${contactName}`);
    return { sent: true, result };
  } catch (err) {
    console.error(`[wechat-bot] 发送失败 (${contactName}):`, err.message);
    return { sent: false, reason: err.message };
  }
}

// ─── 生命周期 ───

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 从 OpenClaw 保存的认证数据创建/更新渠道账号
function ensureWechatAccount() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const accountsDir = path.join(os.homedir(), '.openclaw', 'openclaw-weixin', 'accounts');
  if (!fs.existsSync(accountsDir)) return;

  const files = fs.readdirSync(accountsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const auth = JSON.parse(fs.readFileSync(path.join(accountsDir, file), 'utf-8'));
      if (!auth.token || !auth.userId) continue;

      const existing = db.prepare("SELECT * FROM channel_accounts WHERE platform='wechat' AND config LIKE ?").get(`%${auth.userId}%`);
      if (existing) {
        db.prepare("UPDATE channel_accounts SET config=? WHERE id=?").run(
          JSON.stringify({ token: auth.token, userId: auth.userId, baseUrl: auth.baseUrl || API_BASE }),
          existing.id
        );
        continue;
      }

      // No match by userId — try to claim an orphaned wechat account with empty config
      const orphan = db.prepare("SELECT * FROM channel_accounts WHERE platform='wechat' AND (config IS NULL OR config='' OR config='{}')").get();
      if (orphan) {
        db.prepare("UPDATE channel_accounts SET config=?, status='active' WHERE id=?").run(
          JSON.stringify({ token: auth.token, userId: auth.userId, baseUrl: auth.baseUrl || API_BASE }),
          orphan.id
        );
        console.log(`[wechat-bot] 修复已有渠道账号: ${orphan.id}`);
        continue;
      }

      const id = crypto.randomUUID();
      db.prepare(`INSERT OR IGNORE INTO channel_accounts (id,platform,account_name,agent_id,default_reply_mode,config,status)
        VALUES (?,?,?,?,?,?,?)`).run(
        id, 'wechat', `微信机器人 (${auth.userId.slice(-8)})`, JSON.stringify(['sales-agent']), 'manual',
        JSON.stringify({ token: auth.token, userId: auth.userId, baseUrl: auth.baseUrl || API_BASE }),
        'active'
      );
      console.log(`[wechat-bot] 自动创建渠道账号: ${id}`);
    } catch (e) {
      console.error('[wechat-bot] 读取认证文件失败:', e.message);
    }
  }
}

function startPolling(accountId) {
  const existing = pollingStates.get(accountId);
  if (existing && existing.running) return;

  if (existing) existing.running = false;
  console.log(`[wechat-bot] 开始轮询: ${accountId}`);
  // 小延迟避免启动风暴
  setTimeout(() => pollLoop(accountId), Math.random() * 2000);
}

function stopPolling(accountId) {
  const state = pollingStates.get(accountId);
  if (state) state.running = false;
}

function stopAll() {
  for (const [id, state] of pollingStates) {
    state.running = false;
  }
}

// 启动所有活跃的微信 bot
async function startAllBots() {
  const accounts = db.prepare("SELECT * FROM channel_accounts WHERE platform='wechat' AND status='active'").all();
  for (const acc of accounts) {
    startPolling(acc.id);
  }
  console.log(`[wechat-bot] 已启动 ${accounts.length} 个微信 Bot 轮询`);
}

module.exports = { sendMessage, startPolling, stopPolling, stopAll, startAllBots, ensureWechatAccount };
