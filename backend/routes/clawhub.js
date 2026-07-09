const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
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

// ── 技能分类（14个固定分类）──
const CATEGORIES = {
  external: '外部技能',
  design: '设计多媒体', dev: '开发编程', itops: 'IT 运维与安全',
  data: '数据分析', ai: 'AI Agent', content: '内容创作',
  knowledge: '知识管理', business: '商业运营', edu: '教育学习',
  industry: '行业专业', office: '办公效率', life: '生活服务'
};

const CATEGORY_KEYWORDS = {
  // 顺序：先匹配语义明确的，后匹配宽泛的（design 兜底）
  office: ['productivity','workflow','automation','task','schedule','calendar','todo','email','meeting','batch','organize','reminder','deadline','project','note','ppt','presentation','slide','document','word','pdf','excel','markdown','format','convert','template','collab'],
  business: ['business','crm','sales','market','finance','hr','erp','supply','inventory','order','customer','lead','contract','invoice','payment','account','ecommerce','shop','revenue','tax','payroll','recruitment'],
  edu: ['education','learn','course','tutorial','quiz','exam','study','teach','train','academy','student','flashcard','explain','lesson','textbook','classroom','skill'],
  industry: ['legal','medical','health','real estate','logistics','manufacture','retail','compliance','regulation','clinic','construction','pharma','insurance','bank','industry','bid','procurement'],
  data: ['analytics','visualization','chart','dashboard','bi','etl','csv','spreadsheet','metric','kpi','statistics','tableau','bigquery','databricks','database','sql','parse','extract','transform','report','stats','query','schema','pandas','numpy','jupyter'],
  itops: ['security','auth','devops','monitor','deploy','server','cloud','network','backup','ci','cd','infra','encrypt','scan','audit','permission','sre','admin','linux','docker','kubernetes','firewall','proxy','dns','ssl','vpn','log','ssh','nginx','terraform','ansible','vault','secret','policy'],
  dev: ['dev','code','git','browser','api','cli','npm','node','python','debug','terminal','shell','command','sdk','program','javascript','typescript','rust','golang','java','compile','build','ide','vscode','lint','commit','repo','package','plugin','framework','library','frontend','backend','css','html','react','vue','swift'],
  content: ['content','write','blog','article','social','copywriting','seo','creative','text','story','script','newsletter','tweet','publish','headline','medium','post','essay','translate','summary','caption','writing'],
  knowledge: ['knowledge','wiki','memory','faq','kb','retrieve','catalog','archive','library','search','obsidian','notion','index','reference','handbook','guide','manual'],
  ai: ['llm','gpt','claude','agent','chatbot','prompt','rag','embedding','token','copilot','assistant','reasoning','nlp','chat','model','language','completion','vector','llama','mistral','gemini','openai','anthropic','deepseek','qwen','generate','generative','ai'],
  life: ['travel','food','fitness','weather','shop','news','entertainment','fun','hobby','personal','lifestyle','recipe','restaurant','game','sport','movie','book','pet','music'],
  design: ['image','video','audio','photo','picture','graphic','draw','art','animation','voice','speech','icon','logo','color','render','3d','canvas','svg','font','filter','effect','camera','sound','design','avatar','screenshot','thumbnail','banner']
};

function matchCategory(name, description) {
  const text = ((name || '') + ' ' + (description || '')).toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return cat;
    }
  }
  return 'external';
}

function readMetaCategory(skillKey) {
  try {
    const metaPath = path.join(os.homedir(), '.openclaw', 'workspace', 'skills', skillKey, '_meta.json');
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.category && CATEGORIES[meta.category]) return meta.category;
    }
  } catch {}
  return null;
}

// 扫描文件系统中的本地技能（workspace/skills 目录下含 SKILL.md 的子目录）
function scanLocalSkills() {
  const skills = [];
  const skillsDir = path.join(os.homedir(), '.openclaw', 'workspace', 'skills');
  if (!fs.existsSync(skillsDir)) return skills;
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(skillsDir, entry.name);
    const skillMd = path.join(dirPath, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    let meta = {};
    try {
      const metaPath = path.join(dirPath, '_meta.json');
      if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {}
    const category = meta.category || matchCategory(meta.name || entry.name, meta.description || '');
    skills.push({
      name: meta.name || meta.slug || entry.name,
      displayName: meta.name || entry.name,
      skillKey: entry.name,
      description: meta.description || '',
      version: meta.version || '0.0.0',
      source: 'local',
      disabled: false,
      category
    });
  }
  return skills;
}

// GET /api/clawhub/status
router.get('/status', async (req, res) => {
  try {
    const result = await openclaw('skills.status');
    const translations = getTranslations();
    const skills = (result.skills || []).map(s => {
      const t = translations[s.skillKey || s.name];
      const category = readMetaCategory(s.skillKey) || matchCategory(s.displayName || s.name, s.description || s.summary);
      return {
        ...s,
        nameZh: t?.name_zh || null,
        descZh: t?.desc_zh || null,
        category
      };
    });

    // 补充扫描文件系统中的本地技能
    const existingNames = new Set(skills.map(s => (s.skillKey || s.name || '').toLowerCase()));
    for (const ls of scanLocalSkills()) {
      if (!existingNames.has(ls.skillKey.toLowerCase())) {
        skills.push(ls);
      }
    }

    const untranslated = skills.filter(s => !translations[s.skillKey || s.name]);
    if (untranslated.length > 0) {
      translateInBackground(untranslated);
    }
    res.json({ code: 200, data: { ...result, skills } });
  } catch (e) {
    // OpenClaw 不可用时，至少返回本地技能
    if (e.status === 503) {
      const skills = scanLocalSkills();
      res.json({ code: 200, data: { skills } });
    } else {
      res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
    }
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

    // 查找 SKILL.md（支持嵌套目录，如 GitHub zip 的 repo/skill-name/SKILL.md）
    function findSkillMd(dir, depth) {
      if (depth > 3) return null;
      const mdPath = path.join(dir, 'SKILL.md');
      if (fs.existsSync(mdPath)) return dir;
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
            const found = findSkillMd(path.join(dir, e.name), depth + 1);
            if (found) return found;
          }
        }
      } catch {}
      return null;
    }
    const actualSkillDir = findSkillMd(skillDir, 0);
    if (!actualSkillDir) {
      return res.status(400).json({ code: 400, message: 'zip 包缺少 SKILL.md 文件' });
    }
    skillDir = actualSkillDir;

    // 校验必须文件
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    const metaPath = path.join(skillDir, '_meta.json');

    // 如果缺少 _meta.json，从 SKILL.md 的 YAML frontmatter 自动生成
    if (!fs.existsSync(metaPath)) {
      const skillMd = fs.readFileSync(skillMdPath, 'utf8');
      if (skillMd.startsWith('---')) {
        const end = skillMd.indexOf('---', 4);
        if (end !== -1) {
          const frontmatter = {};
          const lines = skillMd.slice(4, end).split('\n');
          for (const line of lines) {
            const ci = line.indexOf(':');
            if (ci > 0) {
              const key = line.slice(0, ci).trim();
              let val = line.slice(ci + 1).trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
              }
              frontmatter[key] = val;
            }
          }
          if (frontmatter.name) {
            fs.writeFileSync(metaPath, JSON.stringify({ name: frontmatter.name, version: frontmatter.version, description: frontmatter.description }, null, 2));
            console.log('[clawhub] 从 SKILL.md 自动生成 _meta.json:', frontmatter.name);
          }
        }
      }
    }

    // 读取 _meta.json 获取 slug/skillKey
    let meta;
    if (fs.existsSync(metaPath)) {
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {
        return res.status(400).json({ code: 400, message: '_meta.json 格式无效' });
      }
    }
    const skillName = meta?.slug || meta?.name || path.basename(skillDir);

    // 目标目录
    const skillsDir = path.join(os.homedir(), '.openclaw', 'workspace', 'skills');
    const targetDir = path.join(skillsDir, skillName);

    if (fs.existsSync(targetDir)) {
      return res.status(409).json({ code: 409, message: `技能「${skillName}」已存在，请先删除再导入` });
    }

    // 复制到 workspace/skills
    fs.mkdirSync(targetDir, { recursive: true });
    copyDirSync(skillDir, targetDir);

    // 自动匹配分类并写入 _meta.json
    const targetMetaPath = path.join(targetDir, '_meta.json');
    const finalCategory = matchCategory(meta?.displayName || meta?.name || skillName, meta?.description || '');
    try {
      let targetMeta = {};
      if (fs.existsSync(targetMetaPath)) targetMeta = JSON.parse(fs.readFileSync(targetMetaPath, 'utf8'));
      targetMeta.category = finalCategory;
      fs.writeFileSync(targetMetaPath, JSON.stringify(targetMeta, null, 2));
      console.log('[clawhub] 自动分类:', skillName, '→', finalCategory);
    } catch {}

    res.json({ code: 200, data: { name: skillName, path: targetDir, category: finalCategory }, message: '导入成功' });
  } catch (e) {
    res.status(500).json({ code: 500, message: '导入失败: ' + e.message });
  } finally {
    // 清理临时文件
    try { req.file && fs.unlinkSync(req.file.path); } catch {}
    try { tmpDir && fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

// PUT /api/clawhub/category — 修改技能分类
router.put('/category', (req, res) => {
  try {
    const { skillKey, category } = req.body;
    if (!skillKey || !category) return res.status(400).json({ code: 400, message: 'skillKey 和 category 为必填项' });
    if (!CATEGORIES[category]) return res.status(400).json({ code: 400, message: '无效分类: ' + category });

    const metaPath = path.join(os.homedir(), '.openclaw', 'workspace', 'skills', skillKey, '_meta.json');
    let meta = {};
    if (fs.existsSync(metaPath)) {
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
    }
    meta.category = category;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    res.json({ code: 200, data: { skillKey, category } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
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
