// 飞书对接 — SDK 驱动：lark.Client 发消息 + lark.EventDispatcher 收事件
const { Router } = require('express');
const lark = require('@larksuiteoapi/node-sdk');
const db = require('../db');
const { handleIncoming } = require('./index');

const router = Router();

// ─── 按账号缓存的 SDK 实例 ───
const sdkCache = new Map();

function getAccountSDK(accountId) {
  if (sdkCache.has(accountId)) return sdkCache.get(accountId);

  const account = db.prepare('SELECT * FROM channel_accounts WHERE id=? AND platform=? AND status=?')
    .get(accountId, 'feishu', 'active');
  if (!account) return null;

  let cfg = {};
  try { cfg = typeof account.config === 'string' ? JSON.parse(account.config) : account.config; } catch {}

  const client = new lark.Client({
    appId: cfg.app_id,
    appSecret: cfg.app_secret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });

  const dispatcher = new lark.EventDispatcher({
    encryptKey: cfg.encrypt_key || undefined,
    verificationToken: cfg.verification_token || undefined,
  });

  dispatcher.register({
    'im.message.receive_v1': async (data) => {
      const msgType = data.message?.message_type;
      if (msgType !== 'text') {
        console.log('[feishu] 收到非文本消息:', msgType, data.message?.message_id);
        return { code: 0 };
      }

      let text = '';
      try { text = JSON.parse(data.message.content).text || ''; } catch { text = data.message.content; }
      if (!text) return { code: 0 };

      const chatType = data.message?.chat_type;
      const contactName = chatType === 'p2p'
        ? (data.sender?.sender_id?.open_id || data.sender?.sender_id?.user_id || 'unknown')
        : (data.message?.chat_id || 'unknown');

      handleIncoming({
        account_id: accountId,
        platform: 'feishu',
        contact_name: contactName,
        contact_avatar: null,
        content: text,
        raw_data: data,
        extra: { chat_type: chatType, sender_id: data.sender?.sender_id?.open_id, message_id: data.message?.message_id },
      }).catch(err => console.error('[feishu] handleIncoming error:', err));

      return { code: 0 };
    }
  });

  const sdk = { client, dispatcher };
  sdkCache.set(accountId, sdk);
  console.log('[feishu] SDK 已初始化, account:', accountId);
  return sdk;
}

function invalidateSDK(accountId) {
  sdkCache.delete(accountId);
}

// ─── 发送消息（给 channels/index.js sendReply 调用）───
async function sendMessage(account, receiveId, content) {
  const sdk = getAccountSDK(account.id);
  if (!sdk) {
    console.log('[feishu] SDK 未就绪，无法发送');
    return;
  }

  const idType = receiveId.startsWith('oc_') ? 'chat_id' : 'open_id';

  try {
    const res = await sdk.client.im.message.create({
      params: { receive_id_type: idType },
      data: {
        receive_id: receiveId,
        msg_type: 'text',
        content: JSON.stringify({ text: content }),
      },
    });
    if (res?.code === 0) {
      console.log(`[feishu] 消息已发送 → ${receiveId}`);
    } else {
      console.error(`[feishu] 发送失败: [${res?.code}] ${res?.msg}`);
    }
    return res;
  } catch (e) {
    console.error('[feishu] 发送失败:', e.message);
    throw e;
  }
}

// ─── 事件订阅回调 ───
router.post('/callback', async (req, res) => {
  const { account_id } = req.query;

  if (!account_id) return res.status(400).json({ code: 400, msg: 'missing account_id' });

  const sdk = getAccountSDK(account_id);
  if (!sdk) return res.status(400).json({ code: 400, msg: 'account not found' });

  const middleware = lark.adaptExpress(sdk.dispatcher, { autoChallenge: true });
  return middleware(req, res);
});

module.exports = { router, sendMessage, invalidateSDK };
