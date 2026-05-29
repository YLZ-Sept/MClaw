// 蝉镜数字人 API 代理 — 完整路由
const { Router } = require('express');
const {
  listPublicDp, listPublicAudio, listFonts,
  createVideo, getVideo, listVideos, downloadVideo, deleteVideo,
  createTTS, getTTS,
  createLipSync, getLipSync, listLipSync,
  getUploadUrl, getUserInfo, getUserDuration
} = require('../services/chanjing-api');
const path = require('path');
const router = Router();

// ─── 公共资源 ───
router.get('/digital-persons', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const size = parseInt(req.query.size) || 20;
    let tagIds = req.query.tag_ids;
    if (typeof tagIds === 'string' && tagIds) tagIds = tagIds.split(',').map(Number).filter(Boolean);
    else if (!tagIds) tagIds = undefined;
    const data = await listPublicDp(page, size, tagIds);
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/voices', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const size = parseInt(req.query.size) || 20;
    const data = await listPublicAudio(page, size);
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/fonts', async (req, res) => {
  try {
    const data = await listFonts();
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/tags', async (req, res) => {
  try {
    const { listTags } = require('../services/chanjing-api');
    const data = await listTags(req.query.business_type || 1);
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ─── TTS 语音合成 ───
router.post('/tts', async (req, res) => {
  try {
    const data = await createTTS(req.body);
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/tts/:taskId', async (req, res) => {
  try {
    const data = await getTTS(req.params.taskId);
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ─── 视频合成 ───
router.post('/create-video', async (req, res) => {
  try {
    const taskId = await createVideo(req.body);
    res.json({ code: 200, data: taskId });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/video/:videoId', async (req, res) => {
  try {
    const data = await getVideo(req.params.videoId);
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/videos', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const size = parseInt(req.query.size) || 20;
    const data = await listVideos(page, size);
    // Normalize: Chanjing returns { List, PageInfo } → { list, page_info }
    res.json({ code: 200, data: {
      list: data.List || data.list || [],
      page_info: data.PageInfo || data.page_info || {},
    } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.delete('/videos/:id', async (req, res) => {
  try {
    const data = await deleteVideo(req.params.id);
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/videos/:id/download', async (req, res) => {
  try {
    const detail = await getVideo(req.params.id);
    const videoUrl = detail.video_url || detail.preview_url;
    if (!videoUrl) return res.status(404).json({ code: 404, message: '视频尚未生成或已过期' });
    // Redirect to Chanjing CDN URL for download
    res.redirect(videoUrl);
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ─── 对口型 / 照片说话 ───
router.post('/lip-sync', async (req, res) => {
  try {
    const taskId = await createLipSync(req.body);
    res.json({ code: 200, data: taskId });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/lip-sync/:id', async (req, res) => {
  try {
    const data = await getLipSync(req.params.id);
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/lip-sync', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const size = parseInt(req.query.size) || 20;
    const data = await listLipSync(page, size);
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ─── 文件管理 ───
router.get('/upload-url', async (req, res) => {
  try {
    const { service, name } = req.query;
    if (!service) return res.status(400).json({ code: 400, message: '缺少 service 参数' });
    const data = await getUploadUrl(service, name);
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ─── 用户信息 ───
router.get('/user/info', async (req, res) => {
  try {
    const data = await getUserInfo();
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/user/duration', async (req, res) => {
  try {
    const data = await getUserDuration();
    res.json({ code: 200, data });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
