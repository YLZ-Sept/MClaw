// Image sequence video — Node.js port of image_sequence_video.py
const { execFile, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { chat, parseJSON } = require('./llm');
const { generateImage, downloadFile } = require('./ai-video');
const { _tts, _getAudioDuration, _buildSrt, _getDimensions, _escapeFontPath } = require('./video-generator');

const VIDEOS_DIR = path.join(__dirname, '..', 'videos');

const SEGMENT_PROMPT = `You are a visual director. Given the following social media copy, break it into 3-6 logical scenes. For each scene, write an English image prompt that describes a visually striking, cinematic scene matching the copy's emotion.

Return ONLY valid JSON array:
[{"text": "scene text in Chinese", "prompt": "English image generation prompt"}, ...]

Rules:
- scene count depends on copy length (short=3, long=6)
- image prompt: be descriptive, include style/lighting/mood, 15-30 words
- each scene's text should be 1-2 sentences from the copy
- cover the entire copy across all scenes

Copy:
{title}
{body}`;

function _fmtTs(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

async function segmentWithLLM(title, body) {
  const prompt = SEGMENT_PROMPT.replace('{title}', title).replace('{body}', body);
  const response = await chat([
    { role: 'system', content: 'You output only valid JSON arrays. No markdown, no explanation.' },
    { role: 'user', content: prompt }
  ], 0.7);
  const scenes = parseJSON(response);
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('LLM failed to segment copy into scenes');
  return scenes;
}

function _composeImagesVideo({ imagePaths, scenes, totalDuration, audioPath, outputPath, orientation, contentId }) {
  return new Promise((resolve, reject) => {
    const { w: W, h: H } = _getDimensions(orientation);
    const FPS = config.videoFps;
    const n = imagePaths.length;
    const segDur = totalDuration / n;
    const font = _escapeFontPath(config.fontPath);
    const audioAbs = path.resolve(audioPath).replace(/\\/g, '/');
    const outAbs = path.resolve(outputPath).replace(/\\/g, '/');

    // Build concat file
    const concatLines = [];
    for (const ip of imagePaths) {
      const absPath = path.resolve(ip).replace(/\\/g, '/');
      concatLines.push(`file '${absPath}'`);
      concatLines.push(`duration ${segDur}`);
    }
    const concatPath = path.join(VIDEOS_DIR, `_concat_${contentId}.txt`);
    fs.writeFileSync(concatPath, concatLines.join('\n'), 'utf8');

    // Build SRT
    const srtPath = path.join(VIDEOS_DIR, `_srt_imgseq_${contentId}.srt`);
    let srtContent = '';
    for (let i = 0; i < n; i++) {
      const start = _fmtTs(i * segDur);
      const end = _fmtTs((i + 1) * segDur);
      const text = (scenes[i].text || '').slice(0, 60);
      srtContent += `${i + 1}\n${start} --> ${end}\n${text}\n\n`;
    }
    fs.writeFileSync(srtPath, srtContent, 'utf8');

    const srtAbs = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const filterChain =
      `[0:v]fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[bg];` +
      `[bg]subtitles='${srtAbs}':` +
      `force_style='FontName=Microsoft YaHei,FontSize=28,` +
      `PrimaryColour=&H00E8954C&,OutlineColour=&H00080f1a&,Outline=2,` +
      `MarginV=${Math.floor(H / 5)}'` +
      `[out]`;

    const cmdArgs = [
      config.ffmpegBin, '-y',
      '-f', 'concat', '-safe', '0', '-i', concatPath,
      '-i', audioAbs,
      '-filter_complex', filterChain,
      '-map', '[out]', '-map', '1:a',
      '-c:v', 'libx264', '-preset', config.videoPreset,
      '-crf', String(config.videoCrf), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', outAbs
    ];

    execFile(cmdArgs.shift(), cmdArgs, { timeout: 600000, windowsHide: true }, (err, stdout, stderr) => {
      // Cleanup temp files
      for (const p of [concatPath, srtPath]) {
        try { fs.unlinkSync(p); } catch {}
      }
      if (err) {
        const msg = stderr ? stderr.slice(-800) : err.message;
        reject(new Error(`FFmpeg image sequence failed: ${msg}`));
        return;
      }
      resolve(outputPath);
    });
  });
}

async function generateImageSequenceVideo(contentId, contentTitle, contentBody, brandName, orientation = 'portrait') {
  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  // 1. Segment text
  const scenes = await segmentWithLLM(contentTitle, contentBody);

  // 2. Generate images
  const imagePaths = [];
  for (let i = 0; i < scenes.length; i++) {
    const imgUrl = await generateImage(scenes[i].prompt);
    const dest = path.join(VIDEOS_DIR, `scene_${contentId}_${i}.jpg`);
    await downloadFile(imgUrl, dest);
    imagePaths.push(dest);
  }

  // 3. TTS
  const ttsText = `${contentTitle}。${contentBody}`;
  const audioPath = await _tts(ttsText);
  const totalDuration = await _getAudioDuration(audioPath);

  // 4. Compose
  const suffix = orientation === 'landscape' ? '_landscape' : '';
  const outputPath = path.join(VIDEOS_DIR, `video_${contentId}${suffix}.mp4`);

  await _composeImagesVideo({ imagePaths, scenes, totalDuration, audioPath, outputPath, orientation, contentId });

  // Cleanup
  for (const p of imagePaths) { try { fs.unlinkSync(p); } catch {} }
  try { fs.unlinkSync(audioPath); } catch {}

  return outputPath;
}

module.exports = { segmentWithLLM, generateImageSequenceVideo };
