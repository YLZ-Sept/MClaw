// 统一 WebSocket 服务器 — 单实例处理 sightflow + events 两个路径
// 原因: ws 8.x + Node v24, 多个 WebSocketServer 挂在同一 HTTP server 上会导致 frame 损坏 (RSV1)
const { WebSocketServer } = require('ws');
const db = require('../db');
const { addClient, removeClient } = require('./event-bus');
// Lazy require to avoid circular dependency
const getChannelModule = () => require('./index');

function startWSServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, perMessageDeflate: false });

  wss.on('connection', (ws, req) => {
    const url = req.url || '';

    if (url === '/ws/events' || url.startsWith('/ws/events')) {
      // ─── 前端事件推送 ───
      addClient(ws);
      ws.on('close', () => removeClient(ws));
      ws.on('error', () => removeClient(ws));
      return;
    }

    if (url === '/ws/sightflow' || url.startsWith('/ws/sightflow')) {
      // ─── Sightflow 桌面 Agent ───
      let accountId = null;
      console.log('[sightflow] 新连接');

      ws.on('message', async (raw) => {
        const rawStr = raw.toString();
        let data;
        try { data = JSON.parse(rawStr); } catch { return; }

        switch (data.type) {
          case 'auth': {
            const account = db.prepare('SELECT * FROM channel_accounts WHERE id=? AND status=?').get(data.account_id, 'active');
            if (!account) {
              ws.send(JSON.stringify({ type: 'auth_error', message: '账号不存在或已停用' }));
              return;
            }
            if (account.platform !== 'wechat' && account.platform !== 'douyin') {
              ws.send(JSON.stringify({ type: 'auth_error', message: '此账号不是 Sightflow 类型' }));
              return;
            }
            accountId = data.account_id;
            getChannelModule().registerSocket(accountId, ws);
            ws.send(JSON.stringify({
              type: 'auth_ok',
              account_id: accountId,
              platform: account.platform,
              agent_id: account.agent_id,
              reply_mode: account.default_reply_mode
            }));
            console.log(`[sightflow] 认证成功: ${accountId} (${account.platform})`);
            break;
          }

          case 'message': {
            if (!accountId) { ws.send(JSON.stringify({ type: 'error', message: '请先认证' })); return; }
            const { contact_name, contact_avatar, content, raw_data } = data;
            if (!contact_name || !content) {
              ws.send(JSON.stringify({ type: 'error', message: '缺少 contact_name 或 content' }));
              return;
            }
            const account = db.prepare('SELECT * FROM channel_accounts WHERE id=?').get(accountId);
            const result = await getChannelModule().handleIncoming({
              account_id: accountId,
              platform: account?.platform || 'wechat',
              contact_name, contact_avatar, content, raw_data
            });
            if (!result.conversation) {
              ws.send(JSON.stringify({ type: 'error', message: '账号不存在' }));
              return;
            }
            if (result.aiSuggestion) {
              ws.send(JSON.stringify({ type: 'suggestion', conversation_id: result.conversation.id, content: result.aiSuggestion, contact_name }));
            }
            ws.send(JSON.stringify({ type: 'ack', conversation_id: result.conversation.id, message_id: result.message.id, reply_mode: result.conversation.reply_mode }));
            break;
          }

          case 'heartbeat':
            ws.send(JSON.stringify({ type: 'heartbeat_ok' }));
            break;

          case 'mode_change': {
            if (!accountId) return;
            const { conversation_id, reply_mode } = data;
            if (conversation_id && reply_mode) {
              getChannelModule().setConversationMode(conversation_id, reply_mode);
              ws.send(JSON.stringify({ type: 'mode_changed', conversation_id, reply_mode }));
            }
            break;
          }

          default:
            ws.send(JSON.stringify({ type: 'unknown', original_type: data.type }));
        }
      });

      ws.on('close', () => {
        if (accountId) { getChannelModule().unregisterSocket(accountId); console.log(`[sightflow] 断开: ${accountId}`); }
      });

      ws.on('error', (err) => {
        console.error(`[sightflow] WS error (${accountId || 'unknown'}):`, err.message);
      });

      // 10 秒认证超时
      setTimeout(() => {
        if (!accountId && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'auth_timeout', message: '认证超时' }));
          ws.close();
        }
      }, 10000);
      return;
    }

    // 未知路径
    ws.close(4000, 'Unknown path');
  });

  console.log('[ws] 统一 WebSocket 服务器启动: /ws/sightflow + /ws/events');
  return wss;
}

module.exports = { startWSServer };
