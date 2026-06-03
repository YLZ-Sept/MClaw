// 多平台发布服务 — 调用 auto_douyin FastAPI (抖音/小红书/微信视频号)
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVICE_API = process.env.DOUYIN_API || 'http://localhost:8000/api/v1';

async function _fetch(urlPath, opts = {}) {
  const url = `${SERVICE_API}${urlPath}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.message || `HTTP ${res.status}`);
  return data;
}

function health() {
  return fetch(`${SERVICE_API.replace('/api/v1', '')}/health`)
    .then(r => r.json())
    .catch(() => ({ status: 'unhealthy' }));
}

function getAccountStatus(accountName = 'default', platform = 'douyin') {
  return _fetch(`/account/${encodeURIComponent(accountName)}/status?platform=${encodeURIComponent(platform)}`);
}

function login(accountName = 'default', platform = 'douyin') {
  return _fetch('/login', {
    method: 'POST',
    body: JSON.stringify({ account_name: accountName, platform }),
  });
}

function extractThumbnail(videoPath) {
  if (!fs.existsSync(videoPath)) return null;
  const thumbPath = videoPath.replace(/\.(mp4|mov|avi|mkv)$/i, '_thumb.jpg');
  if (fs.existsSync(thumbPath)) return thumbPath;
  try {
    execSync(`ffmpeg -y -i "${videoPath}" -ss 00:00:01 -vframes 1 -q:v 2 "${thumbPath}"`, {
      timeout: 15000,
      stdio: 'pipe',
    });
    return fs.existsSync(thumbPath) ? thumbPath : null;
  } catch (e) {
    console.error('[multi-publish] 缩略图提取失败:', e.message);
    return null;
  }
}

function uploadVideo({ accountName = 'default', platform = 'douyin', videoPath, title, tags = [], description, thumbnailPath, publishDate, coverOrientation = 'portrait', location = '' }) {
  const thumb = thumbnailPath || extractThumbnail(videoPath);
  return _fetch('/upload', {
    method: 'POST',
    body: JSON.stringify({
      account_name: accountName,
      platform,
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

function batchUpload({ accountName = 'default', platform = 'douyin', videoList, config }) {
  return _fetch('/batch-upload', {
    method: 'POST',
    body: JSON.stringify({ account_name: accountName, platform, video_list: videoList, config }),
  });
}

const PLATFORM_LABELS = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  wechat_channel: '微信视频号',
};

function getPlatformLabel(platform) {
  return PLATFORM_LABELS[platform] || platform;
}

module.exports = { health, getAccountStatus, login, uploadVideo, batchUpload, getPlatformLabel };
