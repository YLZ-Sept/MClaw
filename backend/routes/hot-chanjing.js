// 爆款视频 — 蝉镜数字人 API 代理
const { Router } = require('express');
const { listPublicDp, listPublicAudio, listFonts, createVideo, getVideo } = require('../services/chanjing-api');
const router = Router();

router.get('/digital-persons', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const size = parseInt(req.query.size) || 20;
    const data = await listPublicDp(page, size);
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

router.post('/create-video', async (req, res) => {
  try {
    const taskId = await createVideo(req.body);
    res.json({ code: 200, data: { task_id: taskId } });
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

module.exports = router;
