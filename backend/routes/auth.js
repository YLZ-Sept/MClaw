const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// 简单用户存储（生产环境应替换为数据库）
const users = {
  admin: { password: 'admin123', name: '管理员', role: 'admin' }
};

// 内存 token 存储
const tokens = {};

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.json({ code: 400, message: '请输入用户名和密码' });
  }
  const user = users[username];
  if (!user || user.password !== password) {
    return res.json({ code: 401, message: '用户名或密码错误' });
  }
  const token = crypto.randomUUID();
  tokens[token] = { username, name: user.name, role: user.role, createdAt: Date.now() };
  res.json({
    code: 200,
    data: { token, name: user.name, role: user.role }
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

// 导出 tokens 供中间件使用
router.tokens = tokens;

module.exports = router;
