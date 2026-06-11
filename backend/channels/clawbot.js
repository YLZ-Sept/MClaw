// ClawBot 微信通道 — 通过 OpenClaw 连接微信 (ClawBot mode)
// 旧 Sightflow 桌面 Agent 方案已废弃，改用微信内核原生协议
const { Router } = require('express');
const db = require('../db');
const { handleIncoming, sendReply: channelSendReply } = require('./index');

const router = Router();

const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18622';

// Rate limit: max sends per contact per minute (WeChat anti-spam)
const sendWindow = new Map(); // key → [timestamps]
const MAX_SENDS_PER_MINUTE = 3;

function checkRateLimit(key) {
  const now = Date.now();
  let timestamps = sendWindow.get(key);
  if (!timestamps) {
    timestamps = [];
    sendWindow.set(key, timestamps);
  }
  // Purge entries older than 1 minute
  const oneMinAgo = now - 60000;
  while (timestamps.length > 0 && timestamps[0] < oneMinAgo) {
    timestamps.shift();
  }
  if (timestamps.length >= MAX_SENDS_PER_MINUTE) return false;
  timestamps.push(now);
  return true;
}

// ─── OpenClaw → MClaw: receive messages from ClawBot ───

router.post('/webhook', async (req, res) => {
  try {
    const { account_id, contact_name, contact_avatar, content, raw_data } = req.body;

    if (!account_id || !contact_name || !content) {
      return res.status(400).json({ code: 400, message: '缺少必填字段: account_id, contact_name, content' });
    }

    // Verify account exists and is active
    const account = db.prepare('SELECT * FROM channel_accounts WHERE id=? AND status=?').get(account_id, 'active');
    if (!account) {
      return res.status(404).json({ code: 404, message: '账号不存在或已停用' });
    }
    if (account.platform !== 'wechat') {
      return res.status(400).json({ code: 400, message: '此账号不是微信类型' });
    }

    const result = await handleIncoming({
      account_id,
      platform: 'wechat',
      contact_name,
      contact_avatar,
      content,
      raw_data
    });

    if (!result.conversation) {
      return res.status(404).json({ code: 404, message: '无法创建会话' });
    }

    res.json({
      code: 200,
      data: {
        conversation_id: result.conversation.id,
        message_id: result.message?.id,
        reply_mode: result.conversation.reply_mode,
        ai_suggestion: result.aiSuggestion
      }
    });
  } catch (err) {
    console.error('[clawbot] webhook error:', err.message);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ─── MClaw → OpenClaw → WeChat: send replies ───

async function sendMessage(account, contactName, content) {
  const accountId = account.id || account;

  // Rate limit check
  const rateKey = `${accountId}:${contactName}`;
  if (!checkRateLimit(rateKey)) {
    console.log(`[clawbot] 限流阻止: ${contactName}`);
    return { sent: false, reason: 'rate_limited' };
  }

  try {
    const resp = await fetch(`${OPENCLAW_URL}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'clawbot',
        account_id: accountId,
        to: contactName,
        content
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenClaw ${resp.status}: ${errText.slice(0, 200)}`);
    }

    console.log(`[clawbot] 发送成功: ${contactName}`);
    return { sent: true };
  } catch (err) {
    console.error(`[clawbot] 发送失败 (${contactName}):`, err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { router, sendMessage };
