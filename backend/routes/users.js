const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, ALL_PERMISSIONS } = require('./auth');
const { addLog } = require('./logs');

// 所有用户路由需要登录
router.use(requireAuth);

// superadmin 或持有 security_users 权限可访问用户管理
function canManageUsers(req, res, next) {
  if (req.user.role === 'superadmin') return next();
  const perms = req.user.permissions || [];
  if (perms.includes('security_users')) return next();
  return res.status(403).json({ code: 403, message: '无用户管理权限' });
}

// 权限列表（供前端使用）
router.get('/permissions', (req, res) => {
  const perms = req.user.role === 'superadmin'
    ? ALL_PERMISSIONS
    : ALL_PERMISSIONS.filter(p => p.key !== 'model');
  res.json({ code: 200, data: perms });
});

// 角色列表（供前端用户管理下拉使用）
router.get('/roles', canManageUsers, (req, res) => {
  const roles = db.prepare('SELECT id, name FROM roles WHERE name != \'超级管理员\' ORDER BY name ASC').all();
  res.json({ code: 200, data: roles });
});

// 用户列表
router.get('/', canManageUsers, (req, res) => {
  const users = db.prepare('SELECT id, username, name, role, role_id, permissions, created_at FROM users WHERE role != \'superadmin\' ORDER BY created_at DESC').all();
  const roles = db.prepare('SELECT id, name FROM roles').all();
  const roleMap = Object.fromEntries(roles.map(r => [r.id, r.name]));
  res.json({
    code: 200,
    data: users.map(u => ({
      ...u,
      role_name: u.role_id ? (roleMap[u.role_id] || null) : null,
      permissions: (() => { try { return JSON.parse(u.permissions || '[]'); } catch { return []; } })(),
    })),
  });
});

// 创建用户
router.post('/', canManageUsers, (req, res) => {
  const { username, password, name, role, role_id, permissions } = req.body || {};
  if (!username || !password || !name) {
    return res.json({ code: 400, message: '用户名、密码、姓名为必填' });
  }
  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) {
    return res.json({ code: 400, message: '用户名已存在' });
  }

  const salt = crypto.randomUUID().replace(/-/g, '');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  // RBAC: 如果指定了 role_id，从角色表取权限；否则用直接传入的 permissions
  let perms;
  if (role_id) {
    const r = db.prepare('SELECT permissions FROM roles WHERE id=?').get(role_id);
    perms = r ? JSON.parse(r.permissions) : (permissions || []);
  } else if (role === 'admin') {
    perms = ALL_PERMISSIONS.map(p => p.key).filter(k => k !== 'model');
  } else {
    perms = permissions || [];
  }
  db.prepare('INSERT INTO users (id, username, password_hash, name, role, role_id, permissions) VALUES (?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), username, salt + ':' + hash, name, role || 'user', role_id || null, JSON.stringify(perms));
  addLog('success', 'create_user', `${req.user.username} 创建了用户 ${username}`, req.user.username, req.ip);
  res.json({ code: 200, message: '创建成功' });
});

// 更新用户
router.put('/:id', canManageUsers, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.json({ code: 404, message: '用户不存在' });
  if (user.role === 'superadmin') return res.json({ code: 400, message: '不可编辑超级管理员' });

  const { name, role, role_id, permissions, password } = req.body || {};

  if (name) db.prepare('UPDATE users SET name=? WHERE id=?').run(name, req.params.id);
  if (role !== undefined) {
    const perms = (role === 'admin') ? ALL_PERMISSIONS.map(p => p.key).filter(k => k !== 'model') : (permissions || user.permissions);
    db.prepare('UPDATE users SET role=?, permissions=?, role_id=NULL WHERE id=?').run(role, JSON.stringify(perms), req.params.id);
  }
  if (role_id !== undefined) {
    // 从角色表读取权限
    if (role_id) {
      const r = db.prepare('SELECT permissions FROM roles WHERE id=?').get(role_id);
      const perms = r ? r.permissions : '[]';
      db.prepare('UPDATE users SET role_id=?, permissions=? WHERE id=?').run(role_id, perms, req.params.id);
    } else {
      db.prepare('UPDATE users SET role_id=NULL WHERE id=?').run(req.params.id);
      if (permissions) {
        db.prepare('UPDATE users SET permissions=? WHERE id=?').run(JSON.stringify(permissions), req.params.id);
      }
    }
  } else if (permissions !== undefined && !role_id) {
    db.prepare('UPDATE users SET permissions=? WHERE id=?').run(JSON.stringify(permissions), req.params.id);
  }
  if (password) {
    const salt = crypto.randomUUID().replace(/-/g, '');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(salt + ':' + hash, req.params.id);
  }

  // 清除该用户的活跃 token，强制重新登录以更新权限
  const { tokens } = require('./auth');
  for (const [k, v] of Object.entries(tokens)) {
    if (v.id === req.params.id) delete tokens[k];
  }

  addLog('info', 'update_user', `${req.user.username} 编辑了用户 ${user.username}`, req.user.username, req.ip);
  res.json({ code: 200, message: '更新成功' });
});

// 删除用户
router.delete('/:id', canManageUsers, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.json({ code: 404, message: '用户不存在' });
  if (user.role === 'superadmin') return res.json({ code: 400, message: '不可删除超级管理员' });
  if (user.id === req.user.id) return res.json({ code: 400, message: '不可删除自己' });

  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  for (const [k, v] of Object.entries(require('./auth').tokens)) {
    if (v.id === req.params.id) delete require('./auth').tokens[k];
  }
  addLog('warning', 'delete_user', `${req.user.username} 删除了用户 ${user.username}`, req.user.username, req.ip);
  res.json({ code: 200, message: '删除成功' });
});

module.exports = router;
