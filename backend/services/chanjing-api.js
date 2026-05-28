// Chanjing API client — Node.js port of chanjing.py
const config = require('../config');
const path = require('path');
const fs = require('fs');

const BASE = config.chanjingBaseUrl.replace(/\/+$/, '');
const VIDEOS_DIR = path.join(__dirname, '..', 'videos');

let tokenCache = { access_token: null, expires_at: 0 };

async function _getToken() {
  const now = Date.now() / 1000;
  if (tokenCache.access_token && now < tokenCache.expires_at - 60) {
    return tokenCache.access_token;
  }

  const resp = await fetch(`${BASE}/open/v1/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: config.chanjingAppId, secret_key: config.chanjingSecretKey }),
    signal: AbortSignal.timeout(15000)
  });
  const body = await resp.json();
  if (body.code !== 0) throw new Error(`Chanjing auth failed: ${body.msg}`);

  const data = body.data;
  tokenCache.access_token = data.access_token;
  const expiresRaw = data.expire_in;
  if (expiresRaw > now) {
    tokenCache.expires_at = expiresRaw; // Unix timestamp
  } else {
    tokenCache.expires_at = now + expiresRaw; // duration seconds
  }
  return data.access_token;
}

async function _headers() {
  const token = await _getToken();
  return { access_token: token, 'Content-Type': 'application/json' };
}

function _handle(resp) {
  if (resp.code !== 0) throw new Error(`Chanjing API: ${resp.msg} (trace=${resp.trace_id})`);
  return resp.data;
}

async function listPublicDp(page = 1, size = 20, tagIds) {
  const params = { page, size };
  if (tagIds) params.tag_ids = tagIds;
  const resp = await fetch(`${BASE}/open/v1/list_common_dp?${new URLSearchParams(params)}`, {
    headers: await _headers(), signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

async function listPublicAudio(page = 1, size = 20) {
  const resp = await fetch(`${BASE}/open/v1/list_common_audio?${new URLSearchParams({ page, size })}`, {
    headers: await _headers(), signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

async function listFonts() {
  const resp = await fetch(`${BASE}/open/v1/font_list`, {
    headers: await _headers(), signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

async function createVideo(params) {
  const resp = await fetch(`${BASE}/open/v1/create_video`, {
    method: 'POST', headers: await _headers(), body: JSON.stringify(params),
    signal: AbortSignal.timeout(30000)
  });
  return _handle(await resp.json()); // task_id
}

async function getVideo(videoId) {
  const resp = await fetch(`${BASE}/open/v1/video?${new URLSearchParams({ id: videoId })}`, {
    headers: await _headers(), signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

async function listVideos(page = 1, size = 20) {
  const resp = await fetch(`${BASE}/open/v1/video_list`, {
    method: 'POST', headers: await _headers(), body: JSON.stringify({ page, size }),
    signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

async function downloadVideo(url, contentId, suffix = '') {
  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  const dest = path.join(VIDEOS_DIR, `video_${contentId}${suffix}.mp4`);
  const resp = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  return dest;
}

module.exports = { listPublicDp, listPublicAudio, listFonts, createVideo, getVideo, listVideos, downloadVideo };
