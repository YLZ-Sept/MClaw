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
  const url = new URL(`${BASE}/open/v1/list_common_dp`);
  url.searchParams.set('page', page);
  url.searchParams.set('size', size);
  if (tagIds) {
    const ids = Array.isArray(tagIds) ? tagIds : [tagIds];
    ids.forEach(id => url.searchParams.append('tag_ids', id));
  }
  const resp = await fetch(url.toString(), {
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
    method: 'POST', headers: await _headers(), body: JSON.stringify({ page, page_size: size }),
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

// TTS
async function createTTS(params) {
  const resp = await fetch(`${BASE}/open/v1/create_audio_task`, {
    method: 'POST', headers: await _headers(), body: JSON.stringify(params),
    signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json()); // { task_id }
}

async function getTTS(taskId) {
  const resp = await fetch(`${BASE}/open/v1/audio_task_state`, {
    method: 'POST', headers: await _headers(), body: JSON.stringify({ task_id: taskId }),
    signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

// Lip Sync
async function createLipSync(params) {
  const resp = await fetch(`${BASE}/open/v1/video_lip_sync/create`, {
    method: 'POST', headers: await _headers(), body: JSON.stringify(params),
    signal: AbortSignal.timeout(30000)
  });
  return _handle(await resp.json()); // task_id
}

async function getLipSync(id) {
  const resp = await fetch(`${BASE}/open/v1/video_lip_sync/detail?${new URLSearchParams({ id })}`, {
    headers: await _headers(), signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

async function listLipSync(page = 1, size = 20) {
  const resp = await fetch(`${BASE}/open/v1/video_lip_sync/list`, {
    method: 'POST', headers: await _headers(), body: JSON.stringify({ page, page_size: size }),
    signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

// File upload URL
async function getUploadUrl(service, name) {
  const params = { service };
  if (name) params.name = name;
  const resp = await fetch(`${BASE}/open/v1/common/create_upload_url?${new URLSearchParams(params)}`, {
    headers: await _headers(), signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

async function listTags(businessType) {
  const url = new URL(`${BASE}/open/v1/common/tag_list`);
  if (businessType) url.searchParams.append('business_type', businessType);
  const resp = await fetch(url.toString(), {
    headers: await _headers(), signal: AbortSignal.timeout(15000)
  });
  const text = await resp.text();
  try {
    return _handle(JSON.parse(text));
  } catch (e) {
    throw new Error(`Chanjing tags API returned invalid response: ${text.slice(0, 200)}`);
  }
}

// Delete video
async function deleteVideo(id) {
  const resp = await fetch(`${BASE}/open/v1/delete_video`, {
    method: 'POST', headers: await _headers(), body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

// User info
async function getUserInfo() {
  const resp = await fetch(`${BASE}/open/v1/user_info`, {
    headers: await _headers(), signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

async function getUserDuration() {
  const resp = await fetch(`${BASE}/open/v1/user_duration`, {
    headers: await _headers(), signal: AbortSignal.timeout(15000)
  });
  return _handle(await resp.json());
}

module.exports = { listPublicDp, listPublicAudio, listFonts, createVideo, getVideo, listVideos, downloadVideo, createTTS, getTTS, createLipSync, getLipSync, listLipSync, getUploadUrl, deleteVideo, getUserInfo, getUserDuration, listTags };
