// 工具执行器 — 接收 tool name + arguments，直接操作 SQLite
const { randomUUID } = require('crypto');
const db = require('../db');
const { getExecutionContext } = require('../shared/execution-context');

let _cachedNodeId = null;

async function exec(toolName, args, context) {
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

      case 'get_opportunity': {
        const op = db.prepare('SELECT * FROM opportunities WHERE id=?').get(args.opportunity_id);
        if (!op) return { error: '销售机会不存在' };
        return op;
      }

      case 'update_opportunity': {
        const cur = db.prepare('SELECT * FROM opportunities WHERE id=?').get(args.opportunity_id);
        if (!cur) return { error: '销售机会不存在' };
        db.prepare('UPDATE opportunities SET title=?,sales_owner=?,contact_name=?,contact_phone=?,description=?,amount=?,stage=?,competition=?,progress=?,next_plan=? WHERE id=?')
          .run(args.title ?? cur.title, args.sales_owner ?? cur.sales_owner, args.contact_name ?? cur.contact_name, args.contact_phone ?? cur.contact_phone, args.description ?? cur.description, args.amount ?? cur.amount, args.stage ?? cur.stage, args.competition ?? cur.competition, args.progress ?? cur.progress, args.next_plan ?? cur.next_plan, args.opportunity_id);
        return { id: args.opportunity_id, message: '销售机会更新成功' };
      }

      case 'delete_opportunity': {
        const cur = db.prepare('SELECT * FROM opportunities WHERE id=?').get(args.opportunity_id);
        if (!cur) return { error: '销售机会不存在' };
        db.prepare('DELETE FROM opportunities WHERE id=?').run(args.opportunity_id);
        return { message: `销售机会「${cur.title}」已删除` };
      }

      case 'list_contracts':
        return db.prepare('SELECT * FROM contracts ORDER BY created_at DESC').all();

      case 'create_contract': {
        const id = randomUUID();
        db.prepare('INSERT INTO contracts (id,title,contract_no,sales_owner,contact_name,contact_phone,content,amount,signed_date,warranty_period,prepaid_amount,receivable_amount,invoice,delivery_progress,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, args.title, args.contract_no || null, args.sales_owner || null, args.contact_name || null, args.contact_phone || null, args.content || null, args.amount || 0, args.signed_date || null, args.warranty_period || null, args.prepaid_amount || 0, args.receivable_amount || 0, args.invoice || null, args.delivery_progress || null, args.remark || null);
        return { id, message: '合同创建成功' };
      }

      case 'get_contract': {
        const ct = db.prepare('SELECT * FROM contracts WHERE id=?').get(args.contract_id);
        if (!ct) return { error: '合同不存在' };
        return ct;
      }

      case 'update_contract': {
        const cur = db.prepare('SELECT * FROM contracts WHERE id=?').get(args.contract_id);
        if (!cur) return { error: '合同不存在' };
        db.prepare('UPDATE contracts SET title=?,contract_no=?,sales_owner=?,contact_name=?,contact_phone=?,content=?,amount=?,signed_date=?,warranty_period=?,prepaid_amount=?,receivable_amount=?,invoice=?,delivery_progress=?,remark=? WHERE id=?')
          .run(
            args.title ?? cur.title, args.contract_no ?? cur.contract_no, args.sales_owner ?? cur.sales_owner,
            args.contact_name ?? cur.contact_name, args.contact_phone ?? cur.contact_phone, args.content ?? cur.content,
            args.amount ?? cur.amount, args.signed_date ?? cur.signed_date, args.warranty_period ?? cur.warranty_period,
            args.prepaid_amount ?? cur.prepaid_amount, args.receivable_amount ?? cur.receivable_amount,
            args.invoice ?? cur.invoice, args.delivery_progress ?? cur.delivery_progress, args.remark ?? cur.remark,
            args.contract_id
          );
        return { id: args.contract_id, message: '合同更新成功' };
      }

      case 'delete_contract': {
        const cur = db.prepare('SELECT * FROM contracts WHERE id=?').get(args.contract_id);
        if (!cur) return { error: '合同不存在' };
        db.prepare('DELETE FROM contracts WHERE id=?').run(args.contract_id);
        return { message: `合同「${cur.title}」已删除` };
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

      case 'get_return': {
        const ret = db.prepare('SELECT * FROM returns WHERE id=?').get(args.return_id);
        if (!ret) return { error: '退换货记录不存在' };
        return ret;
      }

      case 'update_return': {
        const cur = db.prepare('SELECT * FROM returns WHERE id=?').get(args.return_id);
        if (!cur) return { error: '退换货记录不存在' };
        db.prepare('UPDATE returns SET order_type=?,order_id=?,product_name=?,model=?,quantity=?,reason=?,type=?,exchange_product=? WHERE id=?')
          .run(args.order_type ?? cur.order_type, args.order_id ?? cur.order_id, args.product_name ?? cur.product_name, args.model ?? cur.model, args.quantity ?? cur.quantity, args.reason ?? cur.reason, args.type ?? cur.type, args.exchange_product ?? cur.exchange_product, args.return_id);
        return { id: args.return_id, message: '退换货记录更新成功' };
      }

      // ─── 采购入库 ───
      case 'create_purchase_order': {
        const id = randomUUID();
        db.prepare('INSERT INTO purchase_orders (id,supplier_id,total,status,ordered_date,received_date,remark) VALUES (?,?,?,?,?,?,?)')
          .run(id, args.supplier_id || null, args.total || 0, args.status || 'draft', args.ordered_date || null, args.received_date || null, args.remark || null);
        return { id, message: '采购单创建成功' };
      }

      case 'get_purchase_order': {
        const po = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(args.purchase_order_id);
        if (!po) return { error: '采购单不存在' };
        return po;
      }

      case 'update_purchase_order': {
        const cur = db.prepare('SELECT * FROM purchase_orders WHERE id=?').get(args.purchase_order_id);
        if (!cur) return { error: '采购单不存在' };
        db.prepare('UPDATE purchase_orders SET supplier_id=?,total=?,status=?,ordered_date=?,received_date=?,remark=? WHERE id=?')
          .run(args.supplier_id ?? cur.supplier_id, args.total ?? cur.total, args.status ?? cur.status, args.ordered_date ?? cur.ordered_date, args.received_date ?? cur.received_date, args.remark ?? cur.remark, args.purchase_order_id);
        return { id: args.purchase_order_id, message: '采购单更新成功' };
      }

      // ─── 销售出库 ───
      case 'create_sales_order': {
        const id = randomUUID();
        db.prepare('INSERT INTO sales_orders (id,customer_id,total,status,order_date,remark) VALUES (?,?,?,?,?,?)')
          .run(id, args.customer_id || null, args.total || 0, args.status || 'draft', args.order_date || null, args.remark || null);
        return { id, message: '销售单创建成功' };
      }

      case 'get_sales_order': {
        const so = db.prepare('SELECT * FROM sales_orders WHERE id=?').get(args.sales_order_id);
        if (!so) return { error: '销售单不存在' };
        return so;
      }

      case 'update_sales_order': {
        const cur = db.prepare('SELECT * FROM sales_orders WHERE id=?').get(args.sales_order_id);
        if (!cur) return { error: '销售单不存在' };
        db.prepare('UPDATE sales_orders SET customer_id=?,total=?,status=?,order_date=?,remark=? WHERE id=?')
          .run(args.customer_id ?? cur.customer_id, args.total ?? cur.total, args.status ?? cur.status, args.order_date ?? cur.order_date, args.remark ?? cur.remark, args.sales_order_id);
        return { id: args.sales_order_id, message: '销售单更新成功' };
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

      case 'get_employee': {
        const emp = db.prepare('SELECT * FROM employees WHERE id=?').get(args.employee_id);
        if (!emp) return { error: '员工不存在' };
        return emp;
      }

      case 'update_employee': {
        const cur = db.prepare('SELECT * FROM employees WHERE id=?').get(args.employee_id);
        if (!cur) return { error: '员工不存在' };
        db.prepare('UPDATE employees SET name=?,gender=?,department=?,role=?,phone=?,hire_date=?,contract_end=?,email=? WHERE id=?')
          .run(args.name ?? cur.name, args.gender ?? cur.gender, args.department ?? cur.department, args.role ?? cur.role, args.phone ?? cur.phone, args.hire_date ?? cur.hire_date, args.contract_end ?? cur.contract_end, args.email ?? cur.email, args.employee_id);
        return { id: args.employee_id, message: '员工更新成功' };
      }

      case 'delete_employee': {
        const cur = db.prepare('SELECT * FROM employees WHERE id=?').get(args.employee_id);
        if (!cur) return { error: '员工不存在' };
        db.prepare('DELETE FROM employees WHERE id=?').run(args.employee_id);
        return { message: `员工「${cur.name}」已删除` };
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

      // ─── 招聘 ───
      case 'list_recruitment': {
        const status = args.status;
        if (status) return db.prepare('SELECT * FROM recruitment WHERE status=? ORDER BY created_at DESC').all(status);
        return db.prepare('SELECT * FROM recruitment ORDER BY created_at DESC').all();
      }

      case 'create_recruitment': {
        const id = randomUUID();
        db.prepare('INSERT INTO recruitment (id,department,position,headcount,salary_range,requirements,status) VALUES (?,?,?,?,?,?,?)')
          .run(id, args.department||null, args.position, args.headcount||1, args.salary_range||null, args.requirements||null, 'open');
        return { id, position: args.position, message: '招聘职位创建成功' };
      }

      case 'update_recruitment': {
        const cur = db.prepare('SELECT * FROM recruitment WHERE id=?').get(args.recruitment_id);
        if (!cur) return { error: '职位不存在' };
        db.prepare('UPDATE recruitment SET position=?,department=?,headcount=?,salary_range=?,requirements=?,status=? WHERE id=?')
          .run(args.position ?? cur.position, args.department ?? cur.department, args.headcount ?? cur.headcount, args.salary_range ?? cur.salary_range, args.requirements ?? cur.requirements, args.status ?? cur.status, args.recruitment_id);
        return { id: args.recruitment_id, message: '招聘职位更新成功' };
      }

      case 'delete_recruitment': {
        const cur = db.prepare('SELECT * FROM recruitment WHERE id=?').get(args.recruitment_id);
        if (!cur) return { error: '职位不存在' };
        db.prepare('DELETE FROM candidates WHERE recruitment_id=?').run(args.recruitment_id);
        db.prepare('DELETE FROM recruitment WHERE id=?').run(args.recruitment_id);
        return { message: `招聘职位「${cur.position}」及其候选人已删除` };
      }

      case 'list_candidates': {
        let sql = 'SELECT c.*, r.position AS position_name FROM candidates c LEFT JOIN recruitment r ON c.recruitment_id=r.id WHERE 1=1';
        const params = [];
        if (args.recruitment_id) { sql += ' AND c.recruitment_id=?'; params.push(args.recruitment_id); }
        if (args.status) { sql += ' AND c.status=?'; params.push(args.status); }
        sql += ' ORDER BY c.created_at DESC';
        return db.prepare(sql).all(...params);
      }

      case 'create_candidate': {
        const id = randomUUID();
        db.prepare('INSERT INTO candidates (id,recruitment_id,name,phone,email,status,remark) VALUES (?,?,?,?,?,?,?)')
          .run(id, args.recruitment_id, args.name, args.phone||null, args.email||null, 'pending', args.remark||null);
        return { id, name: args.name, message: '候选人添加成功' };
      }

      case 'update_candidate_status': {
        const cur = db.prepare('SELECT * FROM candidates WHERE id=?').get(args.candidate_id);
        if (!cur) return { error: '候选人不存在' };
        db.prepare('UPDATE candidates SET status=?, remark=? WHERE id=?')
          .run(args.status, args.remark ?? cur.remark, args.candidate_id);
        return { id: args.candidate_id, status: args.status, message: '候选人状态更新成功' };
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

      // ─── 工单 ───
      case 'list_tickets':
        return db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all();

      case 'get_ticket': {
        const tk = db.prepare('SELECT * FROM tickets WHERE id=?').get(args.ticket_id);
        if (!tk) return { error: '工单不存在' };
        return tk;
      }

      case 'create_ticket': {
        const id = randomUUID();
        db.prepare('INSERT INTO tickets (id,customer_id,title,description,priority,status,assigned_to) VALUES (?,?,?,?,?,?,?)')
          .run(id, args.customer_id || null, args.title, args.description || null, args.priority || 'medium', args.status || 'open', args.assigned_to || null);
        return { id, title: args.title, message: '工单创建成功' };
      }

      case 'update_ticket': {
        const cur = db.prepare('SELECT * FROM tickets WHERE id=?').get(args.ticket_id);
        if (!cur) return { error: '工单不存在' };
        db.prepare('UPDATE tickets SET status=?,assigned_to=?,title=?,description=?,priority=? WHERE id=?')
          .run(args.status ?? cur.status, args.assigned_to ?? cur.assigned_to, args.title ?? cur.title, args.description ?? cur.description, args.priority ?? cur.priority, args.ticket_id);
        return { id: args.ticket_id, message: '工单更新成功' };
      }

      case 'delete_ticket': {
        const cur = db.prepare('SELECT * FROM tickets WHERE id=?').get(args.ticket_id);
        if (!cur) return { error: '工单不存在' };
        db.prepare('DELETE FROM tickets WHERE id=?').run(args.ticket_id);
        return { message: `工单「${cur.title}」已删除` };
      }

      // ─── 反馈 ───
      case 'list_feedback':
        return db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all();

      case 'create_feedback': {
        const id = randomUUID();
        db.prepare('INSERT INTO feedback (id,customer_id,rating,category,content) VALUES (?,?,?,?,?)')
          .run(id, args.customer_id || null, args.rating || null, args.category || null, args.content || null);
        return { id, message: '反馈记录成功' };
      }

      case 'delete_feedback': {
        const cur = db.prepare('SELECT * FROM feedback WHERE id=?').get(args.feedback_id);
        if (!cur) return { error: '反馈不存在' };
        db.prepare('DELETE FROM feedback WHERE id=?').run(args.feedback_id);
        return { message: '反馈已删除' };
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

      case 'create_hot_product': {
        const id = randomUUID();
        db.prepare('INSERT INTO hot_products (id,brand_name,description,selling_points,contact_info,target_audience,industry_tags) VALUES (?,?,?,?,?,?,?)')
          .run(id, args.brand_name, args.description || '', args.selling_points || '[]', args.contact_info || '', args.target_audience || '', args.industry_tags || '');
        return { id, message: '爆款产品创建成功' };
      }

      case 'update_hot_product': {
        const cur = db.prepare('SELECT * FROM hot_products WHERE id=?').get(args.product_id);
        if (!cur) return { error: '产品不存在' };
        db.prepare('UPDATE hot_products SET brand_name=?,description=?,selling_points=?,contact_info=?,target_audience=?,industry_tags=? WHERE id=?')
          .run(args.brand_name ?? cur.brand_name, args.description ?? cur.description, args.selling_points ?? cur.selling_points, args.contact_info ?? cur.contact_info, args.target_audience ?? cur.target_audience, args.industry_tags ?? cur.industry_tags, args.product_id);
        return { id: args.product_id, message: '产品更新成功' };
      }

      case 'delete_hot_product': {
        const cur = db.prepare('SELECT * FROM hot_products WHERE id=?').get(args.product_id);
        if (!cur) return { error: '产品不存在' };
        db.prepare('DELETE FROM hot_products WHERE id=?').run(args.product_id);
        return { message: `产品「${cur.brand_name}」已删除` };
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

      case 'create_hot_content': {
        const id = randomUUID();
        db.prepare('INSERT INTO hot_contents (id,title,body,tags,platforms,status) VALUES (?,?,?,?,?,?)')
          .run(id, args.title, args.body || '', args.tags || '', args.platforms || '', args.status || 'draft');
        return { id, message: '内容创建成功' };
      }

      case 'update_hot_content': {
        const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(args.content_id);
        if (!cur) return { error: '内容不存在' };
        db.prepare('UPDATE hot_contents SET title=?,body=?,tags=?,platforms=?,status=?,publish_url=? WHERE id=?')
          .run(args.title ?? cur.title, args.body ?? cur.body, args.tags ?? cur.tags, args.platforms ?? cur.platforms, args.status ?? cur.status, args.publish_url ?? cur.publish_url, args.content_id);
        return { id: args.content_id, message: '内容更新成功' };
      }

      case 'delete_hot_content': {
        const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(args.content_id);
        if (!cur) return { error: '内容不存在' };
        db.prepare('DELETE FROM hot_contents WHERE id=?').run(args.content_id);
        return { message: `内容「${cur.title}」已删除` };
      }

      case 'update_hot_lead': {
        const cur = db.prepare('SELECT * FROM hot_leads WHERE id=?').get(args.lead_id);
        if (!cur) return { error: '线索不存在' };
        db.prepare('UPDATE hot_leads SET status=?,summary=?,pushed=? WHERE id=?')
          .run(args.status ?? cur.status, args.summary ?? cur.summary, args.pushed ?? cur.pushed, args.lead_id);
        return { id: args.lead_id, message: '线索更新成功' };
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

      // ─── PPT 生成 ───
      case 'generate_pptx': {
        const { generatePPTX } = require('../services/ppt-generator');
        const result = await generatePPTX({ theme: args.theme || 'business', slides: args.slides || [] });
        return { filename: result.filename, download_url: `/api/ppt/download/${result.filename}`, message: `PPT 生成成功！\n\n[📥 点击下载 PPT](/api/ppt/download/${result.filename})` };
      }

      // ─── Excel 报表 ───
      case 'generate_excel': {
        const { generateExcel } = require('../services/excel-generator');
        const result = await generateExcel({
          sheets: args.sheets || [{ name: 'Sheet1', title: args.title || '报表', columns: args.columns || [], rows: args.rows || [] }],
          author: args.author || 'MClaw'
        });
        return { filename: result.filename, download_url: `/api/download/excel/${result.filename}`, message: `Excel 生成成功！\n\n[📥 点击下载](/api/download/excel/${result.filename})` };
      }

      // ─── PDF 文档 ───
      case 'generate_pdf': {
        const { generatePDF } = require('../services/pdf-generator');
        const result = await generatePDF({
          title: args.title || 'PDF 文档',
          author: args.author || 'MClaw',
          content: args.content || [{ text: args.text || '文档内容', style: 'body' }],
          pageSize: args.page_size || 'A4',
          orientation: args.orientation || 'portrait',
          watermark: args.watermark || null
        });
        return { filename: result.filename, download_url: `/api/download/pdf/${result.filename}`, message: `PDF 生成成功！\n\n[📥 点击下载](/api/download/pdf/${result.filename})` };
      }

      // ─── Word 文档 ───
      case 'generate_docx': {
        const { generateDocx } = require('../services/docx-generator');
        const result = await generateDocx({
          title: args.title || 'Word 文档',
          author: args.author || 'MClaw',
          sections: args.sections || [{ heading: '内容', paragraphs: [args.text || '文档正文'] }],
          footer: args.footer || ''
        });
        return { filename: result.filename, download_url: `/api/download/docx/${result.filename}`, message: `Word 文档生成成功！\n\n[📥 点击下载](/api/download/docx/${result.filename})` };
      }

      // ─── 图表/流程图 ───
      case 'generate_diagram': {
        const { generateDiagram } = require('../services/mermaid-generator');
        const result = await generateDiagram({
          code: args.code || 'graph TD; A-->B;',
          theme: args.theme || 'default',
          format: args.format || 'png'
        });
        return { filename: result.filename, download_url: `/api/download/diagram/${result.filename}`, message: `图表生成成功！\n\n![图表](/api/download/diagram/${result.filename})` };
      }

      // ─── 定时任务创建 ───
      case 'create_scheduled_task': {
        const wsClient = require('../openclaw/ws-client');
        const { parseSchedule } = require('../shared/schedule');
        const ctx = context || getExecutionContext();
        const params = {
          name: args.name,
          description: args.description || '',
          enabled: args.enabled !== false,
          schedule: parseSchedule(args.schedule),
          sessionTarget: 'isolated',
          wakeMode: 'now',
          payload: { kind: 'agentTurn', message: args.message }
        };
        // 优先用 LLM 指定的 agent_id，其次用当前对话的 Agent
        if (args.agent_id) params.agentId = args.agent_id;
        else if (ctx?.agentId) params.agentId = ctx.agentId;
        const result = await wsClient.request('cron.add', params);
        return { success: true, message: `定时任务「${args.name}」创建成功`, task_id: result.id, schedule: args.schedule };
      }

      // ─── OpenClaw 命令执行 ───
      case 'execute_command': {
        const wsClient = require('../openclaw/ws-client');
        const command = args.command;
        if (!command || typeof command !== 'string') return { error: '缺少 command 参数' };

        // 获取本地节点 ID（缓存）
        if (!_cachedNodeId) {
          try {
            const nodes = await wsClient.request('node.list');
            const local = (nodes?.nodes || nodes || []).find(n =>
              n.connected && (n.commands || []).includes('system.run')
            );
            if (local) _cachedNodeId = local.nodeId || local.id;
          } catch {}
        }
        if (!_cachedNodeId) return { error: '无法找到可用的 OpenClaw 节点，请确认 OpenClaw 已启动并连接' };

        const argv = process.platform === 'win32'
          ? ['cmd.exe', '/d', '/s', '/c', command]
          : ['/bin/sh', '-lc', command];

        const result = await wsClient.request('node.invoke', {
          nodeId: _cachedNodeId,
          command: 'system.run',
          params: { command: argv, rawCommand: command, timeoutMs: 60000 },
          idempotencyKey: randomUUID()
        }, 120000);

        const payload = result?.payload;
        if (payload && typeof payload === 'object') {
          const stdout = typeof payload.stdout === 'string' ? payload.stdout : '';
          const stderr = typeof payload.stderr === 'string' ? payload.stderr : '';
          const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : null;
          const success = payload.success === true;

          let output = '';
          if (stdout) output += stdout;
          if (stderr) output += (output ? '\n\n[stderr]\n' : '[stderr]\n') + stderr;
          if (!output) output = success ? '命令执行成功（无输出）' : `命令执行失败，退出码: ${exitCode ?? '未知'}`;

          return { success, exitCode, output };
        }

        return { error: '命令执行返回异常: ' + JSON.stringify(result).slice(0, 500) };
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
