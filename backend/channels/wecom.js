// 企业微信对接 — 回调接收 + API 发送
// 回调 URL 格式: https://<域名>/api/channels/wecom/callback?account_id=<uuid>
// 文档: https://developer.work.weixin.qq.com/document/path/90930
const { Router } = require('express');
const crypto = require('crypto');
const https = require('https');
const db = require('../db');
const { handleIncoming } = require('./index');

const router = Router();

// ─── 加解密（AES-256-CBC + PKCS7）───

function sha1(...parts) {
  return crypto.createHash('sha1').update(parts.sort().join('')).digest('hex');
}

function pkcs7Unpad(buf) {
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32) return buf;
  return buf.subarray(0, buf.length - pad);
}

function decryptMsg(encodingAESKey, encrypted) {
  // encodingAESKey 是 43 字符的 base64，补 '=' 还原为标准 32 字节 AES key
  const key = Buffer.from(encodingAESKey + '=', 'base64');
  const iv = key.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([decipher.update(encrypted, 'base64'), decipher.final()]);
  decrypted = pkcs7Unpad(decrypted);
  // 明文结构: random_bytes(16) + msg_len(4, big-endian) + msg + receiveid(corpid)
  const msgLen = decrypted.readUInt32BE(16);
  return decrypted.subarray(20, 20 + msgLen).toString('utf8');
}

function encryptMsg(encodingAESKey, plaintext, corpid) {
  const key = Buffer.from(encodingAESKey + '=', 'base64');
  const iv = key.subarray(0, 16);
  const random = crypto.randomBytes(16);
  const msgBuf = Buffer.from(plaintext, 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(msgBuf.length, 0);
  let raw = Buffer.concat([random, lenBuf, msgBuf, Buffer.from(corpid, 'utf8')]);
  // PKCS7 padding to 32-byte boundary
  const pad = 32 - (raw.length % 32);
  if (pad === 0) { raw = Buffer.concat([raw, Buffer.alloc(32, 32)]); }
  else { raw = Buffer.concat([raw, Buffer.alloc(pad, pad)]); }
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(raw), cipher.final()]).toString('base64');
}

function verifySignature(token, timestamp, nonce, encrypted, msgSignature) {
  const sig = sha1(token, timestamp, nonce, encrypted);
  return sig === msgSignature;
}

// 简单 XML 解析 — 提取 <Tag><![CDATA[value]]></Tag> 映射
function parseXml(text) {
  const map = {};
  const re = /<(\w+)><!\[CDATA\[([\s\S]*?)\]\]><\/\1>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

// ─── HTTP 请求辅助（带超时）───

function httpsGet(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}, body: ${body.slice(0, 200)}`)); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpsPost(url, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}, body: ${data.slice(0, 200)}`)); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── access_token 缓存 ───

const tokenCache = new Map();

async function getAccessToken(corpid, corpsecret) {
  const key = `${corpid}:${corpsecret}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.token;

  const json = await httpsGet(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpid)}&corpsecret=${encodeURIComponent(corpsecret)}`
  );
  if (json.errcode === 0) {
    tokenCache.set(key, { token: json.access_token, expires: Date.now() + (json.expires_in - 300) * 1000 });
    return json.access_token;
  }
  // token 获取失败时清除旧缓存
  tokenCache.delete(key);
  throw new Error(`获取企业微信 token 失败 [${json.errcode}]: ${json.errmsg}`);
}

// ─── 发送消息 ───

async function sendMessage(account, touser, content) {
  let cfg = {};
  try { cfg = typeof account.config === 'string' ? JSON.parse(account.config) : account.config; } catch {}
  if (!cfg.corpid || !cfg.corpsecret || !cfg.agentid) {
    console.log('[wecom] 账号缺少 corpid/corpsecret/agentid，无法发送');
    return;
  }
  const token = await getAccessToken(cfg.corpid, cfg.corpsecret);
  const body = JSON.stringify({
    touser,
    msgtype: 'text',
    agentid: Number(cfg.agentid),
    text: { content },
    safe: 0,
  });

  const json = await httpsPost(
    `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`,
    body
  );
  if (json.errcode === 0) {
    console.log(`[wecom] 消息已发送 → ${touser}`);
    return json;
  }
  // invalid access_token 时清除缓存，让下次重新获取
  if (json.errcode === 40014 || json.errcode === 42001) {
    tokenCache.delete(`${cfg.corpid}:${cfg.corpsecret}`);
  }
  throw new Error(`[${json.errcode}] ${json.errmsg}`);
}

// ─── 账号配置 ───

function getAccountConfig(accountId) {
  if (!accountId) return null;
  const account = db.prepare('SELECT * FROM channel_accounts WHERE id=? AND platform=? AND status=?')
    .get(accountId, 'wecom', 'active');
  if (!account) return null;
  let cfg = {};
  try { cfg = typeof account.config === 'string' ? JSON.parse(account.config) : account.config; } catch {}
  return { account, cfg };
}

// ─── 回调: GET — URL 验证 ───

router.get('/callback', (req, res) => {
  const { msg_signature, timestamp, nonce, echostr, account_id } = req.query;
  if (!account_id) return res.status(400).send('missing account_id');

  const acc = getAccountConfig(account_id);
  if (!acc || !acc.cfg.token || !acc.cfg.encodingAESKey) {
    console.log('[wecom] URL 验证: 账号未配置 token/AESKey, account_id:', account_id);
    return res.status(400).send('account not configured');
  }

  if (!verifySignature(acc.cfg.token, timestamp, nonce, echostr, msg_signature)) {
    console.log('[wecom] URL 验证: 签名校验失败, account_id:', account_id);
    return res.status(403).send('signature error');
  }

  try {
    const plaintext = decryptMsg(acc.cfg.encodingAESKey, echostr);
    console.log('[wecom] URL 验证成功, account:', account_id, '→ corpid:', acc.cfg.corpid);
    res.send(plaintext);
  } catch (e) {
    console.error('[wecom] echostr 解密失败:', e.message);
    res.status(500).send('decrypt error');
  }
});

// ─── 回调: POST — 接收消息 ───

router.post('/callback', (req, res) => {
  const { msg_signature, timestamp, nonce, account_id } = req.query;
  if (!account_id) return res.status(400).send('missing account_id');

  const acc = getAccountConfig(account_id);
  if (!acc || !acc.cfg.token || !acc.cfg.encodingAESKey) {
    console.log('[wecom] 消息回调: 账号未配置, account_id:', account_id);
    return res.status(400).send('account not configured');
  }

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  const encMatch = body.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
  if (!encMatch) {
    console.log('[wecom] 消息回调: XML 格式无效, body:', body.slice(0, 100));
    return res.status(400).send('invalid xml');
  }

  if (!verifySignature(acc.cfg.token, timestamp, nonce, encMatch[1], msg_signature)) {
    console.log('[wecom] 消息回调: 签名校验失败, account_id:', account_id);
    return res.status(403).send('signature error');
  }

  let plaintext;
  try {
    plaintext = decryptMsg(acc.cfg.encodingAESKey, encMatch[1]);
  } catch (e) {
    console.error('[wecom] 消息解密失败:', e.message);
    return res.status(500).send('decrypt error');
  }

  const msg = parseXml(plaintext);

  // 事件消息
  if (msg.MsgType === 'event') {
    switch (msg.Event) {
      case 'subscribe':
        console.log('[wecom] 事件: 用户关注 →', msg.FromUserName);
        break;
      case 'unsubscribe':
        console.log('[wecom] 事件: 用户取消关注 →', msg.FromUserName);
        break;
      case 'click':
        console.log('[wecom] 事件: 菜单点击 →', msg.FromUserName, msg.EventKey);
        break;
      case 'enter_agent':
        console.log('[wecom] 事件: 进入应用 →', msg.FromUserName);
        break;
      default:
        console.log('[wecom] 事件:', msg.Event, msg.FromUserName || '');
    }
    return res.send('success');
  }

  // 只处理文本消息
  if (msg.MsgType !== 'text' || !msg.Content) {
    console.log('[wecom] 忽略非文本消息:', msg.MsgType, msg.FromUserName || '');
    return res.send('success');
  }

  console.log('[wecom] 收到:', msg.FromUserName, '→', msg.Content.slice(0, 80));

  // 企微要求 5 秒内返回，异步交给 handleIncoming 处理
  handleIncoming({
    account_id,
    platform: 'wecom',
    contact_name: msg.FromUserName,           // 成员 UserID，用于会话匹配
    contact_avatar: null,
    content: msg.Content,
    raw_data: msg,                            // extractExternalId 会提取 FromUserName
  }).catch(err => console.error('[wecom] handleIncoming error:', err));

  res.send('success');
});

module.exports = { router, sendMessage, getAccessToken };
