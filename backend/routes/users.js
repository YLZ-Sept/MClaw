const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, ALL_PERMISSIONS } = require('./auth');

// 所有用户路由需要登录
router.use(requireAuth);

// 仅 superadmin 可访问用户管理
function superadminOnly(req, res, next) {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ code: 403, message: '仅超级管理员可访问' });
  }
  next();
}

// 权限列表（供前端使用）
router.get('/permissions', (req, res) => {
  res.json({ code: 200, data: ALL_PERMISSIONS });
});

// 用户列表
router.get('/', superadminOnly, (req, res) => {
  const users = db.prepare('SELECT id, username, name, role, permissions, created_at FROM users ORDER BY created_at DESC').all();
  res.json({
    code: 200,
    data: users.map(u => ({ ...u, permissions: (() => { try { return JSON.parse(u.permissions || '[]'); } catch { return []; } })() }))
  });
});

// 创建用户
router.post('/', superadminOnly, (req, res) => {
  const { username, password, name, role, permissions } = req.body || {};
  if (!username || !password || !name) {
    return res.json({ code: 400, message: '用户名、密码、姓名为必填' });
  }
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) {
    return res.json({ code: 400, message: '用户名已存在' });
  }

  const salt = crypto.randomUUID().replace(/-/g, '');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const perms = (role === 'admin') ? ALL_PERMISSIONS.map(p => p.key) : (permissions || []);
  db.prepare('INSERT INTO users (id, username, password_hash, name, role, permissions) VALUES (?,?,?,?,?,?)')
    .run(crypto.randomUUID(), username, salt + ':' + hash, name, role || 'user', JSON.stringify(perms));
  res.json({ code: 200, message: '创建成功' });
});

// 更新用户
router.put('/:id', superadminOnly, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.json({ code: 404, message: '用户不存在' });
  if (user.role === 'superadmin') return res.json({ code: 400, message: '不可编辑超级管理员' });

  const { name, role, permissions, password } = req.body || {};

  if (name) db.prepare('UPDATE users SET name=? WHERE id=?').run(name, req.params.id);
  if (role) {
    const perms = (role === 'admin') ? ALL_PERMISSIONS.map(p => p.key) : (permissions || []);
    db.prepare('UPDATE users SET role=?, permissions=? WHERE id=?').run(role, JSON.stringify(perms), req.params.id);
  } else if (permissions) {
    db.prepare('UPDATE users SET permissions=? WHERE id=?').run(JSON.stringify(permissions), req.params.id);
  }
  if (password) {
    const salt = crypto.randomUUID().replace(/-/g, '');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(salt + ':' + hash, req.params.id);
  }

  res.json({ code: 200, message: '更新成功' });
});

// 删除用户
router.delete('/:id', superadminOnly, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.json({ code: 404, message: '用户不存在' });
  if (user.role === 'superadmin') return res.json({ code: 400, message: '不可删除超级管理员' });
  if (user.id === req.user.id) return res.json({ code: 400, message: '不可删除自己' });

  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  // 清除已删除用户的登录 token
  for (const [k, v] of Object.entries(require('./auth').tokens)) {
    if (v.id === req.params.id) delete require('./auth').tokens[k];
  }
  res.json({ code: 200, message: '删除成功' });
});

module.exports = router;
