// Video generation engine — Node.js port of video_generator.py
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('../config');
const { chat } = require('./llm');
const { tts: edgeTts, sanitizeText } = require('./tts');
const { createTTS, getTTS } = require('./chanjing-api');

const VIDEOS_DIR = path.join(__dirname, '..', 'videos');

const TRANSLATE_PROMPT = `Translate the following Chinese text into natural English. Keep the same meaning and tone. Return ONLY the English translation, no extra text.

Chinese: {text}`;

// ─── Dimensions ───
function _getDimensions(orientation) {
  return orientation === 'landscape'
    ? { w: 1920, h: 1080 }
    : { w: config.videoWidth, h: config.videoHeight };
}

// ─── TTS ───
async function _tts(text, voice, speed, ttsProvider = 'edge') {
  if (ttsProvider === 'chanjing') {
    return _chanjingTts(text, voice, speed);
  }
  return edgeTts(text, voice, speed);
}

async function _chanjingTts(text, voice, speed) {
  const { createTTS, getTTS } = require('./chanjing-api');
  // Submit TTS task
  const { task_id } = await createTTS({
    audio_man: voice,
    speed: speed || 1.0,
    pitch: 1.0,
    text: { text, plain_text: text },
  });
  // Poll for completion
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const state = await getTTS(task_id);
    if (state.status === 1) {
      const audioUrl = state.full?.url || state.full?.path;
      if (!audioUrl) throw new Error('蝉镜 TTS 未返回音频地址');
      // Download audio
      const dest = path.join(VIDEOS_DIR, `tts_${task_id}.wav`);
      const resp = await fetch(audioUrl, { signal: AbortSignal.timeout(60000) });
      if (!resp.ok) throw new Error(`下载蝉镜 TTS 音频失败: HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(dest, buffer);
      return dest;
    }
    if (state.status === -1) {
      throw new Error(`蝉镜 TTS 失败: ${state.errMsg || state.errReason || '未知错误'}`);
    }
  }
  throw new Error('蝉镜 TTS 超时（2分钟）');
}

// ─── Translation ───
async function _translateEn(text) {
  try {
    const result = await chat([
      { role: 'user', content: TRANSLATE_PROMPT.replace('{text}', text) }
    ], 0.3);
    return result.trim();
  } catch { return text; }
}

// ─── Sentence splitting ───
function _splitSentences(text) {
  if (!text || !text.trim()) return ['（无内容）'];
  const raw = text.split(/([。，！？,.!?\n])/);
  const segments = [];
  let buf = '';
  for (const part of raw) {
    buf += part;
    if (buf.length >= 15 || /[。！？!.?\n]/.test(part)) {
      const s = buf.trim();
      if (s) segments.push(s);
      buf = '';
    }
  }
  if (buf.trim()) segments.push(buf.trim());
  return segments.length > 0 ? segments : [text.slice(0, 20)];
}

// ─── SRT builder ───
function _buildSrt(segments, duration, outPath) {
  const n = segments.length;
  const segDur = duration / n;
  let content = '';
  let seq = 0;
  for (let i = 0; i < n; i++) {
    if (!segments[i].trim()) continue;
    seq++;
    content += `${seq}\n${_fmtTs(i * segDur)} --> ${_fmtTs((i + 1) * segDur)}\n${segments[i]}\n\n`;
  }
  if (seq === 0) {
    content = `1\n${_fmtTs(0)} --> ${_fmtTs(duration)}\n（字幕生成失败）\n\n`;
  }
  fs.writeFileSync(outPath, content, 'utf8');
}

function _buildCnSrt(segments, duration, outPath) {
  _buildSrt(segments, duration, outPath);
}

// ─── Time formatting ───
function _fmtTs(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// ─── FFprobe audio duration ───
function _getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    execFile(config.ffprobeBin, ['-v', 'quiet', '-print_format', 'json', '-show_format', audioPath], {
      timeout: 15000, windowsHide: true
    }, (err, stdout) => {
      if (err) return reject(err);
      try {
        const info = JSON.parse(stdout);
        resolve(parseFloat(info.format.duration));
      } catch (e) { reject(e); }
    });
  });
}

// ─── FFmpeg text escaping ───
function _escapeFfmpegText(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%');
}

function _extractFfmpegError(stderr) {
  // Find the first actual error line, skipping the config banner
  const lines = stderr.split('\n');
  const errIdx = lines.findIndex(l => l.includes('Error') || l.includes('Invalid') || l.includes('No such'));
  if (errIdx >= 0) {
    const start = Math.max(0, errIdx - 3);
    const end = Math.min(lines.length, errIdx + 5);
    return lines.slice(start, end).join('\n');
  }
  // Fallback: last meaningful lines before the filter dump
  return lines.slice(-10).join('\n');
}

function _escapeFontPath(p) {
  // TTC fonts cause issues with drawtext — prefer simhei.ttf
  if (p.toLowerCase().endsWith('.ttc')) {
    const ttf = p.replace(/msyh\.ttc$/i, 'simhei.ttf').replace(/msyhbd\.ttc$/i, 'simhei.ttf');
    if (require('fs').existsSync(ttf)) p = ttf;
  }
  const safe = p.replace(/\\/g, '/').replace(/:/g, '\\:');
  return `'${safe}'`;
}

// ─── Ken Burns zoompan for a single image ───
function _kenBurnsFilter(imgIdx, W, H, fps, segFrames, direction) {
  // direction: 1 = zoom in, -1 = zoom out
  const zoomStart = direction === 1 ? 1.0 : 1.12;
  const zoomEnd = direction === 1 ? 1.12 : 1.0;
  const zoomStep = (zoomEnd - zoomStart) / segFrames;
  return `[${imgIdx}:v]zoompan=z='min(max(zoom+${zoomStep.toFixed(6)},1.0),1.15)':` +
    `d=${segFrames}:` +
    `x='iw/2-(iw/zoom/2)+sin(on*0.04)*15':` +
    `y='ih/2-(ih/zoom/2)+cos(on*0.03)*10':` +
    `s=${W}x${H}:fps=${fps}[v${imgIdx}]`;
}

// ─── Multi-image slideshow with Ken Burns + crossfade ───
function _buildSlideshow(imagePaths, W, H, fps, totalDuration, xfadeDuration) {
  const n = imagePaths.length;
  if (n === 0) return null;
  if (n === 1) {
    // Single image: just Ken Burns, no xfade needed
    const segFrames = Math.ceil(totalDuration * fps);
    return {
      inputs: imagePaths.map(p => ({ path: p, loop: true })),
      filter: _kenBurnsFilter(0, W, H, fps, segFrames, 1) + `;[v0]trim=duration=${totalDuration}[bg]`,
    };
  }
  // Multiple images with crossfade
  const segmentDur = (totalDuration - xfadeDuration * (n - 1)) / n;
  if (segmentDur < 1) {
    // Too short, just concat without xfade
    const segFrames = Math.ceil(totalDuration / n * fps);
    const inputs = imagePaths.map(p => ({ path: p, loop: true }));
    let filter = imagePaths.map((_, i) =>
      _kenBurnsFilter(i, W, H, fps, segFrames, i % 2 === 0 ? 1 : -1)
    ).join(';') + ';';
    // concat
    filter += imagePaths.map((_, i) => `[v${i}]`).join('') + `concat=n=${n}:v=1:a=0,trim=duration=${totalDuration}[bg]`;
    return { inputs, filter };
  }

  const segFrames = Math.ceil(segmentDur * fps);
  const xfadeFrames = Math.ceil(xfadeDuration * fps);
  const inputs = imagePaths.map(p => ({ path: p, loop: true }));

  // Build Ken Burns segments
  let filter = imagePaths.map((_, i) =>
    _kenBurnsFilter(i, W, H, fps, segFrames, i % 2 === 0 ? 1 : -1)
  ).join(';') + ';';

  // Chain xfade
  const offset = segmentDur - xfadeDuration;
  let prev = 'v0';
  for (let i = 1; i < n; i++) {
    const next = `x${i}`;
    const off = offset * i;
    filter += `[${prev}][v${i}]xfade=transition=fade:duration=${xfadeDuration}:offset=${off.toFixed(2)}[${next}];`;
    prev = next;
  }
  filter += `[${prev}]trim=duration=${totalDuration}[bg]`;

  return { inputs, filter };
}

// ─── Render video (standard mode) ───
function _renderVideo({ duration, audioPath, srtCnPath, srtEnPath, title, brand, outputPath, orientation, bgmPath, bgImagePath }) {
  return new Promise((resolve, reject) => {
    const { w: W, h: H } = _getDimensions(orientation);
    const FPS = config.videoFps;
    const font = _escapeFontPath(config.fontPath);
    const titleSafe = _escapeFfmpegText(title);
    const brandSafe = _escapeFfmpegText(brand);
    const srtCnAbs = path.resolve(srtCnPath).replace(/\\/g, '/').replace(/:/g, '\\:');
    const srtEnAbs = path.resolve(srtEnPath).replace(/\\/g, '/').replace(/:/g, '\\:');
    const audioAbs = path.resolve(audioPath).replace(/\\/g, '/');
    const outAbs = path.resolve(outputPath).replace(/\\/g, '/');

    const dur = Math.ceil(duration) + 1;
    const bw = 120; const bt = 3; const bh = 60;
    const leftX = 30; const rightX = W - leftX - bw;
    const cnMargin = Math.floor(H / 6);
    const enMargin = Math.floor(H / 6 + 60);

    const hudAndText =
      `drawgrid=w=100:h=100:t=2:c=0xe8954c@0.05[bg2];` +
      `[bg2]` +
      `drawbox=x=${leftX}:y=30:w=${bw}:h=${bt}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${leftX}:y=30:w=${bt}:h=${bh}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${rightX}:y=30:w=${bw}:h=${bt}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${rightX + bw - bt}:y=30:w=${bt}:h=${bh}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${leftX}:y=${H - 30 - bt}:w=${bw}:h=${bt}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${leftX}:y=${H - 30 - bh}:w=${bt}:h=${bh}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${rightX}:y=${H - 30 - bt}:w=${bw}:h=${bt}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${rightX + bw - bt}:y=${H - 30 - bh}:w=${bt}:h=${bh}:c=0xe8954c@0.6:t=fill` +
      `[bg3];` +
      `[bg3]drawtext=text='${titleSafe}':` +
      `fontcolor=0xe8954c:fontsize=56:` +
      `x=(w-text_w)/2:y=${Math.floor(H / 12)}:` +
      `fontfile=${font},` +
      `drawbox=x=(w-200)/2:y=${Math.floor(H / 12 + 78)}:w=200:h=3:c=0xe8954c@0.5:t=fill,` +
      `drawtext=text='${brandSafe}':` +
      `fontcolor=0x5a6a7a:fontsize=28:` +
      `x=(w-text_w)/2:y=${Math.floor(H / 12 + 108)}:` +
      `fontfile=${font}` +
      `[bg4];` +
      `[bg4]subtitles='${srtCnAbs}':` +
      `force_style='FontName=Microsoft YaHei,FontSize=30,` +
      `PrimaryColour=&H00E8954C&,OutlineColour=&H00080f1a&,Outline=3,` +
      `MarginV=${cnMargin}'` +
      `[with_cn];` +
      `[with_cn]subtitles='${srtEnAbs}':` +
      `force_style='FontName=Arial,FontSize=22,` +
      `PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,Outline=2,` +
      `MarginV=${enMargin}'` +
      `[out]`;

    let cmdArgs = [config.ffmpegBin, '-y'];

    // Parse bg images: support comma-separated paths or JSON array
    let bgImages = [];
    if (bgImagePath) {
      try { bgImages = JSON.parse(bgImagePath); } catch {
        bgImages = bgImagePath.split(',').map(p => p.trim()).filter(Boolean);
      }
    }

    let audioInputIdx;
    let ttsIdx;

    if (bgImages.length > 0) {
      const slideshow = _buildSlideshow(bgImages, W, H, FPS, duration, 0.8);
      // Add image inputs
      for (const img of slideshow.inputs) {
        const imgAbs = path.resolve(img.path).replace(/\\/g, '/');
        cmdArgs.push('-loop', '1', '-i', imgAbs);
      }
      audioInputIdx = bgImages.length;
      cmdArgs.push('-i', audioAbs);
      ttsIdx = audioInputIdx;

      const filterChain = slideshow.filter + ';[bg]' + hudAndText;

      if (bgmPath) {
        const bgmAbs = path.resolve(bgmPath).replace(/\\/g, '/');
        const bgmIdx = audioInputIdx + 1;
        cmdArgs.push('-i', bgmAbs);
        const fullFilter = filterChain +
          `;[${ttsIdx}:a]volume=1.0[tts];[${bgmIdx}:a]volume=0.18[bgm];` +
          `[bgm][tts]sidechaincompress=threshold=0.06:ratio=3:attack=80:release=300[outa]`;
        cmdArgs.push('-filter_complex', fullFilter, '-map', '[out]', '-map', '[outa]');
      } else {
        cmdArgs.push('-filter_complex', filterChain, '-map', '[out]', '-map', `${ttsIdx}:a`);
      }
    } else {
      // No images: gradient + cell auto background
      cmdArgs.push(
        '-f', 'lavfi',
        '-i', `gradients=s=${W}x${H}:c0=0x080f1a:c1=0x0c1f38:c2=0x0a1830:n=3:x0=${Math.floor(W / 2)}:y0=0:x1=${Math.floor(W / 2)}:y1=${H}:speed=0.002:r=${FPS}:d=${dur}`,
        '-f', 'lavfi',
        '-i', `cellauto=s=${Math.floor(W / 2)}x${Math.floor(H / 2)}:rule=90:random_fill_ratio=0.25:rate=1:random_seed=42,scale=${W}:${H},loop=-1:1:0`,
        '-i', audioAbs
      );
      audioInputIdx = 2;
      ttsIdx = audioInputIdx;
      const filterChain = `[0:v][1:v]blend=all_mode=screen:all_opacity=0.22[bg];[bg]` + hudAndText;

      if (bgmPath) {
        const bgmAbs = path.resolve(bgmPath).replace(/\\/g, '/');
        const bgmIdx = audioInputIdx + 1;
        cmdArgs.push('-i', bgmAbs);
        const fullFilter = filterChain +
          `;[${ttsIdx}:a]volume=1.0[tts];[${bgmIdx}:a]volume=0.18[bgm];` +
          `[bgm][tts]sidechaincompress=threshold=0.06:ratio=3:attack=80:release=300[outa]`;
        cmdArgs.push('-filter_complex', fullFilter, '-map', '[out]', '-map', '[outa]');
      } else {
        cmdArgs.push('-filter_complex', filterChain, '-map', '[out]', '-map', `${ttsIdx}:a`);
      }
    }

    cmdArgs.push(
      '-c:v', 'libx264', '-threads', '0', '-preset', config.videoPreset,
      '-crf', String(config.videoCrf), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', outAbs
    );

    const proc = execFile(cmdArgs.shift(), cmdArgs, { timeout: 900000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr ? _extractFfmpegError(stderr) : err.message;
        reject(new Error(`FFmpeg failed: ${msg}`));
        return;
      }
      resolve(outputPath);
    });
  });
}

// ─── Render video with AI background ───
function _renderVideoWithAiBg({ duration, audioPath, srtPath, aiVideoPath, title, brand, outputPath, orientation }) {
  return new Promise((resolve, reject) => {
    const { w: W, h: H } = _getDimensions(orientation);
    const FPS = config.videoFps;
    const font = _escapeFontPath(config.fontPath);
    const titleSafe = _escapeFfmpegText(title);
    const brandSafe = _escapeFfmpegText(brand);
    const srtAbs = path.resolve(srtPath).replace(/\\/g, '/').replace(/:/g, '\\:');
    const audioAbs = path.resolve(audioPath).replace(/\\/g, '/');
    const aiAbs = path.resolve(aiVideoPath).replace(/\\/g, '/');
    const outAbs = path.resolve(outputPath).replace(/\\/g, '/');

    const bw = 120; const bt = 3; const bh = 60;
    const leftX = 30; const rightX = W - leftX - bw;

    const filterChain =
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS}[bg];` +
      `[bg]` +
      `drawbox=x=${leftX}:y=30:w=${bw}:h=${bt}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${leftX}:y=30:w=${bt}:h=${bh}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${rightX}:y=30:w=${bw}:h=${bt}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${rightX + bw - bt}:y=30:w=${bt}:h=${bh}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${leftX}:y=${H - 30 - bt}:w=${bw}:h=${bt}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${leftX}:y=${H - 30 - bh}:w=${bt}:h=${bh}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${rightX}:y=${H - 30 - bt}:w=${bw}:h=${bt}:c=0xe8954c@0.6:t=fill,` +
      `drawbox=x=${rightX + bw - bt}:y=${H - 30 - bh}:w=${bt}:h=${bh}:c=0xe8954c@0.6:t=fill` +
      `[bg2];` +
      `[bg2]drawtext=text='${titleSafe}':` +
      `fontcolor=0xe8954c:fontsize=56:` +
      `x=(w-text_w)/2:y=${Math.floor(H / 12)}:` +
      `fontfile=${font},` +
      `drawbox=x=(w-200)/2:y=${Math.floor(H / 12 + 78)}:w=200:h=3:c=0xe8954c@0.5:t=fill,` +
      `drawtext=text='${brandSafe}':` +
      `fontcolor=0x5a6a7a:fontsize=28:` +
      `x=(w-text_w)/2:y=${Math.floor(H / 12 + 108)}:` +
      `fontfile=${font}` +
      `[bg3];` +
      `[bg3]subtitles='${srtAbs}':` +
      `force_style='FontName=Microsoft YaHei,FontSize=30,` +
      `PrimaryColour=&H00E8954C&,OutlineColour=&H00080f1a&,Outline=3,` +
      `MarginV=${Math.floor(H / 6)}'` +
      `[out]`;

    const cmdArgs = [
      config.ffmpegBin, '-y',
      '-stream_loop', '-1', '-i', aiAbs, '-i', audioAbs,
      '-filter_complex', filterChain,
      '-map', '[out]', '-map', '1:a',
      '-c:v', 'libx264', '-threads', '0', '-preset', config.videoPreset,
      '-crf', String(config.videoCrf), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', outAbs
    ];

    execFile(cmdArgs.shift(), cmdArgs, { timeout: 900000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr ? _extractFfmpegError(stderr) : err.message;
        reject(new Error(`FFmpeg AI video failed: ${msg}`));
        return;
      }
      resolve(outputPath);
    });
  });
}

// ─── Main generate functions ───
async function generateVideo(contentId, contentTitle, contentBody, brandName, orientation = 'portrait', voice = 'zh-CN-YunxiNeural', speed = 1.0, bgmPath = null, bgImagePath = null, ttsProvider = 'edge') {
  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  const ttsText = sanitizeText(`${contentTitle}。${contentBody}`);
  const safeTitle = sanitizeText(contentTitle);
  const safeBrand = sanitizeText(brandName);
  const [audioPath, enText] = await Promise.all([
    _tts(ttsText, voice, speed, ttsProvider),
    _translateEn(ttsText)
  ]);

  const cnSegments = _splitSentences(ttsText);
  const duration = await _getAudioDuration(audioPath);
  const suffix = orientation === 'landscape' ? '_landscape' : '';

  const srtCnPath = path.join(VIDEOS_DIR, `sub_${contentId}${suffix}.srt`);
  _buildSrt(cnSegments, duration, srtCnPath);

  const enSegments = _splitSentences(enText);
  const srtEnPath = path.join(VIDEOS_DIR, `sub_${contentId}${suffix}_en.srt`);
  _buildSrt(enSegments, duration, srtEnPath);

  const outputPath = path.join(VIDEOS_DIR, `video_${contentId}${suffix}.mp4`);

  await _renderVideo({ duration, audioPath, srtCnPath, srtEnPath, title: safeTitle, brand: safeBrand, outputPath, orientation, bgmPath, bgImagePath });

  const srtText = fs.readFileSync(srtCnPath, 'utf8');
  for (const p of [audioPath, srtCnPath, srtEnPath]) {
    try { fs.unlinkSync(p); } catch {}
  }

  return { videoPath: outputPath, srtText };
}

async function generateVideoWithAiBackground(contentId, contentTitle, contentBody, brandName, aiVideoPath, orientation = 'portrait') {
  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  const ttsText = sanitizeText(`${contentTitle}。${contentBody}`);
  const safeTitle = sanitizeText(contentTitle);
  const safeBrand = sanitizeText(brandName);
  const audioPath = await _tts(ttsText);

  const cnSegments = _splitSentences(ttsText);
  const duration = await _getAudioDuration(audioPath);
  const suffix = orientation === 'landscape' ? '_landscape' : '';

  const srtPath = path.join(VIDEOS_DIR, `sub_${contentId}${suffix}.srt`);
  _buildCnSrt(cnSegments, duration, srtPath);

  const outputPath = path.join(VIDEOS_DIR, `video_${contentId}${suffix}.mp4`);

  await _renderVideoWithAiBg({ duration, audioPath, srtPath, aiVideoPath, title: safeTitle, brand: safeBrand, outputPath, orientation });

  const srtText = fs.readFileSync(srtPath, 'utf8');
  for (const p of [audioPath, srtPath]) {
    try { fs.unlinkSync(p); } catch {}
  }

  return { videoPath: outputPath, srtText };
}

module.exports = {
  generateVideo, generateVideoWithAiBackground,
  _tts, _getAudioDuration, _escapeFfmpegText, _escapeFontPath,
  _splitSentences, _buildSrt, _buildCnSrt, _getDimensions
};
