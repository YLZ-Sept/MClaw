const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

require('./db');

// CRM
app.use('/api/customers', require('./routes/customers'));
app.use('/api/contacts', require('./routes/crm-contacts'));
app.use('/api/leads', require('./routes/crm-leads'));
app.use('/api/campaigns', require('./routes/crm-campaigns'));
app.use('/api/quotations', require('./routes/crm-quotations'));
app.use('/api/contracts', require('./routes/crm-contracts'));
app.use('/api/tickets', require('./routes/crm-tickets'));
app.use('/api/feedback', require('./routes/crm-feedback'));
app.use('/api/opportunities', require('./routes/crm-opportunities'));
app.use('/api/asset-ledger', require('./routes/asset-ledger'));

// 进销存
app.use('/api/products', require('./routes/products'));
app.use('/api/inventory', require('./routes/products'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/purchase-orders', require('./routes/purchase-orders'));
app.use('/api/warehouses', require('./routes/warehouses'));
app.use('/api/sales-orders', require('./routes/sales-orders'));
app.use('/api/returns', require('./routes/returns'));

// 人事
app.use('/api/employees', require('./routes/employees'));
app.use('/api/departments', require('./routes/hr-departments'));
app.use('/api/recruitment', require('./routes/hr-recruitment'));
app.use('/api/candidates', require('./routes/hr-recruitment'));
app.use('/api/attendance', require('./routes/hr-attendance'));
app.use('/api/personnel-changes', require('./routes/hr-changes'));
app.use('/api/performance', require('./routes/hr-performance'));

// 文档
app.use('/api/documents', require('./routes/documents'));
app.use('/api/doc-folders', require('./routes/doc-folders'));

const DEEPSEEK_URL = 'https://api.deepseek.com/v1';
const DEEPSEEK_KEY = 'sk-4d6b0b5cbfac4e57bdadc29011cffe24';
const DEEPSEEK_MODEL = 'deepseek-chat';

let chatHistories = {};

function getHistory(agent) {
  const key = agent || 'default';
  if (!chatHistories[key]) {
    chatHistories[key] = [
      { role: 'user', content: '你好！' },
      { role: 'assistant', content: '你好老板！MClaw 企业管理已就绪，有什么需要处理的？' }
    ];
  }
  return chatHistories[key];
}

// 简单的意图识别 + 数据查询
const API_BASE = 'http://localhost:3666';

const QUERIES = [
  { match: /客户列表|有哪些客户|查客户/, url: '/api/customers', label: '客户列表' },
  { match: /产品列表|有哪些产品|查产品/, url: '/api/products', label: '产品列表' },
  { match: /库存查询|查库存/, url: '/api/inventory/stock-query', label: '库存情况' },
  { match: /员工列表|有哪些员工|查员工/, url: '/api/employees', label: '员工列表' },
  { match: /请假记录|请假列表/, url: '/api/employees/leave-requests', label: '请假记录' },
  { match: /文档列表|有哪些文档|查文档/, url: '/api/documents', label: '文档列表' }
];

async function queryAPI(url) {
  const res = await fetch(`${API_BASE}${url}`);
  const data = await res.json();
  return data.data || [];
}

app.get('/api/info', (req, res) => {
  res.json({
    code: 200,
    data: { version: 'v2026.5.7', engine: 'OpenClaw', status: 'running' }
  });
});

app.get('/api/chat/history', (req, res) => {
  const history = getHistory(req.query.agent);
  res.json({ code: 200, data: history });
});

app.post('/api/chat/clear', (req, res) => {
  const key = req.body.agent || 'default';
  delete chatHistories[key];
  res.json({ code: 200 });
});

app.post('/api/chat/send', async (req, res) => {
  const { content, agent } = req.body;
  const history = getHistory(agent);
  console.log(`[chat] agent=${agent || 'default'} content="${content}"`);
  history.push({ role: 'user', content });

  try {
    // 检查是否为数据查询
    let queryResult = null;
    let queryLabel = '';
    for (const q of QUERIES) {
      if (q.match.test(content)) {
        console.log(`[query] matched: ${q.label}, url: ${q.url}`);
        queryLabel = q.label;
        try {
          queryResult = await queryAPI(q.url);
          console.log(`[query] got ${Array.isArray(queryResult) ? queryResult.length + ' items' : 'data'}`);
        } catch (e) {
          console.log(`[query] failed: ${e.message}`);
          queryResult = null;
        }
        break;
      }
    }

    let systemMsg = `你是 MClaw 企业管理系统助手「小内」。你已经完成了所有初始化配置（IDENTITY.md、USER.md、TOOLS.md 均已设置），直接回答问题即可。禁止自我介绍，禁止引导流程，禁止问用户问题。用中文回答，简洁直接。你的用户叫"老板"。`;

    if (queryResult !== null) {
      const total = Array.isArray(queryResult) ? queryResult.length : 1;
      systemMsg += `\n\n用户查询了「${queryLabel}」，以下是真实数据（共 ${total} 条）：\n${JSON.stringify(queryResult, null, 2)}\n\n请用表格展示数据，不要添加不存在的字段。`;
    }

    const dsRes = await fetch(`${DEEPSEEK_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemMsg },
          ...history.slice(-6)
        ],
        stream: false,
        max_tokens: 800,
        temperature: 0.3
      })
    });

    if (!dsRes.ok) {
      const errText = await dsRes.text();
      throw new Error(`DeepSeek ${dsRes.status}: ${errText}`);
    }

    const dsData = await dsRes.json();
    const reply = dsData.choices?.[0]?.message?.content || '未返回有效回复';
    history.push({ role: 'assistant', content: reply });
    res.json({ code: 200, data: { content: reply } });

  } catch (err) {
    const fallback = `${content}（${err.message}）`;
    history.push({ role: 'assistant', content: fallback });
    res.json({ code: 200, data: { content: fallback } });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ code: 200, data: { cpu: '12%', memory: '380MB', services: 3 } });
});

const PORT = 3666;
app.listen(PORT, () => {
  console.log(`MClaw 后端运行在 http://localhost:${PORT}`);
});
