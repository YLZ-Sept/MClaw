const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const router = Router();

const DATA_ROOT = path.join(__dirname, '..', 'data');
const KB_ROOT = path.join(__dirname, '..', 'uploads', 'kb');

// 下载记录表
db.exec(`CREATE TABLE IF NOT EXISTS download_logs (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT DEFAULT '',
  file_size INTEGER DEFAULT 0,
  source TEXT DEFAULT 'chat',
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 记录下载
function logDownload(username, filename, fileType, fileSize, source) {
  try {
    db.prepare('INSERT INTO download_logs (id, username, filename, file_type, file_size, source) VALUES (?,?,?,?,?,?)')
      .run(crypto.randomUUID(), username || 'anonymous', filename, fileType || '', fileSize || 0, source || 'chat');
  } catch {}
}

// 简单 token 鉴权（兼容新标签页打开时的 query token）
function authByToken(req, res, next) {
  const tokens = require('./auth').tokens;
  const token = req.query.token;
  if (token && tokens && tokens[token]) {
    req.user = tokens[token];
    return next();
  }
  // 也支持 header Bearer token
  const headerToken = req.headers.authorization?.replace('Bearer ', '');
  if (headerToken && tokens && tokens[headerToken]) {
    req.user = tokens[headerToken];
    return next();
  }
  return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
}

// ★ OpenClaw workspace 文件下载必须在 /:type/:filename 之前注册，
// 否则 Express 会将 "openclaw" 匹配为 :type
// OpenClaw workspace 文件下载：/api/download/openclaw/:filename
// 直接从 ~/.openclaw/workspace/ 读取文件
const os = require('os');
const OC_WORKSPACE = require('path').join(os.homedir(), '.openclaw', 'workspace');

router.get('/openclaw/:filename', authByToken, (req, res) => {
  const { filename } = req.params;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ code: 400, message: '无效文件名' });
  }
  const filepath = require('path').join(OC_WORKSPACE, filename);
  if (!filepath.startsWith(OC_WORKSPACE)) {
    return res.status(400).json({ code: 400, message: '无效文件路径' });
  }
  if (!require('fs').existsSync(filepath)) {
    return res.status(404).json({ code: 404, message: '文件不存在或已被清理' });
  }
  const ext = require('path').extname(filename).toLowerCase();
  const mimeMap = {
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.html': 'text/html',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
  };
  res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  // 记录下载
  try { const s = fs.statSync(filepath); logDownload(req.user?.username, filename, ext, s.size, 'openclaw'); } catch {}
  res.sendFile(filepath);
});

// 统一文件下载：/api/download/:type/:filename
// type: ppt | excel | pdf | docx | diagram | kb
router.get('/:type/:filename', authByToken, (req, res) => {
  const { type, filename } = req.params;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ code: 400, message: '无效文件名' });
  }

  // KB 上传文件：支持路径子目录 /api/download/kb/filename 或 /api/download/kb/user/filename
  if (type === 'kb') {
    const user = req.user?.username || '';
    // 先尝试用户子目录，再尝试根目录
    let filepath = path.join(KB_ROOT, user, filename);
    if (!fs.existsSync(filepath)) {
      filepath = path.join(KB_ROOT, filename);
    }
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ code: 404, message: '文件不存在' });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.sendFile(filepath);
  }

  const dirMap = {
    ppt: 'pptx', excel: 'excel', pdf: 'pdf', docx: 'docx', diagram: 'diagrams'
  };
  const dir = dirMap[type];
  if (!dir) return res.status(400).json({ code: 400, message: '未知文件类型' });

  const filepath = path.join(DATA_ROOT, dir, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ code: 404, message: '文件不存在或已过期' });
  }

  const mimeMap = {
    ppt: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    diagram: 'image/png'
  };

  res.setHeader('Content-Type', mimeMap[type] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filepath);
});

// ── 下载历史 ──
router.get('/history', authByToken, (req, res) => {
  try {
    const username = req.user?.username || '';
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const logs = db.prepare(
      'SELECT * FROM download_logs WHERE username=? OR ?=\'\' ORDER BY created_at DESC LIMIT ?'
    ).all(username, username, limit);
    const total = db.prepare(
      'SELECT COUNT(*) as c FROM download_logs WHERE username=? OR ?=\'\''
    ).get(username, username)?.c || 0;
    res.json({ code: 200, data: { logs, total } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

module.exports = router;
