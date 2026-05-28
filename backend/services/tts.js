// TTS via Python edge-tts subprocess
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PY_SCRIPT = path.join(__dirname, 'tts.py');

// Strip lone surrogates that can't be UTF-8 encoded, keep valid surrogate pairs
function sanitizeText(text) {
  if (!text) return '';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch >= 0xD800 && ch <= 0xDBFF) {
      if (i + 1 < text.length) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) { out += text[i] + text[i + 1]; i++; }
      }
    } else if (ch >= 0xDC00 && ch <= 0xDFFF) {
      // lone low surrogate, skip
    } else {
      out += text[i];
    }
  }
  return out;
}

async function tts(text, voice = 'zh-CN-YunxiNeural', speed = 1.0) {
  const cleanText = sanitizeText(text);
  return new Promise((resolve, reject) => {
    const child = execFile('python', [PY_SCRIPT], {
      windowsHide: true,
      timeout: 60000
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      const outputPath = stdout.trim();
      if (!outputPath || !fs.existsSync(outputPath)) {
        return reject(new Error('TTS 输出文件未生成'));
      }
      resolve(outputPath);
    });
    const input = JSON.stringify({ text: cleanText, voice, speed });
    child.stdin.write(input);
    child.stdin.end();
  });
}

module.exports = { tts, sanitizeText };
