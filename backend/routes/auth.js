const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');

// ============================================================
// 权限定义
// ============================================================
const ALL_PERMISSIONS = [
  { key: 'chat', label: '实时聊天' },
  { key: 'digital', label: '数字员工' },
  { key: 'trending', label: '爆款追踪' },
  { key: 'knowledge', label: '知识库' },
  { key: 'skills', label: '技能库' },
  { key: 'crm', label: 'CRM管理' },
  { key: 'inventory', label: '进销存' },
  { key: 'hr', label: '人事管理' },
  { key: 'docs', label: '文档管理' },
  { key: 'publish', label: '内容发布' },
  { key: 'channels', label: '消息渠道' },
  { key: 'model', label: '模型配置' },
  { key: 'security', label: '安全设置' },
];

function getUserPermissions(user) {
  if (user.role === 'superadmin' || user.role === 'admin') {
    return ALL_PERMISSIONS.map(p => p.key);
  }
  try { return JSON.parse(user.permissions || '[]'); } catch { return []; }
}

// 登录失败追踪（内存）
const loginAttempts = new Map();

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM security_settings').all();
  const m = {};
  for (const r of rows) m[r.key] = r.value;
  return {
    maxAttempts: parseInt(m.login_max_attempts || '5'),
    lockoutMinutes: parseInt(m.login_lockout_minutes || '15'),
  };
}

function verifyPassword(password, stored) {
  const idx = stored.indexOf(':');
  if (idx === -1) return false;
  const salt = stored.slice(0, idx);
  const hash = stored.slice(idx + 1);
  try {
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return derived === hash;
  } catch {
    return false;
  }
}

const tokens = {};

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.json({ code: 400, message: '请输入用户名和密码' });
  }

  const settings = getSettings();
  const attempt = loginAttempts.get(username);

  if (attempt && attempt.lockUntil && Date.now() < attempt.lockUntil) {
    const remaining = Math.ceil((attempt.lockUntil - Date.now()) / 60000);
    return res.json({ code: 429, message: `账号已锁定，${remaining} 分钟后重试` });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    const count = (attempt?.count || 0) + 1;
    if (count >= settings.maxAttempts) {
      loginAttempts.set(username, {
        count,
        lockUntil: Date.now() + settings.lockoutMinutes * 60000,
      });
      return res.json({ code: 429, message: `密码错误${settings.maxAttempts}次，账号已锁定${settings.lockoutMinutes}分钟` });
    }
    loginAttempts.set(username, { count, lockUntil: null });
    return res.json({ code: 401, message: `用户名或密码错误（剩余${settings.maxAttempts - count}次尝试）` });
  }

  loginAttempts.delete(username);

  const token = crypto.randomUUID();
  const permissions = getUserPermissions(user);
  tokens[token] = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    permissions,
    createdAt: Date.now(),
  };
  res.json({
    code: 200,
    data: { token, name: user.name, role: user.role, permissions },
  });
});

router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) delete tokens[token];
  res.json({ code: 200 });
});

router.get('/user', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !tokens[token]) {
    return res.json({ code: 401, message: '未登录或登录已过期' });
  }
  const { name, role, permissions } = tokens[token];
  res.json({ code: 200, data: { name, role, permissions } });
});

// ============================================================
// 权限中间件
// ============================================================

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !tokens[token]) {
    return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
  }
  req.user = tokens[token];
  req.tokenKey = token;
  next();
}

function requirePermission(perm) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (!token || !tokens[token]) {
      return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
    }
    req.user = tokens[token];
    req.tokenKey = token;

    const { role, permissions } = tokens[token];
    if (role === 'superadmin' || role === 'admin') return next();
    if (permissions && permissions.includes(perm)) return next();

    res.status(403).json({ code: 403, message: '无权限访问此模块' });
  };
}

router.tokens = tokens;
router.verifyPassword = verifyPassword;
router.requireAuth = requireAuth;
router.requirePermission = requirePermission;
router.ALL_PERMISSIONS = ALL_PERMISSIONS;

module.exports = router;
