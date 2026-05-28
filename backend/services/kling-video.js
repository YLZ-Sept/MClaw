// Kling AI video service — Node.js port of kling_video.py
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const BASE = config.klingaiBaseUrl.replace(/\/+$/, '');
const VIDEOS_DIR = path.join(__dirname, '..', 'videos');

function _buildJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: config.klingaiAccessKey,
    exp: now + 1800,
    nbf: now - 5
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', config.klingaiSecretKey)
    .update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function submitText2Video(prompt, { duration = '5', mode = 'pro', aspectRatio = '9:16', modelName = 'kling-v2-6', negativePrompt = '' } = {}) {
  const token = _buildJWT();
  const resp = await fetch(`${BASE}/v1/videos/text2video`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_name: modelName, prompt, negative_prompt: negativePrompt, duration, mode, aspect_ratio: aspectRatio }),
    signal: AbortSignal.timeout(30000)
  });
  const data = await resp.json();
  if (resp.status !== 200 || data.code !== 0) throw new Error(`Kling submit failed: ${data.message || resp.status}`);
  return data.data.task_id;
}

async function pollTask(taskId, timeout = 600) {
  const token = _buildJWT();
  const deadline = Date.now() + timeout * 1000;
  let interval = 5;

  while (Date.now() < deadline) {
    const resp = await fetch(`${BASE}/v1/videos/text2video/${taskId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(30000)
    });
    const data = await resp.json();
    if (resp.status !== 200 || data.code !== 0) throw new Error(`Kling poll failed: ${data.message || resp.status}`);

    const status = data.data.task_status;
    if (status === 'succeed' || status === 'completed') return data.data;
    if (status === 'failed') throw new Error(`Kling task failed: ${data.data.task_status_msg || ''}`);

    await new Promise(r => setTimeout(r, interval * 1000));
    interval = Math.min(interval + 2, 15);
  }
  throw new Error(`Kling task ${taskId} timed out after ${timeout}s`);
}

async function downloadVideo(url, dest) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  return dest;
}

async function generateVideo(prompt, contentId, { duration = '5', mode = 'pro', aspectRatio = '9:16' } = {}) {
  if (!config.klingaiAccessKey || !config.klingaiSecretKey) {
    throw new Error('KLINGAI_ACCESS_KEY and KLINGAI_SECRET_KEY not configured');
  }
  const taskId = await submitText2Video(prompt, { duration, mode, aspectRatio });
  const result = await pollTask(taskId);
  const works = (result.task_result && result.task_result.works) || [];
  if (!works.length) throw new Error('Kling returned no video works');

  const videoUrl = works[0].resource.resource;
  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  const dest = path.join(VIDEOS_DIR, `kling_raw_${contentId}.mp4`);
  return downloadVideo(videoUrl, dest);
}

module.exports = { submitText2Video, pollTask, generateVideo };
