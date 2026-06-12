const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, ALL_PERMISSIONS, PERMISSION_MODULES } = require('./auth');
const { addLog } = require('./logs');

const router = Router();
router.use(requireAuth);

// superadmin 或持有 security_roles 权限可管理角色
function canManageRoles(req, res, next) {
  if (req.user.role === 'superadmin') return next();
  const perms = req.user.permissions || [];
  if (perms.includes('security_roles')) return next();
  return res.status(403).json({ code: 403, message: '无角色管理权限' });
}

// 角色列表
router.get('/', canManageRoles, (req, res) => {
  const roles = db.prepare('SELECT * FROM roles WHERE name != \'超级管理员\' ORDER BY created_at ASC').all();
  res.json({
    code: 200,
    data: roles.map(r => ({
      ...r,
      permissions: (() => { try { return JSON.parse(r.permissions); } catch { return []; } })(),
      userCount: db.prepare('SELECT COUNT(*) AS c FROM users WHERE role_id=?').get(r.id).c,
    })),
  });
});

// 单个角色
router.get('/:id', canManageRoles, (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id);
  if (!role) return res.status(404).json({ code: 404, message: '角色不存在' });
  role.permissions = (() => { try { return JSON.parse(role.permissions); } catch { return []; } })();
  res.json({ code: 200, data: role });
});

// 创建角色
router.post('/', canManageRoles, (req, res) => {
  let { name, description, permissions } = req.body || {};
  if (!name) return res.json({ code: 400, message: '角色名称为必填' });
  if (db.prepare('SELECT id FROM roles WHERE name=?').get(name)) {
    return res.json({ code: 400, message: '角色名称已存在' });
  }
  permissions = (permissions || []).filter(p => req.user.role === 'superadmin' || p !== 'model');
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO roles (id, name, description, permissions) VALUES (?,?,?,?)')
    .run(id, name, description || '', JSON.stringify(permissions));
  addLog('success', 'create_role', `${req.user.username} 创建了角色 ${name}`, req.user.username, req.ip);
  res.json({ code: 200, data: { id }, message: '创建成功' });
});

// 更新角色
router.put('/:id', canManageRoles, (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id);
  if (!role) return res.status(404).json({ code: 404, message: '角色不存在' });
  if (role.name === '超级管理员') return res.json({ code: 400, message: '不可编辑超级管理员角色' });

  let { name, description, permissions } = req.body || {};
  if (name) {
    const dup = db.prepare('SELECT id FROM roles WHERE name=? AND id!=?').get(name, req.params.id);
    if (dup) return res.json({ code: 400, message: '角色名称已存在' });
    db.prepare('UPDATE roles SET name=? WHERE id=?').run(name, req.params.id);
  }
  if (description !== undefined) {
    db.prepare('UPDATE roles SET description=? WHERE id=?').run(description, req.params.id);
  }
  if (permissions !== undefined) {
    permissions = permissions.filter(p => req.user.role === 'superadmin' || p !== 'model');
    db.prepare('UPDATE roles SET permissions=? WHERE id=?').run(JSON.stringify(permissions), req.params.id);
    // 清空该角色下所有用户的缓存权限 → 他们下次登录时重新从角色读取
    const { tokens } = require('./auth');
    const userIds = db.prepare('SELECT id FROM users WHERE role_id=?').all(req.params.id).map(u => u.id);
    for (const [k, v] of Object.entries(tokens)) {
      if (userIds.includes(v.id)) {
        const rolePerms = JSON.parse(JSON.stringify(permissions));
        v.permissions = rolePerms;
      }
    }
  }
  addLog('info', 'update_role', `${req.user.username} 编辑了角色 ${role.name}`, req.user.username, req.ip);
  res.json({ code: 200, message: '更新成功' });
});

// 删除角色
router.delete('/:id', canManageRoles, (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id);
  if (!role) return res.status(404).json({ code: 404, message: '角色不存在' });
  if (role.name === '超级管理员') return res.json({ code: 400, message: '不可删除超级管理员角色' });
  const refs = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role_id=?').get(req.params.id).c;
  if (refs > 0) {
    return res.json({ code: 400, message: `该角色下还有 ${refs} 个用户，请先将用户分配到其他角色` });
  }
  db.prepare('DELETE FROM roles WHERE id=?').run(req.params.id);
  addLog('warning', 'delete_role', `${req.user.username} 删除了角色 ${role.name}`, req.user.username, req.ip);
  res.json({ code: 200, message: '删除成功' });
});

// 权限列表（登录即可，前端权限编辑器使用）
router.get('/permissions/list', (req, res) => {
  let modules = PERMISSION_MODULES;
  // 非 superadmin 剔除模型配置
  if (req.user.role !== 'superadmin') {
    modules = modules.filter(m => m.key !== 'model');
  }
  res.json({ code: 200, data: { modules } });
});

module.exports = router;
