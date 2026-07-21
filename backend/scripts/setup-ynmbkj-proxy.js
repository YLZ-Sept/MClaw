// Add reverse proxy for ynmbkj.cn → local MClaw
const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
mkdir -p /www/server/panel/vhost/apache/extension/ynmbkj.cn

cat > /www/server/panel/vhost/apache/extension/ynmbkj.cn/wecom-proxy.conf << 'HEREDOC'
# Reverse proxy for MClaw WeCom callback via SSH tunnel
ProxyPass /api/channels/wecom/ http://127.0.0.1:18621/api/channels/wecom/ timeout=30
ProxyPassReverse /api/channels/wecom/ http://127.0.0.1:18621/api/channels/wecom/
HEREDOC

echo "=== proxy config ==="
cat /www/server/panel/vhost/apache/extension/ynmbkj.cn/wecom-proxy.conf

echo "=== exclude wecom from HTTPS redirect ==="
# Modify the RewriteRule to exclude /api/channels/wecom/
sed -i 's|RewriteRule (.*) https://%{SERVER_NAME}\$1 [L,R=301]|RewriteCond %{REQUEST_URI} !^/api/channels/wecom/\\n    RewriteRule (.*) https://%{SERVER_NAME}\$1 [L,R=301]|' /www/server/panel/vhost/apache/ynmbkj.cn.conf

echo "=== check redirect rule ==="
grep -A2 "RewriteCond.*wecom\|RewriteRule.*https" /www/server/panel/vhost/apache/ynmbkj.cn.conf | head -10

echo "=== httpd test ==="
httpd -t 2>&1

echo "=== restarting apache ==="
apachectl -k graceful 2>&1 || systemctl restart httpd 2>&1 || echo "restart failed, trying alternative"
httpd -k graceful 2>/dev/null || /www/server/apache/bin/apachectl -k graceful 2>/dev/null || echo "could not reload, checking process"
ss -tlnp | grep :443 | head -1
`;

  conn.exec(cmd, (err, stream) => {
    let out = '';
    stream.on('data', d => out += d.toString());
    stream.stderr.on('data', d => out += d.toString());
    stream.on('close', () => {
      console.log(out.trim());
      console.log('[DONE] ynmbkj.cn proxy configured');
      conn.end();
    });
  });
});
conn.connect({ host: '115.159.191.117', port: 22, username: 'root', password: 'yqdkygb911...', readyTimeout: 15000 });
