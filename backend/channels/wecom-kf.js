// 企业微信客服 — 回调接收 + sync_msg 拉取 + API 发送
// 回调 URL 格式: http://<域名>/api/channels/wecom/kf/callback?account_id=<uuid>
// 文档: https://developer.work.weixin.qq.com/document/path/94670 (接收) / 94677 (发送)
const { Router } = require('express');
const db = require('../db');
const { handleIncoming } = require('./index');
const {
  sha1, pkcs7Unpad, decryptMsg, verifySignature, parseXml,
  getAccessToken, httpsPost
} = require('./wecom');

const router = Router();

// ─── 账号配置 ───
function getAccountConfig(accountId) {
  if (!accountId) return null;
  const account = db.prepare('SELECT * FROM channel_accounts WHERE id=? AND platform=? AND status=?')
    .get(accountId, 'wecom_kf', 'active');
  if (!account) return null;
  let cfg = {};
  try { cfg = typeof account.config === 'string' ? JSON.parse(account.config) : account.config; } catch {}
  return { account, cfg };
}

// ─── 拉取客服消息 (sync_msg) ───
async function syncMsg(cfg, token, cursor, openKfid) {
  const accessToken = await getAccessToken(cfg.corpid, cfg.corpsecret);
  const body = JSON.stringify({
    cursor: cursor || '0',
    token,
    limit: 1000,
    voice_format: 0,
    open_kfid: openKfid
  });
  const json = await httpsPost(
    `https://qyapi.weixin.qq.com/cgi-bin/kf/sync_msg?access_token=${accessToken}`,
    body
  );
  return json;
}

// ─── 发送客服消息 ───
async function sendMessage(account, touser, content) {
  let cfg = {};
  try { cfg = typeof account.config === 'string' ? JSON.parse(account.config) : account.config; } catch {}
  if (!cfg.corpid || !cfg.corpsecret || !cfg.open_kfid) {
    console.log('[wecom-kf] 缺少 corpid/corpsecret/open_kfid，无法发送');
    return;
  }
  const token = await getAccessToken(cfg.corpid, cfg.corpsecret);
  const body = JSON.stringify({
    touser,
    open_kfid: cfg.open_kfid,
    msgtype: 'text',
    text: { content }
  });
  const json = await httpsPost(
    `https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg?access_token=${encodeURIComponent(token)}`,
    body
  );
  if (json.errcode === 0) {
    console.log(`[wecom-kf] 消息已发送 → ${touser}`);
    return json;
  }
  throw new Error(`[${json.errcode}] ${json.errmsg}`);
}

// ─── 回调: GET — URL 验证 ───
router.get('/callback', (req, res) => {
  const { msg_signature, timestamp, nonce, echostr, account_id } = req.query;
  if (!account_id) return res.status(400).send('missing account_id');

  const acc = getAccountConfig(account_id);
  if (!acc || !acc.cfg.token || !acc.cfg.encodingAESKey) {
    console.log('[wecom-kf] URL 验证: 账号未配置, account_id:', account_id);
    return res.status(400).send('account not configured');
  }

  if (!verifySignature(acc.cfg.token, timestamp, nonce, echostr, msg_signature)) {
    console.log('[wecom-kf] URL 验证: 签名校验失败');
    return res.status(403).send('signature error');
  }

  try {
    const plaintext = decryptMsg(acc.cfg.encodingAESKey, echostr);
    console.log('[wecom-kf] URL 验证成功:', acc.cfg.open_kfid);
    res.send(plaintext);
  } catch (e) {
    console.error('[wecom-kf] echostr 解密失败:', e.message);
    res.status(500).send('decrypt error');
  }
});

// ─── 回调: POST — 接收事件 + 拉取消息 ───
router.post('/callback', async (req, res) => {
  const { msg_signature, timestamp, nonce, account_id } = req.query;
  if (!account_id) return res.status(400).send('missing account_id');

  const acc = getAccountConfig(account_id);
  if (!acc || !acc.cfg.token || !acc.cfg.encodingAESKey) {
    console.log('[wecom-kf] 消息回调: 账号未配置');
    return res.status(400).send('account not configured');
  }

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const encMatch = body.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
  if (!encMatch) {
    console.log('[wecom-kf] XML 无效:', body.slice(0, 100));
    return res.status(400).send('invalid xml');
  }

  if (!verifySignature(acc.cfg.token, timestamp, nonce, encMatch[1], msg_signature)) {
    console.log('[wecom-kf] 签名校验失败');
    return res.status(403).send('signature error');
  }

  let plaintext;
  try {
    plaintext = decryptMsg(acc.cfg.encodingAESKey, encMatch[1]);
  } catch (e) {
    console.error('[wecom-kf] 解密失败:', e.message);
    return res.status(500).send('decrypt error');
  }

  const msg = parseXml(plaintext);
  console.log('[wecom-kf] 收到事件:', msg.MsgType, msg.Event || '');

  // 先返回 success（企微要求 5 秒内响应）
  res.send('success');

  // 仅处理 kf_msg_or_event 事件
  if (msg.MsgType !== 'event' || msg.Event !== 'kf_msg_or_event') {
    console.log('[wecom-kf] 忽略:', msg.MsgType, msg.Event);
    return;
  }

  const openKfid = msg.OpenKfId;
  const syncToken = msg.Token;
  if (!syncToken) {
    console.log('[wecom-kf] 缺少 Token，无法拉取消息');
    return;
  }

  // 异步拉取消息并处理
  try {
    let cursor = '0';
    let hasMore = true;

    while (hasMore) {
      const result = await syncMsg(acc.cfg, syncToken, cursor, openKfid);
      if (result.errcode !== 0) {
        console.log('[wecom-kf] sync_msg 失败:', result.errcode, result.errmsg);
        break;
      }

      const msgList = result.msg_list || [];
      for (const m of msgList) {
        // 仅处理微信客户发送的文本消息 (origin=3)
        if (m.origin !== 3) continue;
        if (m.msgtype === 'text' && m.text?.content) {
          console.log('[wecom-kf] 收到消息:', m.external_userid, '→', m.text.content.slice(0, 80));

          handleIncoming({
            account_id,
            platform: 'wecom_kf',
            contact_name: m.external_userid,
            contact_avatar: null,
            content: m.text.content,
            raw_data: { FromUserName: m.external_userid, OpenKfId: openKfid, servicer_userid: m.servicer_userid }
          }).catch(err => console.error('[wecom-kf] handleIncoming error:', err));
        }
        // 处理 enter_session 事件 (origin=4)
        if (m.origin === 4 && m.event?.event_type === 'enter_session') {
          const welcome = '你好，我是米贝科技 AI 智能客服。请问有什么可以帮你的？';
          try {
            await sendMessage(acc.account, m.external_userid, welcome);
            console.log('[wecom-kf] 欢迎语已发送 →', m.external_userid);
          } catch (e) {
            console.error('[wecom-kf] 欢迎语发送失败:', e.message);
          }
        }
      }

      hasMore = result.has_more === 1;
      cursor = result.next_cursor || '0';
      if (!hasMore) break;
    }
  } catch (e) {
    console.error('[wecom-kf] 拉取消息异常:', e.message);
  }
});

module.exports = { router, sendMessage };
