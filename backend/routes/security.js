const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const auth = require('./auth');

// 鉴权中间件
function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !auth.tokens[token]) {
    return res.json({ code: 401, message: '未登录或登录已过期' });
  }
  req.token = token;
  req.session = auth.tokens[token];
  next();
}

// 修改密码
router.post('/change-password', authRequired, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.json({ code: 400, message: '请输入旧密码和新密码' });
  }
  if (newPassword.length < 6) {
    return res.json({ code: 400, message: '新密码至少6位' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.session.username);
  if (!user) {
    return res.json({ code: 404, message: '用户不存在' });
  }

  if (!auth.verifyPassword(oldPassword, user.password_hash)) {
    return res.json({ code: 400, message: '旧密码不正确' });
  }

  const salt = crypto.randomUUID().replace(/-/g, '');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(salt + ':' + hash, user.id);

  // 清除所有其他会话，保留当前
  for (const [tk, session] of Object.entries(auth.tokens)) {
    if (session.username === user.username && tk !== req.token) {
      delete auth.tokens[tk];
    }
  }

  res.json({ code: 200, message: '密码修改成功' });
});

// 查看活跃会话
router.get('/sessions', authRequired, (req, res) => {
  const list = Object.entries(auth.tokens).map(([tk, s]) => ({
    token: tk === req.token ? '***current***' : tk.slice(0, 8) + '...',
    tokenFull: tk,
    username: s.username,
    name: s.name,
    role: s.role,
    loginTime: new Date(s.createdAt).toLocaleString('zh-CN'),
    isCurrent: tk === req.token,
  }));
  res.json({ code: 200, data: list });
});

// 强制下线
router.delete('/sessions/:token', authRequired, (req, res) => {
  const target = req.params.token;
  if (!target || target === req.token) {
    return res.json({ code: 400, message: '不能下线当前会话' });
  }
  if (!auth.tokens[target]) {
    return res.json({ code: 404, message: '会话不存在' });
  }
  delete auth.tokens[target];
  res.json({ code: 200, message: '已强制下线' });
});

// 获取安全设置
router.get('/settings', authRequired, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM security_settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ code: 200, data: settings });
});

// 更新安全设置
router.put('/settings', authRequired, (req, res) => {
  const { login_max_attempts, login_lockout_minutes, session_timeout_hours } = req.body || {};
  const update = db.prepare(`
    INSERT INTO security_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  if (login_max_attempts !== undefined) update.run('login_max_attempts', String(login_max_attempts));
  if (login_lockout_minutes !== undefined) update.run('login_lockout_minutes', String(login_lockout_minutes));
  if (session_timeout_hours !== undefined) update.run('session_timeout_hours', String(session_timeout_hours));

  res.json({ code: 200, message: '保存成功' });
});

// ---- 用户管理 ----

// 用户列表
router.get('/users', authRequired, (req, res) => {
  const users = db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY created_at').all();
  res.json({ code: 200, data: users });
});

// 创建用户
router.post('/users', authRequired, (req, res) => {
  const { username, password, name, role } = req.body || {};
  if (!username || !password || !name) {
    return res.json({ code: 400, message: '用户名、密码、姓名为必填' });
  }
  if (password.length < 6) {
    return res.json({ code: 400, message: '密码至少6位' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    return res.json({ code: 400, message: '用户名已存在' });
  }

  const id = crypto.randomUUID();
  const salt = crypto.randomUUID().replace(/-/g, '');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  db.prepare('INSERT INTO users (id, username, password_hash, name, role) VALUES (?,?,?,?,?)')
    .run(id, username, salt + ':' + hash, name, role || 'user');
  res.json({ code: 200, message: '用户创建成功' });
});

// 删除用户
router.delete('/users/:id', authRequired, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.json({ code: 404, message: '用户不存在' });
  if (user.username === req.session.username) {
    return res.json({ code: 400, message: '不能删除自己' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  // 清除该用户的会话
  for (const [tk, s] of Object.entries(auth.tokens)) {
    if (s.username === user.username) delete auth.tokens[tk];
  }
  res.json({ code: 200, message: '用户已删除' });
});

// 重置用户密码
router.post('/users/:id/reset-password', authRequired, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.json({ code: 400, message: '新密码至少6位' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.json({ code: 404, message: '用户不存在' });

  const salt = crypto.randomUUID().replace(/-/g, '');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(salt + ':' + hash, req.params.id);

  // 清除该用户所有会话
  for (const [tk, s] of Object.entries(auth.tokens)) {
    if (s.username === user.username) delete auth.tokens[tk];
  }
  res.json({ code: 200, message: '密码已重置' });
});

module.exports = router;
