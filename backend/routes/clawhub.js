const express = require('express');
const router = express.Router();
const wsClient = require('../openclaw/ws-client');
const { getTranslations, translateInBackground, translateBatch } = require('../services/skill-translator');

function openclaw(method, params) {
  return wsClient.request(method, params).catch(err => {
    throw { status: 503, message: 'OpenClaw 服务不可用: ' + err.message };
  });
}

// GET /api/clawhub/search?q=weather&limit=20
router.get('/search', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q || !q.trim()) return res.json({ code: 200, data: [] });
    const result = await openclaw('skills.search', {
      query: q.trim(),
      limit: parseInt(limit) || 20
    });
    const skills = (result.results || []).map(r => ({
      slug: r.slug,
      name: r.displayName || r.slug,
      description: r.summary || '',
      version: r.version,
      updatedAt: r.updatedAt,
      owner: r.ownerHandle || (r.owner?.displayName)
    }));
    res.json({ code: 200, data: skills });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// GET /api/clawhub/skills/:slug
router.get('/skills/:slug', async (req, res) => {
  try {
    const result = await openclaw('skills.detail', { slug: req.params.slug });
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// POST /api/clawhub/install — body: { slug }
router.post('/install', async (req, res) => {
  try {
    const { slug } = req.body;
    if (!slug) return res.status(400).json({ code: 400, message: 'slug 为必填项' });
    const result = await openclaw('skills.install', {
      source: 'clawhub',
      slug,
      force: false
    });
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// GET /api/clawhub/status
router.get('/status', async (req, res) => {
  try {
    const result = await openclaw('skills.status');
    const translations = getTranslations();
    const skills = (result.skills || []).map(s => {
      const t = translations[s.skillKey || s.name];
      return {
        ...s,
        nameZh: t?.name_zh || null,
        descZh: t?.desc_zh || null
      };
    });
    // 后台翻译未缓存的技能
    const untranslated = skills.filter(s => !translations[s.skillKey || s.name]);
    if (untranslated.length > 0) {
      translateInBackground(untranslated);
    }
    res.json({ code: 200, data: { ...result, skills } });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// POST /api/clawhub/translate-batch — 批量翻译所有未缓存技能
router.post('/translate-batch', async (req, res) => {
  try {
    const result = await openclaw('skills.status');
    const skills = (result.skills || []).map(s => ({
      skillKey: s.skillKey || s.name,
      name: s.name,
      description: s.description || s.summary || ''
    }));
    const r = await translateBatch(skills, 3);
    res.json({ code: 200, data: r });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// POST /api/clawhub/import — 导入外部技能 zip 包
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const os = require('os');

const importUpload = multer({ dest: os.tmpdir() });

router.post('/import', importUpload.single('file'), async (req, res) => {
  let tmpDir = null;
  try {
    if (!req.file) return res.status(400).json({ code: 400, message: '请上传 zip 文件' });

    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries();

    // 找到根目录名（zip 里可能有一层目录包装）
    let rootDir = '';
    for (const e of entries) {
      const slashIdx = e.entryName.indexOf('/');
      if (slashIdx > 0) {
        const dir = e.entryName.slice(0, slashIdx);
        if (!rootDir || dir.length < rootDir.length) rootDir = dir;
      }
    }

    const extractBase = path.join(os.tmpdir(), 'skill-import-' + Date.now());
    fs.mkdirSync(extractBase, { recursive: true });
    tmpDir = extractBase;
    zip.extractAllTo(extractBase, true);

    // 如果有根目录包装，进入该目录
    let skillDir = extractBase;
    if (rootDir) {
      const candidate = path.join(extractBase, rootDir);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        skillDir = candidate;
      }
    }

    // 校验必须文件
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const metaPath = path.join(skillDir, '_meta.json');
    if (!fs.existsSync(skillMdPath)) {
      return res.status(400).json({ code: 400, message: 'zip 包缺少 SKILL.md 文件' });
    }
    if (!fs.existsSync(metaPath)) {
      return res.status(400).json({ code: 400, message: 'zip 包缺少 _meta.json 文件' });
    }

    // 读取 _meta.json 获取 slug/skillKey
    let meta;
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {
      return res.status(400).json({ code: 400, message: '_meta.json 格式无效' });
    }
    const skillName = meta.slug || meta.name || path.basename(skillDir);

    // 目标目录
    const skillsDir = path.join(os.homedir(), '.openclaw', 'workspace', 'skills');
    const targetDir = path.join(skillsDir, skillName);

    if (fs.existsSync(targetDir)) {
      return res.status(409).json({ code: 409, message: `技能「${skillName}」已存在，请先删除再导入` });
    }

    // 复制到 workspace/skills
    fs.mkdirSync(targetDir, { recursive: true });
    copyDirSync(skillDir, targetDir);

    res.json({ code: 200, data: { name: skillName, path: targetDir }, message: '导入成功' });
  } catch (e) {
    res.status(500).json({ code: 500, message: '导入失败: ' + e.message });
  } finally {
    // 清理临时文件
    try { req.file && fs.unlinkSync(req.file.path); } catch {}
    try { tmpDir && fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = router;
