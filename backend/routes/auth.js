const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');

// 登录失败追踪（内存）
const loginAttempts = new Map(); // username → { count, lockUntil }

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

  // 检查是否处于锁定状态
  if (attempt && attempt.lockUntil && Date.now() < attempt.lockUntil) {
    const remaining = Math.ceil((attempt.lockUntil - Date.now()) / 60000);
    return res.json({ code: 429, message: `账号已锁定，${remaining} 分钟后重试` });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    // 记录失败次数
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

  // 登录成功，清除失败记录
  loginAttempts.delete(username);

  const token = crypto.randomUUID();
  tokens[token] = {
    username: user.username,
    name: user.name,
    role: user.role,
    createdAt: Date.now(),
  };
  res.json({
    code: 200,
    data: { token, name: user.name, role: user.role },
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
  const { name, role } = tokens[token];
  res.json({ code: 200, data: { name, role } });
});

router.tokens = tokens;
router.verifyPassword = verifyPassword;

module.exports = router;
