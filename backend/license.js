const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('./db');

// ── 公钥（随 ZIP 分发，从文件读取避免编码问题）──
const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'data', 'license-public.pem'), 'utf8');

// ── 机器指纹采集 ──
function getFingerprint() {
  let uuid = '', disk = '', mac = '';
  try {
    uuid = execSync('wmic csproduct get uuid', { timeout: 5000, windowsHide: true })
      .toString().split('\n')[2]?.trim() || '';
  } catch {}
  try {
    disk = execSync('wmic diskdrive where "Index=0" get serialnumber', { timeout: 5000, windowsHide: true })
      .toString().split('\n')[2]?.trim() || '';
  } catch {}
  try {
    const raw = execSync('wmic nic where "PhysicalAdapter=TRUE" get MACAddress', { timeout: 5000, windowsHide: true })
      .toString();
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    mac = (lines.find(l => l !== 'MACAddress') || '').replace(/:/g, '').toUpperCase();
  } catch {}

  const combined = [uuid, disk, mac].join('|');
  const hash = crypto.createHash('sha256').update(combined).digest('hex').toUpperCase();
  return hash.slice(0, 20).match(/.{1,4}/g).join('-');
}

// ── 指纹容错匹配（5段中至少3段一致）──
function fingerprintMatch(stored, current) {
  const a = stored.split('-');
  const b = current.split('-');
  if (a.length !== 5 || b.length !== 5) return false;
  let match = 0;
  for (let i = 0; i < 5; i++) { if (a[i] === b[i]) match++; }
  return match >= 3;
}

// ── 验签 ──
function verifyLicense(code, currentFingerprint) {
  const parts = code.split('.');
  if (parts.length !== 3) return { ok: false, reason: '授权码格式错误' };
  const [header, bodyB64, sigB64] = parts;

  // RSA-PSS SHA-256
  let ok;
  try {
    const data = Buffer.from(header + '.' + bodyB64, 'utf8');
    const signature = Buffer.from(base64UrlDecode(sigB64), 'base64');
    ok = crypto.verify('RSA-SHA256', data, {
      key: PUBLIC_KEY,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    }, signature);
  } catch {
    return { ok: false, reason: '验签异常' };
  }
  if (!ok) return { ok: false, reason: '签名无效：授权码被篡改' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(base64UrlDecode(bodyB64), 'base64').toString('utf8'));
  } catch {
    return { ok: false, reason: '授权码荷载解析失败' };
  }

  if (header !== 'V1') return { ok: false, reason: '授权码协议版本不支持' };

  if (!fingerprintMatch(payload.fingerprint, currentFingerprint)) {
    return { ok: false, reason: '机器指纹不匹配，请确认授权码与当前机器一致' };
  }

  const expireDate = new Date(payload.expires);
  const now = new Date();
  const expired = expireDate < now;
  const daysLeft = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));

  return { ok: true, payload, expired, daysLeft };
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return str;
}

// ── 授权校验中间件 ──
const WHITE_PREFIXES = ['/api/license/', '/api/auth/', '/api/info', '/api/status', '/uploads/'];

function requireLicense(req, res, next) {
  // 非 API 请求直接放行（SPA 页面、静态资源等）
  if (!req.path.startsWith('/api/')) return next();
  // 白名单 API
  if (WHITE_PREFIXES.some(p => req.path.startsWith(p))) return next();

  const row = db.prepare("SELECT * FROM license WHERE status='active' ORDER BY activated_at DESC LIMIT 1").get();

  if (!row) {
    return res.status(402).json({ code: 402, message: '系统未激活，请联系云南米贝科技获取授权', unactivated: true });
  }

  const result = verifyLicense(row.code, getFingerprint());
  if (!result.ok) {
    db.prepare("UPDATE license SET status='revoked' WHERE id=?").run(row.id);
    return res.status(402).json({ code: 402, message: result.reason });
  }

  if (result.expired) {
    return res.status(402).json({
      code: 402,
      message: `授权已过期 ${Math.abs(result.daysLeft)} 天，请联系云南米贝科技续费`,
      expired: true,
      daysLeft: result.daysLeft,
    });
  }

  req.license = result;
  next();
}

module.exports = { getFingerprint, verifyLicense, requireLicense, PUBLIC_KEY };
