module.exports = {
  apps: [{
    name: 'wecom-tunnel',
    script: './ssh-tunnel.js',
    cwd: __dirname,
    autorestart: true,
    max_restarts: 20,
    restart_delay: 10000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '../data/logs/tunnel-error.log',
    out_file: '../data/logs/tunnel-out.log',
  }]
};
