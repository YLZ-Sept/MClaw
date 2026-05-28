// 爆款视频 — 快捷回复 + 线索检测
const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { classifyIntent } = require('../services/intent-classifier');
const { generateReply } = require('../services/auto-reply');
const { detectLead } = require('../services/lead-detector');
const { pushLeadNotification } = require('../services/notification');
const router = Router();

router.post('/', async (req, res) => {
  try {
    const { user_name, text } = req.body;
    if (!text) return res.status(400).json({ code: 400, message: 'text 必填' });

    const intent = await classifyIntent(text);
    const product = db.prepare('SELECT * FROM hot_products LIMIT 1').get() || {};
    const reply = await generateReply(text, intent, product);

    // Save conversation
    const convId = randomUUID();
    db.prepare(`INSERT INTO hot_conversations (id,source,from_user_name,incoming_text,intent,reply_text)
      VALUES (?,?,?,?,?,?)`).run(convId, 'private_msg', user_name || '匿名用户', text, intent, reply || null);

    let isLead = false;
    let leadSummary = '';
    let contact = '';

    if (intent === 'inquiry' || intent === 'consult') {
      const industry = product.industry_tags || '';
      const leadResult = await detectLead(text, reply || '', industry);
      if (leadResult.is_lead) {
        isLead = true;
        leadSummary = leadResult.summary || '';
        contact = leadResult.contact || '';
        db.prepare('UPDATE hot_conversations SET is_lead=1 WHERE id=?').run(convId);

        const leadId = randomUUID();
        db.prepare(`INSERT INTO hot_leads (id,conversation_id,user_name,contact_extracted,summary)
          VALUES (?,?,?,?,?)`).run(leadId, convId, user_name || '匿名用户', contact, leadSummary);

        pushLeadNotification(leadSummary, user_name || '匿名用户').catch(() => {});
        db.prepare('UPDATE hot_leads SET pushed=1 WHERE id=?').run(leadId);
      }
    }

    res.json({ code: 200, data: { intent, reply, is_lead: isLead, lead_summary: leadSummary } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
