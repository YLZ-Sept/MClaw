// 飞书对接 — 事件订阅接收 + API 发送
const { Router } = require('express');
const crypto = require('crypto');
const https = require('https');
const db = require('../db');
const { handleIncoming } = require('./index');

const router = Router();

// ─── 飞书加解密 ───

function decryptFeishu(encryptKey, encrypted) {
  // SHA-256(encrypt_key) → 32-byte AES-256 key
  const key = crypto.createHash('sha256').update(encryptKey).digest();
  // Base64 decode → IV(16) + ciphertext
  const buf = Buffer.from(encrypted, 'base64');
  const iv = buf.subarray(0, 16);
  const ciphertext = buf.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// 签名验证：SHA-256(timestamp + nonce + encrypt_key + body)
function verifySignature(encryptKey, timestamp, nonce, body, signature) {
  const expected = crypto.createHash('sha256')
    .update(timestamp + nonce + encryptKey + body)
    .digest('hex');
  return expected === signature;
}

// ─── tenant_access_token 缓存 ───

const tokenCache = new Map();

async function getTenantToken(appId, appSecret) {
  const key = `${appId}:${appSecret}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.token;

  const body = JSON.stringify({ app_id: appId, app_secret: appSecret });

  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.code === 0) {
              tokenCache.set(key, { token: json.tenant_access_token, expires: Date.now() + (json.expire - 300) * 1000 });
              resolve(json.tenant_access_token);
            } else {
              reject(new Error(`获取飞书 token 失败: ${json.msg}`));
            }
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── 发送消息 ───

async function sendMessage(account, receiveId, content) {
  let cfg = {};
  try { cfg = typeof account.config === 'string' ? JSON.parse(account.config) : account.config; } catch {}
  if (!cfg.app_id || !cfg.app_secret) {
    console.log('[feishu] 账号缺少 app_id/app_secret，无法发送');
    return;
  }
  const token = await getTenantToken(cfg.app_id, cfg.app_secret);
  const body = JSON.stringify({
    receive_id: receiveId,
    msg_type: 'text',
    content: JSON.stringify({ text: content }),
  });

  // 判断 receive_id 类型：chat_id 开头是 'oc_'，否则默认为 open_id
  const idType = receiveId.startsWith('oc_') ? 'chat_id' : 'open_id';

  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${idType}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          const json = JSON.parse(data);
          if (json.code === 0) {
            console.log(`[feishu] 消息已发送 → ${receiveId}`);
            resolve(json);
          } else {
            console.error(`[feishu] 发送失败: [${json.code}] ${json.msg}`);
            reject(new Error(json.msg));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── 事件订阅路由 ───
// URL: /api/channels/feishu/callback?account_id=xxx

function getAccountConfig(accountId) {
  if (!accountId) return null;
  const account = db.prepare('SELECT * FROM channel_accounts WHERE id=? AND platform=? AND status=?')
    .get(accountId, 'feishu', 'active');
  if (!account) return null;
  let cfg = {};
  try { cfg = typeof account.config === 'string' ? JSON.parse(account.config) : account.config; } catch {}
  return { account, cfg };
}

router.post('/callback', (req, res) => {
  const { account_id } = req.query;
  const body = req.body;

  // URL 验证（飞书配置事件订阅时发送）
  if (body.type === 'url_verification') {
    console.log('[feishu] URL 验证, account:', account_id);
    return res.json({ challenge: body.challenge });
  }

  // 事件回调
  if (!account_id) return res.status(400).json({ code: 400, msg: 'missing account_id' });

  const acc = getAccountConfig(account_id);
  if (!acc) return res.status(400).json({ code: 400, msg: 'account not found' });

  // 签名验证 & 解密
  const timestamp = req.headers['x-lark-request-timestamp'] || '';
  const nonce = req.headers['x-lark-request-nonce'] || '';
  const signature = req.headers['x-lark-signature'] || '';
  const rawBody = JSON.stringify(body);

  let eventData = body;

  if (body.encrypt) {
    // ── 加密事件：需要 encrypt_key 解密 + 验签 ──
    if (!acc.cfg.encrypt_key) {
      console.error('[feishu] 收到加密事件，但未配置 encrypt_key');
      return res.status(400).json({ code: 400, msg: 'encrypt_key not configured' });
    }
    if (signature && !verifySignature(acc.cfg.encrypt_key, timestamp, nonce, rawBody, signature)) {
      console.error('[feishu] 签名验证失败 (encrypt_key)');
      return res.status(403).json({ code: 403, msg: 'signature mismatch' });
    }
    try {
      eventData = decryptFeishu(acc.cfg.encrypt_key, body.encrypt);
    } catch (e) {
      console.error('[feishu] 解密失败:', e.message);
      return res.status(500).json({ code: 500, msg: 'decrypt error' });
    }
  } else {
    // ── 明文事件：需要 verification_token 验签 ──
    if (signature && acc.cfg.verification_token) {
      if (!verifySignature(acc.cfg.verification_token, timestamp, nonce, rawBody, signature)) {
        console.error('[feishu] 签名验证失败 (verification_token)');
        return res.status(403).json({ code: 403, msg: 'signature mismatch' });
      }
    } else if (signature && !acc.cfg.verification_token) {
      // 飞书要求验签但 MClaw 没配 verification_token — 暂放行并警告
      console.warn('[feishu] ⚠️ 收到签名但未配置 verification_token，跳过验签（建议在飞书后台复制 Verification Token 填入 MClaw）');
    }
  }

  console.log('[feishu] 收到事件:', JSON.stringify(eventData, null, 2));

  // 处理消息接收事件
  if (eventData.header?.event_type === 'im.message.receive_v1' && eventData.event) {
    const evt = eventData.event;
    const msgType = evt.message?.message_type;

    // 提取用户名（优先从 sender 获取）
    const sender = evt.sender;
    let contactName = 'unknown';
    if (evt.message?.chat_type === 'p2p') {
      contactName = sender?.sender_id?.open_id
        || sender?.sender_id?.user_id
        || sender?.sender_id?.union_id
        || 'unknown';
    } else {
      // 群聊用 chat_id
      contactName = evt.message?.chat_id || 'unknown';
    }

    // 暂存 sender 信息用于后续获取用户详情
    const senderId = sender?.sender_id?.open_id || sender?.sender_id?.user_id;

    if (msgType === 'text') {
      // 解析 content（飞书文本消息的 content 是 JSON 字符串）
      let text = '';
      try {
        text = JSON.parse(evt.message.content).text || '';
      } catch { text = evt.message.content; }

      if (!text) return res.json({ code: 0 });

      // 异步处理，立即返回
      handleIncoming({
        account_id,
        platform: 'feishu',
        contact_name: contactName,
        contact_avatar: null,
        content: text,
        raw_data: eventData,
        extra: { chat_type: evt.message?.chat_type, sender_id: senderId, message_id: evt.message?.message_id },
      }).catch(err => console.error('[feishu] handleIncoming error:', err));
    } else {
      console.log('[feishu] 收到非文本消息:', msgType, evt.message?.message_id);
    }
  }

  // 飞书要求立即返回（3 秒内）
  res.json({ code: 0 });
});

module.exports = { router, sendMessage, getTenantToken };
