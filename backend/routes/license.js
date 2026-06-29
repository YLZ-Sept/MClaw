const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');
const { getFingerprint, verifyLicense, requireLicense } = require('../license');
const { requireAuth } = require('./auth');

const router = Router();

// 获取授权状态（任何人可访问，帮助页用）
router.get('/status', (req, res) => {
  const fp = getFingerprint();
  const row = db.prepare("SELECT * FROM license WHERE status='active' ORDER BY activated_at DESC LIMIT 1").get();

  if (!row) {
    return res.json({ code: 200, data: { activated: false, fingerprint: fp } });
  }

  const result = verifyLicense(row.code, fp);
  res.json({
    code: 200,
    data: {
      activated: true,
      customer: row.customer,
      fingerprint: fp,
      expires: row.expires,
      daysLeft: result.daysLeft,
      expired: result.expired,
      tier: row.tier || 'enterprise',
      maxUsers: row.max_users || 99,
    }
  });
});

// 激活授权（superadmin 粘贴授权码）
router.post('/activate', (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.json({ code: 400, message: '请输入授权码' });

  const fp = getFingerprint();
  const result = verifyLicense(code, fp);

  if (!result.ok) {
    return res.json({ code: 400, message: result.reason });
  }

  // 吊销旧授权
  db.prepare("UPDATE license SET status='revoked' WHERE status='active'").run();

  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO license (id,code,customer,fingerprint,expires,tier,max_users,status)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, code, result.payload.customer, result.payload.fingerprint,
         result.payload.expires, result.payload.tier || 'enterprise',
         result.payload.users || 99, 'active');

  res.json({
    code: 200,
    data: {
      customer: result.payload.customer,
      expires: result.payload.expires,
      tier: result.payload.tier || 'enterprise',
      maxUsers: result.payload.users || 99,
    }
  });
});

module.exports = router;
