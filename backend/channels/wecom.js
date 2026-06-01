// 企业微信对接 — webhook 接收 + API 发送
const { Router } = require('express');
const crypto = require('crypto');
const https = require('https');
const db = require('../db');
const { handleIncoming } = require('./index');

const router = Router();

// ─── 工具函数：企业微信加解密 ───

function sha1(...parts) {
  return crypto.createHash('sha1').update(parts.sort().join('')).digest('hex');
}

function pkcs7Unpad(buf) {
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32) return buf;
  return buf.subarray(0, buf.length - pad);
}

function decryptMsg(encodingAESKey, encrypted) {
  const key = Buffer.from(encodingAESKey + '=', 'base64'); // 43 chars → 32 bytes
  const iv = key.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([decipher.update(encrypted, 'base64'), decipher.final()]);
  decrypted = pkcs7Unpad(decrypted);
  // 结构: random(16) + msg_len(4, big-endian) + msg + corpid
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
  // PKCS7 padding
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

// 简单 XML 解析（仅提取文本内容，适合企业微信简单格式）
function parseXml(text) {
  const map = {};
  const re = /<(\w+)><!\[CDATA\[([\s\S]*?)\]\]><\/\1>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

function buildXml(encrypted, msgSignature, timestamp, nonce) {
  return `<xml>
<Encrypt><![CDATA[${encrypted}]]></Encrypt>
<MsgSignature><![CDATA[${msgSignature}]]></MsgSignature>
<TimeStamp>${timestamp}</TimeStamp>
<Nonce><![CDATA[${nonce}]]></Nonce>
</xml>`;
}

// ─── access_token 缓存 ───

const tokenCache = new Map();

async function getAccessToken(corpid, corpsecret) {
  const key = `${corpid}:${corpsecret}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.token;

  return new Promise((resolve, reject) => {
    https.get(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpid}&corpsecret=${corpsecret}`,
      (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.errcode === 0) {
              tokenCache.set(key, { token: json.access_token, expires: Date.now() + (json.expires_in - 300) * 1000 });
              resolve(json.access_token);
            } else {
              reject(new Error(`获取企业微信 token 失败: ${json.errmsg}`));
            }
          } catch (e) { reject(e); }
        });
      }
    ).on('error', reject);
  });
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

  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          const json = JSON.parse(data);
          if (json.errcode === 0) {
            console.log(`[wecom] 消息已发送 → ${touser}`);
            resolve(json);
          } else {
            console.error(`[wecom] 发送失败: ${json.errmsg}`);
            reject(new Error(json.errmsg));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── 从 URL 参数获取账号配置 ───
// 企业微信回调 URL 需携带 account_id 参数以定位账号
// 格式: /api/channels/wecom/callback?account_id=xxx

function getAccountConfig(accountId) {
  if (!accountId) return null;
  const account = db.prepare('SELECT * FROM channel_accounts WHERE id=? AND platform=? AND status=?')
    .get(accountId, 'wecom', 'active');
  if (!account) return null;
  let cfg = {};
  try { cfg = typeof account.config === 'string' ? JSON.parse(account.config) : account.config; } catch {}
  return { account, cfg };
}

// ─── 回调路由 ───

// GET: URL 验证（企业微信后台配置回调 URL 时触发）
router.get('/callback', (req, res) => {
  const { msg_signature, timestamp, nonce, echostr, account_id } = req.query;
  if (!account_id) return res.status(400).send('missing account_id');

  const acc = getAccountConfig(account_id);
  if (!acc || !acc.cfg.token || !acc.cfg.encodingAESKey) {
    return res.status(400).send('account not configured');
  }

  // 验证签名
  if (!verifySignature(acc.cfg.token, timestamp, nonce, echostr, msg_signature)) {
    return res.status(403).send('signature error');
  }

  // 解密 echostr
  try {
    const plaintext = decryptMsg(acc.cfg.encodingAESKey, echostr);
    console.log('[wecom] URL 验证成功, account:', account_id);
    res.send(plaintext);
  } catch (e) {
    console.error('[wecom] echostr 解密失败:', e.message);
    res.status(500).send('decrypt error');
  }
});

// POST: 接收消息
router.post('/callback', (req, res) => {
  // 企业微信 POST body 是 XML，需用 text/raw 解析
  // 注意：此路由需要 express.text() 中间件预处理
  const { msg_signature, timestamp, nonce, account_id } = req.query;
  if (!account_id) return res.status(400).send('missing account_id');

  const acc = getAccountConfig(account_id);
  if (!acc || !acc.cfg.token || !acc.cfg.encodingAESKey) {
    return res.status(400).send('account not configured');
  }

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  // 提取 Encrypt 节点内容
  const encMatch = body.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
  if (!encMatch) return res.status(400).send('invalid xml');

  // 验证签名
  if (!verifySignature(acc.cfg.token, timestamp, nonce, encMatch[1], msg_signature)) {
    return res.status(403).send('signature error');
  }

  // 解密
  let plaintext;
  try {
    plaintext = decryptMsg(acc.cfg.encodingAESKey, encMatch[1]);
  } catch (e) {
    console.error('[wecom] 消息解密失败:', e.message);
    return res.status(500).send('decrypt error');
  }

  const msg = parseXml(plaintext);
  console.log('[wecom] 收到消息:', JSON.stringify(msg, null, 2));

  // 只处理文本消息
  if (msg.MsgType !== 'text' || !msg.Content) {
    return res.send('success'); // 非文本消息直接返回成功，不处理
  }

  // 映射到 MClaw 内部格式，调用 handleIncoming
  handleIncoming({
    account_id,
    platform: 'wecom',
    contact_name: msg.FromUserName,
    contact_avatar: null,
    content: msg.Content,
    raw_data: msg,
  }).catch(err => console.error('[wecom] handleIncoming error:', err));

  // 企业微信要求立即返回 'success'，不能等处理完
  res.send('success');
});

module.exports = { router, sendMessage, getAccessToken };
