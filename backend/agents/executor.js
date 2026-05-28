// 工具执行器 — 接收 tool name + arguments，直接操作 SQLite
const { randomUUID } = require('crypto');
const db = require('../db');

function exec(toolName, args) {
  try {
    switch (toolName) {

      // ─── CRM ───
      case 'list_customers':
        return db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();

      case 'get_customer': {
        const cus = db.prepare('SELECT * FROM customers WHERE id=?').get(args.customer_id);
        if (!cus) return { error: '客户不存在' };
        const followUps = db.prepare('SELECT * FROM follow_ups WHERE customer_id=? ORDER BY created_at DESC').all(args.customer_id);
        return { ...cus, follow_ups: followUps };
      }

      case 'create_customer': {
        const id = randomUUID();
        db.prepare('INSERT INTO customers (id,name,phone,company,position,gender,age,traits,preferences,contact_frequency,address) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, args.name, args.phone || null, args.company || null, args.position || null, args.gender || null, args.age || null, args.traits || null, args.preferences || null, args.contact_frequency || null, args.address || null);
        return { id, name: args.name, message: '客户创建成功' };
      }

      case 'update_customer': {
        const cur = db.prepare('SELECT * FROM customers WHERE id=?').get(args.customer_id);
        if (!cur) return { error: '客户不存在' };
        db.prepare('UPDATE customers SET name=?,phone=?,company=?,position=?,gender=?,age=?,traits=?,preferences=?,contact_frequency=?,address=? WHERE id=?')
          .run(args.name ?? cur.name, args.phone ?? cur.phone, args.company ?? cur.company, args.position ?? cur.position, args.gender ?? cur.gender, args.age ?? cur.age, args.traits ?? cur.traits, args.preferences ?? cur.preferences, args.contact_frequency ?? cur.contact_frequency, args.address ?? cur.address, args.customer_id);
        return { id: args.customer_id, message: '客户更新成功' };
      }

      case 'delete_customer':
        db.prepare('DELETE FROM follow_ups WHERE customer_id=?').run(args.customer_id);
        db.prepare('DELETE FROM contacts WHERE customer_id=?').run(args.customer_id);
        db.prepare('DELETE FROM customers WHERE id=?').run(args.customer_id);
        return { message: '客户已删除' };

      case 'add_follow_up': {
        const id = randomUUID();
        db.prepare('INSERT INTO follow_ups (id,customer_id,content,next_contact_date) VALUES (?,?,?,?)')
          .run(id, args.customer_id, args.content, args.next_contact_date || null);
        return { id, message: '跟进记录添加成功' };
      }

      case 'search_customer':
        return db.prepare('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name').all(`%${args.keyword}%`, `%${args.keyword}%`);

      case 'list_contacts':
        if (args.customer_id)
          return db.prepare('SELECT * FROM contacts WHERE customer_id=? ORDER BY created_at DESC').all(args.customer_id);
        return db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();

      case 'list_opportunities':
        return db.prepare('SELECT * FROM opportunities ORDER BY created_at DESC').all();

      case 'create_opportunity': {
        const id = randomUUID();
        db.prepare('INSERT INTO opportunities (id,title,sales_owner,contact_name,contact_phone,description,amount,stage,competition,progress,next_plan) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, args.title, args.sales_owner || null, args.contact_name || null, args.contact_phone || null, args.description || null, args.amount || 0, args.stage || 'contact', args.competition || null, args.progress || null, args.next_plan || null);
        return { id, message: '销售机会创建成功' };
      }

      case 'list_contracts':
        return db.prepare('SELECT * FROM contracts ORDER BY created_at DESC').all();

      case 'create_contract': {
        const id = randomUUID();
        db.prepare('INSERT INTO contracts (id,title,contract_no,sales_owner,contact_name,contact_phone,content,amount,signed_date,warranty_period,prepaid_amount,receivable_amount,invoice,delivery_progress,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, args.title, args.contract_no || null, args.sales_owner || null, args.contact_name || null, args.contact_phone || null, args.content || null, args.amount || 0, args.signed_date || null, args.warranty_period || null, args.prepaid_amount || 0, args.receivable_amount || 0, args.invoice || null, args.delivery_progress || null, args.remark || null);
        return { id, message: '合同创建成功' };
      }

      case 'list_asset_ledger':
        return db.prepare('SELECT * FROM asset_ledger ORDER BY created_at DESC').all();

      // ─── 进销存 ───
      case 'list_purchase_orders':
        return db.prepare('SELECT * FROM purchase_orders ORDER BY created_at DESC').all();

      case 'list_sales_orders':
        return db.prepare('SELECT * FROM sales_orders ORDER BY created_at DESC').all();

      case 'list_returns':
        return db.prepare('SELECT * FROM returns ORDER BY created_at DESC').all();

      case 'create_return': {
        const id = randomUUID();
        db.prepare('INSERT INTO returns (id,order_type,order_id,product_name,model,quantity,reason,type,exchange_product) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(id, args.order_type || 'sales', args.order_id || '', args.product_name, args.model || '', args.quantity || 1, args.reason || '', args.type || 'return', args.exchange_product || '');
        return { id, message: '退换货记录创建成功' };
      }

      // ─── 人事 ───
      case 'list_employees':
        return db.prepare('SELECT * FROM employees ORDER BY created_at DESC').all();

      case 'create_employee': {
        const id = randomUUID();
        db.prepare('INSERT INTO employees (id,name,gender,department,role,phone,hire_date,contract_end,email) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(id, args.name, args.gender||null, args.department||null, args.role||null, args.phone||null, args.hire_date||null, args.contract_end||null, args.email||null);
        return { id, name: args.name, message: '员工创建成功' };
      }

      case 'list_departments':
        return db.prepare(`SELECT d.*, e.name AS manager_name FROM departments d LEFT JOIN employees e ON d.manager_id=e.id ORDER BY d.name`).all();

      case 'list_performance_reports': {
        const month = args.month || new Date().toISOString().slice(0, 7);
        const list = db.prepare('SELECT * FROM performance_reports WHERE month=? ORDER BY employee_name').all(month);
        return list.map(r => {
          try { r.dims = JSON.parse(r.dims); } catch { r.dims = []; }
          return r;
        });
      }

      case 'list_attendance_reports': {
        const month = args.month || new Date().toISOString().slice(0, 7);
        return db.prepare('SELECT * FROM attendance_reports WHERE month=? ORDER BY employee_name').all(month);
      }

      // ─── 文档 ───
      case 'list_documents':
        return db.prepare('SELECT id, title, file_type, file_size, category, tags, created_at FROM documents ORDER BY created_at DESC').all();

      case 'search_documents':
        return db.prepare('SELECT id, title, file_type, file_size, created_at FROM documents WHERE title LIKE ? ORDER BY created_at DESC').all(`%${args.q}%`);

      case 'list_document_folders':
        return db.prepare('SELECT * FROM document_folders ORDER BY name').all();

      case 'search_employee':
        return db.prepare('SELECT * FROM employees WHERE name LIKE ? ORDER BY name').all(`%${args.name}%`);

      case 'search_faq': {
        // 简易中文分词 + 匹配
        const tokenize = (t) => {
          const c = t.replace(/[，,。.！!？?、；;：:（）()【】\[\]""''\s]/g, '');
          const toks = [];
          for (let len = 2; len <= 4; len++) for (let i = 0; i <= c.length - len; i++) toks.push(c.substring(i, i + len));
          return [...new Set(toks)];
        };
        const qTokens = tokenize(args.q);
        const faqs = db.prepare('SELECT * FROM faq').all();
        return faqs.map(f => {
          const fTokens = tokenize(f.question + f.tags);
          return { ...f, score: qTokens.filter(t => fTokens.some(ft => ft.includes(t) || t.includes(ft))).length };
        }).filter(f => f.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
      }

      // ─── 转人工 ───
      case 'handoff_to_human': {
        const id = randomUUID();
        db.prepare('INSERT INTO tickets (id,customer_id,title,description,priority,status) VALUES (?,?,?,?,?,?)')
          .run(id, args.customer_id || null, '【转人工】AI 客服无法解决的问题',
            '对话摘要：\n' + (args.summary || '用户请求转人工处理'),
            args.priority || 'high', 'open');
        return { id, message: '已转人工，工单 ' + id + ' 创建成功', priority: args.priority || 'high' };
      }

      // ─── 仪表盘统计 ───
      case 'get_dashboard_stats': {
        const counts = {
          customers: db.prepare('SELECT COUNT(*) AS c FROM customers').get().c,
          purchase_orders: db.prepare('SELECT COUNT(*) AS c FROM purchase_orders').get().c,
          employees: db.prepare('SELECT COUNT(*) AS c FROM employees').get().c,
          documents: db.prepare('SELECT COUNT(*) AS c FROM documents').get().c,

          opportunities: db.prepare('SELECT COUNT(*) AS c FROM opportunities').get().c,
          tickets: db.prepare('SELECT COUNT(*) AS c FROM tickets WHERE status != \'resolved\'').get().c,
          contracts: db.prepare('SELECT COUNT(*) AS c FROM contracts').get().c
        };
        return counts;
      }

      // ─── 爆款视频 ───
      case 'list_hot_products':
        return db.prepare('SELECT * FROM hot_products ORDER BY created_at DESC').all();

      case 'get_hot_product': {
        const hp = db.prepare('SELECT * FROM hot_products WHERE id=?').get(args.product_id);
        if (!hp) return { error: '产品不存在' };
        return hp;
      }

      case 'list_hot_contents': {
        const status = args.status;
        if (status) return db.prepare('SELECT * FROM hot_contents WHERE status=? ORDER BY generated_at DESC').all(status);
        return db.prepare('SELECT * FROM hot_contents ORDER BY generated_at DESC').all();
      }

      case 'get_hot_content': {
        const hc = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(args.content_id);
        if (!hc) return { error: '内容不存在' };
        return hc;
      }

      case 'list_hot_leads':
        return db.prepare('SELECT * FROM hot_leads ORDER BY created_at DESC').all();

      case 'get_dashboard_hot_stats': {
        const contents = db.prepare("SELECT COUNT(*) AS c FROM hot_contents WHERE status='published'").get().c || 0;
        const drafts = db.prepare("SELECT COUNT(*) AS c FROM hot_contents WHERE status='draft'").get().c || 0;
        const leads = db.prepare('SELECT COUNT(*) AS c FROM hot_leads').get().c || 0;
        const videos = db.prepare("SELECT COUNT(*) AS c FROM hot_contents WHERE video_status='done'").get().c || 0;
        const generating = db.prepare("SELECT COUNT(*) AS c FROM hot_contents WHERE video_status='generating'").get().c || 0;
        return { published_contents: contents, draft_contents: drafts, total_leads: leads, videos_generated: videos, videos_generating: generating };
      }

      default:
        return { error: `未知工具: ${toolName}` };
    }
  } catch (err) {
    console.error(`[executor] ${toolName} error:`, err.message);
    return { error: `操作失败: ${err.message}` };
  }
}

module.exports = { exec };
