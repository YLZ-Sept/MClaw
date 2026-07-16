const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const router = Router();

const DATA_ROOT = path.join(__dirname, '..', 'data');
const KB_ROOT = path.join(__dirname, '..', 'uploads', 'kb');

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

module.exports = router;
