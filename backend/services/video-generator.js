// Video generation engine — Node.js port of video_generator.py
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('../config');
const { chat } = require('./llm');
const { tts: edgeTts, sanitizeText } = require('./tts');

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
async function _tts(text, voice, speed) {
  return edgeTts(text, voice, speed);
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

function _escapeFontPath(p) {
  const safe = p.replace(/\\/g, '/').replace(/:/g, '\\:');
  return `'${safe}'`;
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
    let audioInputIdx = 0;

    if (bgImagePath) {
      const imgAbs = path.resolve(bgImagePath).replace(/\\/g, '/');
      cmdArgs.push('-stream_loop', '-1', '-loop', '1', '-i', imgAbs);
      const filterChain = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS}[bg];[bg]` + hudAndText;
      audioInputIdx = 1;
      cmdArgs.push('-i', audioAbs);
      const ttsIdx = audioInputIdx;

      if (bgmPath) {
        const bgmAbs = path.resolve(bgmPath).replace(/\\/g, '/');
        const bgmIdx = audioInputIdx + 1;
        cmdArgs.push('-i', bgmAbs);
        const fullFilter = filterChain + `;[${ttsIdx}:a]volume=1.0[tts];[${bgmIdx}:a]volume=0.15[bgm];[tts][bgm]amix=inputs=2:duration=first:dropout_transition=2[outa]`;
        cmdArgs.push('-filter_complex', fullFilter, '-map', '[out]', '-map', '[outa]');
      } else {
        cmdArgs.push('-filter_complex', filterChain, '-map', '[out]', '-map', `${ttsIdx}:a`);
      }
    } else {
      cmdArgs.push(
        '-f', 'lavfi',
        '-i', `gradients=s=${W}x${H}:c0=0x080f1a:c1=0x0c1f38:c2=0x0a1830:n=3:x0=${Math.floor(W / 2)}:y0=0:x1=${Math.floor(W / 2)}:y1=${H}:speed=0.002:r=${FPS}:d=${dur}`,
        '-f', 'lavfi',
        '-i', `cellauto=s=${Math.floor(W / 2)}x${Math.floor(H / 2)}:rule=90:random_fill_ratio=0.25:rate=1:random_seed=42,scale=${W}:${H},loop=-1:1:0`,
        '-i', audioAbs
      );
      audioInputIdx = 2;
      const ttsIdx = audioInputIdx;
      const filterChain = `[0:v][1:v]blend=all_mode=screen:all_opacity=0.22[bg];[bg]` + hudAndText;

      if (bgmPath) {
        const bgmAbs = path.resolve(bgmPath).replace(/\\/g, '/');
        const bgmIdx = audioInputIdx + 1;
        cmdArgs.push('-i', bgmAbs);
        const fullFilter = filterChain + `;[${ttsIdx}:a]volume=1.0[tts];[${bgmIdx}:a]volume=0.15[bgm];[tts][bgm]amix=inputs=2:duration=first:dropout_transition=2[outa]`;
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
        const msg = stderr ? stderr.slice(-800) : err.message;
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
        const msg = stderr ? stderr.slice(-800) : err.message;
        reject(new Error(`FFmpeg AI video failed: ${msg}`));
        return;
      }
      resolve(outputPath);
    });
  });
}

// ─── Main generate functions ───
async function generateVideo(contentId, contentTitle, contentBody, brandName, orientation = 'portrait', voice = 'zh-CN-YunxiNeural', speed = 1.0, bgmPath = null, bgImagePath = null) {
  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  const ttsText = sanitizeText(`${contentTitle}。${contentBody}`);
  const safeTitle = sanitizeText(contentTitle);
  const safeBrand = sanitizeText(brandName);
  const [audioPath, enText] = await Promise.all([
    _tts(ttsText, voice, speed),
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
