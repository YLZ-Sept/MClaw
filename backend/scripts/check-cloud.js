const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const cmds = [
    'echo "=== firewalld ===" && systemctl is-active firewalld 2>/dev/null || echo "not running"',
    'echo "=== iptables INPUT ===" && iptables -L INPUT -n 2>/dev/null | head -10',
    'echo "=== bt-panel port ===" && ss -tlnp | grep 8090 || echo "no bt panel"',
    'echo "=== check 18621 ===" && ss -tlnp | grep 18621 || echo "port 18621 not in use"',
  ];
  let pending = cmds.length;
  for (const cmd of cmds) {
    conn.exec(cmd, (err, stream) => {
      let out = '';
      stream.on('data', d => out += d.toString());
      stream.stderr.on('data', d => out += d.toString());
      stream.on('close', () => {
        console.log(out.trim());
        pending--;
        if (pending === 0) conn.end();
      });
    });
  }
});
conn.connect({ host: '115.159.191.117', port: 22, username: 'root', password: '1qaz@WSX', readyTimeout: 10000 });
