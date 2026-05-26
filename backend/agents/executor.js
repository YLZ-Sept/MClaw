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
        db.prepare('INSERT INTO customers (id,name,phone,company,source,remark) VALUES (?,?,?,?,?,?)')
          .run(id, args.name, args.phone || null, args.company || null, args.source || null, args.remark || null);
        return { id, name: args.name, message: '客户创建成功' };
      }

      case 'update_customer': {
        const cur = db.prepare('SELECT * FROM customers WHERE id=?').get(args.customer_id);
        if (!cur) return { error: '客户不存在' };
        db.prepare('UPDATE customers SET name=?,phone=?,company=?,source=?,remark=? WHERE id=?')
          .run(args.name ?? cur.name, args.phone ?? cur.phone, args.company ?? cur.company, args.source ?? cur.source, args.remark ?? cur.remark, args.customer_id);
        return { id: args.customer_id, message: '客户更新成功' };
      }

      case 'delete_customer':
        db.prepare('DELETE FROM follow_ups WHERE customer_id=?').run(args.customer_id);
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
        return db.prepare(`SELECT o.*, c.name AS customer_name FROM opportunities o LEFT JOIN customers c ON o.customer_id=c.id ORDER BY o.created_at DESC`).all();

      case 'create_opportunity': {
        const id = randomUUID();
        db.prepare('INSERT INTO opportunities (id,title,customer_id,stage,amount,probability,expected_close_date,remark) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, args.title, args.customer_id || null, args.stage || 'contact', args.amount || 0, args.probability || 0, args.expected_close_date || null, args.remark || null);
        return { id, message: '销售机会创建成功' };
      }

      case 'list_leads':
        return db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();

      case 'list_contracts':
        return db.prepare(`SELECT c.*, cu.name AS customer_name FROM contracts c LEFT JOIN customers cu ON c.customer_id=cu.id ORDER BY c.created_at DESC`).all();

      case 'create_contract': {
        const id = randomUUID();
        db.prepare('INSERT INTO contracts (id,customer_id,title,total,status,start_date,end_date,content) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, args.customer_id || null, args.title, args.total || null, 'draft', args.start_date || null, args.end_date || null, args.content || null);
        return { id, message: '合同创建成功' };
      }

      case 'list_tickets':
        return db.prepare(`SELECT t.*, c.name AS customer_name FROM tickets t LEFT JOIN customers c ON t.customer_id=c.id ORDER BY t.created_at DESC`).all();

      case 'get_ticket': {
        const t = db.prepare(`SELECT t.*, c.name AS customer_name FROM tickets t LEFT JOIN customers c ON t.customer_id=c.id WHERE t.id=?`).get(args.ticket_id);
        return t || { error: '工单不存在' };
      }

      case 'create_ticket': {
        const id = randomUUID();
        db.prepare('INSERT INTO tickets (id,customer_id,title,description,priority,status) VALUES (?,?,?,?,?,?)')
          .run(id, args.customer_id || null, args.title, args.description || null, args.priority || 'medium', 'open');
        return { id, message: '工单创建成功' };
      }

      case 'update_ticket': {
        const cur = db.prepare('SELECT * FROM tickets WHERE id=?').get(args.ticket_id);
        if (!cur) return { error: '工单不存在' };
        db.prepare('UPDATE tickets SET status=?, assigned_to=? WHERE id=?')
          .run(args.status ?? cur.status, args.assigned_to ?? cur.assigned_to, args.ticket_id);
        return { message: '工单已更新' };
      }

      case 'list_feedback':
        return db.prepare(`SELECT f.*, c.name AS customer_name FROM customer_feedback f LEFT JOIN customers c ON f.customer_id=c.id ORDER BY f.created_at DESC`).all();

      case 'list_quotations':
        return db.prepare(`SELECT q.*, c.name AS customer_name FROM quotations q LEFT JOIN customers c ON q.customer_id=c.id ORDER BY q.created_at DESC`).all();

      case 'list_campaigns':
        return db.prepare('SELECT * FROM marketing_campaigns ORDER BY created_at DESC').all();

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

      default:
        return { error: `未知工具: ${toolName}` };
    }
  } catch (err) {
    console.error(`[executor] ${toolName} error:`, err.message);
    return { error: `操作失败: ${err.message}` };
  }
}

module.exports = { exec };
