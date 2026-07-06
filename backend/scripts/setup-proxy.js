// Create Apache reverse proxy config for WeCom callback
const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
mkdir -p /www/server/panel/vhost/apache/extension/115.159.191.117

cat > /www/server/panel/vhost/apache/extension/115.159.191.117/wecom-proxy.conf << 'HEREDOC'
# Reverse proxy for MClaw WeCom callback via SSH tunnel
ProxyPass /api/channels/wecom/ http://127.0.0.1:18621/api/channels/wecom/ timeout=30
ProxyPassReverse /api/channels/wecom/ http://127.0.0.1:18621/api/channels/wecom/
HEREDOC

echo "=== config written ==="
cat /www/server/panel/vhost/apache/extension/115.159.191.117/wecom-proxy.conf

echo "=== testing apache config ==="
httpd -t 2>&1

echo "=== reloading apache ==="
systemctl reload httpd 2>&1 && echo "Apache reloaded OK"
`;

  conn.exec(cmd, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d.toString());
    stream.stderr.on('data', d => out += d.toString());
    stream.on('close', () => {
      console.log(out.trim());
      console.log('[DONE] Proxy config applied');
      conn.end();
    });
  });
});
conn.connect({ host: '115.159.191.117', port: 22, username: 'root', password: '1qaz@WSX', readyTimeout: 10000 });
