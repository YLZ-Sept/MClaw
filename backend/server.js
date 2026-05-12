const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const OPENCLAW_URL = 'http://localhost:3098';
const OPENCLAW_TOKEN = 'd54c33642bfc7654e7b8a560a85cdddd334c6fa0bcde352d';

let chatHistory = [
  { role: 'user', content: '你好！' },
  { role: 'ai', content: '你好！我是 MClaw 助手，已接入 OpenClaw 引擎，有什么可以帮助你的？' }
];

app.get('/api/info', (req, res) => {
  res.json({
    code: 200,
    data: {
      version: 'v2026.5.7',
      engine: 'OpenClaw',
      status: 'running'
    }
  });
});

app.get('/api/chat/history', (req, res) => {
  res.json({ code: 200, data: chatHistory });
});

app.post('/api/chat/send', async (req, res) => {
  const { content, agent } = req.body;
  chatHistory.push({ role: 'user', content });

  const model = agent ? `openclaw/${agent}` : 'openclaw';

  try {
    const ocRes = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`
      },
      body: JSON.stringify({
        model,
        messages: chatHistory.slice(-10),
        stream: false
      })
    });

    const ocData = await ocRes.json();
    const reply = ocData.choices?.[0]?.message?.content || 'OpenClaw 未返回有效回复';

    chatHistory.push({ role: 'ai', content: reply });
    res.json({ code: 200, data: { content: reply } });
  } catch (err) {
    const fallback = `已收到：${content}（OpenClaw 连接失败：${err.message}）`;
    chatHistory.push({ role: 'ai', content: fallback });
    res.json({ code: 200, data: { content: fallback } });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    code: 200,
    data: { cpu: '12%', memory: '380MB', services: 3 }
  });
});

const PORT = 3666;
app.listen(PORT, () => {
  console.log(`MClaw 后端运行在 http://localhost:${PORT}`);
});
