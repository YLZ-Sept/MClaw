// Event Bus — light-weight broadcast to frontend clients
// Separate from ws-server.js to avoid circular dependency
let clients = new Set();

function addClient(ws) { clients.add(ws); }
function removeClient(ws) { clients.delete(ws); }

function broadcast(event) {
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    try { if (ws.readyState === 1) ws.send(payload); } catch {}
  }
}

module.exports = { addClient, removeClient, broadcast };
