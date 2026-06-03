// WebSocket 服务器 — 前端事件推送
const { WebSocketServer } = require('ws');
const { addClient, removeClient } = require('./event-bus');

function startWSServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, perMessageDeflate: false });

  wss.on('connection', (ws, req) => {
    const url = req.url || '';

    if (url === '/ws/events' || url.startsWith('/ws/events')) {
      addClient(ws);
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
