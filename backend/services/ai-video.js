// AI video via inference.sh — FLUX image → Wan I2V → local MP4
const path = require('path');
const fs = require('fs');
const config = require('../config');

const VIDEOS_DIR = path.join(__dirname, '..', 'videos');

async function _runInference(app, input) {
  const resp = await fetch('https://api.inference.sh/v1/apps/' + app + '/runs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.inferenceApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(120000)
  });
  if (!resp.ok) throw new Error(`Inference.sh ${app}: HTTP ${resp.status}`);
  const data = await resp.json();
  const output = data.output || {};
  const url = output.url || output.image_url || output.video_url || '';
  if (!url && typeof output === 'string') return output;
  if (!url) throw new Error(`${app} returned no URL`);
  return url;
}

async function generateImage(prompt) {
  return _runInference(config.aiVideoImageApp, { prompt });
}

async function generateVideoFromImage(imageUrl, motionPrompt) {
  return _runInference(config.aiVideoVideoApp, { prompt: motionPrompt, image: imageUrl });
}

async function downloadFile(url, dest) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  return dest;
}

async function generateAiVideo(imagePrompt, motionPrompt, contentId) {
  if (!config.inferenceApiKey) throw new Error('INFERENCE_API_KEY not configured');
  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  const imageUrl = await generateImage(imagePrompt);
  const videoUrl = await generateVideoFromImage(imageUrl, motionPrompt);
  const dest = path.join(VIDEOS_DIR, `ai_raw_${contentId}.mp4`);
  return downloadFile(videoUrl, dest);
}

module.exports = { generateImage, generateVideoFromImage, downloadFile, generateAiVideo };
