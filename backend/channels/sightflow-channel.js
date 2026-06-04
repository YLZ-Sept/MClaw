// Sightflow 渠道 — WebSocket 服务器，接受桌面 Sightflow Agent 连接
// WeChat 个人版 / 抖音私信 走此通道（无官方 API，靠视觉驱动桌面自动化）
const { WebSocketServer } = require('ws');
const db = require('../db');
const { registerSocket, unregisterSocket, handleIncoming } = require('./index');

function startSightflowServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/sightflow', perMessageDeflate: false });

  wss.on('connection', (ws, req) => {
    let accountId = null;
    console.log('[sightflow] 新连接');

    ws.on('message', async (raw) => {
      const rawStr = raw.toString();
      console.log('[sightflow] 收到消息:', rawStr.slice(0, 200));
      let data;
      try { data = JSON.parse(rawStr); } catch { console.log('[sightflow] JSON解析失败'); return; }

      switch (data.type) {

        case 'auth': {
          // Sightflow agent 认证：绑定到某个渠道账号
          const account = db.prepare('SELECT * FROM channel_accounts WHERE id=? AND status=?').get(data.account_id, 'active');
          if (!account) {
            ws.send(JSON.stringify({ type: 'auth_error', message: '账号不存在或已停用' }));
            return;
          }
          if (account.platform !== 'wechat' && account.platform !== 'douyin') {
            ws.send(JSON.stringify({ type: 'auth_error', message: '此账号不是 Sightflow 类型，请使用 API 方式连接' }));
            return;
          }
          accountId = data.account_id;
          registerSocket(accountId, ws);
          let agentIds = [];
          try { const p = JSON.parse(account.agent_id); agentIds = Array.isArray(p) ? p : [account.agent_id] } catch (e) { agentIds = account.agent_id ? [account.agent_id] : [] }
          ws.send(JSON.stringify({
            type: 'auth_ok',
            account_id: accountId,
            platform: account.platform,
            agent_id: agentIds[0] || '',
            agent_ids: agentIds,
            reply_mode: account.default_reply_mode
          }));
          console.log(`[sightflow] 认证成功: ${accountId} (${account.platform})`);
          break;
        }

        case 'message': {
          // Sightflow 检测到的新消息
          if (!accountId) {
            ws.send(JSON.stringify({ type: 'error', message: '请先认证' }));
            return;
          }
          const { contact_name, contact_avatar, content, raw_data } = data;
          if (!contact_name || !content) {
            ws.send(JSON.stringify({ type: 'error', message: '缺少 contact_name 或 content' }));
            return;
          }

          const account = db.prepare('SELECT * FROM channel_accounts WHERE id=?').get(accountId);
          const result = await handleIncoming({
            account_id: accountId,
            platform: account?.platform || 'wechat',
            contact_name,
            contact_avatar,
            content,
            raw_data
          });

          // 如果是协同模式，将 AI 建议推回 Sightflow 展示给用户
          if (result.aiSuggestion) {
            ws.send(JSON.stringify({
              type: 'suggestion',
              conversation_id: result.conversation.id,
              content: result.aiSuggestion,
              contact_name
            }));
          }

          // 确认消息已处理
          ws.send(JSON.stringify({
            type: 'ack',
            conversation_id: result.conversation.id,
            message_id: result.message.id,
            reply_mode: result.conversation.reply_mode
          }));
          break;
        }

        case 'heartbeat': {
          ws.send(JSON.stringify({ type: 'heartbeat_ok' }));
          break;
        }

        case 'mode_change': {
          // Sightflow 端切换回复模式
          if (!accountId) return;
          const { conversation_id, reply_mode } = data;
          if (conversation_id && reply_mode) {
            const { setConversationMode } = require('./index');
            setConversationMode(conversation_id, reply_mode);
            ws.send(JSON.stringify({ type: 'mode_changed', conversation_id, reply_mode }));
          }
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'unknown', original_type: data.type }));
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[sightflow] 断开: accountId=${accountId} code=${code} reason=${reason?.toString()?.slice(0,50)||''}`);
      if (accountId) {
        unregisterSocket(accountId);
      }
    });

    ws.on('error', (err) => {
      console.error(`[sightflow] WS error (${accountId || 'unknown'}):`, err.message, err.code || '');
    });

    // 连接后 10 秒内未认证则断开
    setTimeout(() => {
      if (!accountId && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'auth_timeout', message: '认证超时' }));
        ws.close();
      }
    }, 10000);
  });

  console.log('[sightflow] WebSocket 服务器启动: /ws/sightflow');
  return wss;
}

module.exports = { startSightflowServer };
