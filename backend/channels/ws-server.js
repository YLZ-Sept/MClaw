// WebSocket 服务器 — 前端事件推送
const { WebSocketServer } = require('ws');
const { addClient, removeClient } = require('./event-bus');

function startWSServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, perMessageDeflate: false });

  wss.on('connection', (ws, req) => {
    const url = req.url || '';

    if (url === '/ws/events' || url.startsWith('/ws/events')) {
      addClient(ws);

      // 推送当前微信 Bot 在线状态（避免前端连接晚于启动事件丢失）
      try {
        const { getOnlineAccountIds } = require('./wechat-bot');
        for (const id of getOnlineAccountIds()) {
          ws.send(JSON.stringify({ type: 'account_status', account_id: id, online: true }));
        }
      } catch {}

      ws.on('close', () => removeClient(ws));
      ws.on('error', () => removeClient(ws));
      return;
    }

    // Unknown path
    ws.close(4000, 'Unknown path');
  });

  console.log('[ws] WebSocket 服务器启动: /ws/events');
  return wss;
}

module.exports = { startWSServer };
