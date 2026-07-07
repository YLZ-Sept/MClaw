// SSH reverse tunnel: cloud server → local machine
// Equivalent to: ssh -R 18621:localhost:18621 root@115.159.191.117
const { Client } = require('ssh2');
const net = require('net');

const REMOTE_HOST = '115.159.191.117';
const REMOTE_PORT = 22;
const REMOTE_USER = 'root';
const REMOTE_PASS = '1qaz@WSX';
const TUNNEL_PORT = 18621; // port on cloud server to forward to local

const conn = new Client();

conn.on('ready', () => {
  console.log(`[tunnel] Connected to ${REMOTE_HOST}`);

  // Request remote to listen on TUNNEL_PORT and forward to us
  conn.forwardIn('127.0.0.1', TUNNEL_PORT, (err, port) => {
    if (err) {
      console.error(`[tunnel] forwardIn failed: ${err.message}`);
      conn.end();
      return;
    }
    console.log(`[tunnel] Cloud server listening on 127.0.0.1:${port} → forwarding to localhost:${TUNNEL_PORT}`);
  });
});

// When remote receives a connection, pipe it to local
conn.on('tcp connection', (info, accept, reject) => {
  console.log(`[tunnel] Incoming: ${info.srcIP}:${info.srcPort}`);

  const localSocket = net.createConnection(TUNNEL_PORT, '127.0.0.1', () => {
    const remoteSocket = accept();
    remoteSocket.pipe(localSocket).pipe(remoteSocket);
    remoteSocket.on('error', () => {});
    localSocket.on('error', () => {});
  });
  localSocket.on('error', (e) => {
    console.log(`[tunnel] local error: ${e.message}`);
    reject();
  });
});

conn.on('error', (err) => {
  console.error(`[tunnel] Error: ${err.message}`);
});

conn.on('close', () => {
  console.log('[tunnel] Connection closed');
});

conn.connect({
  host: REMOTE_HOST,
  port: REMOTE_PORT,
  username: REMOTE_USER,
  password: REMOTE_PASS,
  keepaliveInterval: 30000,
  keepaliveCountMax: 3,
  readyTimeout: 15000
});
