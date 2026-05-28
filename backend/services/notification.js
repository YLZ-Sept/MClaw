// Notification — DingTalk webhook push. Node.js port of notification.py
const config = require('../config');

async function pushLeadNotification(leadSummary, userName) {
  if (!config.dingtalkWebhook) return;
  try {
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    await fetch(config.dingtalkWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: {
          title: '新线索提醒',
          text: `## 新线索提醒\n\n**客户**：${userName}\n\n**摘要**：${leadSummary}\n\n**时间**：${ts}`
        }
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {}
}

module.exports = { pushLeadNotification };
