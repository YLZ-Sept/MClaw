const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const router = Router();

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'pptx');

router.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ code: 400, message: '无效文件名' });
  }
  const filepath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ code: 404, message: '文件不存在或已过期' });
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filepath);
});

// 根据用户描述生成 PPT
router.post('/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ code: 400, message: '请描述 PPT 内容' });

    // 加载 PPT 技能的 prompt_snippet
    const db = require('../db');
    const skill = db.prepare("SELECT * FROM agent_skills WHERE id='ppt-generator-builtin'").get();
    if (!skill) return res.status(500).json({ code: 500, message: 'PPT 技能未找到' });

    // 调用 LLM 结构化内容
    const { chat, parseJSON } = require('../services/llm');
    const sysPrompt = `${skill.prompt_snippet}\n\n重要：只输出 JSON，不要输出其他内容。`;
    const response = await chat([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: `请根据以下描述生成 PPT：${prompt}` }
    ], 0.7);

    const pptData = parseJSON(response);
    if (!pptData.theme || !pptData.slides) {
      return res.status(500).json({ code: 500, message: 'LLM 未返回有效的 PPT 结构' });
    }

    const { generatePPTX } = require('../services/ppt-generator');
    const result = await generatePPTX(pptData);

    res.json({
      code: 200,
      data: {
        filename: result.filename,
        download_url: `/api/ppt/download/${result.filename}`,
        slides_count: pptData.slides.length
      }
    });
  } catch (err) {
    console.error('[ppt] generate error:', err.message);
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
