// 爆款视频 — 内容流水线 CRUD + 视频生成
const { Router } = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { chat } = require('../services/llm');
const { generateContent } = require('../services/content-generator');
const { buildVisualPrompt, buildKlingPrompt } = require('../services/video-prompt');
const videoGen = require('../services/video-generator');
const aiVideo = require('../services/ai-video');
const klingVideo = require('../services/kling-video');
const cj = require('../services/chanjing-api');
const imgSeqVideo = require('../services/image-sequence-video');
const hyperframesVideo = require('../services/hyperframes-video');

const router = Router();
const VIDEOS_DIR = path.join(__dirname, '..', 'videos');

// Multer for asset uploads
const multer = require('multer');
const upload = multer({ dest: VIDEOS_DIR });

// ─── CRUD ───

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM hot_contents ORDER BY generated_at DESC').all();
  res.json({ code: 200, data: rows });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ code: 404, message: '内容不存在' });
  res.json({ code: 200, data: row });
});

router.post('/', (req, res) => {
  const { title, body, tags } = req.body;
  if (!title || !body) return res.status(400).json({ code: 400, message: 'title 和 body 必填' });
  const id = randomUUID();
  db.prepare(`INSERT INTO hot_contents (id,title,body,tags,status) VALUES (?,?,?,?,'draft')`)
    .run(id, title, body, tags || '');
  const row = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(id);
  res.json({ code: 200, data: row });
});

router.put('/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '内容不存在' });
  const { title, body, tags } = req.body;
  db.prepare(`UPDATE hot_contents SET title=?,body=?,tags=? WHERE id=?`)
    .run(title ?? cur.title, body ?? cur.body, tags ?? cur.tags, req.params.id);
  const row = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  res.json({ code: 200, data: row });
});

router.delete('/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '内容不存在' });
  db.prepare('DELETE FROM hot_contents WHERE id=?').run(req.params.id);
  res.json({ code: 200, data: { status: 'deleted' } });
});

// ─── 批量生成 ───

router.post('/generate', async (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM hot_products LIMIT 1').get();
    if (!product) return res.status(400).json({ code: 400, message: '请先配置产品信息' });

    const count = Math.min(req.body.count || 1, 10);
    const userPrompt = req.body.user_prompt || '';
    const results = [];

    for (let i = 0; i < count; i++) {
      const data = await generateContent(product, userPrompt);
      const id = randomUUID();
      db.prepare(`INSERT INTO hot_contents (id,title,body,tags,status) VALUES (?,?,?,?,'draft')`)
        .run(id, data.title, data.body, data.tags);
      results.push(db.prepare('SELECT * FROM hot_contents WHERE id=?').get(id));
    }

    res.json({ code: 200, data: results });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ─── 上传素材 ───

router.post('/:id/assets', upload.fields([{ name: 'bgm', maxCount: 1 }, { name: 'bg_image', maxCount: 5 }]), (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '内容不存在' });

  const files = req.files || {};

  if (files.bgm?.[0]) {
    const ext = path.extname(files.bgm[0].originalname) || '.mp3';
    const dest = path.join(VIDEOS_DIR, `bgm_${req.params.id}${ext}`);
    fs.renameSync(files.bgm[0].path, dest);
    db.prepare('UPDATE hot_contents SET bgm_path=? WHERE id=?').run(dest, req.params.id);
  }

  if (files.bg_image?.length) {
    const paths = [];
    files.bg_image.forEach((f, i) => {
      const ext = path.extname(f.originalname) || '.jpg';
      const dest = path.join(VIDEOS_DIR, `bgimg_${req.params.id}_${i}${ext}`);
      fs.renameSync(f.path, dest);
      paths.push(dest);
    });
    db.prepare('UPDATE hot_contents SET bg_image_path=? WHERE id=?').run(JSON.stringify(paths), req.params.id);
  }

  const row = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  res.json({ code: 200, data: row });
});

// ─── 审核 ───

router.post('/:id/review', (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '内容不存在' });

  const { action, feedback } = req.body;
  if (action === 'approve') {
    db.prepare('UPDATE hot_contents SET status=? WHERE id=?').run('approved', req.params.id);
  } else {
    db.prepare('UPDATE hot_contents SET status=?,error_message=? WHERE id=?')
      .run('rejected', feedback || '已驳回', req.params.id);
  }

  const row = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  res.json({ code: 200, data: row });
});

// ─── 发布 ───

router.post('/:id/publish', (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '内容不存在' });
  if (cur.status !== 'approved') return res.status(400).json({ code: 400, message: '只有已通过审核的内容才能发布' });

  db.prepare(`UPDATE hot_contents SET platforms=?,status='published',published_at=datetime('now','localtime') WHERE id=?`)
    .run(req.body.platforms || '', req.params.id);

  const row = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  res.json({ code: 200, data: row });
});

// ─── 视频生成（异步）───

router.post('/:id/generate-video', (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '内容不存在' });
  if (cur.status !== 'approved') return res.status(400).json({ code: 400, message: '只有已通过审核的内容才能生成视频' });
  if (cur.video_status === 'generating') return res.status(400).json({ code: 400, message: '视频正在生成中' });

  const contentId = req.params.id;
  const orientation = req.query.orientation || 'portrait';
  const videoMode = req.query.video_mode || 'standard';
  const voice = req.query.voice || 'zh-CN-YunxiNeural';
  const speed = parseFloat(req.query.speed) || 1.0;
  const personId = req.query.person_id || '';
  const audioManId = req.query.audio_man_id || '';
  const pitch = parseFloat(req.query.pitch) || 1.0;
  const fontId = req.query.font_id || '';
  const figureType = req.query.figure_type || '';
  const figureWidth = parseInt(req.query.figure_width) || 0;
  const figureHeight = parseInt(req.query.figure_height) || 0;
  const ttsProvider = req.query.tts_provider || 'edge'; // 'edge' | 'chanjing'

  const { getVideoCredentials } = require('./model-configs');

  // Validate mode configuration
  if (videoMode === 'inference' && !require('../config').inferenceApiKey) {
    return res.status(400).json({ code: 400, message: 'Inference.sh 未配置 INFERENCE_API_KEY' });
  }
  if (videoMode === 'kling') {
    const kc = getVideoCredentials('kling');
    if (!kc.accessKey || !kc.secretKey) {
      return res.status(400).json({ code: 400, message: '可灵 Access Key 和 Secret Key 未配置，请在模型配置页面添加可灵配置' });
    }
  }
  if (videoMode === 'chanjing') {
    const cc = getVideoCredentials('chanjing');
    if (!cc.appId || !cc.secretKey) {
      return res.status(400).json({ code: 400, message: '蝉镜 App ID 和 Secret Key 未配置，请在模型配置页面添加蝉镜配置' });
    }
  }
  if (videoMode === 'chanjing' && (!personId || !audioManId)) {
    return res.status(400).json({ code: 400, message: '蝉镜模式需要指定 person_id 和 audio_man_id' });
  }

  db.prepare("UPDATE hot_contents SET video_status='generating',error_message=NULL WHERE id=?").run(contentId);

  const product = db.prepare('SELECT * FROM hot_products LIMIT 1').get();
  const brand = product ? product.brand_name : 'MClaw';
  const bgm = cur.bgm_path;
  const bgImg = cur.bg_image_path;

  // Fire-and-forget async video generation
  (async () => {
    try {
      let videoPath;
      if (videoMode === 'inference') {
        const prompts = await buildVisualPrompt(cur.title, cur.body);
        const aiRaw = await aiVideo.generateAiVideo(prompts.image_prompt, prompts.motion_prompt, contentId);
        const result = await videoGen.generateVideoWithAiBackground(contentId, cur.title, cur.body, brand, aiRaw, orientation);
        videoPath = result.videoPath;
        try { fs.unlinkSync(aiRaw); } catch {} // 清理原始AI视频
      } else if (videoMode === 'kling') {
        const klingPrompt = await buildKlingPrompt(cur.title, cur.body);
        const ratio = orientation === 'portrait' ? '9:16' : '16:9';
        const klingRaw = await klingVideo.generateVideo(klingPrompt, contentId, { aspectRatio: ratio });
        const result = await videoGen.generateVideoWithAiBackground(contentId, cur.title, cur.body, brand, klingRaw, orientation);
        videoPath = result.videoPath;
        try { fs.unlinkSync(klingRaw); } catch {} // 清理原始Kling视频
      } else if (videoMode === 'chanjing') {
        const text = `${cur.title}。${cur.body}`;
        const params = {
          screen_height: 1920, screen_width: 1080,
          person: { id: personId, height: figureHeight, width: figureWidth, x: 0, y: 0, figure_type: figureType },
          audio: { type: 'tts', tts: { audio_man: audioManId, speed, pitch, text: [text] }, volume: 100 },
          subtitle_config: {
            show: true, font_size: 52, x: 0, y: 1740, width: 1080, height: 180,
            color: '#E8954C', stroke_color: '#080F1A', stroke_width: 2.0, asr_type: 0,
            ...(fontId ? { font_id: fontId } : {})
          },
          resolution_rate: 0,
        };
        const taskId = await cj.createVideo(params);
        let videoUrl = null;
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const detail = await cj.getVideo(taskId);
          videoUrl = detail.video_url || detail.preview_url;
          if (videoUrl) break;
          if (detail.status === -1 || detail.status === 40) {
            throw new Error(`蝉镜视频生成失败: ${detail.msg || detail.queue_desc}`);
          }
        }
        if (!videoUrl) throw new Error('蝉镜视频生成超时（10分钟）');
        const suffix = orientation === 'landscape' ? '_landscape' : '';
        videoPath = await cj.downloadVideo(videoUrl, contentId, suffix);
      } else if (videoMode === 'image_sequence') {
        videoPath = await imgSeqVideo.generateImageSequenceVideo(contentId, cur.title, cur.body, brand, orientation);
      } else if (videoMode === 'hyperframes') {
        videoPath = await hyperframesVideo.generateHyperFramesVideo(contentId, cur.title, cur.body, brand, orientation, voice, speed);
      } else {
        const result = await videoGen.generateVideo(contentId, cur.title, cur.body, brand, orientation, voice, speed, bgm, bgImg, ttsProvider);
        videoPath = result.videoPath;
      }

      const col = orientation === 'landscape' ? 'video_url_landscape' : 'video_url';
      db.prepare(`UPDATE hot_contents SET ${col}=?,video_status='done',generated_at=datetime('now','localtime') WHERE id=?`)
        .run(videoPath, contentId);
      console.log(`[hot-video] Generated for content ${contentId}: ${videoPath}`);
    } catch (err) {
      console.error(`[hot-video] Failed for content ${contentId}:`, err.message);
      db.prepare('UPDATE hot_contents SET video_status=?,error_message=? WHERE id=?')
        .run('failed', err.message.slice(0, 500), contentId);
    }
  })();

  const row = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(contentId);
  res.json({ code: 200, data: row });
});

// ─── 封面帧提取 ───

router.get('/:id/cover-frame', (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '内容不存在' });

  const orientation = req.query.orientation || 'portrait';
  const videoPath = orientation === 'landscape' ? (cur.video_url_landscape || cur.video_url) : (cur.video_url || cur.video_url_landscape);
  if (!videoPath || !fs.existsSync(videoPath)) return res.status(404).json({ code: 404, message: '视频不存在' });

  const t = parseFloat(req.query.t) || 1;
  const { execSync } = require('child_process');
  const suffix = orientation === 'landscape' ? '_landscape' : '';
  const thumbPath = path.join(VIDEOS_DIR, `cover_${req.params.id}_${orientation}_t${t}.jpg`);

  try {
    if (!fs.existsSync(thumbPath)) {
      execSync(`ffmpeg -y -i "${videoPath}" -ss ${t} -vframes 1 -q:v 2 "${thumbPath}"`, { timeout: 15000, stdio: 'pipe' });
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(thumbPath).pipe(res);
  } catch {
    res.status(500).json({ code: 500, message: '封面提取失败' });
  }
});

// ─── 视频文件服务 ───

router.get('/:id/video', (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '内容不存在' });

  const orientation = req.query.orientation || 'portrait';
  const videoPath = orientation === 'landscape' ? cur.video_url_landscape : cur.video_url;
  if (!videoPath) return res.status(404).json({ code: 404, message: '视频不存在' });
  if (!fs.existsSync(videoPath)) return res.status(404).json({ code: 404, message: '视频文件已丢失' });

  const suffix = orientation === 'landscape' ? '_landscape' : '';
  const filename = `video_${req.params.id}${suffix}.mp4`;
  if (req.query.download === 'true') {
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  }
  res.setHeader('Content-Type', 'video/mp4');
  fs.createReadStream(videoPath).pipe(res);
});

// ─── 发布图片上传 ───

const imageUpload = multer({
  dest: VIDEOS_DIR,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per image
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 JPG/PNG/WebP/GIF 图片格式'));
    }
  }
});

router.post('/:id/publish-images', imageUpload.array('images', 12), (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '内容不存在' });

  const files = req.files || [];
  const images = files.map((f, i) => {
    const ext = path.extname(f.originalname) || '.jpg';
    const dest = path.join(VIDEOS_DIR, `pubimg_${req.params.id}_${Date.now()}_${i}${ext}`);
    fs.renameSync(f.path, dest);
    return { id: `img_${i}`, path: dest, url: `/api/hot-contents/${req.params.id}/publish-image/${i}` };
  });

  res.json({ code: 200, data: images });
});

router.get('/:id/publish-image/:idx', (req, res) => {
  const prefix = `pubimg_${req.params.id}_`;
  const suffix = `_${req.params.idx}.`;
  const files = fs.readdirSync(VIDEOS_DIR).filter(f => f.startsWith(prefix) && f.includes(suffix));
  if (!files.length) return res.status(404).json({ code: 404, message: '图片不存在' });
  const filePath = path.join(VIDEOS_DIR, files[0]);
  const ext = path.extname(filePath).toLowerCase();
  const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'image/jpeg';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(filePath).pipe(res);
});

// ─── 删除视频 ───

router.delete('/:id/video', (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '内容不存在' });

  const orientation = req.query.orientation || 'portrait';
  const col = orientation === 'landscape' ? 'video_url_landscape' : 'video_url';
  const videoPath = cur[col];

  if (videoPath) {
    try { fs.unlinkSync(videoPath); } catch {}
    db.prepare(`UPDATE hot_contents SET ${col}=NULL WHERE id=?`).run(req.params.id);
    // Clear video_status if both orientations are gone
    const updated = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.id);
    if (!updated.video_url && !updated.video_url_landscape) {
      db.prepare('UPDATE hot_contents SET video_status=NULL WHERE id=?').run(req.params.id);
    }
  }

  res.json({ code: 200, data: { status: 'deleted' } });
});

module.exports = router;
