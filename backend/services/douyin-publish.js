// 抖音发布服务 — 调用 auto_douyin FastAPI
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DOUYIN_API = process.env.DOUYIN_API || 'http://localhost:18623/api/v1';

async function _fetch(path, opts = {}) {
  const url = `${DOUYIN_API}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.message || `HTTP ${res.status}`);
  return data;
}

function health() {
  return fetch(`${DOUYIN_API.replace('/api/v1', '')}/health`)
    .then(r => r.json())
    .catch(() => ({ status: 'unhealthy' }));
}

function getAccountStatus(accountName = 'default') {
  return _fetch(`/account/${encodeURIComponent(accountName)}/status`);
}

function login(accountName = 'default') {
  return _fetch('/login', { method: 'POST', body: JSON.stringify({ account_name: accountName, platform: 'douyin' }) });
}

function extractThumbnail(videoPath) {
  if (!fs.existsSync(videoPath)) return null;
  const thumbPath = videoPath.replace(/\.(mp4|mov|avi|mkv)$/i, '_thumb.jpg');
  if (fs.existsSync(thumbPath)) return thumbPath; // 已存在直接复用
  try {
    execSync(`ffmpeg -y -i "${videoPath}" -ss 00:00:01 -vframes 1 -q:v 2 "${thumbPath}"`, {
      timeout: 15000,
      stdio: 'pipe',
    });
    return fs.existsSync(thumbPath) ? thumbPath : null;
  } catch (e) {
    console.error('[douyin-publish] 缩略图提取失败:', e.message);
    return null;
  }
}

function uploadVideo({ accountName = 'default', videoPath, title, tags = [], description, thumbnailPath, publishDate, coverOrientation = 'portrait', location = '' }) {
  // 如果没有提供缩略图，自动提取
  const thumb = thumbnailPath || extractThumbnail(videoPath);
  return _fetch('/upload', {
    method: 'POST',
    body: JSON.stringify({
      account_name: accountName,
      platform: 'douyin',
      video_info: {
        video_path: videoPath,
        title,
        tags,
        description: description || '',
        thumbnail_path: thumb || null,
        location,
        cover_orientation: coverOrientation,
      },
      publish_date: publishDate || null,
    }),
  });
}

function batchUpload({ accountName = 'default', videoList, config }) {
  return _fetch('/batch-upload', {
    method: 'POST',
    body: JSON.stringify({ account_name: accountName, platform: 'douyin', video_list: videoList, config }),
  });
}

module.exports = { health, getAccountStatus, login, uploadVideo, batchUpload };
