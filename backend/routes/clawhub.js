const express = require('express');
const router = express.Router();
const wsClient = require('../openclaw/ws-client');

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
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

module.exports = router;
