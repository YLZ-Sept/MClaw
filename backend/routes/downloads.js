const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const router = Router();

const DATA_ROOT = path.join(__dirname, '..', 'data');

// 统一文件下载：/api/download/:type/:filename
// type: ppt | excel | pdf | docx | diagram
router.get('/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ code: 400, message: '无效文件名' });
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
