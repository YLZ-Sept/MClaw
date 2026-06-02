// Sightflow Desktop Agent v3 — Qwen-VL 视觉模型驱动，替换 Tesseract OCR
// 用法: node backend/channels/sightflow-agent.js --account <account_id>
const WebSocket = require('ws');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ─── 配置 ───
const MCLAW_URL = process.env.MCLAW_URL || 'ws://localhost:4011/ws/sightflow';
const ACCOUNT_ID = process.argv.includes('--account')
  ? process.argv[process.argv.indexOf('--account') + 1]
  : process.env.SIGHTFLOW_ACCOUNT;
const INTERVAL = parseInt(process.env.SIGHTFLOW_INTERVAL || '8000');
const PLATFORM = process.env.SIGHTFLOW_PLATFORM || 'wechat';
const REPLY_ENABLED = !process.argv.includes('--no-reply');
const SCRIPT_DIR = __dirname;

if (!ACCOUNT_ID) { console.error('请指定 --account <id>'); process.exit(1); }

// ─── 视觉模型配置 ───
let visionConfig = null;

function getVisionConfig() {
  if (visionConfig) return visionConfig;
  // 从 DB 读取活跃的千问配置
  try {
    const db = require('../db');
    const row = db.prepare("SELECT * FROM model_configs WHERE provider='qwen' AND is_active=1").get();
    if (row && row.api_key) {
      visionConfig = {
        apiBase: (row.api_base || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, ''),
        apiKey: row.api_key,
        model: 'qwen-vl-max'
      };
      return visionConfig;
    }
  } catch (e) { /* fall through */ }
  // 环境变量兜底
  visionConfig = {
    apiBase: (process.env.VISION_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, ''),
    apiKey: process.env.VISION_API_KEY || '',
    model: process.env.VISION_MODEL || 'qwen-vl-max'
  };
  return visionConfig;
}

// ─── 状态 ───
let ws = null;
let reconnectTimer = null;
let captureTimer = null;
let seenMessages = new Set();   // 已处理的消息内容哈希，防重复
let sentMessages = new Set();   // 已发送回复，防回环
let cooldownUntil = 0;          // 发送回复后冷却（时间戳 ms）

const log = (tag, ...args) => console.log(`[${new Date().toLocaleTimeString()}] [${tag}]`, ...args);

// ─── PowerShell ───
function psFile(scriptName, ...args) {
  try {
    const file = path.join(SCRIPT_DIR, scriptName);
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${file}" ${args.map(a => `"${a}"`).join(' ')}`;
    return execSync(cmd, { encoding: 'utf8', timeout: 15000, windowsHide: true }).trim();
  } catch (e) { return ''; }
}

// ─── 窗口操作 ───
function getWindowRect() {
  const result = psFile('find-wechat.ps1');
  if (!result || result === 'NOT_FOUND') return null;
  const parts = result.split('|');
  if (parts.length < 3) return null;
  const rect = parts[2].split(',').map(Number);
  return { hwnd: parts[0], title: parts[1], L: rect[0], T: rect[1], R: rect[2], B: rect[3], proc: parts[3] };
}

function activateWindow() {
  const result = psFile('find-wechat.ps1', '-Show');
  if (!result || result === 'NOT_FOUND') return null;
  const parts = result.split('|');
  if (parts.length < 3) return null;
  const rect = parts[2].split(',').map(Number);
  return { hwnd: parts[0], title: parts[1], L: rect[0], T: rect[1], R: rect[2], B: rect[3], proc: parts[3] };
}

function takeScreenshot(L, T, R, B, outFile) {
  return psFile('capture.ps1', String(L), String(T), String(R), String(B), outFile);
}

function typeReply(text) {
  const pythonScript = path.join(SCRIPT_DIR, 'type_wechat.py');
  const tmpFile = path.join(os.tmpdir(), `mclaw_reply_${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, text, 'utf8');
  try {
    const result = execSync(`python "${pythonScript}" --file "${tmpFile}"`, {
      encoding: 'utf8', timeout: 15000, windowsHide: true
    }).trim();
    fs.unlink(tmpFile, () => {});
    if (result === 'OK') {
      sentMessages.add(text.slice(0, 60).replace(/\s+/g, ''));
    } else {
      log('deliver', `failed: ${result}`);
    }
  } catch (e) {
    log('deliver', `error: ${e.message}`);
    try { fs.unlink(tmpFile, () => {}); } catch {}
  }
}

// ─── 视觉模型 API ───
async function callVisionAPI(imagePath) {
  const config = getVisionConfig();
  if (!config.apiKey) throw new Error('未配置视觉模型 API Key');

  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  const res = await fetch(`${config.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${imageBase64}` }
          },
          {
            type: 'text',
            text: `这是微信电脑版聊天界面的截图。请识别聊天区域中所有可见的聊天消息。
对于每条消息，标注发送者（消息气泡上方显示的名称）和完整消息内容。
以JSON格式返回：{"messages":[{"sender":"发送者","content":"消息内容"}]}
如果是群聊，sender是发言人的名字。如果没有可见的聊天消息，返回{"messages":[]}。
重要：只返回JSON，不要添加任何解释或额外文字。`
          }
        ]
      }],
      max_tokens: 1024,
      temperature: 0.1
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`VL API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  // 解析 JSON
  try {
    return JSON.parse(content);
  } catch {
    // 尝试提取 markdown 代码块中的 JSON
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1]); } catch {}
    }
    // 尝试直接匹配 JSON 对象
    const jsonMatch = content.match(/\{[\s\S]*"messages"[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch {}
    }
    log('vision', `无法解析响应: ${content.slice(0, 200)}`);
    return { messages: [] };
  }
}

// ─── 消息去重 ───
function messageKey(content) {
  return content.slice(0, 80).replace(/\s+/g, '');
}

function isNewMessage(content) {
  const key = messageKey(content);
  if (seenMessages.has(key)) return false;
  seenMessages.add(key);
  // 保持 Set 大小可控
  if (seenMessages.size > 300) {
    const arr = [...seenMessages];
    seenMessages = new Set(arr.slice(-150));
  }
  return true;
}

function isSelfEcho(text) {
  const cleaned = text.replace(/\s+/g, '');
  for (const sent of sentMessages) {
    if (cleaned.includes(sent) || sent.includes(cleaned)) return true;
  }
  return false;
}

// ─── 截图 + VL 检测 ───
async function captureAndDetect() {
  if (Date.now() < cooldownUntil) {
    log('cooldown', `跳过 (${Math.round((cooldownUntil - Date.now()) / 1000)}s)`);
    return;
  }

  // 1. 获取窗口
  let win = getWindowRect();
  if (!win) { log('window', '未找到窗口'); return; }

  const w = win.R - win.L, h = win.B - win.T;
  if (w < 200 || h < 200) { log('window', '窗口太小'); return; }

  // 2. 计算聊天区域（裁掉左侧边栏、顶部标题栏、底部输入区）
  const sidebarW = Math.round(w * 0.25);
  const topBar = 50;
  const bottomBar = 170;
  const chatL = win.L + sidebarW;
  const chatT = win.T + topBar;
  const chatR = win.R;
  const chatB = win.B - bottomBar;

  try {
    // 3. 激活窗口并截图
    log('capture', '激活窗口并截图...');
    const activated = activateWindow();
    if (!activated) return;

    const useL = (chatR - chatL >= 200) ? chatL : activated.L;
    const useT = (chatR - chatL >= 200) ? chatT : activated.T;
    const useR = (chatR - chatL >= 200) ? chatR : activated.R;
    const useB = (chatR - chatL >= 200) ? chatB : activated.B;

    const tmpFile = path.join(os.tmpdir(), `sightflow_${Date.now()}.png`);
    const saved = takeScreenshot(useL, useT, useR, useB, tmpFile);
    if (!saved || !fs.existsSync(saved)) { log('capture', '截图失败'); return; }

    const cw = useR - useL, ch = useB - useT;
    log('capture', `聊天区 ${cw}x${ch}, VL 识别...`);

    // 4. 调用视觉模型
    const startTime = Date.now();
    const result = await callVisionAPI(saved);
    const elapsed = Date.now() - startTime;
    fs.unlink(saved, () => {});

    const messages = result.messages || [];
    log('vision', `${messages.length} 条消息 (${elapsed}ms)`);

    if (messages.length === 0) return;

    // 5. 处理每条消息
    const contactName = win.title.replace(/[（(].*[）)]/g, '').trim() || '未知联系人';
    let newCount = 0;

    for (const msg of messages) {
      const content = (msg.content || '').trim();
      if (content.length < 2) continue;
      if (!isNewMessage(content)) continue;
      if (isSelfEcho(content)) {
        log('filter', '跳过自身回声');
        continue;
      }

      newCount++;
      const preview = content.slice(0, 120).replace(/\n/g, ' ');
      log('detect', `[${msg.sender || '?'}] ${preview}`);

      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'message',
          contact_name: msg.sender || contactName,
          contact_avatar: '',
          content: content.slice(0, 500)
        }));
        log('send', '→ MClaw');
      }
    }

    if (newCount > 0) log('detect', `共 ${newCount} 条新消息`);
  } catch (err) {
    log('capture', `错误: ${err.message}`);
  }
}

// ─── WebSocket ───
function connect() {
  log('ws', `连接 ${MCLAW_URL}...`);
  ws = new WebSocket(MCLAW_URL, { perMessageDeflate: false });

  ws.on('open', () => {
    log('ws', '认证...');
    ws.send(JSON.stringify({ type: 'auth', account_id: ACCOUNT_ID }));
  });

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }

    switch (data.type) {
      case 'auth_ok':
        log('ws', `认证成功 platform=${data.platform} mode=${data.reply_mode}`);
        startCaptureLoop();
        break;
      case 'auth_error':
        log('ws', `认证失败: ${data.message}`);
        process.exit(1);
        break;
      case 'reply':
        log('reply', `收到回复: ${data.content?.slice(0, 50)}...`);
        if (REPLY_ENABLED) {
          typeReply(data.content);
          cooldownUntil = Date.now() + INTERVAL * 1.5;
          log('deliver', 'OK, 冷却开始');
        } else {
          console.log('\n回复:\n', data.content?.slice(0, 200), '\n');
        }
        break;
      case 'suggestion':
        log('suggest', `AI建议: ${data.content?.slice(0, 60)}...`);
        console.log('💡', data.content?.slice(0, 200));
        break;
      case 'ack':
        log('ack', `conv=${data.conversation_id?.slice(0, 8)}`);
        break;
      case 'heartbeat_ok': break;
      case 'auth_timeout':
        log('ws', '认证超时'); ws.close(); break;
      case 'disabled':
        log('ws', '账号已停用，退出');
        stopCaptureLoop();
        ws.close();
        process.exit(0);
        break;
      default:
        log('ws', `未知: ${data.type}`);
    }
  });

  ws.on('close', () => {
    log('ws', '断开, 5秒重连');
    stopCaptureLoop();
    reconnectTimer = setTimeout(connect, 5000);
  });
  ws.on('error', (err) => log('ws', `错误: ${err.message}`));
}

function startCaptureLoop() {
  if (captureTimer) return;
  log('capture', `循环启动, 间隔 ${INTERVAL / 1000}s`);
  captureAndDetect();
  captureTimer = setInterval(captureAndDetect, INTERVAL);
}
function stopCaptureLoop() {
  if (captureTimer) { clearInterval(captureTimer); captureTimer = null; }
}

// ─── 启动 ───
async function main() {
  console.log('══════════════════════════════════');
  console.log('  Sightflow Desktop Agent v3 (Qwen-VL)');
  console.log('  平台:', PLATFORM, '  间隔:', INTERVAL / 1000, 's');
  console.log('  回复:', REPLY_ENABLED ? '启用' : '禁用');

  const cfg = getVisionConfig();
  console.log('  视觉模型:', cfg.model, '|', cfg.apiBase);
  if (!cfg.apiKey) {
    console.warn('  ⚠ 未配置视觉模型 API Key，请检查 model_configs 或 VISION_API_KEY 环境变量');
  }
  console.log('══════════════════════════════════\n');
  connect();
}

main().catch(err => { console.error('启动失败:', err.message); process.exit(1); });

process.on('SIGINT', () => {
  console.log('\n退出...');
  stopCaptureLoop();
  clearTimeout(reconnectTimer);
  if (ws) ws.close();
  process.exit(0);
});
