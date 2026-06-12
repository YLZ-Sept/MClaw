const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, ALL_PERMISSIONS } = require('./auth');
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

// 权限列表（公开，登录即可）
router.get('/permissions/list', (req, res) => {
  const groups = [
    {
      key: 'system', label: '系统管理',
      items: [
        { key: 'model', label: '模型配置', desc: 'AI 模型提供商和密钥管理' },
        { key: 'security', label: '安全设置', desc: '访问安全设置页面' },
        { key: 'security_config', label: '安全配置', desc: '密码策略和登录安全' },
        { key: 'security_users', label: '用户管理', desc: '创建/编辑/删除用户' },
        { key: 'security_roles', label: '角色管理', desc: '创建/编辑/删除角色' },
        { key: 'security_permissions', label: '权限管理', desc: '查看权限定义和分配' },
        { key: 'security_sessions', label: '会话管理', desc: '查看和强制下线活跃会话' },
        { key: 'security_maintain', label: '系统维护', desc: '系统概览和备份恢复' },
      ],
    },
    {
      key: 'comm', label: '沟通协作',
      items: [
        { key: 'chat', label: '实时聊天', desc: 'AI 对话和智能体交互' },
        { key: 'channels', label: '消息渠道', desc: '微信/企微/飞书等多渠道接入' },
      ],
    },
    {
      key: 'biz', label: '业务管理',
      items: [
        { key: 'crm', label: 'CRM管理', desc: '客户/联系人/合同/机会/资产管理' },
        { key: 'inventory', label: '进销存', desc: '采购/销售/库存/退换货管理' },
        { key: 'hr', label: '人事管理', desc: '员工/部门/招聘/考勤/绩效管理' },
        { key: 'docs', label: '文档管理', desc: '文档上传/搜索/分类管理' },
        { key: 'finance', label: '财务管理', desc: '应收/应付账款管理' },
      ],
    },
    {
      key: 'content', label: '内容运营',
      items: [
        { key: 'trending', label: '爆款追踪', desc: '热点内容提取/AI改写/视频生成' },
        { key: 'knowledge', label: '知识库', desc: 'FAQ 管理和知识检索' },
        { key: 'skills', label: '技能库', desc: '自定义智能体技能管理' },
        { key: 'publish', label: '内容发布', desc: '多平台视频发布和招标采集' },
        { key: 'digital', label: '数字员工', desc: '智能体和数字人管理' },
      ],
    },
  ];
  // 非 superadmin 不展示模型配置权限
  if (req.user.role !== 'superadmin') {
    for (const g of groups) {
      g.items = g.items.filter(item => item.key !== 'model');
    }
  }
  res.json({ code: 200, data: { groups } });
});

module.exports = router;
