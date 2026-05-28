// HyperFrames video generation — HTML template + npx hyperframes render
// Uses CSS animations (no GSAP CDN — HyperFrames headless Chrome blocks external scripts)
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { tts, sanitizeText } = require('./tts');
const { _getAudioDuration } = require('./video-generator');

const VIDEOS_DIR = path.join(__dirname, '..', 'videos');

// ─── Sentence splitting (Chinese-aware) ───
function splitSentences(text) {
  if (!text || !text.trim()) return ['（无内容）'];
  const parts = text.split(/(?<=[。！？.!?\n])/);
  const segments = [];
  for (const part of parts) {
    const s = part.trim();
    if (s) {
      if (s.length > 60) {
        const subParts = s.split(/(?<=[，,])/);
        let buf = '';
        for (const sp of subParts) {
          const trimmed = sp.trim();
          if (!trimmed) continue;
          if (buf.length + trimmed.length > 50 && buf.trim()) {
            segments.push(buf.trim());
            buf = trimmed;
          } else {
            buf += trimmed;
          }
        }
        if (buf.trim()) segments.push(buf.trim());
      } else {
        segments.push(s);
      }
    }
  }
  return segments.length > 0 ? segments : [text.slice(0, 40)];
}

function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Build HyperFrames HTML (CSS animations only, no external scripts) ───
function buildHTML({ title, brand, orientation, duration, segments }) {
  const W = orientation === 'landscape' ? 1920 : 1080;
  const H = orientation === 'landscape' ? 1080 : 1920;
  const dur = Math.ceil(duration);
  const textColor = '#e8954c';
  const bottomY = Math.floor(H / 5);

  const totalChars = segments.reduce((s, seg) => s + seg.length, 0) || 1;
  let timeCursor = Math.min(2, duration * 0.2);
  const segTimings = segments.map(seg => {
    const segDur = Math.max(2, (seg.length / totalChars) * duration * 0.8);
    const start = Math.min(timeCursor, duration - 2);
    timeCursor = start + segDur * 0.75;
    return { text: seg, start, duration: Math.min(segDur, duration - start - 0.5) };
  });

  // Build segment HTML blocks
  let segHTML = '';
  for (let i = 0; i < segTimings.length; i++) {
    const seg = segTimings[i];
    segHTML += `
    <div id="seg-${i}" class="clip seg-text" data-start="${seg.start.toFixed(1)}" data-duration="${seg.duration.toFixed(1)}" data-track-index="2"
         style="left:60px;right:60px;bottom:${bottomY}px;font-size:34px;line-height:1.7;color:#ffffff;text-shadow:0 1px 8px rgba(0,0,0,0.8);animation:fadeUp 0.5s ease-out both">
      ${escapeHTML(seg.text)}
    </div>`;
  }

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${W}, height=${H}" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      margin: 0; width: ${W}px; height: ${H}px; overflow: hidden;
      background: linear-gradient(135deg, #080f1a 0%, #0c1f38 100%);
      font-family: "Roboto", "Inter", "Noto Sans JP", sans-serif;
    }
    #root { width: ${W}px; height: ${H}px; position: relative; }
    .clip { position: absolute; }

    /* Animations */
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 0.5; } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes scanDown { from { top: 30px; } to { top: ${H - 30}px; } }
    @keyframes progressBar { from { width: 0%; } to { width: 100%; } }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${dur}" data-width="${W}" data-height="${H}">

    <!-- HUD corner decorations -->
    <div id="hud-tl" class="hud-tl clip" data-start="0" data-duration="${dur}" data-track-index="8"
         style="width:120px;height:60px;top:30px;left:30px;border:3px solid ${textColor};border-right:none;border-bottom:none;opacity:0;animation:fadeIn 0.5s ease-out 0.2s both"></div>
    <div id="hud-tr" class="hud-tr clip" data-start="0" data-duration="${dur}" data-track-index="8"
         style="width:120px;height:60px;top:30px;right:30px;border:3px solid ${textColor};border-left:none;border-bottom:none;opacity:0;animation:fadeIn 0.5s ease-out 0.3s both"></div>
    <div id="hud-bl" class="hud-bl clip" data-start="0" data-duration="${dur}" data-track-index="8"
         style="width:120px;height:60px;bottom:30px;left:30px;border:3px solid ${textColor};border-right:none;border-top:none;opacity:0;animation:fadeIn 0.5s ease-out 0.4s both"></div>
    <div id="hud-br" class="hud-br clip" data-start="0" data-duration="${dur}" data-track-index="8"
         style="width:120px;height:60px;bottom:30px;right:30px;border:3px solid ${textColor};border-left:none;border-top:none;opacity:0;animation:fadeIn 0.5s ease-out 0.5s both"></div>

    <!-- Scan line -->
    <div id="scanline" class="clip" data-start="0" data-duration="${dur}" data-track-index="9"
         style="left:0;right:0;height:2px;top:30px;background:linear-gradient(90deg,transparent,rgba(232,149,76,0.25),transparent);animation:scanDown ${dur.toFixed(1)}s linear both"></div>

    <!-- Progress bar -->
    <div id="progress-wrap" class="clip" data-start="0" data-duration="${dur}" data-track-index="9"
         style="bottom:18px;left:40px;right:40px;height:3px;background:rgba(232,149,76,0.15);border-radius:2px">
      <div id="progress-fill" style="height:100%;background:${textColor};border-radius:2px;animation:progressBar ${dur.toFixed(1)}s linear both"></div>
    </div>

    <!-- Title -->
    <div id="title" class="clip" data-start="0" data-duration="${dur}" data-track-index="1"
         style="left:50px;right:50px;top:${Math.floor(H / 8)}px;text-align:center;font-size:50px;font-weight:700;color:${textColor};text-shadow:0 2px 12px rgba(232,149,76,0.3);line-height:1.3;animation:fadeUp 0.8s ease-out both">
      ${escapeHTML(title)}
    </div>

    <!-- Brand -->
    <div id="brand" class="clip" data-start="0" data-duration="${dur}" data-track-index="1"
         style="left:50px;top:${Math.floor(H / 8) + 100}px;text-align:center;width:${W - 100}px;font-size:22px;color:#5a6a7a;animation:fadeUp 0.6s ease-out 0.3s both">
      ${escapeHTML(brand)}
    </div>

    <!-- Subtitle segments -->
    ${segHTML}

    <!-- Audio -->
    <audio id="tts-audio" data-start="0" data-duration="${dur}" data-track-index="0"
           src="assets/tts.mp3" data-volume="1.0"></audio>
  </div>

  <script>
    // Minimal GSAP-compatible timeline
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = {
      pause: function() { return this; },
      play: function() { return this; },
      seek: function(t) { return this; },
      duration: function() { return ${dur}; },
      progress: function() { return 0; },
      time: function() { return 0; }
    };
  </script>
</body>
</html>`;

  return html;
}

// ─── Main generate function ───
async function generateHyperFramesVideo(contentId, contentTitle, contentBody, brandName, orientation = 'portrait', voice = 'zh-CN-YunxiNeural', speed = 1.0) {
  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  // 1. Generate TTS audio
  const ttsText = sanitizeText(`${contentTitle}。${contentBody}`);
  const safeTitle = sanitizeText(contentTitle);
  const safeBrand = sanitizeText(brandName);
  const audioPath = await tts(ttsText, voice, speed);
  const duration = await _getAudioDuration(audioPath);

  // 2. Split text into scenes
  const segments = splitSentences(ttsText);

  // 3. Create temp project directory
  const projectDir = path.join(os.tmpdir(), `hf-${contentId}`);
  if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'assets'), { recursive: true });

  // 4. Copy TTS audio to assets
  const assetAudio = path.join(projectDir, 'assets', 'tts.mp3');
  fs.copyFileSync(audioPath, assetAudio);

  // 5. Generate index.html
  const html = buildHTML({ title: safeTitle, brand: safeBrand, orientation, duration, segments });
  fs.writeFileSync(path.join(projectDir, 'index.html'), html, 'utf8');

  // 6. Generate project files
  fs.writeFileSync(path.join(projectDir, 'meta.json'), JSON.stringify({
    id: contentId, name: safeTitle.slice(0, 50), createdAt: new Date().toISOString()
  }, null, 2), 'utf8');

  fs.writeFileSync(path.join(projectDir, 'hyperframes.json'), JSON.stringify({
    "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
    "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    "paths": { "blocks": "compositions", "components": "compositions/components", "assets": "assets" }
  }, null, 2), 'utf8');

  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
    name: `hf-${contentId.slice(0, 8)}`, private: true, type: "module",
    scripts: { render: "npx --yes hyperframes render" }
  }, null, 2), 'utf8');

  // 7. Render with HyperFrames
  const outputPath = path.join(VIDEOS_DIR, `video_${contentId}${orientation === 'landscape' ? '_landscape' : ''}.mp4`);
  const resolution = orientation === 'landscape' ? 'landscape' : 'portrait';

  await new Promise((resolve, reject) => {
    const cmd = `npx --yes hyperframes render --quality draft --resolution ${resolution} --output "${outputPath}"`;
    console.log(`[hyperframes] Running: ${cmd}`);
    exec(cmd, {
      cwd: projectDir,
      timeout: 600000,
      windowsHide: true,
      env: { ...process.env, HYPERFRAMES_TELEMETRY: 'disabled' }
    }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr ? stderr.slice(-500) : err.message;
        reject(new Error(`HyperFrames render failed: ${msg}`));
        return;
      }
      if (!fs.existsSync(outputPath)) {
        reject(new Error('HyperFrames 渲染完成但未找到输出文件'));
        return;
      }
      resolve(outputPath);
    });
  });

  // 8. Cleanup
  try { fs.rmSync(projectDir, { recursive: true }); } catch {}
  try { fs.unlinkSync(audioPath); } catch {}

  return outputPath;
}

module.exports = { generateHyperFramesVideo, splitSentences };
